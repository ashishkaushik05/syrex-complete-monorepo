import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import '../models/invoice.dart';
import '../models/outlet.dart';
import '../utils/formatters.dart';

Future<Uint8List> buildInvoicePdf(
  InvoiceDetailDto inv,
  OutletProfileDto profile,
) async {
  final doc = pw.Document();

  final accentColor = PdfColor.fromHex('#0E7C5A');
  final mutedColor = PdfColor.fromHex('#736E64');
  final lineColor = PdfColor.fromHex('#EBE8DF');
  final redColor = PdfColor.fromHex('#C24338');

  final due = parseAmount(inv.amountDue);
  final isOverdue = () {
    final dd = tryParseDate(inv.dueDate);
    return dd != null && dd.isBefore(DateTime.now()) && due > 0;
  }();

  doc.addPage(
    pw.Page(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(40),
      build: (ctx) => pw.Column(
        crossAxisAlignment: pw.CrossAxisAlignment.start,
        children: [
          // ── Header ──────────────────────────────────────────
          pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text('SYREX',
                      style: pw.TextStyle(
                          fontSize: 22,
                          fontWeight: pw.FontWeight.bold,
                          color: accentColor)),
                  pw.SizedBox(height: 2),
                  pw.Text('Tax Invoice',
                      style: pw.TextStyle(fontSize: 11, color: mutedColor)),
                ],
              ),
              pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.end,
                children: [
                  pw.Text(inv.invoiceNumber,
                      style: pw.TextStyle(
                          fontSize: 16, fontWeight: pw.FontWeight.bold)),
                  pw.SizedBox(height: 4),
                  _labelValue('Date', fmtDateStr(inv.invoiceDate),
                      mutedColor: mutedColor),
                  if (inv.dueDate != null)
                    _labelValue('Due', fmtDateStr(inv.dueDate),
                        valueColor: isOverdue ? redColor : null,
                        mutedColor: mutedColor),
                  _labelValue('Order', '#${inv.orderNumber}',
                      mutedColor: mutedColor),
                ],
              ),
            ],
          ),
          pw.SizedBox(height: 24),
          pw.Divider(color: lineColor, thickness: 1),
          pw.SizedBox(height: 16),

          // ── Bill To ─────────────────────────────────────────
          pw.Text('BILL TO',
              style: pw.TextStyle(
                  fontSize: 9,
                  fontWeight: pw.FontWeight.bold,
                  color: mutedColor,
                  letterSpacing: 1.2)),
          pw.SizedBox(height: 6),
          pw.Text(profile.legalName ?? profile.name,
              style: pw.TextStyle(
                  fontSize: 13, fontWeight: pw.FontWeight.bold)),
          if (profile.billingAddress1 != null)
            pw.Text(
              [
                profile.billingAddress1,
                profile.billingAddress2,
                profile.billingCity,
                profile.billingState,
                profile.billingPincode,
              ].whereType<String>().join(', '),
              style: pw.TextStyle(fontSize: 10, color: mutedColor),
            )
          else
            pw.Text(profile.address,
                style: pw.TextStyle(fontSize: 10, color: mutedColor)),
          if (profile.gstin != null)
            pw.Text('GSTIN: ${profile.gstin}',
                style: pw.TextStyle(fontSize: 10, color: mutedColor)),

          pw.SizedBox(height: 20),
          pw.Divider(color: lineColor, thickness: 1),
          pw.SizedBox(height: 12),

          // ── Line items ───────────────────────────────────────
          if (inv.lines.isNotEmpty) ...[
            pw.Text('ITEMS',
                style: pw.TextStyle(
                    fontSize: 9,
                    fontWeight: pw.FontWeight.bold,
                    color: mutedColor,
                    letterSpacing: 1.2)),
            pw.SizedBox(height: 8),
            pw.Table(
              border: pw.TableBorder(
                bottom: pw.BorderSide(color: lineColor),
                horizontalInside: pw.BorderSide(color: lineColor, width: 0.5),
              ),
              columnWidths: {
                0: const pw.FlexColumnWidth(3),
                1: const pw.FixedColumnWidth(48),
                2: const pw.FixedColumnWidth(80),
                3: const pw.FixedColumnWidth(80),
              },
              children: [
                pw.TableRow(
                  decoration: pw.BoxDecoration(color: PdfColor.fromHex('#F5F3EE')),
                  children: [
                    _cell('Item', bold: true, muted: mutedColor),
                    _cell('Qty', bold: true, muted: mutedColor, align: pw.Alignment.centerRight),
                    _cell('Unit Price', bold: true, muted: mutedColor, align: pw.Alignment.centerRight),
                    _cell('Amount', bold: true, muted: mutedColor, align: pw.Alignment.centerRight),
                  ],
                ),
                for (final line in inv.lines)
                  pw.TableRow(children: [
                    _cell(line.sku),
                    _cell('${line.qty}', align: pw.Alignment.centerRight),
                    _cell(fmtINR(parseAmount(line.unitPrice)), align: pw.Alignment.centerRight),
                    _cell(fmtINR(parseAmount(line.lineTotal)), align: pw.Alignment.centerRight),
                  ]),
              ],
            ),
            pw.SizedBox(height: 16),
          ],

          // ── Totals ───────────────────────────────────────────
          pw.Align(
            alignment: pw.Alignment.centerRight,
            child: pw.SizedBox(
              width: 240,
              child: pw.Column(children: [
                if (inv.subtotal != null)
                  _totalRow('Subtotal', fmtINR(parseAmount(inv.subtotal!)),
                      lineColor: lineColor, mutedColor: mutedColor),
                if (inv.discountAmount != null &&
                    parseAmount(inv.discountAmount!) > 0)
                  _totalRow(
                      'Discount',
                      '− ${fmtINR(parseAmount(inv.discountAmount!))}',
                      valueColor: accentColor,
                      lineColor: lineColor,
                      mutedColor: mutedColor),
                for (final ch in inv.charges)
                  _totalRow(ch.name, fmtINR(parseAmount(ch.amount)),
                      lineColor: lineColor, mutedColor: mutedColor),
                _totalRow('Total', fmtINR(parseAmount(inv.total)),
                    lineColor: lineColor, mutedColor: mutedColor),
                _totalRow('Amount Paid', fmtINR(parseAmount(inv.amountPaid)),
                    valueColor: accentColor,
                    lineColor: lineColor,
                    mutedColor: mutedColor),
                pw.Divider(color: lineColor, thickness: 1.5),
                pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Text('Balance Due',
                        style: pw.TextStyle(
                            fontSize: 13, fontWeight: pw.FontWeight.bold)),
                    pw.Text(fmtINR(due),
                        style: pw.TextStyle(
                            fontSize: 14,
                            fontWeight: pw.FontWeight.bold,
                            color: due > 0 ? redColor : accentColor)),
                  ],
                ),
              ]),
            ),
          ),

          pw.Spacer(),
          pw.Divider(color: lineColor, thickness: 0.5),
          pw.SizedBox(height: 6),
          pw.Text('Generated by Syrex Outlet App',
              style: pw.TextStyle(fontSize: 8, color: mutedColor)),
        ],
      ),
    ),
  );

  return doc.save();
}

pw.Widget _labelValue(String label, String? value,
    {PdfColor? valueColor, required PdfColor mutedColor}) {
  return pw.Row(
    mainAxisSize: pw.MainAxisSize.min,
    children: [
      pw.Text('$label: ',
          style: pw.TextStyle(fontSize: 9, color: mutedColor)),
      pw.Text(value ?? '—',
          style: pw.TextStyle(
              fontSize: 9,
              fontWeight: pw.FontWeight.bold,
              color: valueColor)),
    ],
  );
}

pw.Widget _cell(String text,
    {bool bold = false,
    pw.Alignment align = pw.Alignment.centerLeft,
    PdfColor? muted}) {
  return pw.Padding(
    padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 7),
    child: pw.Align(
      alignment: align,
      child: pw.Text(text,
          style: pw.TextStyle(
              fontSize: 10,
              fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
              color: muted)),
    ),
  );
}

pw.Widget _totalRow(String label, String value,
    {PdfColor? valueColor,
    required PdfColor lineColor,
    required PdfColor mutedColor}) {
  return pw.Container(
    padding: const pw.EdgeInsets.symmetric(vertical: 4),
    decoration: pw.BoxDecoration(
        border: pw.Border(bottom: pw.BorderSide(color: lineColor, width: 0.5))),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Text(label,
            style: pw.TextStyle(fontSize: 10, color: mutedColor)),
        pw.Text(value,
            style: pw.TextStyle(
                fontSize: 10,
                fontWeight: pw.FontWeight.bold,
                color: valueColor)),
      ],
    ),
  );
}
