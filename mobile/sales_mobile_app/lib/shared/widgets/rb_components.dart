import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../app/theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────
// Color helpers
// ─────────────────────────────────────────────────────────────

/// Resolves light/dark token from [BuildContext].
RbThemeColors rbColors(BuildContext context) =>
    RbThemeColors(isDark: Theme.of(context).brightness == Brightness.dark);

// ─────────────────────────────────────────────────────────────
// Typography helpers
// ─────────────────────────────────────────────────────────────

TextStyle rbH1(BuildContext context) => GoogleFonts.inter(
      fontSize: 28,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.7,
      height: 1.1,
      color: rbColors(context).ink,
    );

TextStyle rbH2(BuildContext context) => GoogleFonts.inter(
      fontSize: 20,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.3,
      color: rbColors(context).ink,
    );

TextStyle rbH3(BuildContext context) => GoogleFonts.inter(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      letterSpacing: -0.16,
      color: rbColors(context).ink,
    );

TextStyle rbBody(BuildContext context) => GoogleFonts.inter(
      fontSize: 14,
      color: rbColors(context).ink2,
      height: 1.45,
    );

TextStyle rbMeta(BuildContext context) => GoogleFonts.inter(
      fontSize: 12,
      color: rbColors(context).muted,
    );

TextStyle rbMono(BuildContext context, {double size = 13, FontWeight weight = FontWeight.w400}) =>
    GoogleFonts.jetBrainsMono(
      fontSize: size,
      fontWeight: weight,
      color: rbColors(context).ink,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

TextStyle rbMoney(BuildContext context, {double size = 14, FontWeight weight = FontWeight.w500}) =>
    GoogleFonts.inter(
      fontSize: size,
      fontWeight: weight,
      color: rbColors(context).ink,
      fontFeatures: const [FontFeature.tabularFigures()],
      letterSpacing: -0.01 * size,
    );

// ─────────────────────────────────────────────────────────────
// Indian Rupee formatter
// ─────────────────────────────────────────────────────────────

String fmtMoney(num? n, {bool compact = false, String sign = '₹'}) {
  if (n == null) return '—';
  final neg = n < 0;
  final abs = n.abs();
  if (compact) {
    if (abs >= 1e7) return '${neg ? '−' : ''}$sign${(abs / 1e7).toStringAsFixed(2).replaceAll(RegExp(r'\.?0+$'), '')}Cr';
    if (abs >= 1e5) return '${neg ? '−' : ''}$sign${(abs / 1e5).toStringAsFixed(2).replaceAll(RegExp(r'\.?0+$'), '')}L';
    if (abs >= 1e3) return '${neg ? '−' : ''}$sign${(abs / 1e3).toStringAsFixed(1).replaceAll(RegExp(r'\.?0+$'), '')}k';
  }
  final rounded = abs.round();
  final s = rounded.toString();
  final last3 = s.length > 3 ? s.substring(s.length - 3) : s;
  final rest = s.length > 3 ? s.substring(0, s.length - 3) : '';
  final grouped = rest.isNotEmpty
      ? '${rest.replaceAllMapped(RegExp(r'\B(?=(\d{2})+(?!\d))'), (_) => ',')},$last3'
      : last3;
  return '${neg ? '−' : ''}$sign$grouped';
}

// ─────────────────────────────────────────────────────────────
// RbCard — `.rb-card`
// ─────────────────────────────────────────────────────────────

class RbCard extends StatelessWidget {
  const RbCard({
    super.key,
    required this.child,
    this.padding,
    this.onTap,
    this.color,
    this.borderColor,
    this.radius = 12.0,
    this.clipContent = false,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final double radius;
  final bool clipContent;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final bg = color ?? c.surface;
    final border = borderColor ?? c.line;

    final box = Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border, width: 0.5),
        borderRadius: BorderRadius.circular(radius),
      ),
      child: clipContent
          ? ClipRRect(borderRadius: BorderRadius.circular(radius), child: _inner)
          : _inner,
    );

    if (onTap == null) return box;

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(radius),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: box,
      ),
    );
  }

  Widget get _inner => padding != null ? Padding(padding: padding!, child: child) : child;
}

// ─────────────────────────────────────────────────────────────
// RbChip — `.rb-chip` + tone variants
// ─────────────────────────────────────────────────────────────

enum RbTone { neutral, accent, warn, danger, info, success }

class RbChip extends StatelessWidget {
  const RbChip({
    super.key,
    required this.label,
    this.tone = RbTone.neutral,
    this.leading,
    this.mono = false,
  });

  final String label;
  final RbTone tone;
  final Widget? leading;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);

    Color bg, fg;
    Color? bd;
    switch (tone) {
      case RbTone.accent:
        bg = c.accentSoft;
        fg = RbColors.accent;
        bd = c.accentLine;
      case RbTone.warn:
        bg = c.warnSoft;
        fg = RbColors.warn;
        bd = null;
      case RbTone.danger:
        bg = c.dangerSoft;
        fg = RbColors.danger;
        bd = null;
      case RbTone.info:
        bg = c.infoSoft;
        fg = RbColors.info;
        bd = null;
      case RbTone.success:
        bg = c.successSoft;
        fg = RbColors.success;
        bd = null;
      case RbTone.neutral:
        bg = c.surface2;
        fg = c.ink2;
        bd = c.line;
    }

    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: bd ?? Colors.transparent, width: 0.5),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 4)],
          Text(
            label,
            style: mono
                ? GoogleFonts.jetBrainsMono(fontSize: 11, fontWeight: FontWeight.w500, color: fg)
                : GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w500, color: fg, letterSpacing: 0.01),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// StatusChip — maps order/invoice status → tone
// ─────────────────────────────────────────────────────────────

const _orderStatusMeta = {
  'pending_approval': (label: 'Pending approval', tone: RbTone.warn),
  'approved': (label: 'Approved', tone: RbTone.info),
  'partially_dispatched': (label: 'Part dispatched', tone: RbTone.info),
  'fully_dispatched': (label: 'Dispatched', tone: RbTone.success),
  'rejected': (label: 'Rejected', tone: RbTone.danger),
  'cancelled': (label: 'Cancelled', tone: RbTone.neutral),
  'on_hold': (label: 'On hold', tone: RbTone.warn),
};

const _invoiceStatusMeta = {
  'paid': (label: 'Paid', tone: RbTone.success),
  'partial': (label: 'Partial', tone: RbTone.warn),
  'overdue': (label: 'Overdue', tone: RbTone.danger),
  'open': (label: 'Open', tone: RbTone.info),
};

class StatusChip extends StatelessWidget {
  const StatusChip.order(this.status, {super.key}) : _map = _orderStatusMeta;
  const StatusChip.invoice(this.status, {super.key}) : _map = _invoiceStatusMeta;

  final String status;
  final Map<String, ({String label, RbTone tone})> _map;

  @override
  Widget build(BuildContext context) {
    final meta = _map[status] ?? (label: status, tone: RbTone.neutral);
    return RbChip(label: meta.label, tone: meta.tone);
  }
}

// ─────────────────────────────────────────────────────────────
// StatusDot — `.rb-dot`
// ─────────────────────────────────────────────────────────────

class StatusDot extends StatelessWidget {
  const StatusDot({
    super.key,
    this.tone = RbTone.neutral,
    this.pulse = false,
    this.label,
    this.size = 6.0,
  });

  final RbTone tone;
  final bool pulse;
  final String? label;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    Color color;
    switch (tone) {
      case RbTone.accent || RbTone.success:
        color = RbColors.accent;
      case RbTone.warn:
        color = RbColors.warn;
      case RbTone.danger:
        color = RbColors.danger;
      case RbTone.info:
        color = RbColors.info;
      default:
        color = c.muted;
    }
    final dot = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        boxShadow: tone == RbTone.accent || tone == RbTone.success
            ? [BoxShadow(color: color.withOpacity(0.35), blurRadius: 0, spreadRadius: 3)]
            : null,
      ),
    );
    final animated = pulse ? _PulseWidget(child: dot) : dot;
    if (label == null) return animated;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        animated,
        const SizedBox(width: 5),
        Text(label!, style: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w500, color: c.ink2)),
      ],
    );
  }
}

class _PulseWidget extends StatefulWidget {
  const _PulseWidget({required this.child});
  final Widget child;

  @override
  State<_PulseWidget> createState() => _PulseWidgetState();
}

class _PulseWidgetState extends State<_PulseWidget> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _scale = Tween<double>(begin: 1.0, end: 1.06).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
    _opacity = Tween<double>(begin: 1.0, end: 0.7).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _ctrl,
        builder: (_, child) => Transform.scale(
          scale: _scale.value,
          child: Opacity(opacity: _opacity.value, child: child),
        ),
        child: widget.child,
      );
}

// ─────────────────────────────────────────────────────────────
// RbBtn — `.rb-btn`
// ─────────────────────────────────────────────────────────────

enum RbBtnVariant { primary, accent, outline, ghost }
enum RbBtnSize { sm, regular, lg }

class RbBtn extends StatelessWidget {
  const RbBtn({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = RbBtnVariant.outline,
    this.size = RbBtnSize.regular,
    this.leading,
    this.trailing,
    this.block = false,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final RbBtnVariant variant;
  final RbBtnSize size;
  final Widget? leading;
  final Widget? trailing;
  final bool block;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final double height = switch (size) {
      RbBtnSize.sm => 32,
      RbBtnSize.regular => 44,
      RbBtnSize.lg => 52,
    };
    final double fontSize = switch (size) {
      RbBtnSize.sm => 13,
      RbBtnSize.regular => 15,
      RbBtnSize.lg => 16,
    };
    final EdgeInsets padding = switch (size) {
      RbBtnSize.sm => const EdgeInsets.symmetric(horizontal: 10),
      RbBtnSize.regular => const EdgeInsets.symmetric(horizontal: 14),
      RbBtnSize.lg => const EdgeInsets.symmetric(horizontal: 16),
    };
    final double radius = switch (size) {
      RbBtnSize.sm => 8,
      RbBtnSize.regular => 10,
      RbBtnSize.lg => 12,
    };

    Color bg, fg;
    Color? borderColor;

    switch (variant) {
      case RbBtnVariant.primary:
        bg = c.ink;
        fg = c.bg;
        borderColor = null;
      case RbBtnVariant.accent:
        bg = RbColors.accent;
        fg = RbColors.accentInk;
        borderColor = null;
      case RbBtnVariant.outline:
        bg = c.surface;
        fg = c.ink;
        borderColor = c.line;
      case RbBtnVariant.ghost:
        bg = Colors.transparent;
        fg = c.ink;
        borderColor = null;
    }

    final child = loading
        ? SizedBox(
            width: fontSize,
            height: fontSize,
            child: CircularProgressIndicator(strokeWidth: 2, color: fg),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (leading != null) ...[leading!, const SizedBox(width: 6)],
              Text(
                label,
                style: GoogleFonts.inter(
                  fontSize: fontSize,
                  fontWeight: FontWeight.w500,
                  letterSpacing: -0.01,
                  color: fg,
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 6), trailing!],
            ],
          );

    return SizedBox(
      height: height,
      width: block ? double.infinity : null,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          onTap: loading ? null : onPressed,
          borderRadius: BorderRadius.circular(radius),
          splashColor: Colors.transparent,
          highlightColor: Colors.black.withOpacity(0.04),
          child: Container(
            padding: padding,
            decoration: borderColor != null
                ? BoxDecoration(
                    border: Border.all(color: borderColor, width: 0.5),
                    borderRadius: BorderRadius.circular(radius),
                  )
                : null,
            alignment: Alignment.center,
            child: child,
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RbTopBar — sticky frosted top bar
// ─────────────────────────────────────────────────────────────

class RbTopBar extends StatelessWidget implements PreferredSizeWidget {
  const RbTopBar({
    super.key,
    this.title,
    this.largeTitle = true,
    this.sub,
    this.leading,
    this.actions = const [],
    this.bottom,
    this.extraHeight = 0,
  });

  final String? title;
  final bool largeTitle;
  final String? sub;
  final Widget? leading;
  final List<Widget> actions;
  final Widget? bottom;
  final double extraHeight;

  static const double _statusBarHeight = 50.0;
  static const double _toolbarHeight = 44.0 + 12.0 * 2; // 44 + padding

  @override
  Size get preferredSize => Size.fromHeight(
        _statusBarHeight +
            _toolbarHeight +
            (largeTitle && title != null ? 52.0 : 0) +
            (bottom != null ? 44.0 : 0) +
            extraHeight,
      );

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          color: c.bg.withOpacity(0.86),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Toolbar row
              SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: Row(
                    children: [
                      if (leading != null) ...[
                        SizedBox(width: 36, child: leading),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: largeTitle
                            ? const SizedBox.shrink()
                            : title != null
                                ? Text(
                                    title!,
                                    style: GoogleFonts.inter(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: -0.15,
                                      color: c.ink,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  )
                                : const SizedBox.shrink(),
                      ),
                      ...actions.map((a) => Padding(padding: const EdgeInsets.only(left: 8), child: a)),
                    ],
                  ),
                ),
              ),
              // Large title
              if (largeTitle && title != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title!, style: rbH1(context)),
                      if (sub != null) ...[
                        const SizedBox(height: 4),
                        Text(sub!, style: rbMeta(context)),
                      ],
                    ],
                  ),
                ),
              if (bottom != null) bottom!,
              // Hair-line border bottom
              Divider(height: 0.5, thickness: 0.5, color: c.line),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RbSection — labeled section header
// ─────────────────────────────────────────────────────────────

class RbSection extends StatelessWidget {
  const RbSection({
    super.key,
    required this.label,
    this.action,
    this.onAction,
    this.child,
    this.padded = true,
  });

  final String label;
  final String? action;
  final VoidCallback? onAction;
  final Widget? child;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 8),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label.toUpperCase(),
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.88,
                    color: c.muted,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (action != null)
                TextButton(
                  onPressed: onAction,
                  style: TextButton.styleFrom(
                    minimumSize: Size.zero,
                    padding: const EdgeInsets.only(left: 10),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    action!,
                    style: GoogleFonts.inter(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: RbColors.accent,
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (child != null)
          padded ? Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: child!) : child!,
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RbRow — list row with hairline divider
// ─────────────────────────────────────────────────────────────

class RbRow extends StatelessWidget {
  const RbRow({
    super.key,
    required this.child,
    this.onTap,
    this.hasDivider = true,
    this.isFirst = false,
    this.minHeight = 56.0,
    this.crossAxisAlignment = CrossAxisAlignment.center,
  });

  final Widget child;
  final VoidCallback? onTap;
  final bool hasDivider;
  final bool isFirst;
  final double minHeight;
  final CrossAxisAlignment crossAxisAlignment;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final content = Container(
      constraints: BoxConstraints(minHeight: minHeight),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: child,
    );

    final withDivider = (hasDivider && !isFirst)
        ? Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Divider(height: 0.5, thickness: 0.5, color: c.line),
              content,
            ],
          )
        : content;

    if (onTap == null) return withDivider;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        splashColor: Colors.transparent,
        highlightColor: c.surface2.withOpacity(0.7),
        child: withDivider,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// ProductTile — colored gradient product icon
// ─────────────────────────────────────────────────────────────

const _brandColors = [
  Color(0xFF0F766E), Color(0xFF7C3AED), Color(0xFFDC2626),
  Color(0xFF0369A1), Color(0xFF0891B2), Color(0xFFDB2777),
  Color(0xFFCA8A04), Color(0xFF059669), Color(0xFF9333EA),
];

Color brandColorForId(String id) {
  int h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
  }
  return _brandColors[h.abs() % _brandColors.length];
}

class ProductTile extends StatelessWidget {
  const ProductTile({
    super.key,
    this.color,
    this.brandId,
    this.size = 56,
    this.icon = Icons.inventory_2_outlined,
    this.radius = 10.0,
  });

  final Color? color;
  final String? brandId;
  final double size;
  final IconData icon;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final base = color ?? (brandId != null ? brandColorForId(brandId!) : RbColors.accent);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            base,
            Color.lerp(base, Colors.black, 0.4)!,
          ],
        ),
        boxShadow: [
          BoxShadow(color: Colors.white.withOpacity(0.18), spreadRadius: -1, blurRadius: 0),
        ],
      ),
      child: Icon(icon, size: size * 0.42, color: Colors.white),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RbAvatar — initials circle
// ─────────────────────────────────────────────────────────────

class RbAvatar extends StatelessWidget {
  const RbAvatar({
    super.key,
    required this.initials,
    this.size = 36,
    this.dark = true,
  });

  final String initials;
  final double size;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final bg = dark ? c.ink : c.surface2;
    final fg = dark ? c.bg : c.ink;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: bg,
        border: Border.all(color: c.line, width: 0.5),
      ),
      alignment: Alignment.center,
      child: Text(
        initials.toUpperCase(),
        style: GoogleFonts.inter(
          fontSize: size * 0.36,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.02,
          color: fg,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RbSearchInput
// ─────────────────────────────────────────────────────────────

class RbSearchInput extends StatelessWidget {
  const RbSearchInput({
    super.key,
    this.controller,
    this.onChanged,
    this.placeholder = 'Search',
  });

  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final String placeholder;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return SizedBox(
      height: 38,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: GoogleFonts.inter(fontSize: 14, color: c.ink),
        decoration: InputDecoration(
          hintText: placeholder,
          hintStyle: GoogleFonts.inter(fontSize: 14, color: c.muted2),
          prefixIcon: Padding(
            padding: const EdgeInsets.only(left: 10, right: 6),
            child: Icon(Icons.search, size: 16, color: c.muted),
          ),
          prefixIconConstraints: const BoxConstraints(minWidth: 34),
          filled: true,
          fillColor: c.surface2,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide.none,
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: c.line2, width: 0.5),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RbEmpty — empty state
// ─────────────────────────────────────────────────────────────

class RbEmpty extends StatelessWidget {
  const RbEmpty({
    super.key,
    this.icon = Icons.inventory_2_outlined,
    required this.title,
    this.sub,
  });

  final IconData icon;
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: c.surface2,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 22, color: c.muted),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w500, color: c.ink2),
            textAlign: TextAlign.center,
          ),
          if (sub != null) ...[
            const SizedBox(height: 4),
            Text(sub!, style: GoogleFonts.inter(fontSize: 13, color: c.muted), textAlign: TextAlign.center),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// RbIconBtn — square icon button for app bars
// ─────────────────────────────────────────────────────────────

class RbIconBtn extends StatelessWidget {
  const RbIconBtn({super.key, required this.icon, this.onTap, this.badge});

  final IconData icon;
  final VoidCallback? onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final btn = Material(
      color: c.surface2,
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: c.line, width: 0.5),
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: 18, color: c.ink2),
        ),
      ),
    );

    if (badge == null) return btn;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        btn,
        Positioned(
          top: -3,
          right: -3,
          child: Container(
            constraints: const BoxConstraints(minWidth: 16),
            height: 16,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            decoration: BoxDecoration(
              color: RbColors.danger,
              borderRadius: BorderRadius.circular(99),
            ),
            alignment: Alignment.center,
            child: Text(
              '$badge',
              style: const TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
// MapBackground — `.rb-map` grid overlay
// ─────────────────────────────────────────────────────────────

class MapBackground extends StatelessWidget {
  const MapBackground({super.key, this.child, this.height});

  final Widget? child;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return SizedBox(
      height: height,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  RbColors.accent.withOpacity(0.12),
                  RbColors.info.withOpacity(0.08),
                  c.surface2,
                ],
              ),
            ),
          ),
          Opacity(
            opacity: 0.4,
            child: CustomPaint(
              painter: _GridPainter(color: c.line),
            ),
          ),
          if (child != null) child!,
        ],
      ),
    );
  }
}

class _GridPainter extends CustomPainter {
  const _GridPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 0.5;
    const step = 32.0;
    for (double x = 0; x <= size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }
    for (double y = 0; y <= size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(_GridPainter old) => old.color != color;
}

// ─────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────

class RbProgressBar extends StatelessWidget {
  const RbProgressBar({
    super.key,
    required this.value,
    this.height = 6,
    this.color,
    this.backgroundColor,
  });

  final double value; // 0..1
  final double height;
  final Color? color;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final pct = value.clamp(0.0, 1.0);
    final barColor = color ??
        (pct > 0.8 ? RbColors.danger : pct > 0.6 ? RbColors.warn : RbColors.accent);

    return ClipRRect(
      borderRadius: BorderRadius.circular(height / 2),
      child: SizedBox(
        height: height,
        child: LinearProgressIndicator(
          value: pct,
          backgroundColor: backgroundColor ?? c.surface2,
          valueColor: AlwaysStoppedAnimation<Color>(barColor),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Filter chip row — scrollable horizontal filter chips
// ─────────────────────────────────────────────────────────────

class RbFilterChips<T> extends StatelessWidget {
  const RbFilterChips({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.padding = const EdgeInsets.fromLTRB(12, 0, 12, 12),
  });

  final List<({T value, String label})> options;
  final T selected;
  final ValueChanged<T> onSelected;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return SizedBox(
      height: 32 + 12,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: padding,
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (context, i) {
          final opt = options[i];
          final active = opt.value == selected;
          return GestureDetector(
            onTap: () => onSelected(opt.value),
            child: Container(
              height: 32,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: active ? c.ink : c.surface2,
                borderRadius: BorderRadius.circular(99),
                border: Border.all(
                  color: active ? Colors.transparent : c.line,
                  width: 0.5,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                opt.label,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: active ? c.bg : c.ink2,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Row key-value pair (for totals/breakdown tables)
// ─────────────────────────────────────────────────────────────

class RbKvRow extends StatelessWidget {
  const RbKvRow({
    super.key,
    required this.k,
    required this.v,
    this.accent = false,
    this.muted = false,
    this.bold = false,
    this.dangerV = false,
  });

  final String k;
  final String v;
  final bool accent;
  final bool muted;
  final bool bold;
  final bool dangerV;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Text(
            k,
            style: GoogleFonts.inter(
              fontSize: 13,
              color: muted ? c.muted : c.ink2,
            ),
          ),
          Text(
            v,
            style: GoogleFonts.inter(
              fontSize: bold ? 16 : 14,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
              color: dangerV
                  ? RbColors.danger
                  : accent
                      ? RbColors.accent
                      : c.ink,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Toast overlay
// ─────────────────────────────────────────────────────────────

class RbToast {
  static OverlayEntry? _entry;

  static void show(BuildContext context, String message) {
    _entry?.remove();
    final overlay = Overlay.of(context);
    _entry = OverlayEntry(
      builder: (_) => Positioned(
        top: MediaQuery.of(context).padding.top + 60,
        left: 0,
        right: 0,
        child: Center(
          child: Material(
            color: Colors.transparent,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFF09090B),
                borderRadius: BorderRadius.circular(99),
                boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 30, offset: Offset(0, 10))],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.check, size: 14, color: RbColors.accent),
                  const SizedBox(width: 8),
                  Text(
                    message,
                    style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    overlay.insert(_entry!);
    Future.delayed(const Duration(milliseconds: 2200), () {
      _entry?.remove();
      _entry = null;
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Qty stepper
// ─────────────────────────────────────────────────────────────

enum RbQtySize { sm, regular }

class RbQtyStepper extends StatelessWidget {
  const RbQtyStepper({
    super.key,
    required this.qty,
    this.onDecrement,
    this.onIncrement,
    this.size = RbQtySize.regular,
  });

  final int qty;
  final VoidCallback? onDecrement;
  final VoidCallback? onIncrement;
  final RbQtySize size;

  @override
  Widget build(BuildContext context) {
    final c = rbColors(context);
    final h = size == RbQtySize.sm ? 28.0 : 36.0;
    final btnW = size == RbQtySize.sm ? 26.0 : 32.0;
    final numW = size == RbQtySize.sm ? 24.0 : 28.0;
    final fontSize = size == RbQtySize.sm ? 12.0 : 14.0;

    return Container(
      height: h,
      decoration: BoxDecoration(
        color: c.surface2,
        borderRadius: BorderRadius.circular(h / 2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _StepBtn(width: btnW, height: h, icon: Icons.remove, onTap: onDecrement ?? () {}, c: c),
          SizedBox(
            width: numW,
            child: Text(
              '$qty',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: fontSize,
                fontWeight: FontWeight.w600,
                fontFeatures: const [FontFeature.tabularFigures()],
                color: c.ink,
              ),
            ),
          ),
          _StepBtn(width: btnW, height: h, icon: Icons.add, onTap: onIncrement ?? () {}, c: c),
        ],
      ),
    );
  }
}

class _StepBtn extends StatelessWidget {
  const _StepBtn({
    required this.width,
    required this.height,
    required this.icon,
    required this.onTap,
    required this.c,
  });

  final double width, height;
  final IconData icon;
  final VoidCallback onTap;
  final RbThemeColors c;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: SizedBox(
          width: width,
          height: height,
          child: Icon(icon, size: width * 0.44, color: c.ink),
        ),
      );
}
