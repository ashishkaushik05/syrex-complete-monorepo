# Invoices Feature — Behavioral Specification

**Scope:** InvoicesListScreen, InvoiceDetailScreen, InvoicePdfService (buildInvoicePdf),
InvoiceListTile widget, and all data models in the invoices domain.

**Audience:** Test writer who has not seen the source code. This document is the only input.

---

# Component: InvoiceDto

## Purpose

Represents a single invoice in list context. Contains enough data to render a tile and
compute payment/overdue status without fetching full detail.

## Fields

| Field | Dart type | Required | Notes |
|---|---|---|---|
| `id` | `String` | yes | Unique invoice identifier (UUID) |
| `invoiceNumber` | `String` | yes | Human-readable invoice reference, e.g. `INV-2024-001` |
| `orderId` | `String` | yes | FK to the parent order |
| `outletId` | `String` | yes | FK to the outlet; defaults to `''` if JSON key is absent or null |
| `invoiceDate` | `String?` | no | ISO date string or null |
| `dueDate` | `String?` | no | ISO date string or null |
| `total` | `String` | yes | Monetary total stored as string; JSON value is coerced via `.toString()` (handles num or String) |
| `amountPaid` | `String` | yes | Cumulative amount paid; coerced via `.toString()` |
| `amountDue` | `String` | yes | Remaining balance; coerced via `.toString()` |
| `createdAt` | `String?` | no | ISO datetime string or null |

## fromJson Contract

- `id`, `invoiceNumber`, `orderId` are cast directly as `String` — a null or missing value throws a cast exception.
- `outletId` uses a null-safe cast: `j['outletId'] as String? ?? ''` — missing or null key becomes an empty string.
- `total`, `amountPaid`, `amountDue` call `.toString()` on whatever the JSON provides. This means the server may return these as a number (`123.45`) or a string (`"123.45"`) — both are accepted. The resulting Dart field is always a `String`.
- `invoiceDate`, `dueDate`, `createdAt` are nullable string casts (`as String?`).

## Edge Cases

- If `total`, `amountPaid`, or `amountDue` is JSON `null`, `.toString()` on null returns the literal string `"null"`. Downstream code (parseAmount) must handle this gracefully.
- If `outletId` is missing from the JSON map entirely, the result is `''` (empty string), not an error.

---

# Component: InvoiceCharge

## Purpose

Represents an additional charge line on an invoice (e.g. GST, delivery fee, surcharge).
Displayed in the detail screen and included in the PDF totals section.

## Fields

| Field | Dart type | Required | Notes |
|---|---|---|---|
| `id` | `String` | yes | Unique charge identifier |
| `name` | `String` | yes | Display label for the charge, e.g. `"GST 18%"` |
| `type` | `String` | yes | Charge category identifier (opaque string) |
| `rate` | `String` | yes | Rate value coerced via `.toString()` |
| `amount` | `String` | yes | Charge amount coerced via `.toString()` |
| `displayOrder` | `int` | yes | Sort order for rendering; JSON value is `num?`, defaulting to `0` if absent |

## fromJson Contract

- `id`, `name`, `type` are direct `String` casts — null or missing throws.
- `rate` and `amount` call `.toString()` — accept numeric or string JSON values.
- `displayOrder` is cast to `num?` then converted to int via `.toInt()`, with `?? 0` default if JSON key is absent or null.

## Edge Cases

- `displayOrder` absent in JSON resolves to `0`, not an error.
- The `type` field is stored as a raw string; the UI never reads it — it is for future server-side filtering only.

---

# Component: InvoiceLine

## Purpose

Represents a single product line item within an invoice. Used in the detail screen's
"Line items" section and in the PDF items table.

## Fields

| Field | Dart type | Required | Notes |
|---|---|---|---|
| `id` | `String` | yes | Unique line identifier |
| `sku` | `String` | yes | Product SKU code displayed as-is |
| `qty` | `int` | yes | Quantity; JSON value is `num` cast to `int` via `.toInt()` — must not be null |
| `unitPrice` | `String` | yes | Per-unit price coerced via `.toString()` |
| `lineTotal` | `String` | yes | `qty × unitPrice` total coerced via `.toString()` |

## fromJson Contract

- `id` and `sku` are direct `String` casts.
- `qty` is `(j['qty'] as num).toInt()` — if the key is absent or null a cast exception is thrown.
- `unitPrice` and `lineTotal` call `.toString()` on the JSON value.

## Edge Cases

- `qty` must be present and numeric in JSON; there is no default.
- `unitPrice` shown in the PDF; if the server omits it the string becomes `"null"` and will render as the literal text.

---

# Component: InvoiceDetailDto

## Purpose

Extends `InvoiceDto` with full detail fields needed to render the detail screen and
generate the PDF. Fetched by a separate API call; not included in list responses.

## Inherited Fields

All fields from `InvoiceDto` (see above) plus:

## Additional Fields

| Field | Dart type | Required | Notes |
|---|---|---|---|
| `orderNumber` | `String` | yes | Human-readable order reference, e.g. `ORD-001`; defaults to `''` if JSON key is absent or null |
| `subtotal` | `String?` | no | Pre-charge, pre-discount total; coerced via `?.toString()` — null if JSON key is absent or null |
| `discountAmount` | `String?` | no | Discount amount applied; coerced via `?.toString()` — null if JSON key is absent or null |
| `charges` | `List<InvoiceCharge>` | yes | List of additional charge rows; defaults to `[]` if JSON key is absent or null |
| `lines` | `List<InvoiceLine>` | yes | List of product line items; defaults to `[]` if JSON key is absent or null |

## fromJson Contract

- `orderNumber` uses `j['orderNumber'] as String? ?? ''` — missing or null becomes empty string.
- `subtotal` and `discountAmount` use `j[key]?.toString()` — if the key is absent or the value is JSON null, the Dart field is `null`.
- `charges` uses `(j['charges'] as List<dynamic>? ?? [])` — a missing key or JSON null yields an empty list.
- `lines` uses `(j['lines'] as List<dynamic>? ?? [])` — a missing key or JSON null yields an empty list.
- Numeric values inside each charge/line item are parsed by their respective `fromJson` factories.

## Edge Cases

- If `subtotal` is `null`, the UI omits the subtotal row entirely (both screen and PDF).
- If `discountAmount` is `null` or its parsed amount is `0`, the discount row is omitted from the PDF. The screen omits the row only when `discountAmount` is null (it does not check for zero).
- An empty `charges` list means no extra charge rows are rendered.
- An empty `lines` list means the "Line items" section is hidden on both the screen and the PDF.

---

# Component: PagedInvoices

## Purpose

Wraps the paginated invoice list API response. Holds the current page of invoice
summaries and an optional cursor for fetching the next page.

## Fields

| Field | Dart type | Required | Notes |
|---|---|---|---|
| `items` | `List<InvoiceDto>` | yes | Current page of invoices; JSON array must be present (not nullable) |
| `nextCursor` | `String?` | no | Opaque pagination cursor; null if no further pages exist |

## fromJson Contract

- `items` is `(j['items'] as List<dynamic>)` — must be a JSON array; absent or null throws.
- Each element in `items` is parsed via `InvoiceDto.fromJson`.
- `nextCursor` is `j['nextCursor'] as String?` — null if absent or JSON null.

## Pagination Notes

The current list screen implementation fetches the first page only (no cursor passed).
The `nextCursor` value is parsed and stored in `PagedInvoices` but the list screen does
not use it to load additional pages. Load-more / infinite scroll is not implemented in
the current version. The `invoiceHistory` API method accepts an optional `cursor`
parameter that would be used for future pagination.

---

# Component: InvoiceListTile

## Purpose

Renders a single-invoice card in the invoices list. Displays invoice reference,
issue date, due date or settled status, amount, and a status badge. Tappable to
navigate to the detail screen.

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `invoice` | `InvoiceDto` | yes | Invoice data to display |
| `onTap` | `VoidCallback` | yes | Callback invoked when the tile is tapped |
| `c` | `AppThemeColors` | yes | Theme color set (light or dark) |

## Status Derivation Logic

The tile computes an internal `_status` string before rendering. The logic is:

1. Parse `amountDue` as a number using `parseAmount()`.
2. If `amountDue <= 0` → status is `'paid'`.
3. Otherwise, parse `dueDate` using `tryParseDate()`.
4. If `dueDate` parsed successfully AND the parsed date is strictly before `DateTime.now()` → status is `'overdue'`.
5. Otherwise (amount due > 0 and not yet past due date, or due date is null/unparseable) → status is `'unpaid'`.

Key invariant: a zero or negative `amountDue` always yields `'paid'` regardless of the
due date. The due date is only evaluated when there is a positive outstanding balance.

## Overdue Highlighting

When status is `'overdue'`:
- The due date line is rendered in `c.red` color.
- The status badge receives `'overdue'` and renders accordingly (badge behavior is
  defined in `StatusBadge`, outside this spec).

When status is `'paid'`:
- The due date line is replaced with the text `'Settled in full'`.
- The due date color is `c.textFaint` (no red).

When status is `'unpaid'`:
- The due date line shows `'Due <formatted due date>'` in `c.textFaint` color.

## Amount Display

- When status is `'paid'`: the displayed amount is the `total` (full invoice amount).
- When status is `'overdue'` or `'unpaid'`: the displayed amount is `amountDue`
  (the outstanding balance).
- Amounts are formatted using `fmtINR()`.

## Rendered Elements (top to bottom, left to right)

1. **Header row**
   - Left: Invoice number prefixed with `#` (e.g., `#INV-2024-001`), truncated with ellipsis if too long.
   - Right: `StatusBadge` with computed status string.

2. **Body row** (11px gap below header)
   - Left column:
     - Line 1: `'Issued <fmtDateStr(invoiceDate)>'` in `c.textMute` color.
     - Line 2 (3px gap): `'Settled in full'` when paid, or `'Due <fmtDateStr(dueDate)>'` otherwise. Color is `c.red` when overdue, `c.textFaint` otherwise.
   - Right column (bottom-aligned):
     - Formatted INR amount (total if paid, amountDue otherwise).
     - Chevron right icon (17px, `c.textFaint` color).

## Interaction

- The entire tile is wrapped in `GestureDetector`. Tapping anywhere on the tile invokes `onTap`.
- There is no long-press, swipe, or secondary action.

## Visual Styling

- Container: `c.surface` background, `BorderRadius.circular(18)`, border `c.line`, box shadow `c.shadow`.
- Padding: 14px on all sides.
- No elevation widget — shadow comes from `c.shadow` box shadow.

## Edge Cases

- If `invoiceDate` is null, `fmtDateStr(null)` determines the display (behavior of `fmtDateStr` with null is defined in the formatters module, outside this spec).
- If `dueDate` is null and `amountDue > 0`, `tryParseDate(null)` returns null, so the status will be `'unpaid'` (not `'overdue'`).
- If `parseAmount(amountDue)` returns exactly `0.0`, the status is `'paid'`.
- Negative `amountDue` (credit scenario) also yields `'paid'`.

---

# Component: InvoicesListScreen

## Purpose

Displays a scrollable, pull-to-refresh list of all invoices for the current outlet.
Acts as the entry point to the invoices feature.

## Provider Structure

A single private `FutureProvider.autoDispose.family` named `_invoicesProvider` is
defined at file scope. It is parameterised by `outletId` (a `String`).

When watched with a given `outletId`, it calls:
- `ref.read(outletPortalClientProvider).invoiceHistory(outletId)`

This triggers the tRPC procedure `outletPortal.invoiceHistory` with input:
```json
{
  "outletId": "<outletId>",
  "limit": 20
}
```
No cursor is passed on initial load. The response is decoded into `PagedInvoices`.

The `outletId` is obtained from `ref.watch(sessionControllerProvider).outletId`.

The theme mode is obtained from `ref.watch(themeModeProvider)`, which resolves to a
`ThemeMode` enum value. `AppThemeColors` is instantiated with `dark: true` when the
mode is `ThemeMode.dark`, `dark: false` otherwise.

## UI States

### Loading State

Shown while the `FutureProvider` is in the `loading` state (initial fetch not yet
complete).

Rendered as a `ListView.separated` of **6 placeholder skeleton items**:
- Each item: a `Container` of height 88, background `c.sunken`,
  `BorderRadius.circular(18)`.
- Padding: `EdgeInsets.fromLTRB(18, 0, 18, 24)`.
- Separator: `SizedBox(height: 10)`.
- No actual invoice data is shown.

### Error State

Shown when the `FutureProvider` completes with an error.

Rendered as a `Center` widget containing a single `Text`:
- Content: `'Failed to load invoices'`
- Style: `TextStyle(color: c.textMute)`

There is no retry button. The user can pull to refresh to retry.

### Empty State

Shown when the provider resolves with data but `page.items` is empty.

Rendered as a `ListView` containing a single `EmptyState` widget with:
- `icon`: `Icons.description_outlined`
- `title`: `'No invoices yet'`
- `sub`: `'Invoices raised against your orders will appear here.'`
- `c`: current theme colors

The `ListView` wrapper ensures pull-to-refresh physics work even when there are no
items (the `RefreshIndicator` requires a scrollable child).

### Data State

Shown when the provider resolves with one or more invoices.

Rendered as a `ListView.separated`:
- Padding: `EdgeInsets.fromLTRB(18, 0, 18, 24)`.
- `itemCount`: `page.items.length`.
- Separator: `SizedBox(height: 10)`.
- Each item: `InvoiceListTile` with:
  - `invoice`: the `InvoiceDto` at index `i`.
  - `onTap`: navigates to `/invoices/<invoice.id>` via `context.push(...)`.
  - `c`: current theme colors.

## App Bar

The screen always renders an `OutletAppBar` with:
- `title`: `'Invoices'`
- `c`: current theme colors
- No `subtitle` or `showBack` — defaults apply (no back button on list screen).

The app bar is placed above the `Expanded` scroll area, not inside it.

## Pull-to-Refresh

The `Expanded` content area is wrapped in a `RefreshIndicator`:
- `color`: `c.accent`
- `onRefresh`: calls `ref.invalidate(_invoicesProvider(outletId))`, which disposes the
  cached async value and triggers a fresh fetch. The `RefreshIndicator` future completes
  when the invalidation call returns (immediately — it does not await the re-fetch).

Pull-to-refresh is available in all data states (loading, error, empty, and data) because
all children are scrollable.

## Navigation

- Tapping a tile calls `context.push('/invoices/<invoice.id>')`.
- This pushes `InvoiceDetailScreen` onto the navigation stack (GoRouter route `/invoices/:id`).

## Edge Cases

- If `outletId` changes while the screen is displayed (session change), the provider
  family key changes and a fresh fetch is triggered automatically.
- The `_invoicesProvider` is `autoDispose`: it is torn down when the screen leaves the
  widget tree, and recreated on the next navigation to this screen.
- Pagination beyond the first 20 invoices is not supported by the UI. If the outlet has
  more than 20 invoices, only the first 20 are shown.

---

# Component: InvoiceDetailScreen

## Purpose

Displays the full detail of a single invoice, including financial summary, line items,
and a button to generate and share a PDF.

## Constructor

```dart
InvoiceDetailScreen({required String invoiceId})
```

The `invoiceId` is taken from the route parameter. The `outletId` is read from the
session provider at build time.

## Provider Structure

A single private `FutureProvider.autoDispose.family` named `_invoiceDetailProvider`
is parameterised by an anonymous record `({String outletId, String invoiceId})`.

When watched, it calls:
- `ref.read(outletPortalClientProvider).invoiceDetail(outletId, invoiceId)`

This triggers the tRPC procedure `outletPortal.invoiceDetail` with input:
```json
{
  "outletId": "<outletId>",
  "invoiceId": "<invoiceId>"
}
```
The response is decoded into `InvoiceDetailDto`.

`outletId` is obtained from `ref.watch(sessionControllerProvider).outletId`.

## UI States

### Loading State

Shown while the provider is in the `loading` state.

Rendered as a `ListView` (not `CustomScrollView`) with padding `EdgeInsets.all(18)`,
containing **5 skeleton rows**:
- Each row: `Container` of height 52, background `c.sunken`,
  `BorderRadius.circular(16)`.
- Separator: `Padding(bottom: 10)` wrapping each container.
- No app bar is shown during loading.

### Error State

Shown when the provider completes with an error.

Rendered as a `Center` widget containing:
- `Text('Failed to load invoice', style: TextStyle(color: c.textMute))`

There is no retry button.

### Data State

Shown when the provider resolves successfully. The `_Body` StatefulWidget is rendered
with the resolved `InvoiceDetailDto`.

See the "Data State Detail" section below.

## Data State Detail

The data state renders a `CustomScrollView` with two slivers:

### App Bar (Sliver 1)

`OutletAppBar` with:
- `title`: `inv.invoiceNumber` (the invoice reference string)
- `subtitle`: `'INVOICE'` (literal)
- `c`: current theme colors
- `showBack`: `true` — a back button is shown

### Content (Sliver 2)

`SliverPadding` with padding `EdgeInsets.fromLTRB(18, 0, 18, 32)`, containing a
`SliverList` with the following children in order:

#### 1. Overdue Banner (conditional)

Displayed only when the invoice is overdue. Overdue is defined as:
- Parse `inv.amountDue` with `parseAmount()` → `due`
- Parse `inv.dueDate` with `tryParseDate()` → `dd`
- Overdue = `dd != null AND dd.isBefore(DateTime.now()) AND due > 0`

The banner is a `Container` with:
- Margin: `EdgeInsets.only(bottom: 14)`
- Padding: `EdgeInsets.all(13)`
- Background: `c.redSoft`
- Border radius: `BorderRadius.circular(14)`
- Border: `Border.all(color: c.red.withOpacity(0.25))`
- Content: `Row` with:
  - `Icons.warning_amber_outlined` icon, color `c.redText`, size 18
  - `SizedBox(width: 8)`
  - `Text('Payment overdue — <fmtINR(due)> pending')` in `AppTextStyles.labelBold(color: c.redText)`

#### 2. Financial Summary Card

An `AppCard` containing a `Column` of `KVRow` and `KVTotalRow` widgets in this order:

| Row | Label | Value | Condition | Special color |
|---|---|---|---|---|
| KVRow | `'Order'` | `'#<inv.orderNumber>'` | always | — |
| KVRow | `'Invoice date'` | `fmtDateStr(inv.invoiceDate)` | always | — |
| KVRow | `'Due date'` | `fmtDateStr(inv.dueDate)` | always | `c.red` when overdue, else default |
| KVRow | `'Subtotal'` | `fmtINR(parseAmount(inv.subtotal!))` | only if `inv.subtotal != null` | — |
| KVRow | `'Discount'` | `'− <fmtINR(parseAmount(inv.discountAmount!))>'` | only if `inv.discountAmount != null` | `c.green` |
| KVRow (per charge) | `ch.name` | `fmtINR(parseAmount(ch.amount))` | for each charge in `inv.charges` | — |
| KVRow | `'Total'` | `fmtINR(parseAmount(inv.total))` | always | — |
| KVRow | `'Paid'` | `fmtINR(parseAmount(inv.amountPaid))` | always | `c.green` |
| KVTotalRow | `'Balance due'` | `fmtINR(due)` | always | `c.red` if `due > 0`, `c.green` if `due <= 0` |

- Multiple charges are rendered in the order they appear in `inv.charges`.
- The `KVTotalRow` is visually distinguished from `KVRow` (bolder / larger styling —
  exact style defined in `KVTotalRow` widget, outside this spec).

#### 3. Line Items Section (conditional)

Shown only when `inv.lines.isNotEmpty`.

Contains:
- `Text('Line items')` with `AppTextStyles.sectionTitle(color: c.text)`
- `SizedBox(height: 10)`
- `AppCard` containing a `Column` of `KVRow` widgets, one per line:
  - `label`: `'<line.sku> × <line.qty>'` (literal `×` character, Unicode multiplication sign)
  - `value`: `fmtINR(parseAmount(line.lineTotal))`
  - `last: i == inv.lines.length - 1` — passed to `KVRow` to suppress the last separator
- `SizedBox(height: 16)` after the card

#### 4. Download PDF Button

An `AppButton` with:
- `label`: `'Generating PDF…'` when `_downloading` is true, `'Download as PDF'` otherwise
- `icon`: `Icons.download_outlined`
- `c`: current theme colors
- `fullWidth`: `true`
- `variant`: `AppButtonVariant.soft`
- `loading`: `_downloading` (bool)
- `onTap`: `null` when `_downloading` is true; `_downloadPdf` callback otherwise

The button is always rendered (not conditional). Tapping while `_downloading` is true
does nothing (onTap is null).

## PDF Download Flow

Triggered when the user taps "Download as PDF" and `_downloading` is false.

### Step-by-step sequence:

1. `setState(() => _downloading = true)` — button switches to loading state.

2. **API call 1**: `ref.read(outletPortalClientProvider).myProfile()`
   - tRPC procedure: `outletPortal.myProfile`
   - Input: `{}` (no parameters)
   - Returns: `OutletProfileDto`

3. **PDF generation**: `buildInvoicePdf(inv, profile)` is called (see InvoicePdfService spec).
   - `inv` is the already-loaded `InvoiceDetailDto`.
   - `profile` is the `OutletProfileDto` from step 2.
   - Returns: `Uint8List` (raw PDF bytes).

4. **Sharing**: `Printing.sharePdf(bytes: bytes, filename: '${inv.invoiceNumber}.pdf')`
   - The filename is the invoice number followed by `.pdf`, e.g. `INV-2024-001.pdf`.
   - This opens the native share sheet (on mobile) or print dialog (on desktop/web).

5. On success: `setState(() => _downloading = false)` — button returns to normal.

6. On any error during steps 2–4:
   - A `SnackBar` is shown via `ScaffoldMessenger.of(context)`.
   - Content: `Text('Failed to generate PDF: <error>')`.
   - Background color: `c.red`.
   - `_downloading` is set back to `false` regardless.

### Guards:
- Steps 5 and 6 check `if (mounted)` before calling `setState` or
  `ScaffoldMessenger`. If the widget was disposed during the async operation, no
  state updates are attempted.
- The `myProfile()` call is not cached — a fresh network call is made every time
  the button is tapped.

## Overdue Logic (Detail Screen)

The overdue detection on the detail screen is computed inside `_BodyState.build()`,
independently of the `InvoiceListTile` logic. The formula is identical:

```
due = parseAmount(inv.amountDue)
dd = tryParseDate(inv.dueDate)
overdue = (dd != null) AND (dd.isBefore(DateTime.now())) AND (due > 0)
```

Both the banner and the "Due date" row color are driven by this same `overdue` boolean.

## Edge Cases

- If `inv.lines` is empty, the entire "Line items" section (heading, card, spacing) is hidden.
- If `inv.subtotal` is null, the subtotal row is not rendered in the card.
- If `inv.discountAmount` is null, the discount row is not rendered. If it is non-null
  but parses to 0, it is still rendered (the screen does not suppress zero-discount rows,
  unlike the PDF).
- If `dueDate` is null or not parseable, `tryParseDate` returns null, so `overdue` is
  always false and neither the banner nor the red due date color appears.
- If `amountDue` is 0 (fully paid), `due <= 0` so `overdue` is false even if `dueDate`
  is in the past.
- The detail screen has no pull-to-refresh. The `_invoiceDetailProvider` is
  `autoDispose`, so navigating away and back will trigger a fresh fetch.
- No offline caching is implemented.

---

# Component: InvoicePdfService (buildInvoicePdf)

## Purpose

Generates a single-page A4 PDF document representing a tax invoice. Returns the PDF
as raw bytes (`Uint8List`) which can be shared or saved.

## Signature

```dart
Future<Uint8List> buildInvoicePdf(InvoiceDetailDto inv, OutletProfileDto profile) async
```

## Inputs

### InvoiceDetailDto (inv)
All fields described in the InvoiceDetailDto model spec are potentially used. Key fields:
- `invoiceNumber` — rendered in PDF header
- `invoiceDate` — rendered after formatting via `fmtDateStr()`
- `dueDate` — rendered if non-null; colored red if overdue
- `orderNumber` — rendered as `#<orderNumber>`
- `amountDue` — used to compute overdue status and "Balance Due" total
- `subtotal` — rendered only if non-null
- `discountAmount` — rendered only if non-null AND the parsed amount > 0
- `charges` — all rendered in totals section
- `total`, `amountPaid` — always rendered
- `lines` — items table rendered only when non-empty

### OutletProfileDto (profile)
Used for the "BILL TO" section. Fields consumed:
- `legalName` — preferred display name; falls back to `name` if null
- `name` — fallback when `legalName` is null
- `billingAddress1` — if non-null, a composite address string is built
- `billingAddress2`, `billingCity`, `billingState`, `billingPincode` — joined into address line
- `address` — used as fallback when `billingAddress1` is null (the outlet's street address)
- `gstin` — rendered as `'GSTIN: <value>'` if non-null; omitted if null

## Output

A `Uint8List` containing a valid PDF file. The PDF has exactly one A4 page.

## Page Layout

All measurements are in PDF points. The page margin is 40 points on all sides.

### Section 1: Header (top of page)

A two-column row:

**Left column:**
- `'SYREX'` — 22pt, bold, accent color (`#0E7C5A`)
- `'Tax Invoice'` — 11pt, muted color (`#736E64`)

**Right column (right-aligned):**
- `inv.invoiceNumber` — 16pt, bold
- `'Date: <fmtDateStr(inv.invoiceDate)>'` as a label-value pair (9pt each)
- `'Due: <fmtDateStr(inv.dueDate)>'` — only rendered if `inv.dueDate != null`; value is colored red (`#C24338`) if overdue, else default color
- `'Order: #<inv.orderNumber>'`

A horizontal divider (color `#EBE8DF`, 1pt) separates the header from the next section.

### Section 2: Bill To

- Label: `'BILL TO'` — 9pt, bold, muted, letter-spacing 1.2
- Name line: `profile.legalName ?? profile.name` — 13pt, bold
- Address line:
  - If `billingAddress1 != null`: join `[billingAddress1, billingAddress2, billingCity, billingState, billingPincode]` filtering out nulls, separated by `', '`. Rendered as 10pt muted text.
  - If `billingAddress1 == null`: render `profile.address` as 10pt muted text.
- GSTIN line: `'GSTIN: <profile.gstin>'` — 10pt muted — only if `profile.gstin != null`.

A horizontal divider separates Bill To from the next section.

### Section 3: Line Items Table (conditional)

Rendered only when `inv.lines.isNotEmpty`.

Label: `'ITEMS'` — 9pt, bold, muted, letter-spacing 1.2.

A 4-column table with column widths:
- Column 0 (Item/SKU): `FlexColumnWidth(3)` — takes remaining space
- Column 1 (Qty): `FixedColumnWidth(48)`
- Column 2 (Unit Price): `FixedColumnWidth(80)`
- Column 3 (Amount): `FixedColumnWidth(80)`

**Header row** (background `#F5F3EE`):
- `'Item'` | `'Qty'` | `'Unit Price'` | `'Amount'` — all bold, muted color
- Qty, Unit Price, Amount are right-aligned; Item is left-aligned.

**Data rows** (one per `InvoiceLine`):
- Column 0: `line.sku` — left-aligned
- Column 1: `'<line.qty>'` — right-aligned
- Column 2: `fmtINR(parseAmount(line.unitPrice))` — right-aligned
- Column 3: `fmtINR(parseAmount(line.lineTotal))` — right-aligned

Table borders: bottom border on the whole table, horizontal inside borders — all in line color (`#EBE8DF`).

### Section 4: Totals (right-aligned block, width 240)

Rendered as a right-aligned `SizedBox(width: 240)` containing rows in order:

| Row | Condition | Value color |
|---|---|---|
| `Subtotal` | only if `inv.subtotal != null` | default |
| `Discount` | only if `inv.discountAmount != null` AND `parseAmount(inv.discountAmount!) > 0` | accent green (`#0E7C5A`) |
| `<ch.name>` for each charge | always (may be empty list) | default |
| `Total` | always | default |
| `Amount Paid` | always | accent green |
| Divider (1.5pt) | always | — |
| `Balance Due` | always | red (`#C24338`) if `due > 0`, green (`#0E7C5A`) if `due <= 0` |

Each row except "Balance Due" uses `_totalRow`: label 10pt muted, value 10pt bold, bottom border in line color.

"Balance Due" is styled separately: label 13pt bold (no color), value 14pt bold with conditional color.

### Section 5: Footer

`pw.Spacer()` pushes footer to the bottom of the page.

A thin divider (0.5pt, line color) followed by:
- `'Generated by Syrex Outlet App'` — 8pt, muted color.

## Overdue Detection in PDF

Same logic as the screen:
```
due = parseAmount(inv.amountDue)
dd = tryParseDate(inv.dueDate)
isOverdue = (dd != null) AND (dd.isBefore(DateTime.now())) AND (due > 0)
```

The overdue flag affects: the "Due" date value color in the header, and the "Balance Due"
value color in the totals.

## Error Cases

The function itself does not throw intentionally. Errors propagate upward to the caller
(`_downloadPdf` in the detail screen), which catches them and shows a SnackBar.

Potential error sources:
- `parseAmount()` receiving `"null"` string — behavior depends on the formatters module.
- `tryParseDate()` failing on an unparseable string — returns null (no throw).
- The `pdf` package failing to generate — would propagate as an uncaught exception.
- `profile.address` being an empty string — renders an empty line (no crash).

## Colors Used

| Role | Hex |
|---|---|
| Accent (brand green) | `#0E7C5A` |
| Muted text | `#736E64` |
| Line / divider | `#EBE8DF` |
| Red (overdue/balance) | `#C24338` |
| Header row background | `#F5F3EE` |

---

# Cross-Cutting: API Client

## outletPortalClientProvider

All API calls go through `OutletPortalClient`, accessed via the
`outletPortalClientProvider` Riverpod provider.

## tRPC Call Pattern

All methods use `_api.query(procedureName, inputMap, fromJson)` which sends a GET
request to the tRPC endpoint and unwraps the response envelope before calling `fromJson`.

## Procedure Reference

| Method | tRPC Procedure | Input Shape | Return Type |
|---|---|---|---|
| `invoiceHistory(outletId)` | `outletPortal.invoiceHistory` | `{"outletId": String, "limit": 20}` | `PagedInvoices` |
| `invoiceHistory(outletId, cursor: c)` | `outletPortal.invoiceHistory` | `{"outletId": String, "limit": 20, "cursor": String}` | `PagedInvoices` |
| `invoiceHistory(outletId, q: s)` | `outletPortal.invoiceHistory` | `{"outletId": String, "limit": 20, "q": String}` | `PagedInvoices` |
| `invoiceDetail(outletId, invoiceId)` | `outletPortal.invoiceDetail` | `{"outletId": String, "invoiceId": String}` | `InvoiceDetailDto` |
| `myProfile()` | `outletPortal.myProfile` | `{}` | `OutletProfileDto` |

Notes:
- `cursor` and `q` are omitted from the input map entirely when not provided (not sent
  as null — the conditional spread `if (cursor != null) 'cursor': cursor` is used).
- `limit` always defaults to `20` and is always included.
- The list screen never passes `cursor` or `q` — only `outletId` and `limit`.

---

# Cross-Cutting: Overdue Detection Summary

The overdue condition is computed identically in three places:
1. `InvoiceListTile._status` getter
2. `InvoiceDetailScreen._BodyState.build()` — for banner and due date color
3. `buildInvoicePdf()` — for PDF header due date color and balance due color

All three use the same formula:
- `due = parseAmount(amountDue)`
- `dd = tryParseDate(dueDate)`
- `overdue = (dd != null) AND (dd.isBefore(DateTime.now())) AND (due > 0)`

A test that varies `amountDue` and `dueDate` should expect identical behavior
across all three locations.

---

# Cross-Cutting: Theme

All visual components accept an `AppThemeColors c` parameter. Color tokens used:

| Token | Usage |
|---|---|
| `c.bg` | Screen scaffold background |
| `c.surface` | Card / tile background |
| `c.sunken` | Skeleton placeholder background |
| `c.line` | Tile border |
| `c.shadow` | Tile box shadow |
| `c.accent` | Refresh indicator color |
| `c.text` | Primary text |
| `c.textMute` | Secondary / muted text, error messages |
| `c.textFaint` | Tertiary text (due date, chevron) |
| `c.red` | Overdue highlights, error snackbar, balance due (positive) |
| `c.redSoft` | Overdue banner background |
| `c.redText` | Overdue banner text and icon |
| `c.green` | Discount, paid amount, balance due (zero/negative) |

The screen derives the `AppThemeColors` instance once per `build()` call by checking
`ref.watch(themeModeProvider) == ThemeMode.dark`.
