import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'product_thumb.dart';

/// Displays a product image from a URL or base64 data URI.
///
/// Square thumbnail: `ProductImage(imageUrl: url, hue: h, size: 48)`
/// Full-bleed (fills parent SizedBox): `ProductImage(imageUrl: url, hue: h, fill: true)`
///
/// Falls back to [ProductThumb] when no image is available or on error.
class ProductImage extends StatelessWidget {
  final String? imageUrl;
  final int hue;

  /// Used for square thumbnails. Ignored when [fill] is true.
  final double size;
  final double radius;
  final BoxFit fit;

  /// When true, image fills the parent's constraints (width/height = infinity).
  final bool fill;

  const ProductImage({
    super.key,
    required this.imageUrl,
    required this.hue,
    this.size = 56,
    this.radius = 12,
    this.fit = BoxFit.cover,
    this.fill = false,
  });

  double? get _w => fill ? null : size;
  double? get _h => fill ? null : size;

  Widget _thumb() => fill
      ? _GradientFill(hue: hue)
      : ProductThumb(hue: hue, category: '', size: size, radius: radius);

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    if (url == null || url.isEmpty) return _thumb();

    if (url.startsWith('data:')) {
      return _DataUriImage(
        uri: url,
        width: _w,
        height: _h,
        radius: radius,
        fit: fit,
        fallback: _thumb,
      );
    }

    final img = Image.network(
      url,
      width: _w,
      height: _h,
      fit: fit,
      errorBuilder: (_, __, ___) => _thumb(),
      loadingBuilder: (_, child, progress) => progress == null
          ? child
          : _Shimmer(width: _w, height: _h, radius: radius, hue: hue),
    );

    if (fill) return img;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: img,
    );
  }
}

class _DataUriImage extends StatefulWidget {
  final String uri;
  final double? width;
  final double? height;
  final double radius;
  final BoxFit fit;
  final Widget Function() fallback;

  const _DataUriImage({
    required this.uri,
    required this.width,
    required this.height,
    required this.radius,
    required this.fit,
    required this.fallback,
  });

  @override
  State<_DataUriImage> createState() => _DataUriImageState();
}

class _DataUriImageState extends State<_DataUriImage> {
  Uint8List? _bytes;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _decode();
  }

  @override
  void didUpdateWidget(_DataUriImage old) {
    super.didUpdateWidget(old);
    if (old.uri != widget.uri) _decode();
  }

  void _decode() {
    try {
      final commaIdx = widget.uri.indexOf(',');
      if (commaIdx < 0) { if (mounted) setState(() => _error = true); return; }
      final bytes = base64Decode(widget.uri.substring(commaIdx + 1));
      if (mounted) setState(() { _bytes = bytes; _error = false; });
    } catch (_) {
      if (mounted) setState(() => _error = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error || _bytes == null) return widget.fallback();

    final img = Image.memory(
      _bytes!,
      width: widget.width,
      height: widget.height,
      fit: widget.fit,
      errorBuilder: (_, __, ___) => widget.fallback(),
    );

    if (widget.radius == 0) return img;
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radius),
      child: img,
    );
  }
}

/// Full-bleed gradient fill used as placeholder when `fill: true` and no image.
class _GradientFill extends StatelessWidget {
  final int hue;
  const _GradientFill({required this.hue});

  @override
  Widget build(BuildContext context) {
    final light = HSLColor.fromAHSL(1, hue.toDouble(), 0.55, 0.88).toColor();
    final mid = HSLColor.fromAHSL(1, hue.toDouble(), 0.48, 0.80).toColor();
    final iconColor =
        HSLColor.fromAHSL(1, hue.toDouble(), 0.40, 0.42).toColor();
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: const Alignment(-0.5, -0.8),
          end: const Alignment(0.8, 0.8),
          colors: [light, mid],
        ),
      ),
      child: Center(
        child: Icon(Icons.electrical_services, size: 36, color: iconColor),
      ),
    );
  }
}

class _Shimmer extends StatelessWidget {
  final double? width;
  final double? height;
  final double radius;
  final int hue;
  const _Shimmer(
      {required this.width,
      required this.height,
      required this.radius,
      required this.hue});

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          color: HSLColor.fromAHSL(1, hue.toDouble(), 0.45, 0.88).toColor(),
        ),
      );
}
