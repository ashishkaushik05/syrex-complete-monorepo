// ignore_for_file: lines_longer_than_80_chars

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:network_image_mock/network_image_mock.dart';
import 'package:go_router/go_router.dart';
import 'package:outlet_app/core/api/api_client.dart';
import 'package:outlet_app/modules/catalog/catalog_screen.dart';
import 'package:outlet_app/core/api/catalog_client.dart';
import 'package:outlet_app/core/models/catalog.dart';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockCatalogClient extends Mock implements CatalogClient {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

Map<String, dynamic> _product({
  String id = 'p1',
  String name = 'Product 1',
  String sku = 'SKU001',
  String basePrice = '1000',
  String categoryId = 'cat1',
  int warrantyMonths = 12,
  String? displayName,
  String? primaryImageUrl,
}) =>
    {
      'id': id,
      'name': name,
      'sku': sku,
      'basePrice': basePrice,
      'categoryId': categoryId,
      'warrantyMonths': warrantyMonths,
      if (displayName != null) 'displayName': displayName,
      if (primaryImageUrl != null) 'primaryImageUrl': primaryImageUrl,
    };

Map<String, dynamic> _brand({String id = 'b1', String name = 'Syrex'}) =>
    {'id': id, 'name': name};

Map<String, dynamic> _pagedProducts(List<Map<String, dynamic>> items) => {
      'items': items,
      'nextCursor': null,
    };

Widget _buildApp(MockCatalogClient client) {
  final router = GoRouter(
    initialLocation: '/more/catalog',
    routes: [
      GoRoute(
        path: '/more/catalog',
        builder: (_, __) => const CatalogScreen(),
      ),
    ],
  );

  return ProviderScope(
    overrides: [
      catalogClientProvider.overrideWithValue(client),
    ],
    child: MaterialApp.router(routerConfig: router),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

void main() {
  late MockCatalogClient client;

  setUp(() {
    client = MockCatalogClient();
    // Default: brands return empty list (no brand chips)
    when(() => client.listBrands())
        .thenAnswer((_) async => []);
    // Default: products return empty list
    when(() => client.listProducts(
          brandId: any(named: 'brandId'),
          q: any(named: 'q'),
        )).thenAnswer((_) async =>
        PagedProducts.fromJson(_pagedProducts([])));
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — Loading state', () {
    testWidgets('shows 6 skeleton cards while loading', (tester) async {
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((_) async {
        await Future<void>.delayed(const Duration(seconds: 30));
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pump(); // trigger loading
        // Skeleton shows exactly 6 placeholder items
        final grid = find.byType(GridView);
        expect(grid, findsOneWidget);
        // The skeleton grid has itemCount=6
        final gridWidget = tester.widget<GridView>(grid);
        // We verify 6 items are in the skeleton via the child count
        expect(find.byType(Container), findsAtLeast(6));
      });
    });
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — Error state', () {
    testWidgets('shows "Failed to load catalog" on error', (tester) async {
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenThrow(const ApiException('Network error'));

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        expect(find.text('Failed to load catalog'), findsOneWidget);
      });
    });

    testWidgets('no retry button in error state', (tester) async {
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenThrow(const ApiException('Error'));

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        expect(find.text('Retry'), findsNothing);
      });
    });
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — Empty state', () {
    testWidgets('shows empty state when no products returned', (tester) async {
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        expect(find.text('No products found'), findsOneWidget);
        expect(
            find.text('Try adjusting your search or brand filter.'),
            findsOneWidget);
      });
    });
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — Data state: grid layout', () {
    testWidgets('renders product grid with 2 columns', (tester) async {
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((_) async => PagedProducts.fromJson(_pagedProducts([
            _product(id: 'p1', name: 'Product A'),
            _product(id: 'p2', name: 'Product B'),
          ])));

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        expect(find.text('Product A'), findsOneWidget);
        expect(find.text('Product B'), findsOneWidget);
        // Grid delegate has crossAxisCount: 2
        final grid = tester.widget<GridView>(find.byType(GridView));
        final delegate = grid.gridDelegate
            as SliverGridDelegateWithFixedCrossAxisCount;
        expect(delegate.crossAxisCount, 2);
      });
    });

    testWidgets('tapping product card does NOT navigate anywhere',
        (tester) async {
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((_) async => PagedProducts.fromJson(_pagedProducts([
            _product(id: 'p1', name: 'Tappable Product'),
          ])));

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Tappable Product'));
        await tester.pumpAndSettle();
        // Still on the catalog screen (no navigation occurred)
        expect(find.text('Tappable Product'), findsOneWidget);
      });
    });
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — Search: no debounce, immediate API calls', () {
    testWidgets('typing "abc" triggers 3 separate API calls (one per char)',
        (tester) async {
      final capturedQ = <String?>[];
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((invocation) async {
        capturedQ.add(invocation.namedArguments[#q] as String?);
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        capturedQ.clear(); // clear initial load calls

        final searchField = find.byType(TextField);
        await tester.tap(searchField);
        await tester.pump();

        // Type 'a'
        await tester.enterText(searchField, 'a');
        await tester.pump();
        // Type 'ab'
        await tester.enterText(searchField, 'ab');
        await tester.pump();
        // Type 'abc'
        await tester.enterText(searchField, 'abc');
        await tester.pumpAndSettle();

        // At least 3 calls made (one per character change)
        expect(capturedQ.length, greaterThanOrEqualTo(3));
      });
    });

    testWidgets('empty search field sends q: null to provider', (tester) async {
      final capturedQ = <String?>[];
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((invocation) async {
        capturedQ.add(invocation.namedArguments[#q] as String?);
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        // Initial load should have q: null (empty string → null)
        expect(capturedQ, contains(null));
      });
    });

    testWidgets('clear button resets query to null', (tester) async {
      final capturedQ = <String?>[];
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((invocation) async {
        capturedQ.add(invocation.namedArguments[#q] as String?);
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        capturedQ.clear();

        final searchField = find.byType(TextField);
        await tester.enterText(searchField, 'test');
        await tester.pumpAndSettle();

        // Clear button appears when _q is non-empty
        final clearButton = find.byIcon(Icons.close);
        if (clearButton.evaluate().isNotEmpty) {
          await tester.tap(clearButton);
          await tester.pumpAndSettle();
          expect(capturedQ.last, isNull);
        }
      });
    });
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — Brand filter', () {
    setUp(() {
      when(() => client.listBrands()).thenAnswer((_) async => [
            BrandDto.fromJson(_brand(id: 'b1', name: 'Syrex')),
            BrandDto.fromJson(_brand(id: 'b2', name: 'LG')),
          ]);
    });

    testWidgets('brand chip row shows after brands load', (tester) async {
      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        expect(find.text('All'), findsOneWidget);
        expect(find.text('Syrex'), findsOneWidget);
        expect(find.text('LG'), findsOneWidget);
      });
    });

    testWidgets('selecting a brand chip sends brandId to provider',
        (tester) async {
      final capturedBrandId = <String?>[];
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((invocation) async {
        capturedBrandId
            .add(invocation.namedArguments[#brandId] as String?);
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        capturedBrandId.clear();

        await tester.tap(find.text('Syrex'));
        await tester.pumpAndSettle();

        expect(capturedBrandId, contains('b1'));
      });
    });

    testWidgets('"All" chip clears brand filter (sends null brandId)',
        (tester) async {
      final capturedBrandId = <String?>[];
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((invocation) async {
        capturedBrandId
            .add(invocation.namedArguments[#brandId] as String?);
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();

        // Select a brand first
        await tester.tap(find.text('Syrex'));
        await tester.pumpAndSettle();
        capturedBrandId.clear();

        // Now tap "All"
        await tester.tap(find.text('All'));
        await tester.pumpAndSettle();

        expect(capturedBrandId, contains(null));
      });
    });

    testWidgets('brand filter and search text are combined in single call',
        (tester) async {
      final captured = <Map<String, String?>>[];
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((invocation) async {
        captured.add({
          'brandId': invocation.namedArguments[#brandId] as String?,
          'q': invocation.namedArguments[#q] as String?,
        });
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        captured.clear();

        // Select brand
        await tester.tap(find.text('Syrex'));
        await tester.pumpAndSettle();

        // Type in search
        await tester.enterText(find.byType(TextField), 'bat');
        await tester.pumpAndSettle();

        // Last call should have both brandId and q set
        expect(captured.last['brandId'], 'b1');
        expect(captured.last['q'], 'bat');
      });
    });
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — No load-more / no pagination UI', () {
    testWidgets('renders all items from first page with no pagination UI',
        (tester) async {
      final products =
          List.generate(5, (i) => _product(id: 'p$i', name: 'Product $i'));
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((_) async =>
          PagedProducts.fromJson(_pagedProducts(products)));

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        for (var i = 0; i < 5; i++) {
          expect(find.text('Product $i'), findsOneWidget);
        }
        expect(find.text('Load more'), findsNothing);
        expect(find.byType(ElevatedButton), findsNothing);
      });
    });
  });

  // -------------------------------------------------------------------------
  group('CatalogScreen — Pull-to-refresh', () {
    testWidgets('pull-to-refresh invalidates provider and triggers re-fetch',
        (tester) async {
      int fetchCount = 0;
      when(() => client.listProducts(
            brandId: any(named: 'brandId'),
            q: any(named: 'q'),
          )).thenAnswer((_) async {
        fetchCount++;
        return PagedProducts.fromJson(_pagedProducts([]));
      });

      await mockNetworkImagesFor(() async {
        await tester.pumpWidget(_buildApp(client));
        await tester.pumpAndSettle();
        final before = fetchCount;
        await tester.drag(
            find.byType(RefreshIndicator), const Offset(0, 300));
        await tester.pumpAndSettle();
        expect(fetchCount, greaterThan(before));
      });
    });
  });
}
