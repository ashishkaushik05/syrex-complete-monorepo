# Payments Module — Behavioral Specification

Source files covered:
- `lib/modules/payments/payments_list_screen.dart`
- `lib/modules/payments/payment_detail_screen.dart`
- `lib/core/api/payments_client.dart`
- `lib/core/models/payment.dart`

---

# Component: PaymentsListScreen

## Purpose

Displays a scrollable, pull-to-refresh list of payment receipts linked to the authenticated outlet's account. Each row is tappable and navigates to a detail screen. The screen is read-only; there are no create/edit actions.

---

## Provider Structure

A single file-private Riverpod provider drives this screen:

```
_paymentsProvider — FutureProvider.autoDispose<PagedPayments>
```

- Declared at file scope (not inside the widget class).
- Marked `autoDispose`, so it is torn down when the screen leaves the widget tree.
- Calls `paymentsClientProvider` (read, not watched) and invokes `.list()` with no arguments, which means `limit` defaults to 20 and `cursor` is omitted.
- The provider is watched (not read) inside `build`, so the widget rebuilds on state changes.

---

## UI States

### Loading State

- Displayed while `_paymentsProvider` is in the `loading` AsyncValue state.
- Shows a skeleton list widget (`_Skeleton`) inside the `RefreshIndicator`.
- The skeleton renders exactly 5 placeholder rows.
- Each placeholder row is a rounded rectangle with:
  - height: 72
  - background color: `c.sunken` (the theme's sunken/muted surface color)
  - border radius: 18
- Rows are separated by 10-pixel vertical gaps.
- Padding: left 18, top 0, right 18, bottom 24.
- No spinner, no text, no progress indicator — purely skeleton boxes.

### Error State

- Displayed when `_paymentsProvider` resolves to an `AsyncError`.
- Shows a single centered `Text` widget with the literal string: `'Failed to load payments'`.
- Text color: `c.textMute`.
- There is NO retry button and NO retry mechanism. The user's only option is pull-to-refresh (see Interactions section).
- AUDIT NOTE: The absence of a retry button is a known gap. The test should assert that no retry widget is present in the error state.

### Empty State

- Displayed when the provider resolves successfully but `page.items` is an empty list.
- Uses the shared `EmptyState` widget with:
  - `icon`: `Icons.payments_outlined`
  - `title`: `'No payments recorded'`
  - `sub`: `'Payment receipts linked to your account will appear here.'`
  - `c`: current theme colors
- The `EmptyState` is wrapped in a `ListView` (single child) so that pull-to-refresh still works. Without the `ListView` wrapper, `RefreshIndicator` cannot be triggered on a short/empty content area.

### Data State

- Displayed when the provider resolves with one or more items.
- Renders a `ListView.separated` containing one `_PaymentTile` per item in `page.items`.
- Items are rendered in the order they appear in `page.items` (no client-side sorting).
- Padding: left 18, top 0, right 18, bottom 24.
- Separator: `SizedBox(height: 10)` (no visual divider line).
- Pagination: The `PagedPayments.nextCursor` field is received and stored in the model but is NOT used by the list screen. There is no "load more" button, no infinite scroll, and no cursor-based pagination in the UI. Only the first page (up to 20 items, as determined by the default limit) is ever displayed.

---

## _PaymentTile (per-row widget)

Each payment in the list is rendered as an `AppCard` (a shared styled card widget). The card is tappable.

### Layout

The tile is a single `Row` containing, left to right:

1. **Status icon container** — 42x42 rounded square (border radius 12):
   - If `payment.voided == true`:
     - Background: `c.redSoft`
     - Icon: `Icons.cancel_outlined`, color `c.redText`, size 22
   - If `payment.voided == false`:
     - Background: `c.greenSoft`
     - Icon: `Icons.check_circle_outline`, color `c.greenText`, size 22

2. **12-pixel horizontal gap** (`SizedBox(width: 12)`)

3. **Expanded text column** (takes remaining space, aligns left):
   - Line 1: Payment date — rendered via `fmtDateStr(payment.paymentDate)`. Style: `AppTextStyles.labelBold`, color `c.text`.
   - Line 2 (conditional): Reference — rendered only if `payment.reference != null`. Text: `'Ref: ${payment.reference}'`. Style: `AppTextStyles.smallLabel`, color `c.textMute`.

4. **Trailing amount column** (aligns right):
   - Line 1: Amount — rendered via `fmtINR(parseAmount(payment.amount))`. Style: `AppTextStyles.amountMd`, color `c.text`.
   - Line 2 (conditional): Void label — rendered only if `payment.voided == true`. Text: `'Voided'`. Style: `AppTextStyles.smallLabelBold`, color `c.redText`.

5. **4-pixel horizontal gap** (`SizedBox(width: 4)`)

6. **Chevron icon**: `Icons.chevron_right`, size 17, color `c.textFaint`.

### Tap Behavior

Tapping anywhere on the `AppCard` triggers `context.push('/more/payments/${payment.id}')`.

- Uses `GoRouter.push` (not `go`), so the list screen remains in the navigation stack and the back button on the detail screen returns to the list.
- The route segment uses the payment's `id` field (a UUID string).

---

## Interactions

### Pull-to-Refresh

- The entire body (below the app bar) is wrapped in a `RefreshIndicator`.
- Spinner color: `c.accent`.
- On refresh gesture: calls `ref.invalidate(_paymentsProvider)`, which disposes and re-creates the provider, triggering a fresh network fetch.
- Works in all states (loading, error, empty, data) because the `RefreshIndicator` wraps the `paymentsAsync.when(...)` result regardless of which branch is rendered. However, in the error state the content is a plain `Center` widget (not a `ListView`), which means the refresh gesture may not be triggerable by the user on some devices/OS versions unless they can scroll down. This is a known UX limitation.

### Navigation

- App bar: `OutletAppBar` with `title: 'Payments'` and `showBack: true`. The back button behavior is provided by `OutletAppBar` (not explicitly coded in this screen).
- Item tap: navigates to `/more/payments/<id>` using `context.push`.

---

## API Calls

- `payments.list` — called once on provider creation. See PaymentsClient section for full input/output spec.

---

## Edge Cases

- If `page.items` is non-empty but a single payment has `voided == true`, that tile shows the red icon and "Voided" label; all other tiles show the green icon. Both can appear in the same list simultaneously.
- The screen never passes a `cursor` to `.list()`. If the server returns more than 20 payments, only the first 20 are shown, with no UI affordance for loading more.
- `payment.reference` is optional. When absent, the second line of the tile's text column is entirely omitted (not shown as blank).
- Amount is stored as a `String` in the model. `parseAmount` converts it to a numeric type before `fmtINR` formats it as Indian Rupees. If `parseAmount` throws on malformed input, the tile will crash. This is not guarded in the UI.
- The screen has no search, filter, or sort controls.

---

# Component: PaymentDetailScreen

## Purpose

Displays all fields for a single payment, identified by ID. Shows allocation breakdown (which invoices the payment was applied to, in FIFO order as returned by the server). Read-only — no edit or void actions are present in this screen.

---

## Provider Structure

```
_paymentDetailProvider — FutureProvider.autoDispose.family<PaymentDetailDto, String>
```

- Declared at file scope.
- Parameterized by `String` (the payment ID).
- Marked `autoDispose`, so it is torn down when the screen is popped.
- Calls `paymentsClientProvider` (read) and invokes `.getById(id)`.
- Watched in `build` via `ref.watch(_paymentDetailProvider(paymentId))`.

The screen receives `paymentId` as a constructor argument (`required this.paymentId`) and passes it to the provider family when watching.

---

## UI States

### Loading State

- Displayed while `_paymentDetailProvider(paymentId)` is loading.
- Shows `_Loading` widget: a `ListView` with 4 skeleton placeholder items.
- Each placeholder: height 52, background `c.sunken`, border radius 16, bottom padding 10.
- Padding on the `ListView`: all sides 18.
- No app bar is rendered during loading — the skeleton takes the full screen body.

### Error State

- Displayed on `AsyncError`.
- Shows a single centered `Text`: `'Failed to load payment'`, color `c.textMute`.
- No retry button, no back button in the error state body — the only navigation escape is the device's system back gesture/button.
- No app bar is rendered during the error state.

### Data State

- Rendered by `_Body(payment: p, c: c)`.
- Uses `CustomScrollView` with two slivers (see layout below).

---

## Data State Layout (_Body)

The body is a `CustomScrollView` with the following sliver sequence:

### Sliver 1: App Bar (SliverToBoxAdapter)

`OutletAppBar` with:
- `title`: `'Payment'` (literal, not the payment reference or ID)
- `subtitle`: `fmtDateStr(payment.paymentDate)` — the formatted payment date appears as a subtitle under the title
- `showBack: true` — back button is present
- `trailing`: if `payment.voided == true`, a `StatusBadge(status: 'voided', c: c)` widget is shown in the trailing position. If not voided, `trailing` is `null` (no badge).

### Sliver 2: Content (SliverPadding > SliverList)

Padding: left 18, top 0, right 18, bottom 24.

Content is a `SliverChildListDelegate` with two possible card groups:

#### Card 1: Payment Summary (always present)

An `AppCard` containing a `Column` of `KVRow` widgets. `KVRow` displays a label-value pair. The rows are:

| Row | Label | Value | Condition | Value Color |
|-----|-------|-------|-----------|-------------|
| 1 | `'Amount'` | `fmtINR(parseAmount(payment.amount))` | Always | `c.redText` if voided, `c.greenText` if not voided |
| 2 | `'Date'` | `fmtDateStr(payment.paymentDate)` | Always | default |
| 3 | `'Reference'` | `payment.reference!` | Only if `payment.reference != null` | default |
| 4 | `'Description'` | `payment.description!` | Only if `payment.description != null` | default |
| 5 | `'Void reason'` | `payment.voidReason!` | Only if `payment.voided == true` AND `payment.voidReason != null` | `c.redText` |

The `last` prop on the void reason `KVRow` is set to `payment.allocations.isEmpty`. This means the void reason row is visually styled as the last row in the card when there are no allocations, and styled as a non-last row (typically showing a bottom divider) when allocations follow.

#### Card 2: Allocation Breakdown (conditional)

Only rendered when `payment.allocations.isNotEmpty`.

Preceded by a `SizedBox(height: 16)` gap after Card 1.

An `AppCard` containing a `Column` with one `KVRow` per allocation:

| Row | Label | Value |
|-----|-------|-------|
| Per allocation | `'Invoice #${allocation.invoiceNumber}'` | `fmtINR(parseAmount(allocation.amount))` |

The `last` prop is `true` only for the final allocation in the list (`i == payment.allocations.length - 1`). All preceding rows have `last: false`.

Allocations are rendered in the order they appear in `payment.allocations` as deserialized from the server response. The client performs no reordering. The server is responsible for FIFO ordering.

---

## Interactions

### Navigation

- Back button: provided by `OutletAppBar` with `showBack: true`. Returns to the previous route (the list screen, since `push` was used to navigate here).
- No other interactive elements — no tap targets, no forms, no void button, no refresh gesture.

### No Pull-to-Refresh

The detail screen has no `RefreshIndicator`. Data can only be refreshed by navigating away and back (which disposes and recreates the `autoDispose` provider).

---

## API Calls

- `payments.getById` — called once on provider creation. See PaymentsClient section.

---

## Edge Cases

- When `payment.voided == true` but `payment.voidReason == null`, the "Void reason" row is omitted entirely. The `StatusBadge` in the app bar still appears because the voided check does not require a reason.
- When `payment.voided == true`, the amount in Card 1 is colored `c.redText` (not just labelled). This is the only field that changes color based on voided status inside the card (the void reason row also uses `c.redText` for its value, but only appears when voided).
- When `payment.allocations` is empty, Card 2 is entirely absent (no card, no gap, no heading). The 16px gap before Card 2 is also absent.
- The detail screen does not show the `outletId`, `id`, or `createdAt` fields to the user.
- If the payment has both `reference` and `description` as null, only Amount and Date rows appear in Card 1 (plus void reason if applicable).

---

# Component: PaymentsClient

## Purpose

HTTP client encapsulating all API calls for the Payments module. Wraps the shared `ApiClient` with payment-specific deserialization. Exposed via a Riverpod provider.

---

## Provider

```
paymentsClientProvider — Provider<PaymentsClient>
```

- Not `autoDispose` — lives for the lifetime of the `ProviderContainer`.
- Reads `apiClientProvider` (not watched) and constructs a `PaymentsClient` with it.

---

## Methods

### `list({String? cursor, int limit = 20}) → Future<PagedPayments>`

**tRPC procedure:** `payments.list`

**Call type:** Query (HTTP GET via `ApiClient.query`)

**Input shape sent to the server:**
```json
{
  "limit": <int, always present, default 20>,
  "cursor": "<String>" // only present when cursor argument is non-null
}
```

When called from `_paymentsProvider` (the list screen), `cursor` is always omitted and `limit` defaults to 20. The method signature supports cursor-based pagination as a future capability, but the current UI does not use it.

**Deserialization:** Calls `PagedPayments.fromJson(j)` on the tRPC response data object.

**Returns:** A `Future<PagedPayments>` that either resolves or propagates the exception thrown by `ApiClient`.

---

### `getById(String id) → Future<PaymentDetailDto>`

**tRPC procedure:** `payments.getById`

**Call type:** Query (HTTP GET via `ApiClient.query`)

**Input shape sent to the server:**
```json
{
  "id": "<String, the payment UUID>"
}
```

**Deserialization:** Calls `PaymentDetailDto.fromJson(j)` on the tRPC response data object.

**Returns:** A `Future<PaymentDetailDto>` that either resolves or propagates the exception.

---

## Error Handling

`PaymentsClient` itself performs no try/catch. Errors from `ApiClient` propagate directly to the Riverpod provider, which surfaces them as `AsyncError` states in the UI.

---

# Model: PaymentDto

## Purpose

Represents a single payment record in list context. Used by `_PaymentTile` and as the base class for `PaymentDetailDto`.

## Fields

| Field | Dart Type | Nullable | Description |
|-------|-----------|----------|-------------|
| `id` | `String` | No | UUID primary key of the payment |
| `outletId` | `String` | No | UUID of the outlet this payment belongs to |
| `amount` | `String` | No | Payment amount as a string (may be decimal, e.g. `"1500.00"`) |
| `paymentDate` | `String` | No | ISO 8601 date string of when the payment was made |
| `reference` | `String?` | Yes | Optional external reference/cheque number |
| `description` | `String?` | Yes | Optional freeform description |
| `voided` | `bool` | No | True if the payment has been voided |
| `voidReason` | `String?` | Yes | Optional reason text explaining why the payment was voided |
| `createdAt` | `String?` | Yes | ISO 8601 timestamp of record creation |

## fromJson Contract

Source key → field mapping:

| JSON key | Dart field | Type handling |
|----------|-----------|---------------|
| `j['id']` | `id` | Cast to `String` directly — must be present |
| `j['outletId']` | `outletId` | Cast to `String?`, defaults to `''` if null |
| `j['amount']` | `amount` | `toString()` called on raw value — handles both `String` and `num` from JSON |
| `j['paymentDate']` | `paymentDate` | Cast to `String` directly — must be present |
| `j['reference']` | `reference` | Cast to `String?` — may be null |
| `j['description']` | `description` | Cast to `String?` — may be null |
| `j['voidedAt']` | `voided` | **Not stored directly.** `voided` is `true` if and only if `j['voidedAt'] != null`. The actual timestamp is discarded. |
| `j['voidReason']` | `voidReason` | Cast to `String?` — may be null |
| `j['createdAt']` | `createdAt` | Cast to `String?` — may be null |

Important: The JSON field for voided status is `voidedAt` (a nullable timestamp), not a `voided` boolean. The Dart model converts this to a `bool` at parse time.

---

# Model: PaymentAllocation

## Purpose

Represents a single FIFO allocation — the portion of a payment applied to a specific invoice. Used only in `PaymentDetailDto`.

## Fields

| Field | Dart Type | Nullable | Description |
|-------|-----------|----------|-------------|
| `invoiceId` | `String` | No | UUID of the invoice this amount was applied to |
| `invoiceNumber` | `String` | No | Human-readable invoice number for display |
| `amount` | `String` | No | Amount allocated to this invoice, as a string |

## fromJson Contract

| JSON key | Dart field | Type handling |
|----------|-----------|---------------|
| `j['invoiceId']` | `invoiceId` | Cast to `String` directly — must be present |
| `j['invoiceNumber']` | `invoiceNumber` | Cast to `String?`. **Fallback:** if `j['invoiceNumber']` is null, falls back to `j['invoiceId']` cast to `String`. This means the invoice ID is shown as the label when the server does not return a human-readable number. |
| `j['amount']` | `amount` | `toString()` called on raw value — handles both `String` and `num` |

---

# Model: PaymentDetailDto

## Purpose

Extends `PaymentDto` with an allocation list. Used exclusively by `PaymentDetailScreen`.

## Additional Fields (beyond PaymentDto)

| Field | Dart Type | Nullable | Description |
|-------|-----------|----------|-------------|
| `allocations` | `List<PaymentAllocation>` | No (may be empty list) | Ordered list of FIFO invoice allocations |

## fromJson Contract

Duplicates all `PaymentDto.fromJson` mappings (the factory is a full constructor call, not a super delegation) plus:

| JSON key | Dart field | Type handling |
|----------|-----------|---------------|
| `j['allocations']` | `allocations` | Cast to `List<dynamic>?`. If the key is absent or null, defaults to `[]`. Each element is cast to `Map<String, dynamic>` and deserialized via `PaymentAllocation.fromJson`. |

The full `fromJson` chain for `PaymentDetailDto` does NOT call `PaymentDto.fromJson` internally — it re-reads all fields independently. Both factories parse `j['voidedAt']` for the `voided` bool in the same way.

---

# Model: PagedPayments

## Purpose

Wraps a list of `PaymentDto` items with an optional pagination cursor. Returned by `payments.list`.

## Fields

| Field | Dart Type | Nullable | Description |
|-------|-----------|----------|-------------|
| `items` | `List<PaymentDto>` | No (may be empty list) | Ordered list of payments for the current page |
| `nextCursor` | `String?` | Yes | Opaque cursor for fetching the next page; null if no further pages exist |

## fromJson Contract

| JSON key | Dart field | Type handling |
|----------|-----------|---------------|
| `j['items']` | `items` | Cast to `List<dynamic>` (not null-safe — will throw if absent). Each element deserialized via `PaymentDto.fromJson`. |
| `j['nextCursor']` | `nextCursor` | Cast to `String?` — may be null |

Note: `j['items']` is NOT null-guarded with `?? []`. If the server returns a response without an `items` key, `fromJson` will throw a `TypeError` at the `as List<dynamic>` cast.

---

# Amount Formatting

Throughout both screens, amounts follow this pipeline:

1. `payment.amount` (or `allocation.amount`) is a `String` stored in the model.
2. `parseAmount(String)` converts it to a numeric value (implementation is in `lib/core/utils/formatters.dart`, outside scope of this spec — but the contract is: accepts string decimal, returns a number type).
3. `fmtINR(num)` formats the number as Indian Rupees (implementation in formatters.dart — expected output format: `₹X,XX,XXX.XX` or equivalent Indian number format).

The same pipeline is used for both the list tile amounts and all amounts on the detail screen (summary and each allocation row).

---

# Date Formatting

`fmtDateStr(String)` is called on `payment.paymentDate` in both screens. The function accepts an ISO 8601 date string (as stored in the model) and returns a human-readable formatted date string. Implementation is in `lib/core/utils/formatters.dart`. On the detail screen, this formatted date also appears as the subtitle of the app bar.

---

# Known Gaps (Audited)

1. **No retry button on error in PaymentsListScreen.** The error state displays only a text message. Pull-to-refresh is the sole recovery mechanism, and it may be difficult to trigger on an error state that renders a non-scrollable `Center` widget.

2. **No retry button on error in PaymentDetailScreen.** The error state is a plain `Center` with text, and no app bar is rendered, leaving the user with only the system back gesture to escape.

3. **No pagination UI in PaymentsListScreen.** `PagedPayments.nextCursor` is parsed and available but completely unused. The list is capped at 20 items (the default `limit`).

4. **`PagedPayments.fromJson` will throw if `items` key is absent** — there is no `?? []` fallback, unlike the `allocations` field in `PaymentDetailDto.fromJson`.

5. **`PaymentAllocation.invoiceNumber` fallback to `invoiceId`.** If the server omits `invoiceNumber`, the detail screen will display the UUID as `'Invoice #<uuid>'`. This is visually poor but not a crash.

6. **`outletId` defaults to empty string** (`''`) rather than throwing or propagating null when the server omits it. This silently masks a potential data integrity issue.
