# Orders Behavioral Specification

This document is a complete behavioral specification for the Orders feature of the Outlet App. It covers every screen, widget, client method, and data model involved in viewing, creating, and managing orders. The test writer should have no need to consult any source file beyond this document.

---

# Component: OrderDto (Data Model)

## Purpose

Represents a single order returned from the backend. Used everywhere an order is displayed or acted upon.

## Fields

| Field | Dart type | Nullable | Default if missing | Description |
|---|---|---|---|---|
| `id` | `String` | No | — | Unique order UUID |
| `orderNumber` | `String` | No | — | Human-readable order identifier (e.g. "ORD-0042") |
| `outletId` | `String` | No | — | UUID of the outlet that placed the order |
| `status` | `String` | No | — | Raw status string from backend (see Status Values below) |
| `priority` | `String` | No | `'medium'` | Order priority; defaults to `'medium'` if absent from JSON |
| `orderDate` | `String?` | Yes | `null` | ISO date string; nullable |
| `deliveryAddress` | `String` | No | `''` (empty string) | Delivery address; defaults to empty string if absent |
| `totalValue` | `String` | No | — | Stringified decimal total including tax; always coerced via `.toString()` |
| `subtotalValue` | `String` | No | — | Stringified decimal subtotal before tax; always coerced via `.toString()` |
| `taxTotal` | `String` | No | — | Stringified decimal tax amount; always coerced via `.toString()` |
| `notes` | `String?` | Yes | `null` | Optional free-text notes on the order |
| `approvedAt` | `String?` | Yes | `null` | ISO datetime string for approval timestamp |
| `rejectionReason` | `String?` | Yes | `null` | Reason text if order was rejected |
| `lines` | `List<OrderLineDto>` | No | `[]` (empty list) | Line items; defaults to empty list if `lines` key absent |

## fromJson Contract

- Key `'id'` → `String`, required, hard cast
- Key `'orderNumber'` → `String`, required, hard cast
- Key `'outletId'` → `String`, required, hard cast
- Key `'status'` → `String`, required, hard cast
- Key `'priority'` → `String?`, optional, defaults to `'medium'`
- Key `'orderDate'` → `String?`, optional, may be `null`
- Key `'deliveryAddress'` → `String?`, optional, defaults to `''`
- Keys `'totalValue'`, `'subtotalValue'`, `'taxTotal'` → any type, coerced with `.toString()`
- Keys `'notes'`, `'approvedAt'`, `'rejectionReason'` → `String?`, optional
- Key `'lines'` → `List<dynamic>?`, optional, defaults to `[]`; each element passed to `OrderLineDto.fromJson`

## Computed Property: displayStatus

`OrderDto.displayStatus` returns a UI-friendly string using the following mapping:
- `'pending_approval'` → `'pending'`
- `'fully_dispatched'` → `'dispatched'`
- `'partially_dispatched'` → `'dispatched'`
- Any other value → returned unchanged

## Status Values (Raw, from Backend)

The full set of known raw status values:
- `pending_approval`
- `approved`
- `dispatched` (used directly in some contexts)
- `fully_dispatched`
- `partially_dispatched`
- `cancelled`

## Edge Cases

- `totalValue`, `subtotalValue`, `taxTotal` are always converted to string via `.toString()`, so the backend may return numeric or string types; the model tolerates both.
- `lines` defaults to `[]` so an order with no lines key is valid and renders an empty item list.
- `deliveryAddress` defaults to `''` (empty string) rather than null; downstream code displaying it should handle empty strings gracefully.

---

# Component: OrderLineDto (Data Model)

## Purpose

Represents a single line item within an order. Always contained within `OrderDto.lines`.

## Fields

| Field | Dart type | Nullable | Default if missing | Description |
|---|---|---|---|---|
| `id` | `String` | No | — | Line item UUID |
| `productId` | `String` | No | — | UUID of the product |
| `sku` | `String` | No | — | Product SKU string |
| `qtyOrdered` | `int` | No | — | Quantity originally ordered |
| `qtyDispatched` | `int` | No | `0` | Quantity actually dispatched; defaults to `0` if absent |
| `unitPrice` | `String` | No | — | Stringified decimal unit price; coerced via `.toString()` |
| `lineTotal` | `String` | No | — | Stringified decimal line total; coerced via `.toString()` |
| `status` | `String` | No | `'pending'` | Line item status; defaults to `'pending'` if absent |

## fromJson Contract

- Key `'id'` → `String`, required, hard cast
- Key `'productId'` → `String`, required, hard cast
- Key `'sku'` → `String`, required, hard cast
- Key `'qtyOrdered'` → `num`, required, converted to `int` via `.toInt()`
- Key `'qtyDispatched'` → `num?`, optional, converted to `int`; defaults to `0`
- Keys `'unitPrice'`, `'lineTotal'` → any type, coerced with `.toString()`
- Key `'status'` → `String?`, optional, defaults to `'pending'`

## Edge Cases

- `qtyDispatched` uses `num?` with null-fallback to `0`, tolerating absent key or explicit null.
- `unitPrice` and `lineTotal` use `.toString()` so numeric backend values are accepted.

---

# Component: PagedOrders (Data Model)

## Purpose

Wrapper for a paginated list of orders. Returned by `orderHistory`.

## Fields

| Field | Dart type | Nullable | Description |
|---|---|---|---|
| `items` | `List<OrderDto>` | No | The orders on this page |
| `nextCursor` | `String?` | Yes | Opaque cursor for the next page; `null` means last page |

## fromJson Contract

- Key `'items'` → `List<dynamic>`, required; each element passed to `OrderDto.fromJson`
- Key `'nextCursor'` → `String?`, optional

---

# Component: CreateOrderInput (Data Model)

## Purpose

Payload sent to the backend when creating a new order. Constructed in `CreateOrderFlow` and passed to `OrdersClient.create`.

## Fields

| Field | Dart type | Nullable | Description |
|---|---|---|---|
| `outletId` | `String` | No | Outlet placing the order |
| `deliveryAddress` | `String` | No | Trimmed delivery address text |
| `priority` | `String` | No | One of: `'low'`, `'medium'`, `'high'` |
| `lines` | `List<CreateOrderLineInput>` | No | At least one line item |
| `notes` | `String?` | Yes | Optional trimmed notes; omitted from JSON if null |

## toJson Output Shape

```json
{
  "outletId": "<string>",
  "deliveryAddress": "<string>",
  "priority": "<string>",
  "lines": [
    { "productId": "<string>", "qtyOrdered": <int>, "unitPrice": "<string>" }
  ],
  "notes": "<string>"   // omitted entirely if null
}
```

The `notes` key is conditionally included: present only when non-null.

---

# Component: CreateOrderLineInput (Data Model)

## Purpose

One line item within a `CreateOrderInput`. Serialized into the `lines` array.

## Fields

| Field | Dart type | Description |
|---|---|---|
| `productId` | `String` | UUID of the product |
| `qtyOrdered` | `int` | Quantity selected by the user |
| `unitPrice` | `String` | `basePrice` string taken directly from the catalog `ProductDto` |

## toJson Output Shape

```json
{ "productId": "<string>", "qtyOrdered": <int>, "unitPrice": "<string>" }
```

---

# Component: OrdersClient

## Purpose

Handles API calls that write to or read order state through tRPC. Distinct from `OutletPortalClient`; used exclusively by `CreateOrderFlow` for order creation and cancellation originating in the client.

## Provider

`ordersClientProvider` — a Riverpod `Provider<OrdersClient>`. Depends on `apiClientProvider`.

## Methods

### `create(CreateOrderInput input) → Future<OrderDto>`

- tRPC procedure: `orders.create` (mutation)
- Input shape: `input.toJson()` — see `CreateOrderInput.toJson` above
- Returns: `OrderDto` parsed from the mutation response
- Throws on network or server error

### `cancel(String orderId, {String? note}) → Future<OrderDto>`

- tRPC procedure: `orders.transition` (mutation)
- Input shape:
  ```json
  {
    "id": "<orderId>",
    "action": "cancel",
    "note": "<string>"   // omitted if note is null
  }
  ```
- The `note` key is conditionally included: present only when the optional `note` parameter is non-null.
- Returns: `OrderDto` of the updated order
- Throws on network or server error

Note: There are two separate cancel paths in the app. `OrdersClient.cancel` (above) is the client-level method that returns `OrderDto`. `OutletPortalClient.cancel` (used by `OrderDetailScreen`) is a fire-and-forget void mutation at the portal level — see below.

---

# Component: OutletPortalClient (Order-Related Methods)

## Purpose

Handles order-related read queries and the portal-level cancel action. Used by `OrdersListScreen` and `OrderDetailScreen`.

## Methods

### `orderHistory(String outletId, {String? cursor, int limit = 20, String? status, String? q}) → Future<PagedOrders>`

- tRPC procedure: `outletPortal.orderHistory` (query)
- Input shape:
  ```json
  {
    "outletId": "<string>",
    "limit": <int>,
    "cursor": "<string>",   // omitted if null
    "status": "<string>",   // omitted if null
    "q": "<string>"         // omitted if null
  }
  ```
- Default `limit` is `20`.
- When `OrdersListScreen` calls this, it passes no cursor (first page only), `limit` defaults to `20`, and `status` is either `null` (for "all") or one of the filter chip values.
- Returns: `PagedOrders`

### `orderDetail(String outletId, String orderId) → Future<OrderDto>`

- tRPC procedure: `outletPortal.orderDetail` (query)
- Input shape: `{ "outletId": "<string>", "orderId": "<string>" }`
- Returns: `OrderDto` with full line-item data

### `cancel(String outletId, String orderId) → Future<void>`

- tRPC procedure: `outletPortal.cancel` (mutation, void result)
- Input shape: `{ "outletId": "<string>", "orderId": "<string>" }`
- Returns nothing; throws on error
- Called by `OrderDetailScreen` after the user confirms the cancel dialog

---

# Component: CatalogClient (listProducts — used by CreateOrderFlow)

## Method: `listProducts({...}) → Future<PagedProducts>`

- tRPC procedure: `products.list` (query)
- Called in `CreateOrderFlow` with `limit: 100` and no other arguments
- Input shape sent: `{ "limit": 100 }`
- Returns: `PagedProducts` containing up to 100 products for display in the order builder

---

# Component: OrderListTile (Widget)

## Purpose

A tappable card that summarizes one order in a list. Used in `OrdersListScreen` and potentially elsewhere.

## Data Displayed

Given an `OrderDto order`, the tile renders:

1. **Order number** — formatted as `#<order.orderNumber>` (e.g. "#ORD-0042"), shown bold in the top-left; truncated with ellipsis if too long.
2. **Status badge** — top-right, showing the display-mapped status:
   - `'pending_approval'` → badge reads `'pending'`
   - `'fully_dispatched'` or `'partially_dispatched'` → badge reads `'dispatched'`
   - Any other status → badge shows the raw status value unchanged
3. **Order date** — bottom-left, formatted via `fmtDateStr(order.orderDate)`; `orderDate` may be null, and `fmtDateStr` is responsible for handling that.
4. **Product count** — below the date; shows `"<n> product"` (singular) or `"<n> products"` (plural) based on `order.lines.length`.
5. **Total amount** — bottom-right, formatted via `fmtINR(parseAmount(order.totalValue))`.
6. **Chevron icon** — a right-arrow icon to the right of the total, indicating tappability.

## Layout

- Outer container: rounded corners (radius 18), surface color background, line-color border, shadow.
- Top row: order number (left, expanded) + status badge (right).
- Bottom row: date and product count column (left, expanded) + amount and chevron (right, bottom-aligned).
- Fixed padding: 14px all sides.
- Vertical gap between top and bottom rows: 11px.

## Interaction

- The entire tile is wrapped in a `GestureDetector`. Tapping anywhere on the tile invokes the `onTap` callback provided by the parent.
- The tile itself has no internal state; all behavior is delegated to the caller via `onTap`.

## Props

| Prop | Type | Description |
|---|---|---|
| `order` | `OrderDto` | The order to display |
| `onTap` | `VoidCallback` | Called when the user taps anywhere on the tile |
| `c` | `AppThemeColors` | Theme color set |

## Edge Cases

- If `order.lines` is empty, the product count shows `"0 products"`.
- Status values not in the known mapping set pass through unchanged to `StatusBadge`.
- `orderDate` may be null; `fmtDateStr` must handle null gracefully (this is out of scope for `OrderListTile` itself).

---

# Component: OrdersListScreen

## Purpose

Displays a paginated, filterable list of the current outlet's orders. The user can filter by status, refresh the list, tap an order to view its detail, or navigate to the create-order flow.

## Provider

`_ordersProvider` — a `FutureProvider.autoDispose.family<PagedOrders, ({String outletId, String? status})>`.

- Keyed on a record of `outletId` + `status`.
- Calls `outletPortalClientProvider.orderHistory(outletId, status: status)`.
- When `status` equals the string `'all'`, `null` is passed as the status argument to `orderHistory` (i.e. no filter is applied).
- For any other status string, the value is passed through verbatim.

## Initialization

- Accepts an optional `initialFilter` constructor parameter.
- `_filter` state is initialized to `widget.initialFilter ?? 'all'`.
- If `initialFilter` is not provided, the screen opens with the "all" chip selected.

## Filter Chips

Five chips are always shown, in this order:
1. `all`
2. `pending_approval`
3. `approved`
4. `dispatched`
5. `cancelled`

Only one chip is selected at a time. Tapping a chip updates `_filter` to that chip's value, which triggers a new provider lookup (the old result is discarded due to `autoDispose`). The `FilterChipRow` widget renders these chips and calls `onSelect` when one is tapped.

## UI States

### Loading State

- Shown while `_ordersProvider` is in the loading state.
- Renders a `_Skeleton` widget: a `ListView` with 6 placeholder containers, each 88px tall, rounded (radius 18), in the `c.sunken` color, with 10px gaps between them and 18px horizontal + 24px bottom padding.

### Error State

- Shown when `_ordersProvider` yields an error.
- Renders a centered `Text` widget with the message: `'Failed to load orders'` in `c.textMute` color.
- No retry button is shown inline; the user must use pull-to-refresh.

### Empty State (Data, Zero Items)

- Shown when the provider returns successfully but `page.items` is empty.
- Renders an `EmptyState` widget with:
  - Icon: `Icons.receipt_long_outlined`
  - Title: `'No orders'`
  - Subtitle: `'Orders placed will appear here.'`
  - Action label: `'Place an order'`
  - Action: navigates to `/orders/new` via `context.push('/orders/new')`
- The `EmptyState` is wrapped in a single-child `ListView` so pull-to-refresh still works.

### Data State (Non-Empty)

- Renders a `ListView.separated` of `OrderListTile` widgets.
- Padding: 18px left/right, 0 top, 24px bottom.
- 10px gap between tiles.
- Each tile shows one `OrderDto` from `page.items`.
- Tapping a tile navigates to `/orders/<order.id>` via `context.push('/orders/${page.items[i].id}')`.

## Pull-to-Refresh

- A `RefreshIndicator` (color: `c.accent`) wraps the list area.
- Pulling to refresh calls `ref.invalidate(_ordersProvider)`, which invalidates all family keys, forcing a fresh fetch for the current filter.

## FAB (Floating Action Button)

- Always visible regardless of UI state.
- Extended FAB with icon `Icons.add` and label `'New order'`.
- Background: `c.accent`, foreground: white.
- Tapping navigates to `/orders/new` via `context.push('/orders/new')`.

## Layout

- `Scaffold` with `c.bg` background, no `AppBar` widget (uses custom `OutletAppBar`).
- `OutletAppBar` title: `'Orders'`.
- Below the app bar: `FilterChipRow` with 18px horizontal and 12px bottom padding.
- Below the chips: expanded scrollable area for the list.
- FAB is a `floatingActionButton` on the `Scaffold`.

## API Calls

- `outletPortal.orderHistory` — called automatically when the screen mounts or the filter changes. Parameters: `outletId` from session, `limit: 20` (default), `status: null` when filter is `'all'`, otherwise the raw filter string.

## Navigation

- Into this screen: accepts optional `initialFilter` to pre-select a filter chip.
- From this screen:
  - Tap order tile → `context.push('/orders/<orderId>')`
  - Tap FAB or "Place an order" empty-state action → `context.push('/orders/new')`

## Dependencies

- `sessionControllerProvider` — to read `outletId`
- `outletPortalClientProvider` — for API
- `themeModeProvider` — for dark/light theming
- `_ordersProvider` — scoped to screen

## Edge Cases

- The filter state is local to the screen widget. Navigating away and back (depending on router stack behavior) may reset the filter to `'all'` unless `initialFilter` is passed.
- The screen does not implement pagination beyond the first page (no cursor, no load-more). Only the first 20 orders for the current filter are shown.
- `ref.invalidate(_ordersProvider)` invalidates all family variants, not just the current filter's variant.

---

# Component: OrderDetailScreen

## Purpose

Displays full details of a single order identified by `orderId`. The user can refresh, and cancel the order if its status permits.

## Provider

`_orderDetailProvider` — a `FutureProvider.autoDispose.family<OrderDto, ({String outletId, String orderId})>`.

- Calls `outletPortalClientProvider.orderDetail(outletId, orderId)`.
- Keyed on the record `(outletId, orderId)`.

## Constructor

```dart
OrderDetailScreen({required String orderId})
```

The `orderId` is passed in at construction (typically from the router). The `outletId` is read at build time from `sessionControllerProvider`.

## UI States

### Loading State

- Renders `_Loading`: a `ListView` with 4 placeholder containers, each 60px tall, rounded (radius 16), `c.sunken` color, 10px gaps, 18px all-sides padding.

### Error State

- Centered `Text` with message `'Failed to load order'` in `c.textMute` color.
- No retry button; user must pull-to-refresh.

### Data State

- Renders `_Body` with the full `OrderDto`.
- The entire body is a `RefreshIndicator` wrapping a `CustomScrollView` with `AlwaysScrollableScrollPhysics` (so pull-to-refresh works even when content is short).

## App Bar (Data State)

- `OutletAppBar` with:
  - Title: `'#<order.orderNumber>'` (e.g. `'#ORD-0042'`)
  - Subtitle: `'ORDER'`
  - `showBack: true` (back navigation arrow visible)
  - Trailing row (right side):
    1. `StatusBadge` showing the **mapped** status (same mapping as `OrderListTile._mapStatus`):
       - `'pending_approval'` → `'pending'`
       - `'fully_dispatched'` or `'partially_dispatched'` → `'dispatched'`
       - All other values pass through unchanged
    2. A 36×36 rounded container (radius 10, `c.surface` background, `c.line` border) containing a refresh icon (`Icons.refresh_rounded`, size 18, `c.textMute` color). Tapping this icon calls `_refresh()`.

## Status Mapping (`_mapStatus`)

Identical to `OrderListTile._mapStatus`:
- `'pending_approval'` → `'pending'`
- `'fully_dispatched'` or `'partially_dispatched'` → `'dispatched'`
- Otherwise → unchanged

## Order Summary Card

An `AppCard` containing a vertical list of `KVRow` and `KVTotalRow` entries:

| Label | Value | Notes |
|---|---|---|
| `'Order date'` | `fmtDateStr(order.orderDate)` | Formatted date |
| `'Priority'` | `order.priority` | Raw string (e.g. "medium") |
| `'Delivery address'` | `order.deliveryAddress` | Full address string |
| `'Notes'` | `order.notes` | Shown only if `order.notes != null` |
| `'Rejection reason'` | `order.rejectionReason` | Shown only if `order.rejectionReason != null`; text color is `c.red` |
| `'Subtotal'` | `fmtINR(parseAmount(order.subtotalValue))` | |
| `'Tax'` | `fmtINR(parseAmount(order.taxTotal))` | |
| `'Total'` | `fmtINR(parseAmount(order.totalValue))` | Rendered as `KVTotalRow` (visually emphasized) |

## Line Items Section

- A `Text` label `'Items'` in `AppTextStyles.sectionTitle` style, separated from the card by 16px.
- Each `OrderLineDto` in `order.lines` renders as a separate `AppCard` with 10px bottom margin:
  - Top row: SKU text (left, expanded, `AppTextStyles.bodyHeavy`) + `StatusBadge` of `line.status` (right; raw status, no mapping applied)
  - 8px gap
  - `KVRow` — `'Qty ordered'` → `'${line.qtyOrdered}'`
  - `KVRow` — `'Qty dispatched'` → `'${line.qtyDispatched}'`
  - `KVRow` — `'Unit price'` → `fmtINR(parseAmount(line.unitPrice))`
  - `KVRow` — `'Line total'` → `fmtINR(parseAmount(line.lineTotal))` (marked as `last: true`)

## Cancel Button

- Shown only when `order.status == 'pending_approval' || order.status == 'approved'`.
- 24px top spacing.
- `AppButton` with:
  - Label: `'Cancel order'`
  - Variant: `AppButtonVariant.danger`
  - `fullWidth: true`
  - Tapping opens the cancel confirmation dialog.

## Cancel Confirmation Dialog

- Triggered by tapping the "Cancel order" button.
- `AlertDialog` with:
  - Title: `'Cancel order?'`
  - Content: `'This action cannot be undone.'`
  - Two action buttons:
    1. `'Keep'` (left) — dismisses the dialog with `Navigator.pop(context)`. No API call.
    2. `'Cancel order'` (right, text color `c.red`) — dismisses the dialog then calls `outletPortalClientProvider.cancel(outletId, order.id)`, then calls `_refresh()` to reload the order detail.

## Refresh Behavior

`_refresh()` calls `ref.invalidate(_orderDetailProvider(args))`, where `args` is the `(outletId, orderId)` record. This triggers a fresh fetch from `outletPortal.orderDetail`.

Refresh can be triggered by:
1. The inline refresh icon button in the app bar.
2. Pull-to-refresh on the `CustomScrollView`.
3. After a successful cancel action.

## API Calls

- `outletPortal.orderDetail` — on mount and on each refresh.
- `outletPortal.cancel` — on user confirmation of cancel dialog.

## Navigation

- Into this screen: `orderId` provided by the router.
- From this screen: back navigation via `showBack: true` in the app bar (standard pop).
- No forward navigation from this screen.

## Dependencies

- `sessionControllerProvider` — to read `outletId`
- `outletPortalClientProvider` — for API
- `themeModeProvider` — for theming
- `_orderDetailProvider` — scoped to screen

## Edge Cases

- The cancel button is absent for orders with status `'fully_dispatched'`, `'partially_dispatched'`, `'dispatched'`, or `'cancelled'`.
- After the cancel dialog is confirmed, there is no loading indicator shown while the cancel API call is in-flight. The dialog closes immediately and the order detail is refreshed.
- If the cancel API call throws, the error is not caught and no error UI is shown. The `_refresh()` call still fires regardless (it is called after `await`, so a thrown exception would prevent it — the test writer should note this as a potential issue to verify behavior).
- `order.notes` row is conditionally rendered: absent if `notes` is null.
- `order.rejectionReason` row is conditionally rendered: absent if null; when present, its value is shown in `c.red`.
- Line item status badges use the raw `line.status` value with no mapping.

---

# Component: CreateOrderFlow

## Purpose

A single-screen, multi-section flow for building and placing a new order. The user browses the product catalog, adds items to an in-memory cart, then fills in delivery details and submits.

## Provider

`_catalogProvider` — a `FutureProvider.autoDispose<PagedProducts>`.

- Calls `catalogClientProvider.listProducts(limit: 100)`.
- Fetches up to 100 products with no filter.

## State (Local to _CreateOrderFlowState)

| State variable | Type | Initial value | Description |
|---|---|---|---|
| `_cart` | `Map<String, _CartItem>` | `{}` | Keyed by `product.id`; holds selected products and quantities |
| `_addressCtrl` | `TextEditingController` | empty | Delivery address input |
| `_priority` | `String` | `'medium'` | Currently selected priority |
| `_notesCtrl` | `TextEditingController` | empty | Optional notes input |
| `_loading` | `bool` | `false` | True while the place-order API call is in flight |
| `_q` | `String` | `''` | Current search query string |
| `_searchCtrl` | `TextEditingController` | empty | Search field controller |

All three `TextEditingController` instances are disposed in `dispose()`.

## App Bar

- `OutletAppBar` with title `'New order'`, `showBack: true`.
- When `_cartCount > 0`, a trailing badge is shown:
  - Text: `'<n> item · <fmtINR(total)>'` (singular "item") or `'<n> items · <fmtINR(total)>'` (plural)
  - Container styled with `c.accentSoft` background, `c.accentBorder` border, radius 10
  - Text style: `AppTextStyles.labelBold` in `c.accent` color
- When `_cartCount == 0`, the trailing slot is null (nothing shown).

## Computed Properties

- `_cartCount` — sum of all `qty` values in `_cart`; `0` when cart is empty.
- `_cartTotal` — sum of `parseAmount(product.basePrice) * qty` for all cart items; `0.0` when cart is empty.

## Search Bar

- Always visible below the app bar.
- A styled `TextField` inside a rounded container (`c.surface` background, `c.line` border, radius 14).
- Hint text: `'Search products…'`
- Typing updates `_q` via `onChanged`, which re-filters the product list synchronously.
- No debounce; filtering is immediate on each keystroke.
- The search is client-side only (no additional API call).

## Product List

### Loading State

- Renders `_Skeleton`: 8 placeholder containers, each 72px tall, rounded (radius 16), `c.sunken` color, 8px gaps, 18px horizontal + 24px bottom padding.

### Error State

- Centered `Text`: `'Failed to load products'` in `c.textMute` color.
- No retry button; provider will retry on next build if conditions change.

### Data State

- When `_q` is empty: all products from `catalog.items` are shown.
- When `_q` is non-empty: products are filtered to those where `displayTitle` OR `sku` contains `_q` (case-insensitive substring match).
- Filtered list rendered as `ListView.separated`:
  - Padding: 18px left/right, 0 top, 120px bottom (to clear the bottom sheet).
  - 8px gaps between items.

### Product Row (_ProductRow)

Each product renders as a row card with:
- Rounded container (radius 16), `c.surface` background.
- Border color: `c.accentBorder` when the product has qty > 0 in the cart, `c.line` otherwise.
- Shadow: `c.shadow`.
- Left: `ProductImage` widget (size 48, radius 12, hue derived from `(index * 47 + 160) % 360`).
- Middle (expanded): product `displayTitle` (bold, max 2 lines, ellipsis overflow) and `basePrice` formatted via `fmtINR(parseAmount(product.basePrice))` in `c.accent`.
- Right: `QtyStepper` widget showing current qty (0 if not in cart).

### Quantity Change Behavior

When `QtyStepper` emits a value `v`:
- If `v == 0`: remove the product from `_cart` (i.e. `_cart.remove(product.id)`).
- If `v > 0`: upsert the cart entry: `_cart[product.id] = _CartItem(product, v)`.
- The product row border immediately changes to `c.accentBorder` when qty > 0.

## Cart Bar (Bottom Sheet)

The `bottomSheet` slot of the `Scaffold` is:
- `null` when `_cartCount == 0` — no bottom sheet shown.
- `_CartBar` widget when `_cartCount > 0`.

### _CartBar: Collapsed State (default)

When first appearing, the cart bar is collapsed:
- Shows item count and total amount (left side).
- A `'Review order'` button with `Icons.keyboard_arrow_up` icon (right side).
- Tapping anywhere on the collapsed bar OR the "Review order" button expands it.

Collapsed layout (12px vertical padding, 18px horizontal):
- Left column: `'<n> item'` / `'<n> items'` label, then the formatted total amount.
- Right: `AppButton` labelled `'Review order'` with up-chevron icon.

### _CartBar: Expanded State

Tapping the "Review order" button or the collapsed bar expands the cart bar to show the order form. The expanded view shows:

1. **Header row**:
   - Left column: item count label + total amount (larger style).
   - Right: a down-chevron icon (`Icons.keyboard_arrow_down`). Tapping it collapses the bar back.

2. **Delivery address field** (14px top gap from header):
   - Label: `'Delivery address'` (small, muted).
   - Multi-line `TextField` (2 lines max), hint: `'Full delivery address'`, filled with `c.sunken`.
   - Bound to `_addressCtrl`.

3. **Priority dropdown** (12px below address):
   - Label: `'Priority'` (small, muted).
   - `DropdownButtonFormField<String>` with three options:
     - `'low'` → label `'Low'`
     - `'medium'` → label `'Medium'`
     - `'high'` → label `'High'`
   - Initial value: `_priority` (defaults to `'medium'`).
   - On change: calls `onPriorityChange` which updates `_priority` in the parent.
   - If the dropdown emits null, `'medium'` is used as fallback.

4. **Place order button** (12px below priority):
   - Label: `'Place order · <fmtINR(total)>'`
   - Full width, large size (`AppButtonSize.lg`).
   - When `_loading` is true: button shows loading indicator and `onTap` is set to null (not tappable).
   - When `_loading` is false: tapping calls `_placeOrder()`.

Note: The notes field (`_notesCtrl`) exists in state and is passed into `_CartBar` but there is no visible UI element for it in the expanded cart bar as rendered. The notes value is still sent to the API if non-empty.

## Order Submission (_placeOrder)

### Validation (in order)

1. **Cart empty check**: if `_cart.isEmpty`, return immediately — no API call, no error message.
2. **Delivery address check**: if `_addressCtrl.text.trim().isEmpty`, show a `SnackBar` with message `'Please enter a delivery address'` and return. No API call.

### On Valid Input

1. Set `_loading = true` (triggers rebuild; disables the place-order button).
2. Read `outletId` from `ref.read(sessionControllerProvider).outletId`.
3. Build `lines`: for each `_CartItem` in `_cart.values`, construct a `CreateOrderLineInput`:
   - `productId`: `e.product.id`
   - `qtyOrdered`: `e.qty`
   - `unitPrice`: `e.product.basePrice`
4. Call `ordersClientProvider.create(CreateOrderInput(...))` with:
   - `outletId`
   - `deliveryAddress`: `_addressCtrl.text.trim()`
   - `priority`: `_priority`
   - `lines`: the list constructed above
   - `notes`: `null` if `_notesCtrl.text.trim().isEmpty`, else `_notesCtrl.text.trim()`
5. On success (if widget is still mounted):
   - `context.pop()` — pop the create-order screen.
   - `context.push('/orders/<order.id>')` — navigate to the newly created order's detail screen.
6. On error (if widget is still mounted):
   - Show a `SnackBar` with message `'Failed to place order: <error>'` and `backgroundColor: Colors.red`.
7. In `finally` (if widget is still mounted):
   - Set `_loading = false`.

## Navigation

- Into this screen: pushed from `OrdersListScreen` via `/orders/new`.
- From this screen on success: pops itself, then pushes `/orders/<newOrderId>`.
- Back navigation: `showBack: true` in the app bar allows normal pop at any time.

## API Calls

- `products.list` — on mount, with `limit: 100`. No further API calls for search (client-side filtering).
- `orders.create` — on "Place order" tap (after validation passes).

## Dependencies

- `catalogClientProvider` — to fetch the product catalog
- `ordersClientProvider` — to place the order
- `sessionControllerProvider` — to read `outletId`
- `themeModeProvider` — for theming

## Edge Cases

- If the user removes all items from the cart (all quantities set to 0), `_cartCount` becomes 0 and the bottom sheet disappears. The user can still navigate back or continue browsing.
- The cart bar state (`_expanded`) is local to `_CartBarState`. If the bottom sheet is recreated (e.g. cart goes to 0 then back above 0), `_expanded` resets to `false` (collapsed).
- The delivery address validation uses `.trim()` — whitespace-only input is treated as empty.
- The notes field is always passed to the API as `null` if the trimmed text is empty; it is never sent as an empty string.
- The catalog is fetched once with `limit: 100`. If there are more than 100 products, the excess are not shown and are not paginated.
- Search filtering is case-insensitive and checks both `displayTitle` and `sku` independently (OR logic).
- The `_loading` flag prevents re-submission: while `true`, the place-order button is not tappable.
- `mounted` checks guard all post-async state mutations and navigation calls to prevent acting on a disposed widget.
- The order of items in the `lines` array corresponds to `_cart.values` iteration order (insertion order of the `Map`).
