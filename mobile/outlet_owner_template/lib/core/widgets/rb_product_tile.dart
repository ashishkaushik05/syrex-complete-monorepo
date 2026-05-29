import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:outlet_owner_template/core/design/app_colors.dart';
import 'package:outlet_owner_template/core/design/app_spacing.dart';
import 'package:outlet_owner_template/core/design/money_formatter.dart';
import 'package:outlet_owner_template/core/widgets/rb_card.dart';

/// Product tile matching the design's ProductTile component.
/// Card with image placeholder (40×40 rounded), product name (14px w500), meta line (category · price), optional badge.
class RbProductTile extends StatelessWidget {
  const RbProductTile({
    super.key,
    required this.name,
    required this.price,
    this.category,
    this.sku,
    this.onTap,
    this.trailing,
    this.imageUrl,
  });

  final String name;
  final num price;
  final String? category;
  final String? sku;
  final VoidCallback? onTap;
  final Widget? trailing;
  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).extension<AppColorScheme>()!;

    return RbCard(
      onTap: onTap,
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          // Image / placeholder
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: cs.surface2,
              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
            ),
            child: imageUrl != null
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    child: Image.network(imageUrl!, fit: BoxFit.cover),
                  )
                : Center(
                    child: Text(
                      name.substring(0, 1).toUpperCase(),
                      style: GoogleFonts.geist(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: cs.ink2,
                      ),
                    ),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: GoogleFonts.geist(fontSize: 14, fontWeight: FontWeight.w500, color: cs.ink),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    if (category != null)
                      Text(category!, style: GoogleFonts.geist(fontSize: 12, color: cs.ink2)),
                    if (category != null && sku != null)
                      Text(' · ', style: GoogleFonts.geist(fontSize: 12, color: cs.ink2)),
                    if (sku != null)
                      Text(sku!, style: GoogleFonts.geistMono(fontSize: 11, color: cs.ink2)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (trailing != null)
            trailing!
          else
            Text(
              MoneyFormatter.format(price),
              style: GoogleFonts.geistMono(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: cs.ink,
              ),
            ),
        ],
      ),
    );
  }
}
