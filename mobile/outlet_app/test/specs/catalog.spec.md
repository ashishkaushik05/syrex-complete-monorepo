# Catalog Feature — Behavioral Specification

**Scope:** This document covers the full observable behavior of the Catalog feature,
including the screen, the API client, all data models, and the two product image
widgets. It is written for a test author who has not seen the source code.

---

# Component: CatalogScreen

## Purpose

The CatalogScreen is the primary product-browsing surface. It lets an outlet user
search across products by keyword, narrow by brand, and browse the results in a
two-column grid. The screen is stateful: search text and selected brand are held in
local widget state and drive re-fetches.

---

## Provider Structure

Two Riverpod providers are declared at file scope (module-private, accessible only
within this file):

### `_brandsProvider`
- Type: `FutureProvider.autoDispose<List<BrandDto>>`
- Calls `CatalogClient.listBrands()` once when first watched.
- Auto-disposes when no longer watched (i.e., when the screen leaves the tree).
- Has no parameters; there is a single shared instance for the whole screen.

### `_productsProvider`
- Type: `FutureProvider.autoDispose.family<PagedProducts, ({String? brandId, String? q})>`
- Parameterised by a named-field record: `(brandId: String?, q: String?)`.
- A distinct provider instance is created for each unique `(brandId, q)` pair.
- Calls `CatalogClient.listProducts(brandId: brandId, q: q)`.
- The screen passes `q: null` (not an empty string) when the search field is empty.
  Specifically: if `_q.isEmpty` then `q` is `null`; otherwise `q` is the raw string.
- Auto-disposes when no longer watched.

`CatalogScreen` itself is a `ConsumerStatefulWidget`. Its state (`_CatalogScreenState`)
holds:
- `String? _brandId` — `null` means "All brands" (no brand filter).
- `TextEditingController _searchCtrl` — controller for the search field.
- `String _q` — mirrors the current text in the search field; starts as `''`.

The controller is disposed in `dispose()`.

---

## UI Layout (top to bottom)

1. `OutletAppBar` — title text is `'Catalog'`; `showBack: true` (a back arrow is shown).
2. Search bar (horizontal padding 18 left/right, 10 bottom, 0 top).
3. Brand filter chip row (horizontal padding 18 left/right, 10 bottom, 0 top) — shown
   only after brands load and only if the brands list is non-empty.
4. Expanded area — contains the product grid (or loading/error/empty states), wrapped
   in a `RefreshIndicator`.

The overall background color is `AppThemeColors.bg` (theme-dependent).

---

## Search Bar

- Rendered as a rounded container (border radius 14, color `c.surface`, border `c.line`).
- Left side: search icon (`Icons.search`, 20 px, color `c.textFaint`).
- Center: `TextField` with:
  - Hint text: `'Search products…'`
  - No visible border (`InputBorder.none`).
  - Vertical content padding: 12 px.
  - `onChanged` callback fires on every keystroke; there is NO debounce. Each
    character change immediately updates `_q` via `setState`, which immediately
    triggers a new provider lookup (and therefore a new API call) for the updated
    `(brandId, q)` pair.
- Right side: a clear button (`Icons.close`, 18 px, color `c.textFaint`) rendered
  with 10 px horizontal padding. The clear button is visible only when `_q` is
  non-empty. Tapping it calls `_searchCtrl.clear()` and sets `_q = ''`.

---

## Brand Filter Chip Row

- Rendered only when `_brandsProvider` is in the `data` state AND the returned list
  is non-empty.
- While brands are loading or on error, the chip row is absent (replaced by
  `SizedBox.shrink()`).
- Chip labels: `['All', ...brands.map((b) => b.name)]`. "All" is always the first chip.
- Initially selected chip: `'All'` (because `_brandId == null`).
- Selecting `'All'` sets `_brandId = null`.
- Selecting any other chip finds the `BrandDto` whose `.name` matches the chip label,
  then sets `_brandId = brand.id`.
- The currently selected chip label is determined by reverse-lookup: if `_brandId` is
  non-null, find the brand with `id == _brandId`; if not found (brand disappeared from
  list), fall back to `brands.first.name`. If `_brandId` is null, label is `'All'`.

### Combined filter behavior

Brand filter and search text are combined, not independent. Both `_brandId` and `_q`
are passed together to `_productsProvider` as a single argument record. A change to
either triggers a re-watch of a different provider instance (new `(brandId, q)` pair),
which calls the API with both filters simultaneously. There is no client-side
intersection of two separate result sets.

---

## Product Grid (data state)

- Uses `GridView.builder` with padding `EdgeInsets.fromLTRB(18, 0, 18, 24)`.
- Grid delegate: `SliverGridDelegateWithFixedCrossAxisCount`
  - `crossAxisCount: 2` — always exactly 2 columns.
  - `crossAxisSpacing: 12`
  - `mainAxisSpacing: 12`
  - `mainAxisExtent: 230` — each card has a fixed height of 230 px (not aspect-ratio
    based; the aspect ratio delegate is only used in the skeleton).
- `itemCount` = `page.items.length` — the full count of items returned by the API
  call; there is no client-side pagination or "load more" behavior. All items returned
  by the API are rendered at once.
- Each item renders a `_ProductCard` with `product`, `c` (theme colors), and `index`
  (0-based position in the list).

### Pagination note

The `PagedProducts` model does carry a `nextCursor` field, and `CatalogClient.listProducts`
accepts a `cursor` parameter. However, `CatalogScreen` does NOT use `nextCursor` and
does NOT pass `cursor` to the provider. There is no "load more" / infinite scroll in
the current screen. All products returned in the first page are shown.

---

## Loading State (skeleton)

While `_productsProvider` is in the loading state, a `_Skeleton` widget is shown.

`_Skeleton`:
- Uses the same `GridView.builder` layout as the data grid, with identical padding.
- Grid delegate: `SliverGridDelegateWithFixedCrossAxisCount`
  - `crossAxisCount: 2`
  - `crossAxisSpacing: 12`
  - `mainAxisSpacing: 12`
  - `childAspectRatio: 0.72` — NOTE: uses aspect ratio, not fixed extent.
- `itemCount: 6` — always renders exactly 6 placeholder cards.
- Each placeholder is a `Container` with color `c.sunken` and border radius 18.

The skeleton is shown for products only. While brands are loading, the chip row is
simply absent — there is no brand-specific skeleton.

---

## Error State

When `_productsProvider` is in the error state:
- A centered `Text` widget displays `'Failed to load catalog'` in color `c.textMute`.
- No retry button is present.
- The `RefreshIndicator` remains active, so the user can pull-to-refresh to retry.

---

## Empty State

When `_productsProvider` returns data with an empty `items` list:
- An `EmptyState` widget is displayed inside a `ListView` (to enable pull-to-refresh).
- `EmptyState` receives:
  - `icon: Icons.category_outlined`
  - `title: 'No products found'`
  - `sub: 'Try adjusting your search or brand filter.'`

---

## Pull-to-Refresh

The entire grid area is wrapped in a `RefreshIndicator`:
- Color: `c.accent`.
- `onRefresh` callback calls `ref.invalidate(_productsProvider)`, which invalidates
  ALL instances of the family provider (all `(brandId, q)` combinations), forcing a
  fresh API call for the current combination on next watch.
- Pull-to-refresh is available in all product states: data, loading, and error.

---

## Navigation

There is NO navigation triggered by tapping a product card. `_ProductCard` has no
`GestureDetector`, `InkWell`, or `onTap` handler. Product cards are display-only.

---

## Theme / Dark Mode

The screen reads `themeModeProvider` to determine dark mode. `AppThemeColors` is
constructed with `dark: bool` accordingly. All colors used in this screen come from
that object.

---

# Component: _ProductCard

## Purpose

Displays a single product in the catalog grid. The card is a fixed-height (230 px)
column of an image area (112 px) and a text area (118 px).

---

## Hue Calculation

Each card computes a unique hue based on its index:

```
hue = (index * 47 + 160) % 360
```

This integer is passed to the image widget and used for gradient/placeholder colors.

---

## Card Container

- Color: `c.surface`
- Border radius: 18
- Border: `c.line`
- Box shadow: `c.shadow`

---

## Image Area (top, fixed 112 px height, full card width)

- Clipped with `BorderRadius.vertical(top: Radius.circular(17))` — only top corners
  are rounded.
- If `product.primaryImageUrl` is non-null:
  - Renders `_FullImage`, which renders `ProductImage` with:
    - `imageUrl`: the product's primary image URL
    - `hue`: the computed card hue
    - `fill: true`
    - `radius: 0` (no extra corner clipping; the card's own `ClipRRect` handles it)
    - `fit: BoxFit.cover`
- If `product.primaryImageUrl` is null:
  - Renders `_ThumbFill` — a full-bleed gradient with a centered icon.

### `_ThumbFill` (no-image placeholder)

- Fills the full 112 px image slot.
- Background: diagonal `LinearGradient` from `Alignment(-0.5, -0.8)` to
  `Alignment(0.8, 0.8)`, using two HSL colors derived from the card hue:
  - Light stop: `HSL(hue, 55%, 88%)`
  - Mid stop:   `HSL(hue, 48%, 80%)`
- Center icon: `Icons.electrical_services`, size 40, color `HSL(hue, 40%, 42%)`.
- This `_ThumbFill` is separate from `ProductImage`'s internal fallback; it is rendered
  by the card directly when `primaryImageUrl` is null (before `ProductImage` is even
  instantiated).

---

## Text Area (bottom, expands to fill remaining ~118 px)

Padding: `EdgeInsets.fromLTRB(12, 10, 12, 12)`.

The text area is a column with `mainAxisAlignment: spaceBetween`, containing two
logical groups:

### Name + SKU block (top of text area)

- **Product name** (`product.displayTitle`):
  - `displayTitle` returns `displayName` if non-null, otherwise falls back to `name`.
  - Text style: `AppTextStyles.labelBold(color: c.text)`
  - Max lines: 2; overflow: ellipsis.
- Vertical gap: 3 px.
- **SKU** (`product.sku`):
  - Text style: `AppTextStyles.caption(color: c.textFaint)`
  - Max lines: 1; overflow: ellipsis.

### Price (pinned to bottom of text area)

- Displays `product.basePrice` formatted as Indian Rupees via
  `fmtINR(parseAmount(product.basePrice))`.
- `basePrice` is a `String` (always coerced from JSON). `parseAmount` converts it to
  a numeric type; `fmtINR` formats it as an INR currency string.
- Text style: `AppTextStyles.amountMd(color: c.text)`

---

## What is NOT displayed on the card

- Product description (`product.description`) — not shown.
- Warranty months (`product.warrantyMonths`) — not shown.
- Category ID (`product.categoryId`) — not shown.
- `isActive` flag — not used for display or filtering in the card.

---

# Component: CatalogClient

## Purpose

Provides typed methods for calling product catalog tRPC procedures. Wraps the shared
`ApiClient` and deserialises responses into typed Dart DTOs.

---

## Provider

```
catalogClientProvider = Provider<CatalogClient>
```

Reads `apiClientProvider` to obtain the shared `ApiClient`. This provider is not
auto-disposing; it lives for the application lifetime.

---

## Method: `listBrands()`

- **tRPC procedure:** `brands.list`
- **Input shape:** `{}` — empty map (no parameters).
- **HTTP method:** GET (tRPC query).
- **Return type:** `Future<List<BrandDto>>`
- **Response parsing:**
  - Expects the tRPC response JSON to be a `Map<String, dynamic>` at the top level.
  - Reads the `'items'` key, which must be a `List<dynamic>`.
  - Maps each element through `BrandDto.fromJson`.
- **Edge cases:** If `items` is an empty list, returns `[]`. The method does not throw
  for an empty list.

---

## Method: `listCategories({String? brandId})`

- **tRPC procedure:** `categories.list`
- **Input shape:**
  - Base: `{}`
  - If `brandId` is non-null, adds `'brandId': brandId` to the input map.
  - If `brandId` is null, the key `'brandId'` is entirely absent from the input.
- **HTTP method:** GET (tRPC query).
- **Return type:** `Future<List<CategoryDto>>`
- **Response parsing:**
  - Same shape as `listBrands`: expects a `Map` with an `'items'` list.
  - Maps each element through `CategoryDto.fromJson`.
- **Note:** `listCategories` is defined in the client but is NOT called by
  `CatalogScreen`. It is available for other callers.

---

## Method: `listProducts({String? categoryId, String? brandId, String? q, String? cursor, int limit = 50})`

- **tRPC procedure:** `products.list`
- **Input shape:**
  - Always includes: `'limit': limit` (default `50` — an integer).
  - If `categoryId` is non-null, adds `'categoryId': categoryId`.
  - If `brandId` is non-null, adds `'brandId': brandId`.
  - If `q` is non-null, adds `'q': q`.
  - If `cursor` is non-null, adds `'cursor': cursor`.
  - Null parameters are entirely absent from the input map (not sent as null).
- **HTTP method:** GET (tRPC query).
- **Return type:** `Future<PagedProducts>`
- **Response parsing:** Passes the entire JSON value to `PagedProducts.fromJson`.
- **Called by CatalogScreen with:**
  - `brandId`: the currently selected brand ID or `null`.
  - `q`: the current search string or `null` (empty string is converted to `null` by
    the screen before calling).
  - `categoryId`: never passed (always omitted, defaults to null).
  - `cursor`: never passed (always omitted, defaults to null).
  - `limit`: not passed, so the default of `50` is used.

---

# Component: ProductImage

## Purpose

Displays a product image from either a network URL or a base64-encoded data URI.
Falls back gracefully when no URL is given, when decoding fails, or when the network
request fails.

---

## Constructor Parameters

| Parameter  | Type      | Default    | Description |
|------------|-----------|------------|-------------|
| `imageUrl` | `String?` | required   | URL (http/https) or `data:` URI. May be null. |
| `hue`      | `int`     | required   | 0–360 integer; used for gradient placeholder and shimmer colors. |
| `size`     | `double`  | `56`       | Square size in logical pixels. Used only when `fill: false`. |
| `radius`   | `double`  | `12`       | Corner radius. Used only when `fill: false`. |
| `fit`      | `BoxFit`  | `BoxFit.cover` | Image fit mode. |
| `fill`     | `bool`    | `false`    | When `true`, the widget expands to fill parent constraints. |

---

## Rendering Logic (decision tree)

1. **If `imageUrl` is null or empty string** → render fallback (see Fallback section below).
2. **If `imageUrl` starts with `'data:'`** → render `_DataUriImage` (base64 path).
3. **Otherwise** → render a network image.

### Network image path

- Uses `Image.network` with `width`, `height`, `fit` from the widget parameters.
- When `fill: false`, `width = size` and `height = size`.
- When `fill: true`, `width = null` and `height = null` (fills parent).
- **Loading state:** while the image is downloading, a `_Shimmer` placeholder is
  shown. Once loading completes (`progress == null`), the real image replaces it.
- **Error state:** if the network request or decoding fails, the fallback is shown.
- **Clipping:** when `fill: false`, the image is wrapped in `ClipRRect` with the given
  `radius`. When `fill: true`, no `ClipRRect` is applied (caller is responsible for
  clipping via its own container).

### Data URI path (`_DataUriImage`)

- Stateful widget; decoding happens in `initState`.
- Parses by finding the first comma (`,`) in the URI string. Everything after the
  comma is treated as base64-encoded image data and decoded with `base64Decode`.
- If there is no comma in the URI, the `_error` flag is set to `true` immediately.
- If `base64Decode` throws, the `_error` flag is set to `true`.
- When the `uri` prop changes (`didUpdateWidget`), `_decode()` is called again.
- While `_bytes == null` and `_error == false` (decoding not yet done on first frame
  sync), the fallback is shown.
- Once decoded, renders `Image.memory` with the decoded bytes.
- If `Image.memory` itself fails (corrupt bytes), the fallback is shown via
  `errorBuilder`.
- **Clipping:** if `radius == 0`, the image is returned without `ClipRRect`. Otherwise
  it is wrapped in `ClipRRect(radius)`.

---

## Fallback Behavior

The fallback differs between `fill: true` and `fill: false` modes:

- **`fill: true`** → `_GradientFill(hue: hue)` — a full-bleed gradient fill (see below).
- **`fill: false`** → `ProductThumb(hue: hue, category: '', size: size, radius: radius)` —
  a square gradient thumbnail with an icon. Note: `category` is always passed as empty
  string `''` when called from `ProductImage`.

---

## `_GradientFill` (fill-mode fallback)

- No border radius (it expands to fill parent; clipping is the caller's responsibility).
- Diagonal `LinearGradient` from `Alignment(-0.5, -0.8)` to `Alignment(0.8, 0.8)`:
  - Light stop: `HSL(hue, 55%, 88%)`
  - Mid stop:   `HSL(hue, 48%, 80%)`
- Centered icon: `Icons.electrical_services`, size **36**, color `HSL(hue, 40%, 42%)`.

Note: the card-level `_ThumbFill` (rendered when `primaryImageUrl` is null) uses the
same gradient formula but renders the icon at size **40**. `_GradientFill` (rendered
when `fill: true` and image fails) uses size **36**. These are distinct widgets.

---

## `_Shimmer` (network loading placeholder)

- A plain colored `Container` with the same `width`, `height`, and `radius` as the
  target image slot.
- Color: `HSL(hue, 45%, 88%)`.
- Displayed only during network image download; replaced by the real image once
  loaded.
- No animation (color is static; not an animated shimmer).

---

# Component: ProductThumb

## Purpose

A square, hue-colored gradient thumbnail with a category-specific icon glyph. Used
as a standalone widget where no image URL is available, or as the non-fill fallback
inside `ProductImage`.

---

## Constructor Parameters

| Parameter  | Type     | Default | Description |
|------------|----------|---------|-------------|
| `hue`      | `int`    | required | 0–360; drives gradient and icon color. |
| `category` | `String` | required | Category name string; used for icon selection. |
| `size`     | `double` | `56`    | Square width and height in logical pixels. |
| `radius`   | `double` | `14`    | Corner radius. |

---

## Icon Selection (`_glyph` method)

The displayed icon is selected by exact string match on `category`:

| `category` value     | Icon |
|----------------------|------|
| `'Refrigerators'`    | `Icons.kitchen` |
| `'Washing Machines'` | `Icons.local_laundry_service` |
| `'Air Conditioners'` | `Icons.ac_unit` |
| `'Televisions'`      | `Icons.tv` |
| Any other value (including `''`) | `Icons.electrical_services` |

---

## Visual Specification

- Square container: `width = size`, `height = size`.
- Border radius: `radius`.
- Background: diagonal `LinearGradient` from `Alignment(-0.5, -0.8)` to
  `Alignment(0.8, 0.8)`:
  - Light stop: `HSL(hue, 62%, 90%)`
  - Mid stop:   `HSL(hue, 55%, 80%)`
- Note: these HSL values differ from those in `_GradientFill` and `_ThumbFill`.
  `ProductThumb` is more saturated/vibrant.
- Icon: result of `_glyph(category)`, size `size * 0.46`, color `HSL(hue, 45%, 38%)`.
- The icon is NOT centered explicitly; it is the sole child of the `Container`, which
  defaults to centering its child.

---

# Data Models

## Model: `BrandDto`

Represents a product brand.

| Field         | Dart Type | Required | JSON key       | Notes |
|---------------|-----------|----------|----------------|-------|
| `id`          | `String`  | yes      | `'id'`         | Cast as `String` |
| `name`        | `String`  | yes      | `'name'`       | Cast as `String` |
| `description` | `String?` | no       | `'description'`| Cast as `String?`; null if key absent or value is null |

### `fromJson` contract

- Reads `j['id']` as `String` — will throw if absent or wrong type.
- Reads `j['name']` as `String` — will throw if absent or wrong type.
- Reads `j['description']` as `String?` — null-safe; no throw if absent.

---

## Model: `CategoryDto`

Represents a product category belonging to a brand.

| Field     | Dart Type | Required | JSON key    | Notes |
|-----------|-----------|----------|-------------|-------|
| `id`      | `String`  | yes      | `'id'`      | |
| `brandId` | `String`  | yes      | `'brandId'` | Foreign key to `BrandDto.id` |
| `name`    | `String`  | yes      | `'name'`    | |

### `fromJson` contract

- All three fields are required. Absence or wrong type will throw.

---

## Model: `ProductDto`

Represents a single product.

| Field              | Dart Type | Required | JSON key           | Notes |
|--------------------|-----------|----------|--------------------|-------|
| `id`               | `String`  | yes      | `'id'`             | |
| `categoryId`       | `String`  | yes      | `'categoryId'`     | |
| `name`             | `String`  | yes      | `'name'`           | |
| `displayName`      | `String?` | no       | `'displayName'`    | Null if absent |
| `sku`              | `String`  | yes      | `'sku'`            | |
| `description`      | `String?` | no       | `'description'`    | Null if absent |
| `basePrice`        | `String`  | yes      | `'basePrice'`      | JSON value is coerced via `.toString()` — accepts string or number from JSON |
| `warrantyMonths`   | `int`     | yes      | `'warrantyMonths'` | Parsed via `(j['warrantyMonths'] as num).toInt()` — accepts int or double in JSON |
| `isActive`         | `bool`    | no       | `'isActive'`       | Defaults to `true` if key absent or value is null |
| `primaryImageUrl`  | `String?` | no       | `'primaryImageUrl'`| Null if absent |

### Computed property: `displayTitle`

```
String get displayTitle => displayName ?? name;
```

Returns `displayName` if it is non-null; otherwise returns `name`. This is the string
shown as the product name on the card.

### `fromJson` contract notes

- `basePrice` uses `.toString()` on whatever JSON value is present (number or string
  both work).
- `warrantyMonths` casts to `num` first, then calls `.toInt()` — handles both integer
  and floating-point representations in JSON.
- `isActive` uses `?? true` — if the key is missing or is `null`, defaults to `true`.

---

## Model: `PagedProducts`

Wraps a list of products and an optional cursor for server-side pagination.

| Field        | Dart Type        | Required | JSON key      | Notes |
|--------------|------------------|----------|---------------|-------|
| `items`      | `List<ProductDto>` | yes    | `'items'`     | List may be empty |
| `nextCursor` | `String?`        | no       | `'nextCursor'`| Null if key absent; represents the opaque cursor for the next page |

### `fromJson` contract

- `items`: reads `j['items']` as `List<dynamic>`, maps each through `ProductDto.fromJson`.
- `nextCursor`: reads `j['nextCursor']` as `String?`, null-safe.

---

# Edge Cases & Interactions

## Search — immediate, no debounce

Every character typed in the search field triggers `setState`, updating `_q` and
causing `_productsProvider` to be re-watched with a new `(brandId, q)` pair. This
fires a new API call on every keystroke. There is no timer, no debounce, and no
minimum character count before the call is made.

## Clearing search

Pressing the clear (X) button resets `_searchCtrl` and sets `_q = ''`. Because
`_q.isEmpty` converts to `q: null` in the provider call, the resulting provider key
is `(brandId: <current>, q: null)` — the same as the initial unfiltered state for
that brand.

## Brand filter without brands loaded

If `_brandsProvider` is still loading or has errored, the chip row is not shown. The
user cannot change the brand filter. Products are still fetched with `brandId: null`.

## Brand filter with a single brand

The chip row still renders with two chips: `'All'` and the single brand name.

## Brand removed between renders

If `_brandId` is set to a brand ID that no longer appears in the brands list (possible
if brands list is refreshed), the selected chip label falls back to `brands.first.name`
(via the `orElse` in `firstWhere`). The `_brandId` value itself is not corrected
automatically — it remains set to the stale ID, and the next products API call will
pass that ID to the server.

## Network image in fill mode — no ClipRRect

When `ProductImage` is used with `fill: true`, the `Image.network` widget is returned
directly without wrapping in `ClipRRect`. The caller (in this case the card's own
`ClipRRect` container) is responsible for corner clipping.

## Data URI with no comma

If a `data:` URI is passed that contains no comma character, `_DataUriImage` sets
`_error = true` immediately in `initState` (synchronously, before the first build of
`_DataUriImage` itself completes — technically scheduled via `setState` inside
`initState`, which Flutter allows). The fallback widget is shown.

## Data URI change during widget lifetime

If the `imageUrl` prop of `ProductImage` changes from one data URI to another (and
therefore `_DataUriImage`'s `uri` prop changes), `didUpdateWidget` re-runs `_decode`.
During the re-decode period, the previously decoded bytes are still shown (not cleared
to fallback), EXCEPT if `_bytes == null && _error == false` — which cannot happen
after a successful first decode unless the widget is newly constructed. In practice,
on URI change the new bytes replace the old once decoded.

## Empty `category` string in ProductThumb

When `ProductImage` uses `ProductThumb` as its fallback, `category` is always `''`.
The `_glyph` method falls through to the `default` case and returns
`Icons.electrical_services`.

## `warrantyMonths` from floating-point JSON

If the server returns `warrantyMonths` as a floating-point number (e.g., `12.0`),
the `(j['warrantyMonths'] as num).toInt()` call truncates it to `12`. This is
intentional.

## `isActive` false products

`ProductDto.isActive` can be `false`. `CatalogScreen` does NOT filter out inactive
products client-side. Whether inactive products appear depends entirely on the server's
response to the `products.list` call.
