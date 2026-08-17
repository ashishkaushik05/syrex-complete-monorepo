# Dispatches Feature — Behavioral Specification

**Audience:** Test writers who have no access to the source code.  
**Scope:** All dispatch-related screens, widgets, API clients, and data models in the outlet app.

---

# Component: DispatchDto (Data Model)

## Purpose

Lightweight dispatch summary record. Used in list views and as the base class for the detailed record.

## Fields

| Field | Dart Type | Nullable | Description |
|---|---|---|---|
| `id` | `String` | No | UUID — unique dispatch identifier |
| `dispatchDate` | `String?` | Yes | ISO-8601 date string for when the shipment was dispatched |
| `deliveryStatus` | `String` | No | Status code (see Status Values section below) |
| `transporterName` | `String` | No | Name of the logistics/transport company |
| `vehicleNumber` | `String` | No | Vehicle or truck registration number |
| `lrNumber` | `String?` | Yes | Lorry Receipt number (optional) |
| `estimatedDelivery` | `String?` | Yes | ISO-8601 date string for expected delivery |
| `deliveredAt` | `String?` | Yes | ISO-8601 date string for actual delivery confirmation time |

## fromJson Contract

- `id` — cast from `j['id']` as `String` (required, must be present)
- `dispatchDate` — cast from `j['dispatchDate']` as `String?` (null-safe)
- `deliveryStatus` — cast from `j['deliveryStatus']` as `String` (required)
- `transporterName` — cast from `j['transporterName']` as `String` (required)
- `vehicleNumber` — cast from `j['vehicleNumber']` as `String` (required)
- `lrNumber` — cast from `j['lrNumber']` as `String?` (null-safe)
- `estimatedDelivery` — cast from `j['estimatedDelivery']` as `String?` (null-safe)
- `deliveredAt` — cast from `j['deliveredAt']` as `String?` (null-safe)

## Edge Cases

- A JSON object missing any required field (`id`, `deliveryStatus`, `transporterName`, `vehicleNumber`) will throw a cast error at runtime.
- All optional fields default to `null` when absent from JSON.

---

# Component: DispatchLineDto (Data Model)

## Purpose

Represents one line item within a dispatch — a specific product SKU, quantity, and optionally a list of serial numbers for individually serialized units (e.g. batteries).

## Fields

| Field | Dart Type | Nullable | Description |
|---|---|---|---|
| `id` | `String` | No | UUID — unique line item identifier |
| `sku` | `String` | No | Product SKU code/name |
| `qtyOrdered` | `int` | No | Quantity originally ordered by the outlet |
| `qtyDispatched` | `int` | No | Quantity actually included in this shipment |
| `serialNumbers` | `List<String>` | No | List of serial numbers for serialized units; empty list if not serialized |

## fromJson Contract

- `id` — cast from `j['id']` as `String` (required)
- `sku` — cast from `j['sku']` as `String` (required)
- `qtyOrdered` — parsed as `(j['qtyOrdered'] as num).toInt()` — accepts both `int` and `double` from JSON
- `qtyDispatched` — parsed as `(j['qtyDispatched'] as num).toInt()` — same numeric coercion
- `serialNumbers` — parsed from `j['serialNumbers'] as List<dynamic>? ?? []` then cast to `List<String>`; if the key is absent or null, defaults to an empty list

## Edge Cases

- When `serialNumbers` is an empty list, serial number UI is hidden in the detail screen.
- `qtyOrdered` and `qtyDispatched` may differ — partial shipments are valid.

---

# Component: DispatchDetailDto (Data Model)

## Purpose

Full dispatch record including all line items. Extends `DispatchDto` by adding the `lines` list. Used exclusively in the detail screen.

## Fields

Inherits all fields from `DispatchDto` (see above), plus:

| Field | Dart Type | Nullable | Description |
|---|---|---|---|
| `lines` | `List<DispatchLineDto>` | No | List of dispatch line items; empty list if no lines in the response |

## fromJson Contract

Parses all `DispatchDto` fields identically (same field names, same nullability rules), plus:

- `lines` — parsed from `j['lines'] as List<dynamic>? ?? []`; each element is parsed through `DispatchLineDto.fromJson()`; if the key is absent or null, defaults to an empty list.

## Edge Cases

- A dispatch with zero lines renders the "Items" section header but no line cards below it.

---

# Component: PagedDispatches (Data Model)

## Purpose

Cursor-paginated wrapper around a list of `DispatchDto` objects. Returned by the `dispatchHistory` API call.

## Fields

| Field | Dart Type | Nullable | Description |
|---|---|---|---|
| `items` | `List<DispatchDto>` | No | The dispatches on the current page |
| `nextCursor` | `String?` | Yes | Opaque cursor string for fetching the next page; null means no more pages |

## fromJson Contract

- `items` — parsed from `j['items'] as List<dynamic>`; each element is parsed through `DispatchDto.fromJson()` (required key, not null-safe — will throw if absent)
- `nextCursor` — cast from `j['nextCursor']` as `String?` (null-safe)

## Edge Cases

- When `items` is an empty list, `PagedDispatches` is valid and non-null; the UI handles the empty case separately.
- `nextCursor` being null means the list is fully loaded (no pagination implemented in the current UI).

---

# Component: Status Values

## Purpose

The `deliveryStatus` field on `DispatchDto` / `DispatchDetailDto` is a string code. The following values are defined for dispatch-specific statuses. The `StatusBadge` and `DispatchListTile` components display these values visually.

## Defined Status Values and Their Display

| Status Code | Display Label | Badge Background | Badge Dot Color | Badge Text Color |
|---|---|---|---|---|
| `pending` | "Pending approval" | Amber soft | Amber | Amber text |
| `dispatched` | "Dispatched" | Blue soft | Blue | Blue text |
| `in_transit` | "In transit" | Blue soft | Blue | Blue text |
| `delivered` | "Delivered" | Green soft | Green | Green text |
| `cancelled` | "Cancelled" | Sunken (muted grey) | Text faint | Text mute |
| _(any other value)_ | Raw status string (no transformation) | Sunken (muted grey) | Text faint | Text mute |

## Notes on `dispatched` and `in_transit`

Both `dispatched` and `in_transit` share identical visual styling (blue soft background, blue dot, blue text). They differ only in their display label: "Dispatched" vs "In transit".

## Delivery Confirmation Logic (based on status)

- `deliveryStatus == 'delivered'` → dispatch is considered delivered; `_isDelivered` is `true`.
- `deliveryStatus == 'in_transit'` → delivery can be confirmed; `_canConfirm` is `true`.
- Any other status → `_isDelivered` and `_canConfirm` are both `false`.

---

# Component: DispatchesClient

## Purpose

Handles mutation API calls specific to dispatches. Provides `markDelivered`. Read-only queries (list, detail) are handled by `OutletPortalClient`, not this client.

## Provider

`dispatchesClientProvider` — a Riverpod `Provider<DispatchesClient>`. Depends on `apiClientProvider` to obtain the underlying `ApiClient` instance.

## Methods

### `markDelivered(String dispatchId, {String? deliveredAt, String? note})`

**What it does:** Marks a specific dispatch as delivered.

**tRPC procedure:** `dispatches.markDelivered`

**HTTP method:** Mutation (POST)

**Input shape sent to the API:**
```json
{
  "id": "<dispatchId>",
  "deliveredAt": "<ISO string or omitted if null>",
  "note": "<string or omitted if null or empty>"
}
```

- `id` is always included.
- `deliveredAt` is included only when it is non-null.
- `note` is included only when it is non-null AND non-empty (empty string is treated as absent).

**Return type:** `Future<DispatchDto>` — the updated dispatch record as a `DispatchDto`.

**Response parsing:** Response JSON is parsed via `DispatchDto.fromJson()`.

**Current call-site usage:** The UI calls `markDelivered(dispatch.id)` with no optional parameters — `deliveredAt` and `note` are both omitted.

## Edge Cases

- If `note` is an empty string `""`, it is not included in the request payload.
- If the mutation fails, the error propagates as an unhandled future exception; the UI does not currently display an error state after a failed confirmation.

---

# Component: OutletPortalClient (dispatch-related methods only)

## Purpose

Handles read-only (query) API calls for dispatch history and detail. These methods are used by the providers in the list and detail screens.

## Methods

### `dispatchHistory(String outletId, {String? cursor, int limit = 20})`

**tRPC procedure:** `outletPortal.dispatchHistory`

**HTTP method:** Query (GET)

**Input shape:**
```json
{
  "outletId": "<outletId>",
  "limit": 20,
  "cursor": "<cursor string or omitted if null>"
}
```

- `outletId` is always included.
- `limit` defaults to `20` and is always included.
- `cursor` is included only when non-null.

**Return type:** `Future<PagedDispatches>`

**Response parsing:** `PagedDispatches.fromJson()`

**Current call-site usage:** Called with only `outletId`; no `cursor` or custom `limit` is passed from the screen. Pagination is not wired up in the current UI.

---

### `dispatchDetail(String outletId, String dispatchId)`

**tRPC procedure:** `outletPortal.dispatchDetail`

**HTTP method:** Query (GET)

**Input shape:**
```json
{
  "outletId": "<outletId>",
  "dispatchId": "<dispatchId>"
}
```

Both fields are always present.

**Return type:** `Future<DispatchDetailDto>`

**Response parsing:** `DispatchDetailDto.fromJson()`

---

# Component: DispatchListTile

## Purpose

Reusable card widget representing a single dispatch in the list. Tappable to navigate to the detail screen. Displays a compact or full layout depending on the `compact` flag.

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `dispatch` | `DispatchDto` | Yes | The dispatch record to display |
| `onTap` | `VoidCallback` | Yes | Called when the user taps the card |
| `c` | `AppThemeColors` | Yes | Theme color set (light or dark) |
| `compact` | `bool` | No (default `false`) | When `true`, hides the transporter/vehicle row |

## Visual Structure (non-compact mode)

The tile is a rounded card (border radius 18, surface color, line border, drop shadow) with three rows:

**Row 1 — Header row:**
- Left: 38x38 rounded square icon container (blue-soft background, `Icons.local_shipping_outlined`, blue text color, border radius 11)
- Center: Dispatch ID truncated to first 8 characters of UUID, prefixed with `#` (e.g., `#a1b2c3d4`). Uses `dispatchTitle` text style.
- Right: `StatusBadge` widget showing `dispatch.deliveryStatus`

**Row 2 — Metadata row (hidden when `compact == true`):**
- Two `_MetaCol` sub-widgets side by side, separated by 18px gap:
  - Left `_MetaCol`: label = "Transporter", value = `dispatch.transporterName`
  - Right `_MetaCol`: label = "Vehicle", value = `dispatch.vehicleNumber`

**Row 3 — Status/ETA row (always shown):**
- Icon: `Icons.check_circle_outline` when `deliveryStatus == 'delivered'`, `Icons.schedule` otherwise
- Icon color: `c.green` when delivered, `c.blueText` otherwise
- Text: Constructed as follows:
  - Prefix: `"Delivered"` when `deliveryStatus == 'delivered'`, `"ETA"` otherwise
  - Suffix: `dispatch.estimatedDelivery` if non-null; else `dispatch.deliveredAt` if non-null; else `"—"`
  - Full text example: `"ETA 2026-06-10"` or `"Delivered 2026-06-05"` or `"ETA —"`

## `_MetaCol` Sub-Widget

Displays a stacked label+value pair:
- Label: uppercase text with 0.3 letter-spacing, `caption` style, `textFaint` color
- Value: `labelBold` style, `text` color

## Interaction

- The entire tile is wrapped in a `GestureDetector`. A tap calls `onTap`.
- No long-press, swipe, or other gesture handling.

## Edge Cases

- If `dispatch.id` is shorter than 8 characters, `substring(0, 8)` will throw a `RangeError` at runtime. The spec assumes all IDs are valid UUIDs (36 characters).
- When both `estimatedDelivery` and `deliveredAt` are null, the suffix shows `"—"`.
- When `deliveredAt` is set but `estimatedDelivery` is also set, `estimatedDelivery` takes priority in the suffix (checked first).
- In compact mode, the transporter and vehicle rows are omitted; all other rows remain.

---

# Component: StatusBadge

## Purpose

Pill-shaped badge rendering a status label with a colored dot. Used in both `DispatchListTile` and `DispatchDetailScreen`.

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `status` | `String` | Yes | Status code string (e.g. `'in_transit'`) |
| `c` | `AppThemeColors` | Yes | Theme color set |
| `label` | `String?` | No | Override display label; defaults to `c.statusLabel(status)` |

## Visual Structure

- Container with pill shape (border radius 999), colored background (`m.bg`)
- Inner row: 7x7 circle dot (color `m.dot`) + 6px gap + text (style `badge`, color `m.fg`)
- Padding: left 8, top 5, right 10, bottom 5

## Color/Label Resolution

Colors and labels are resolved by `AppThemeColors.status(statusCode)` and `AppThemeColors.statusLabel(statusCode)`. See the Status Values table above for the full mapping.

## Edge Cases

- An unrecognized status code falls through to the default: muted grey background, faint dot, mute text, and the raw status string is displayed as-is as the label.

---

# Component: DispatchesListScreen

## Purpose

Displays the outlet's full dispatch history as a scrollable list of `DispatchListTile` cards. The outlet ID is sourced from the authenticated session.

## Provider

**`_dispatchesProvider`** — `FutureProvider.autoDispose.family<PagedDispatches, String>` parameterized by `outletId`.

- Calls `ref.read(outletPortalClientProvider).dispatchHistory(outletId)`.
- Auto-disposes when the screen leaves the widget tree.
- `outletId` is read from `sessionControllerProvider` via `ref.watch`.

## UI States

### Loading State

- Renders a `_Skeleton` widget.
- `_Skeleton` displays a `ListView.separated` with exactly 5 placeholder blocks.
- Each placeholder is a `Container` with height 106, `c.sunken` color, and border radius 18.
- Separator between placeholders: 10px vertical `SizedBox`.
- List padding: left 18, top 0, right 18, bottom 24.

### Error State

- Renders a centered `Text` widget with the message: `"Failed to load dispatches"`.
- Text uses `c.textMute` color.
- No retry button is shown.

### Empty State (data loaded, zero items)

- Renders an `EmptyState` widget inside a single-item `ListView` (to allow pull-to-refresh).
- `EmptyState` receives:
  - `icon`: `Icons.local_shipping_outlined`
  - `title`: `"No dispatches yet"`
  - `sub`: `"Shipments linked to your orders will appear here."`
  - `c`: current `AppThemeColors`

### Data State (one or more dispatches)

- Renders a `ListView.separated` with one `DispatchListTile` per dispatch in `page.items`.
- List padding: left 18, top 0, right 18, bottom 24.
- Separator between tiles: 10px vertical `SizedBox`.
- Each tile is rendered in non-compact mode (default `compact = false`).
- Tapping a tile navigates to `/dispatches/<dispatch.id>` using GoRouter's `context.push(...)`.

## Scaffold Structure

- `Scaffold` with `backgroundColor: c.bg`.
- Body is a `Column` with:
  - `OutletAppBar` with `title: 'Dispatches'` (no back arrow, no subtitle, no trailing widget).
  - `Expanded` child wrapping a `RefreshIndicator` around the async state widget.

## Pull-to-Refresh

- Available in all states (the `RefreshIndicator` wraps the entire state child).
- On refresh: calls `ref.invalidate(_dispatchesProvider(outletId))`, which triggers a fresh API fetch.
- `RefreshIndicator` color: `c.accent`.

## Theme

- `themeModeProvider` is watched to determine light/dark mode.
- `AppThemeColors` is instantiated with `dark: true/false` accordingly.

## Navigation

- Tapping a `DispatchListTile` calls `context.push('/dispatches/${dispatch.id}')`.
- No back navigation is initiated from this screen itself.

## API Calls

- On first build: `outletPortal.dispatchHistory` is called with `{ outletId, limit: 20 }`.
- On pull-to-refresh: same call repeated.

## Edge Cases

- The `_dispatchesProvider` is `autoDispose`, so navigating away and back causes a fresh fetch.
- `outletId` is read synchronously from `sessionControllerProvider`; if it changes between navigations, the new value is used.
- Pagination (`nextCursor`) is fetched from the API but not used — the UI always shows only the first page.

---

# Component: DispatchDetailScreen

## Purpose

Displays the full details of a single dispatch, including logistics metadata, all line items with serial numbers, and a delivery confirmation action when appropriate.

## Props

| Prop | Type | Required | Description |
|---|---|---|---|
| `dispatchId` | `String` | Yes | The UUID of the dispatch to display; received as a route parameter |

## Provider

**`_dispatchDetailProvider`** — `FutureProvider.autoDispose.family<DispatchDetailDto, ({String outletId, String dispatchId})>` parameterized by a named-field record `(outletId, dispatchId)`.

- Calls `ref.read(outletPortalClientProvider).dispatchDetail(args.outletId, args.dispatchId)`.
- `outletId` is read from `sessionControllerProvider` via `ref.watch`.
- The `args` record is constructed as `(outletId: outletId, dispatchId: dispatchId)`.

## UI States

### Loading State

- Renders a `_Loading` widget.
- `_Loading` shows a `ListView` with exactly 4 skeleton placeholder blocks.
- Each block: `Container` with height 60, `c.sunken` color, border radius 16, bottom padding 10.
- List padding: all sides 18.

### Error State

- Renders a centered `Text` with message: `"Failed to load dispatch"`.
- Text uses `c.textMute` color.
- No retry button is shown.

### Data State

- Renders the `_Body` widget (see below).

## _Body Layout

The body is a `RefreshIndicator` wrapping a `CustomScrollView` with `AlwaysScrollableScrollPhysics` (ensures pull-to-refresh works even when content is shorter than the screen).

### App Bar (SliverToBoxAdapter)

`OutletAppBar` with:
- `title`: `"#"` + first 8 characters of `dispatch.id` (e.g., `#a1b2c3d4`)
- `subtitle`: `"DISPATCH"` (rendered below the title)
- `showBack: true` (back navigation arrow is shown)
- `trailing` row contains two widgets:
  1. `StatusBadge(status: dispatch.deliveryStatus, c: c)`
  2. A 36x36 rounded square icon button (surface color, line border, radius 10) showing `Icons.refresh_rounded` (size 18, `c.textMute` color). Tapping this calls `_refresh()`.

### Delivered Banner (conditional)

Shown only when `dispatch.deliveryStatus == 'delivered'`.

- Appears at the top of the scroll content, before the metadata card.
- Followed by a 16px vertical gap.
- Banner is a full-width container (padding: horizontal 18, vertical 20) with:
  - Background color: `c.greenSoft`
  - Border radius: 16
  - Border: 1px `c.accentBorder`
- Inner row contains:
  - A 44x44 circle (color `c.accent`) with `Icons.check_rounded` (white, size 26)
  - 14px gap
  - Expanded column:
    - `Text("Delivery confirmed")` in `bodyHeavy` style, `c.greenText` color
    - If `dispatch.deliveredAt` is non-null: `Text(fmtDateStr(dispatch.deliveredAt))` in `smallLabel` style, `c.greenText` color, `FontWeight.w400`
    - If `dispatch.deliveredAt` is null: the date text row is omitted entirely

### Metadata Card (AppCard)

Always shown. Contains a `Column` of `KVRow` widgets:

| Label | Value | Condition |
|---|---|---|
| `"Dispatch date"` | `fmtDateStr(dispatch.dispatchDate)` | Always shown |
| `"Transporter"` | `dispatch.transporterName` | Always shown |
| `"Vehicle no."` | `dispatch.vehicleNumber` | Always shown |
| `"LR number"` | `dispatch.lrNumber!` | Only shown when `dispatch.lrNumber != null` |
| `"ETA"` | `fmtDateStr(dispatch.estimatedDelivery)` | Only shown when `dispatch.estimatedDelivery != null` |
| `"Delivered at"` | `fmtDateStr(dispatch.deliveredAt)` | Only shown when `dispatch.deliveredAt != null` |

The `"Delivered at"` row has special styling:
- `last: true` (removes any divider below it)
- `valueColor: c.greenText` (value text is rendered in green)

### Items Section

- Section header: `Text("Items")` with `sectionTitle` style, `c.text` color
- 10px gap below header
- For each `line` in `dispatch.lines`, an `AppCard` containing:
  - `Text(line.sku)` in `bodyHeavy` style, `c.text` color
  - 8px gap
  - `KVRow(label: 'Ordered', value: '${line.qtyOrdered}', ...)`
  - `KVRow(label: 'Dispatched', value: '${line.qtyDispatched}', last: line.serialNumbers.isEmpty, ...)`
    - `last` is `true` (no divider) only when `serialNumbers` is empty
  - If `line.serialNumbers.isNotEmpty`:
    - `KVRow(label: 'Serials', value: line.serialNumbers.join(', '), last: true, ...)`
    - Serial numbers are comma-space joined into a single string
- Each line card has 10px bottom padding between cards.

### Confirm Delivery Button (conditional)

Shown only when `dispatch.deliveryStatus == 'in_transit'` (`_canConfirm == true`).

- Preceded by a 24px vertical gap.
- `AppButton` widget:
  - `label`: `"Confirm delivery received"`
  - `fullWidth: true`
  - `onTap`: calls `_confirmDelivery(context)`

### Delivery Confirmation Dialog

Triggered by tapping the "Confirm delivery received" button.

- `AlertDialog` with:
  - `title`: `"Confirm delivery?"`
  - `content`: `"Mark this shipment as delivered."`
  - Two action buttons:
    1. `TextButton("Cancel")` — closes the dialog via `Navigator.pop(context)`; no API call is made.
    2. `TextButton("Confirm")` — closes the dialog first, then calls `ref.read(dispatchesClientProvider).markDelivered(dispatch.id)`, then calls `_refresh()`.

**Post-confirm behavior:** After the API call completes (success or failure), `_refresh()` invalidates `_dispatchDetailProvider(args)`, causing the detail to reload from the API.

## Pull-to-Refresh

- Wraps the entire `CustomScrollView` in `RefreshIndicator` (color: `c.accent`).
- On refresh: calls `_refresh()`, which calls `ref.invalidate(_dispatchDetailProvider(args))`.
- The inline refresh icon button in the app bar trailing area also calls `_refresh()`.

## Navigation

- The back arrow (`showBack: true`) in `OutletAppBar` handles popping the route.
- No `context.push` or `context.go` is called from within this screen.

## API Calls

| Trigger | tRPC Procedure | Input |
|---|---|---|
| Initial build / refresh | `outletPortal.dispatchDetail` | `{ outletId, dispatchId }` |
| "Confirm" in dialog | `dispatches.markDelivered` | `{ id: dispatchId }` |

## Edge Cases

- If the dispatch status is not `'in_transit'` and not `'delivered'` (e.g., `'pending'`, `'dispatched'`, `'cancelled'`), neither the delivered banner nor the confirm button is shown.
- The "Confirm" action does not show a loading spinner or disable the button; the dialog closes immediately and the detail refreshes after the async call resolves.
- If `markDelivered` throws, the error is unhandled — there is no error toast or retry UI.
- If `dispatch.lines` is empty, the "Items" section header still renders but no cards appear below it.
- `fmtDateStr` is called on nullable date strings; when the value is null, the calling code gates it with a null check (`if (dispatch.xxx != null)`) before calling `fmtDateStr`. The formatter itself is not called with null.
- Serial numbers on a line with a single entry display as a bare string (no trailing comma).
- `dispatch.id.substring(0, 8)` assumes the ID is at least 8 characters; a shorter ID would throw at runtime.
- The screen is `autoDispose`, so navigating back and returning causes a fresh fetch.
