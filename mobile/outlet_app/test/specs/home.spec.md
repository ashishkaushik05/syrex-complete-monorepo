# Screen: Home

## Purpose

The Home screen is the post-login landing page for an outlet owner. It gives a
consolidated, at-a-glance view of the outlet's financial and operational health:
the live outstanding balance, a shortcut to place a new order, three summary
stat cards, the three most recent orders, active (in-transit) dispatches from
the latest five dispatches, and overdue invoices from the latest five invoices.
All four data sections load in parallel and are independently refreshable via a
single pull-to-refresh gesture. The screen is a read-only dashboard; it does not
mutate any server state.

---

## UI States

### Loading

The screen is divided into independent async regions. Each region has its own
skeleton while its data loads. The rest of the screen (non-async widgets) renders
immediately.

Widgets always visible regardless of load state:

- Identity header (top of screen, outside scroll area) — see Data section.
- "Place a new order" CTA card — always rendered.
- Section headers for "Recent orders", "Active dispatches", and "Overdue
  invoices" — always rendered, including their "See all" action links.

Per-region skeletons shown while loading:

- **Balance banner skeleton**: A plain rounded rectangle, height 160 px,
  `c.sunken` background color, border-radius 22. No text, no shimmer, no
  animation described in source.
- **Stats row skeleton**: A row of 3 equal-width placeholder cards. Each card is
  a rounded rectangle, height 88 px, `c.sunken` fill, border-radius 16,
  separated by 4 px horizontal padding.
- **Recent orders skeleton**: `_ListSkeleton` with `count: 2`. Renders 2
  stacked placeholder tiles, each height 80 px, `c.sunken` fill, border-radius
  18, with 10 px bottom spacing between them.
- **Active dispatches skeleton**: `_ListSkeleton` with `count: 1`. One tile,
  same dimensions as above.
- **Overdue invoices skeleton**: `_ListSkeleton` with `count: 1`. One tile,
  same dimensions.

### Error

All four async regions silently collapse to `SizedBox.shrink()` on error — zero
height, no error message, no retry button, no toast. The rest of the screen
remains fully interactive. There is no global error state or error banner.

Note: because errors are invisible, a failed summary load leaves both the balance
banner and the stats row completely absent from the layout without any visual
indication to the user.

### Empty

"Empty" is only meaningful for the two filtered sections (dispatches, invoices),
since orders simply renders however many items are returned (0–3):

- **Active dispatches — empty**: When the dispatch list loads successfully but
  no dispatches have `deliveryStatus == 'in_transit'`, the section shows a
  single line of text: `"No active shipments"` in `AppTextStyles.label` with
  color `c.textFaint`. It is wrapped in a `Padding` with 22 px bottom padding.
  No retry, no CTA.

- **Overdue invoices — empty**: When the invoice list loads successfully but
  none of the returned invoices are overdue (see filtering logic in Data
  section), the section shows a single line of text: `"No overdue invoices"` in
  `AppTextStyles.label` with color `c.textFaint`. It is wrapped in a `Padding`
  with 10 px bottom padding. No retry, no CTA.

- **Recent orders — empty**: No special empty state. If `page.items` is empty,
  a zero-child `Column` is rendered. The section header remains visible.

### Data

When all providers have loaded, the full screen is rendered as a `CustomScrollView`
containing:

#### 1. Identity Header (`_IdentityHeader`) — always visible, top of page

Sits outside the scroll area in a `SliverToBoxAdapter` at the very top, with top
padding equal to `MediaQuery.padding.top + 12`, left/right padding 18, bottom 14.
Background color `c.bg`.

Contents (left to right):

- **Avatar**: 44x44 px rounded rectangle (border-radius 14), background `c.accent`.
  Displays the user's initials in white, font size 16, weight 800.
  - Initials computed from `session.user.name`: first 2 characters uppercased if
    `name.length >= 2`; otherwise the full name uppercased.
  - Fallback when `user` is null or `user.name` is null: text `"Outlet"`, initials
    `"OU"`.
- **Text column** (flexible, fills remaining space):
  - Top line: `"Good morning"` — `AppTextStyles.smallLabel` in `c.textMute`.
    This greeting is hardcoded and does not change based on time of day.
  - Bottom line: the user's name — `AppTextStyles.dispatchTitle` in `c.text`,
    font size 17, ellipsis overflow.
- **Bell button** (42x42 px, right side): rounded rectangle (border-radius 13),
  `c.surface` background, `c.line` border, shadow. Contains `Icons.notifications_outlined`
  (21 px, `c.text`). A red dot indicator (`c.red`, 8x8 px circle, `c.surface`
  2 px border) is always displayed at top-right of the icon, positioned at
  `top: 9, right: 10`. The dot is unconditional — it always shows; there is no
  unread-count logic.

#### 2. Balance Banner (`_BalanceBanner`)

Rendered when `_summaryProvider` resolves. A gradient card, border-radius 22,
padding 18 all sides, with a decorative `BoxShadow`. Two translucent white
circles are rendered as background decoration (clipped to `Clip.none`).

Contents:

- Row: rupee icon (`Icons.currency_rupee`, 15 px, white70) + label text
  `"OUTSTANDING BALANCE"` in `AppTextStyles.caption` (white70), letter-spacing
  0.2, weight 700.
- Outstanding amount: `fmtINR(parseAmount(summary.outstandingLive))` — the
  `outstandingLive` field parsed as a numeric amount and formatted as INR
  currency. Rendered in `AppTextStyles.balanceBanner` in white.
- Subtitle text:
  `"<N> open invoice<s> · <M> total orders"` where N = `summary.openInvoicesCount`
  and M = `summary.ordersCount`. The word "invoice" is pluralized: singular when
  N == 1 (`"invoice"`), plural otherwise (`"invoices"`).
- "View invoices" button: full-width, 11 px vertical padding, white (92% opacity)
  rounded container (border-radius 13). Displays `"View invoices"` text in
  `AppTextStyles.bodyBold` (`c.greenText`) and a right-arrow icon
  (`Icons.arrow_forward`, 17 px, `c.greenText`).

Note: `outstandingSnapshot` field from the API response is fetched but not
rendered anywhere on the Home screen.

#### 3. New Order CTA (`_NewOrderCta`) — always visible

A tappable card, `c.surface` background, border-radius 18, 1.5 px `c.accentBorder`
border, padding 15 all sides.

Contents (left to right):

- Icon container: 42x42 px rounded square (border-radius 13), `c.accent`
  background, shadow. Contains `Icons.add` (24 px, white).
- Text column:
  - `"Place a new order"` — `AppTextStyles.bodyHeavy` (`c.text`), font size 15.
  - `"Browse catalog & build your order"` — `AppTextStyles.smallLabel` (`c.textMute`).
- Trailing chevron: `Icons.chevron_right` (20 px, `c.textFaint`).

This widget is always rendered and is never hidden or disabled.

#### 4. Stats Row (`_StatsRow`)

Rendered when `_summaryProvider` resolves. A horizontal row of 3 `StatCard`
widgets, separated by 10 px gaps:

- **Card 1 — Total orders**:
  - Icon: `Icons.schedule`, amber soft background (`c.amberSoft`), amber text
    color (`c.amberText`).
  - Value: `summary.ordersCount.toString()`.
  - Label: `"Total orders"`.
  - No `onTap` handler — not tappable.

- **Card 2 — In transit**:
  - Icon: `Icons.local_shipping_outlined`, blue soft background (`c.blueSoft`),
    blue text color (`c.blueText`).
  - Value: hardcoded `"—"` (em dash). The actual in-transit count is not
    derived from the summary; it requires the dispatches list to be filtered.
    The home screen does not compute or display this number.
  - Label: `"In transit"`.
  - Tappable: `onTap` navigates to `'/dispatches'` using `context.go`.

- **Card 3 — Open invoices**:
  - Icon: `Icons.warning_amber_outlined`, red soft background (`c.redSoft`),
    red text color (`c.redText`).
  - Value: `summary.openInvoicesCount.toString()`.
  - Label: `"Open invoices"`.
  - Tappable: `onTap` navigates to `'/invoices'` using `context.go`.

#### 5. Recent Orders section

Section header: `"Recent orders"` with action label `"See all"`.

Renders up to 3 orders from `_recentOrdersProvider`. Each order is rendered as
an `OrderListTile` with 10 px bottom padding. The tile delegates all display
details to the `OrderListTile` shared widget (not specified here). Each tile is
individually tappable.

#### 6. Active Dispatches section

Section header: `"Active dispatches"` with action label `"See all"`.

Fetches up to 5 dispatches from `_dispatchesProvider`. Filters the result to
only those where `dispatch.deliveryStatus == 'in_transit'` (exact string
equality). Renders matching dispatches as `DispatchListTile` widgets, each with
10 px bottom padding. Each tile is tappable.

If the filtered list is empty, shows the empty state described above.

#### 7. Overdue Invoices section

Section header: `"Overdue invoices"` with action label `"See all"`.

Fetches up to 5 invoices from `_invoicesProvider`. Filters the result to only
those satisfying ALL of the following simultaneously:

1. `tryParseDate(invoice.dueDate)` returns a non-null `DateTime` value.
2. The parsed due date is strictly before `DateTime.now()` (i.e., the due date
   is in the past).
3. `parseAmount(invoice.amountDue) > 0` (the amount due is a positive number
   after parsing).

Invoices failing any of these conditions are excluded. Matching invoices are
rendered as `InvoiceListTile` widgets, each with 10 px bottom padding. Each
tile is tappable.

If no invoices pass the filter, shows the empty state described above.

---

## User Interactions

| Interaction | Trigger | Result |
|---|---|---|
| Pull to refresh | Drag down on the scroll view | Invalidates all four providers: `_summaryProvider(outletId)`, `_recentOrdersProvider(outletId)`, `_dispatchesProvider(outletId)`, `_invoicesProvider(outletId)`. All four re-fetch in parallel. Skeletons reappear for each section during reload. |
| Tap "View invoices" button (balance banner) | Tap the white button inside the gradient banner | Navigates to `'/invoices'` using `context.go` (replaces current route). |
| Tap the New Order CTA card | Tap anywhere on the card | Navigates to `'/orders/new'` using `context.push` (pushes onto stack). |
| Tap "In transit" stat card | Tap the second stat card | Navigates to `'/dispatches'` using `context.go`. |
| Tap "Open invoices" stat card | Tap the third stat card | Navigates to `'/invoices'` using `context.go`. |
| Tap "See all" in Recent orders header | Tap the action label | Navigates to `'/orders'` using `context.go`. |
| Tap an `OrderListTile` | Tap any individual order row | Navigates to `'/orders/<order.id>'` using `context.push`. |
| Tap "See all" in Active dispatches header | Tap the action label | Navigates to `'/dispatches'` using `context.go`. |
| Tap a `DispatchListTile` | Tap any individual dispatch row | Navigates to `'/dispatches/<dispatch.id>'` using `context.push`. |
| Tap "See all" in Overdue invoices header | Tap the action label | Navigates to `'/invoices'` using `context.go`. |
| Tap an `InvoiceListTile` | Tap any individual invoice row | Navigates to `'/invoices/<invoice.id>'` using `context.push`. |
| Tap the bell icon | Tap the notification button in the header | Calls `onBell` callback, which is currently a no-op (`() {}`). No navigation, no UI change. |
| Tap "Total orders" stat card | Tap the first stat card | No action. The card has no `onTap` handler. |

---

## API Calls

| Call | Procedure | Input | Response fields used |
|---|---|---|---|
| Summary | `outletPortal.summary` | `{ outletId: String }` | `outstandingLive` (formatted as INR, shown in banner), `openInvoicesCount` (shown in banner subtitle and stat card), `ordersCount` (shown in banner subtitle and stat card) |
| Recent orders | `outletPortal.orderHistory` | `{ outletId: String, limit: 3 }` | `items[]` — full list passed to `OrderListTile`; `order.id` used for navigation |
| Dispatch history | `outletPortal.dispatchHistory` | `{ outletId: String, limit: 5 }` | `items[]` — filtered by `deliveryStatus == 'in_transit'`; filtered items passed to `DispatchListTile`; `dispatch.id` used for navigation |
| Invoice history | `outletPortal.invoiceHistory` | `{ outletId: String, limit: 5 }` | `items[]` — filtered by `dueDate` (parsed date, must be in the past) and `amountDue` (must be > 0 after parsing); filtered items passed to `InvoiceListTile`; `invoice.id` used for navigation |

No mutation calls are made from this screen.

The `outstandingSnapshot` field returned by `outletPortal.summary` and all fields
of `OutletProfileDto` (returned by `outletPortal.myProfile`) are not used on
this screen. The `myProfile` endpoint is not called from `HomeScreen`.

---

## Providers Used

| Provider | Type | What it provides |
|---|---|---|
| `sessionControllerProvider` | (inferred `StateNotifier` or `Notifier`) | The current session object. `session.outletId` (String) is used as the key for all four family providers. `session.user` is passed to `_IdentityHeader` for the name and initials. |
| `themeModeProvider` | `StateProvider<ThemeMode>` (inferred) | Current theme mode (`ThemeMode.dark` or `ThemeMode.light`). Used to instantiate `AppThemeColors(dark: bool)` which drives all colors on the screen. |
| `outletPortalClientProvider` | `Provider<OutletPortalClient>` | Singleton HTTP client. Read (not watched) by all four `FutureProvider.autoDispose.family` providers to obtain their data. |
| `_summaryProvider` | `FutureProvider.autoDispose.family<OutletSummaryDto, String>` | Fetches outlet summary for a given `outletId`. Keyed by `outletId`. Auto-disposed when the screen leaves the widget tree. Watched directly in `build` — drives both the balance banner and stats row. |
| `_recentOrdersProvider` | `FutureProvider.autoDispose.family<PagedOrders, String>` | Fetches up to 3 most recent orders for a given `outletId`. Keyed by `outletId`. Auto-disposed when the screen leaves the widget tree. |
| `_dispatchesProvider` | `FutureProvider.autoDispose.family<PagedDispatches, String>` | Fetches up to 5 dispatches for a given `outletId`. Keyed by `outletId`. Auto-disposed when screen leaves the widget tree. Filtered client-side to in-transit only. |
| `_invoicesProvider` | `FutureProvider.autoDispose.family<PagedInvoices, String>` | Fetches up to 5 invoices for a given `outletId`. Keyed by `outletId`. Auto-disposed when screen leaves the widget tree. Filtered client-side to overdue only. |

All four `FutureProvider.autoDispose.family` providers are file-private (prefixed
with `_`) and defined at the top of `home_screen.dart`. They are not shared with
other screens.

---

## Navigation

| From | Action | To | Method |
|---|---|---|---|
| Home screen | Tap "View invoices" button in balance banner | `/invoices` | `context.go` |
| Home screen | Tap "Place a new order" CTA | `/orders/new` | `context.push` |
| Home screen | Tap "In transit" stat card | `/dispatches` | `context.go` |
| Home screen | Tap "Open invoices" stat card | `/invoices` | `context.go` |
| Home screen | Tap "See all" in Recent orders | `/orders` | `context.go` |
| Home screen | Tap an order tile | `/orders/<order.id>` | `context.push` |
| Home screen | Tap "See all" in Active dispatches | `/dispatches` | `context.go` |
| Home screen | Tap a dispatch tile | `/dispatches/<dispatch.id>` | `context.push` |
| Home screen | Tap "See all" in Overdue invoices | `/invoices` | `context.go` |
| Home screen | Tap an invoice tile | `/invoices/<invoice.id>` | `context.push` |
| Home screen | Tap bell icon | (no-op) | — |

`context.go` replaces the current route (does not push to stack).
`context.push` pushes a new route onto the navigation stack (back button returns
to Home).

---

## Edge Cases

- **Greeting is always "Good morning"**: The string is hardcoded. The greeting
  does not change in the afternoon or evening. Tests should not expect time-based
  greeting variation.

- **"In transit" stat card always shows "—"**: The value is hardcoded as an em
  dash, not computed from the dispatch list. Even if dispatches load successfully,
  this card never shows a numeric count.

- **Notification dot is unconditional**: The red indicator dot on the bell icon
  is always rendered. There is no logic to hide it when there are no
  notifications. The bell tap is a no-op; no navigation or state change occurs.

- **Error state is silent**: All four providers swallow errors with
  `SizedBox.shrink()`. There is no snackbar, dialog, toast, or retry button.
  A user facing a network failure will see a partial page with missing sections
  but no explanation.

- **Overdue invoice filter is three-part**: An invoice is only shown as overdue
  if its `dueDate` is parseable (non-null from `tryParseDate`), the parsed date
  is strictly in the past (not today), and `amountDue` parses to a value greater
  than zero. An invoice with an unparseable due date, a due date of today, or a
  zero/negative amount due is silently excluded.

- **Active dispatch filter is string-exact**: Only dispatches with
  `deliveryStatus` equal to the exact string `'in_transit'` appear. Other
  status strings (e.g., `'delivered'`, `'pending'`) are excluded even if they
  represent in-flight shipments.

- **`outstandingSnapshot` is fetched but unused**: The summary DTO includes
  `outstandingSnapshot` but only `outstandingLive` is displayed. Tests verifying
  the displayed amount should use `outstandingLive`.

- **`session.user` may be null**: The `_IdentityHeader` accesses `user?.name`
  with a null-safe call. If `user` is null, the name defaults to `"Outlet"` and
  the initials displayed are `"OU"`.

- **Short user names**: If `user.name` has fewer than 2 characters, the initials
  are the full name uppercased (e.g., `"A"` → `"A"`). The condition is
  `name.length >= 2` for the two-character substring path.

- **Provider invalidation is keyed**: Pull-to-refresh invalidates the providers
  using the `outletId` from the current session at the time of refresh. If
  `outletId` changes between mount and refresh, the old key would be invalidated,
  not the new one. In practice this is unlikely as `outletId` is session-stable.

- **`limit` parameters are hardcoded**: Recent orders always requests `limit: 3`;
  dispatches and invoices always request `limit: 5`. There is no pagination,
  "load more", or infinite scroll on the Home screen.

- **`autoDispose` means no caching across navigations**: Each time the user
  returns to Home (e.g., pops back from an order detail), all four providers
  re-fetch from the network because they are auto-disposed. There is no
  keep-alive or manual cache behavior.
