import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/app_icons.dart';

class RbTabItem {
  const RbTabItem({
    required this.id,
    required this.label,
    required this.icon,
    this.badge,
  });
  final String id;
  final String label;
  final String icon;
  final int? badge;
}

class RbTabBar extends StatelessWidget {
  const RbTabBar({
    super.key,
    required this.tabs,
    required this.activeTab,
    required this.onTabChanged,
  });

  final List<RbTabItem> tabs;
  final String activeTab;
  final ValueChanged<String> onTabChanged;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;
    final bottomPad = MediaQuery.of(context).padding.bottom;

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: cs.bg.withAlpha(230),
            border: Border(top: BorderSide(color: cs.line, width: AppSpacing.hairline)),
          ),
          padding: EdgeInsets.only(bottom: bottomPad),
          child: SizedBox(
            height: 56,
            child: Row(
              children: tabs.map((t) {
                final active = t.id == activeTab;
                final color = active ? cs.accent : cs.ink2;
                return Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => onTabChanged(t.id),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            RbIcon(t.icon, size: 22, color: color),
                            if (t.badge != null && t.badge! > 0)
                              Positioned(
                                top: -4,
                                right: -8,
                                child: Container(
                                  constraints: const BoxConstraints(minWidth: 16),
                                  height: 16,
                                  padding: const EdgeInsets.symmetric(horizontal: 4),
                                  decoration: BoxDecoration(
                                    color: cs.accent,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Center(
                                    child: Text(
                                      '${t.badge}',
                                      style: GoogleFonts.geist(
                                        fontSize: 9,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          t.label,
                          style: GoogleFonts.geist(
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            color: color,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ),
      ),
    );
  }
}
