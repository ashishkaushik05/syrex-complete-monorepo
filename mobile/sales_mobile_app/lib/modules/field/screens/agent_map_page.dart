import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../shared/widgets/premium_surfaces.dart';
import '../models/field_models.dart';
import '../providers/field_providers.dart';

class AgentMapPage extends ConsumerStatefulWidget {
  const AgentMapPage({super.key});

  @override
  ConsumerState<AgentMapPage> createState() => _AgentMapPageState();
}

class _AgentMapPageState extends ConsumerState<AgentMapPage> {
  bool _trail = true;
  bool _visits = true;
  bool _stops = true;

  final MapController _mapController = MapController();

  static const LatLng _indiaCenter = LatLng(20.5937, 78.9629);

  void _fitBounds(List<LatLng> points) {
    if (points.isEmpty || points.length == 1) {
      _mapController.move(
        points.isEmpty ? _indiaCenter : points.first,
        points.isEmpty ? 5.0 : 14.0,
      );
      return;
    }
    final bounds = LatLngBounds.fromPoints(points);
    _mapController.fitCamera(
      CameraFit.bounds(
        bounds: bounds,
        padding: const EdgeInsets.all(40),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final shiftAsync = ref.watch(activeShiftProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Agent Map')),
      body: PremiumGradientBackground(
        child: shiftAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (_, __) =>
              const Center(child: Text('Unable to load shift context.')),
          data: (shift) {
            if (shift == null) {
              return const EmptyStateView(
                title: 'No Active Shift',
                subtitle: 'Start a shift to see map trail and markers.',
                icon: Icons.route_outlined,
              );
            }

            final trailAsync = ref.watch(trailForShiftProvider(shift.id));
            final visitsAsync = ref.watch(visitsForShiftProvider(shift.id));
            final stopsAsync = ref.watch(stopsForShiftProvider(shift.id));

            return Column(
              children: [
                // Layer filter chips
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                  child: PremiumCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Layer Filters',
                          style: TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          children: [
                            FilterChip(
                              label: const Text('Trail'),
                              selected: _trail,
                              onSelected: (v) => setState(() => _trail = v),
                            ),
                            FilterChip(
                              label: const Text('Visits'),
                              selected: _visits,
                              onSelected: (v) => setState(() => _visits = v),
                            ),
                            FilterChip(
                              label: const Text('Stops'),
                              selected: _stops,
                              onSelected: (v) => setState(() => _stops = v),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),

                // Map
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: trailAsync.when(
                        loading: () =>
                            const Center(child: CircularProgressIndicator()),
                        error: (_, __) => const Center(
                            child: Text('Unable to load trail points.')),
                        data: (trail) {
                          final visits =
                              visitsAsync.valueOrNull ?? const <FieldVisitModel>[];
                          final stops =
                              stopsAsync.valueOrNull ?? const <FieldStopModel>[];

                          final trailLatLngs = trail.points
                              .map((p) => LatLng(p.lat, p.lng))
                              .toList();
                          final visitLatLngs = visits
                              .map((v) => LatLng(v.lat, v.lng))
                              .toList();
                          final stopLatLngs = stops
                              .map((s) => LatLng(s.lat, s.lng))
                              .toList();

                          final allPoints = [
                            ...trailLatLngs,
                            ...visitLatLngs,
                            ...stopLatLngs,
                          ];

                          // Fit bounds once after data loads
                          WidgetsBinding.instance.addPostFrameCallback((_) {
                            if (mounted) _fitBounds(allPoints);
                          });

                          return FlutterMap(
                            mapController: _mapController,
                            options: MapOptions(
                              initialCenter: _indiaCenter,
                              initialZoom: 5,
                            ),
                            children: [
                              TileLayer(
                                urlTemplate:
                                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                                userAgentPackageName:
                                    'com.syrex.sales_mobile_app',
                              ),
                              if (_trail && trailLatLngs.length >= 2)
                                PolylineLayer(
                                  polylines: [
                                    Polyline(
                                      points: trailLatLngs,
                                      color: Colors.blue,
                                      strokeWidth: 3.0,
                                    ),
                                  ],
                                ),
                              if (_visits && visitLatLngs.isNotEmpty)
                                MarkerLayer(
                                  markers: visitLatLngs
                                      .map(
                                        (ll) => Marker(
                                          point: ll,
                                          width: 16,
                                          height: 16,
                                          child: Container(
                                            decoration: const BoxDecoration(
                                              color: Colors.green,
                                              shape: BoxShape.circle,
                                            ),
                                          ),
                                        ),
                                      )
                                      .toList(),
                                ),
                              if (_stops && stopLatLngs.isNotEmpty)
                                MarkerLayer(
                                  markers: stopLatLngs
                                      .map(
                                        (ll) => Marker(
                                          point: ll,
                                          width: 14,
                                          height: 14,
                                          child: Container(
                                            decoration: BoxDecoration(
                                              color: Colors.red,
                                              borderRadius:
                                                  BorderRadius.circular(2),
                                            ),
                                          ),
                                        ),
                                      )
                                      .toList(),
                                ),
                            ],
                          );
                        },
                      ),
                    ),
                  ),
                ),

                // Shift Context card
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                  child: PremiumCard(
                    child: trailAsync.when(
                      loading: () => const SizedBox.shrink(),
                      error: (_, __) => const SizedBox.shrink(),
                      data: (trail) {
                        final elapsed = DateTime.now()
                            .difference(DateTime.parse(shift.startedAt));
                        final hours = elapsed.inHours;
                        final minutes = elapsed.inMinutes % 60;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Shift Context',
                              style: TextStyle(
                                  fontWeight: FontWeight.w700, fontSize: 16),
                            ),
                            const SizedBox(height: 8),
                            Text('Elapsed: ${hours}h ${minutes}m'),
                            Text(
                              'Distance: ${(trail.totalDistanceMeters / 1000).toStringAsFixed(2)} km',
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton.icon(
                                    onPressed: () => ref.invalidate(
                                        trailForShiftProvider(shift.id)),
                                    icon: const Icon(Icons.refresh_rounded),
                                    label: const Text('Refresh Map'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
