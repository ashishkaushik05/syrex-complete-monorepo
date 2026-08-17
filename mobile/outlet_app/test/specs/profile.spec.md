# Behavioral Specification: Profile, More, and OutletPortalClient

**Scope:** Three source units —
1. `lib/modules/profile/profile_screen.dart` — ProfileScreen widget
2. `lib/modules/more/more_screen.dart` — MoreScreen widget
3. `lib/core/api/outlet_portal_client.dart` — OutletPortalClient class

**Audience:** Test writer who has not seen the source code. All behavior described here must be considered authoritative. Any behavior not described here is unspecified and must not be asserted.

---

# Component: ProfileScreen

## Purpose

Displays the authenticated outlet's own profile data (outlet info, credit figures, and billing/GST details) and allows the outlet owner to add or edit billing information via a modal bottom sheet. The screen never receives an outlet ID from the caller — it calls `myProfile()` which resolves the outlet identity from the server session/token.

---

## Provider Structure

- **`_profileProvider`** is a `FutureProvider.autoDispose<OutletProfileDto>` defined at file scope (module-private).
- It calls `ref.read(outletPortalClientProvider).myProfile()` on each build.
- Because it is `autoDispose`, the provider is torn down when the screen is removed from the widget tree and recreated on the next navigation to the screen.
- The screen watches this provider via `ref.watch(_profileProvider)`.

---

## UI States

### Loading State

- Shown while `_profileProvider` is in the `AsyncValue.loading` state.
- Renders a `ListView` with 5 skeleton placeholder containers.
- Each placeholder is a rounded rectangle, height 52, color `c.sunken`, corner radius 16, separated by 10 px vertical gaps.
- No app bar is rendered during loading; the ListView uses 18 px padding on all sides.
- No user-visible text appears in this state.

### Error State

- Shown when `_profileProvider` emits an `AsyncValue.error`.
- Renders a `CustomScrollView` that includes:
  - An `OutletAppBar` with title `'Profile'` and a back button (`showBack: true`).
  - A centered column (in `SliverFillRemaining`) containing:
    - An error icon (`Icons.error_outline`, size 40, color `c.textFaint`).
    - The text `'Failed to load profile'` in `bodyHeavy` style.
    - The text `'Please check your connection and try again.'` in `bodyMed` style, centered.
    - A button labeled `'Retry'` with a `Icons.refresh_rounded` icon.
- Tapping **Retry** calls `ref.invalidate(_profileProvider)`, which re-triggers the `myProfile()` API call.
- The error value itself (the exception object) is not displayed to the user.

### Data State

- Shown when `_profileProvider` has resolved with an `OutletProfileDto`.
- Renders a `CustomScrollView` containing:
  - An `OutletAppBar` with title `'Profile'` and `showBack: true`.
  - A `SliverPadding` of `fromLTRB(18, 0, 18, 32)` wrapping a `SliverList` with all content cards.

---

## Fields Displayed in Data State

All field labels are shown as-is on the left; values are shown on the right. Each field pair is rendered using a `KVRow` widget.

### Card 1 — Outlet Info (AppCard)

| Label | Source field on OutletProfileDto | Notes |
|---|---|---|
| `'Outlet name'` | `profile.name` | Plain string |
| `'Outlet code'` | `profile.outletCode` | Plain string |
| `'Owner'` | `profile.ownerName` | Plain string |
| `'Phone'` | `profile.phone` | Plain string |
| `'Address'` | `profile.address` | Plain string; `last: true` on KVRow |

### Card 2 — Credit (AppCard)

| Label | Source field | Formatting | Special styling |
|---|---|---|---|
| `'Credit limit'` | `profile.creditLimit` | `fmtINR(parseAmount(profile.creditLimit))` | None |
| `'Outstanding balance'` | `profile.outstandingBalance` | `fmtINR(parseAmount(profile.outstandingBalance))` | Value text color is `c.red` when `parseAmount(profile.outstandingBalance) > 0`; otherwise no override (`null`) |

- `parseAmount` converts `profile.creditLimit` / `profile.outstandingBalance` (which may be stored as strings or decimals) to a numeric double before formatting.
- `fmtINR` formats the double as Indian Rupee currency.
- The outstanding balance KVRow has `last: true`.

### Section — Billing Info

- A section header row is always rendered with:
  - Left: the text `'Billing info'` in `sectionTitle` style.
  - Right: a pill-shaped tappable button that opens the billing edit bottom sheet (see Billing Edit Sheet section below).
    - The pill label is `'Edit'` when any of `profile.legalName`, `profile.gstin`, or `profile.billingAddress1` is non-null.
    - The pill label is `'Add'` when all three of those fields are null.
    - The pill always has an `Icons.edit_outlined` icon (size 14) to the left of the label.

#### When billing data exists (`_hasBilling == true`)

`_hasBilling` is `true` if at least one of the following is non-null: `profile.legalName`, `profile.gstin`, `profile.billingAddress1`.

An `AppCard` is rendered containing KVRows conditionally:

- **Legal name** (`'Legal name'` label): shown only if `profile.legalName != null`. Value is `profile.legalName`.
- **GSTIN** (`'GSTIN'` label): shown only if `profile.gstin != null`. Value is `profile.gstin`. The `last` flag on this KVRow is `true` only when `profile.billingAddress1 == null` AND `profile.legalName != null`.
- **Billing address** (`'Billing address'` label): shown only if `profile.billingAddress1 != null`. The value is a comma-separated join of all non-null values from this ordered list: `[billingAddress1, billingAddress2, billingCity, billingState, billingPincode]`. Null entries are omitted (`.whereType<String>().join(', ')`). This KVRow has `last: true`.

#### When billing data is absent (`_hasBilling == false`)

A placeholder container is rendered (not an AppCard) with:
- Background color `c.surface`, border radius 14, border color `c.line`.
- An icon `Icons.receipt_long_outlined` (size 20, color `c.textFaint`) on the left.
- The text: `'No billing info added yet. Tap Edit to add GST details and billing address.'` in `bodyMed` style, color `c.textMute`.

---

## Billing Edit Bottom Sheet

### Trigger

Tapping either the `'Edit'` or `'Add'` pill button calls `_openBillingEdit(context)`, which calls `showModalBottomSheet` with:
- `isScrollControlled: true` (sheet grows with keyboard).
- `backgroundColor: Colors.transparent`.
- The sheet widget is `_BillingEditSheet`.

### Sheet Appearance

- Container with `c.surface` background, top-left and top-right corner radius of 24.
- Padding: `fromLTRB(20, 16, 20, viewInsets.bottom + 24)` — the bottom padding grows as the keyboard appears.
- A drag handle (36 wide, 4 tall, color `c.line`, radius 2) centered at the top.
- Title: `'Billing info'` in `headingLg` style.
- Subtitle: `'Used on invoices and GST documents.'` in `bodyMed` style, color `c.textMute`.
- The fields area is wrapped in a `Flexible` + `SingleChildScrollView` so the sheet remains scrollable when the keyboard is visible.

### Pre-population

All fields are pre-populated from the current profile data at the moment the sheet is opened. Null values from the profile map to empty strings in the text controllers.

| Field label | Controller initialized from | Hint text | Keyboard type | Capitalization |
|---|---|---|---|---|
| `'Legal name'` | `profile.legalName ?? ''` | `'e.g. City Distributors Pvt Ltd'` | text (default) | words (default) |
| `'GSTIN'` | `profile.gstin ?? ''` | `'15-char GST number'` | text (default) | characters |
| `'Address line 1'` | `profile.billingAddress1 ?? ''` | `'Building, street'` | text (default) | words (default) |
| `'Address line 2'` | `profile.billingAddress2 ?? ''` | `'Area, landmark (optional)'` | text (default) | words (default) |
| `'City'` | `profile.billingCity ?? ''` | `'City'` | text (default) | words (default) |
| `'State'` | `profile.billingState ?? ''` | `'State'` | text (default) | words (default) |
| `'Pincode'` | `profile.billingPincode ?? ''` | `'6-digit pincode'` | number | words (default, irrelevant for number keyboard) |

- City and State are rendered side-by-side in a Row (each in an `Expanded` child), separated by 10 px.
- All other fields are full-width, stacked vertically with 12 px gaps between fields.
- All text fields have `autocorrect: false`.
- Field labels use `smallLabelBold` style with `letterSpacing: 0.2`.

### Validation Rules

There is **no client-side field-level validation** performed before submission. The source code contains no validators, no required-field checks, and no format checks (e.g., for GSTIN length/format or pincode digit count). The hint text `'15-char GST number'` and `'6-digit pincode'` are advisory only.

Empty-string trimming is applied: any field whose trimmed value is the empty string is converted to `null` before being sent to the API. This is the only pre-submission transformation performed.

### Submit Behavior

The submit button is labeled `'Save billing info'`, full-width, large size (`AppButtonSize.lg`).

**While saving** (`_saving == true`):
- The button enters its `loading` state (spinner shown, taps disabled — `onTap` is set to `null`).
- The `_saving` flag is set via `setState` before the API call begins.

**On success**:
1. `_profileProvider` is invalidated via `widget.ref.invalidate(_profileProvider)`, forcing a fresh `myProfile()` call when the profile screen re-renders.
2. The bottom sheet is dismissed via `Navigator.of(context).pop()`.
3. No success snackbar or toast is shown.

**On failure** (any exception thrown by `updateBilling`):
1. A `SnackBar` is shown with:
   - Content text: `'Failed to save: $e'` where `$e` is the string representation of the caught exception.
   - Background color: `c.red`.
2. The sheet remains open (it is not dismissed).
3. `_saving` is reset to `false`.

**In all cases** (finally block):
- `_saving` is reset to `false` via `setState`, but only if the widget is still mounted.

**Mount guard**: all post-async UI operations (`Navigator.pop`, `ScaffoldMessenger.showSnackBar`, `setState`) are guarded with `if (mounted)` checks.

### Sheet Controller Lifecycle

All 7 `TextEditingController` instances are created in `initState` and disposed in `dispose`. They are never recreated while the sheet is open.

---

## API Calls Made by ProfileScreen

| Trigger | Method | Effect |
|---|---|---|
| Screen build (first watch of `_profileProvider`) | `outletPortalClientProvider.myProfile()` | Loads profile data |
| Retry button tap (error state) | `ref.invalidate(_profileProvider)` → `myProfile()` | Re-fetches profile |
| Save billing info (success) | `ref.invalidate(_profileProvider)` | Forces profile re-fetch after sheet closes |
| Save billing info button tap | `outletPortalClientProvider.updateBilling(...)` | Submits billing mutation |

---

## Edge Cases

- If `profile.outstandingBalance` parses to exactly `0`, the outstanding balance value color is not overridden (`null`), meaning it uses the default text color, not `c.red`. The condition is strictly `> 0`.
- If all of `legalName`, `gstin`, and `billingAddress1` are null, the billing section shows the placeholder text AND the button pill says `'Add'` (not `'Edit'`).
- If only `billingAddress2`, `billingCity`, `billingState`, or `billingPincode` are non-null (but `billingAddress1` is null), `_hasBilling` is still `false` and the empty-state placeholder is shown.
- The GSTIN `last` flag logic: if `legalName` is non-null AND `billingAddress1` is null, the GSTIN row gets `last: true`. If `legalName` is null and only GSTIN is present, the `last` condition evaluates to `false` (because `profile.legalName != null` is false), so `last: false` for GSTIN in that case. The billing address row unconditionally has `last: true` when present.
- Theme (dark/light) is driven by `themeModeProvider`. The `AppThemeColors` object `c` is reconstructed on every theme change. No theme toggle is present on this screen.

---

# Component: MoreScreen

## Purpose

A hub/navigation screen that shows the authenticated user's identity at the top and provides grouped menu items for navigating to key app sections, plus a logout action.

---

## Provider Dependencies

- `themeModeProvider` — watched to determine dark/light theme.
- `sessionControllerProvider` — watched to read the current `SessionState`. The `.user` field is read from the state.

---

## Header Section (User Identity)

Always rendered at the top, inside a `Container` with `c.bg` background and padding `fromLTRB(18, safeAreaTop + 16, 18, 20)`.

### Avatar

- A 52x52 container, background color `c.accent`, corner radius 16.
- Displays the user's initials as centered text, white color, font size 18, weight 800.
- Initials are computed as:
  - If `user?.name` is non-null and has length >= 2: the first 2 characters of the name, uppercased.
  - If `user?.name` is non-null and has length 1: the single character, uppercased.
  - If `user` is null: `'Outlet'` is used as the name fallback before computing initials.
- Concretely: `name = user?.name ?? 'Outlet'`, then `initials = name.length >= 2 ? name.substring(0, 2).toUpperCase() : name.toUpperCase()`.

### Name and Email

- Name displayed using `screenTitle` text style, color `c.text`, with `TextOverflow.ellipsis`.
- If `user?.name` is null, `'Outlet'` is shown.
- Email displayed using `smallLabel` text style, color `c.textMute`.
- If `user?.email` is null, an empty string is displayed (no email row is hidden).

### View Profile Button

- A pill-shaped tappable container, right-aligned.
- Label: `'View profile'` in `labelBold` style, color `c.accent`.
- Background: `c.surface`, border radius 11, border color `c.line`.
- Tapping calls `context.push('/more/profile')` via GoRouter.

---

## Menu Sections

Sections are grouped under uppercase category labels (`caption` text style, weight 700, letter spacing 0.5, color `c.textFaint`). Each section is a rounded container (`c.surface` background, radius 18, border `c.line`, shadow `c.shadow`). If a section has multiple items, they are separated by a `Divider` (height 1, color `c.line`).

Each menu item (`_Item`) renders:
- A 36x36 icon container (background `c.sunken`, radius 10) on the left, containing the icon (size 20, color `c.text`).
- The item label in `label` text style, color `c.text`.
- A trailing `Icons.chevron_right` (size 18, color `c.textFaint`) on the right.
- The entire row has `HitTestBehavior.opaque` so taps register on empty space.

### Section: ACCOUNT

| Icon | Label | Action |
|---|---|---|
| `Icons.person_outline` | `'Profile'` | `context.push('/more/profile')` |

### Section: FINANCE

| Icon | Label | Action |
|---|---|---|
| `Icons.payments_outlined` | `'Payments'` | `context.push('/more/payments')` |

### Section: SUPPORT

| Icon | Label | Action |
|---|---|---|
| `Icons.build_circle_outlined` | `'Service complaints'` | `context.push('/more/service')` |

### Section: CATALOG

| Icon | Label | Action |
|---|---|---|
| `Icons.category_outlined` | `'Product catalog'` | `context.push('/more/catalog')` |

**Note:** Profile appears in two places — the header `'View profile'` button and the `'Profile'` menu item under ACCOUNT. Both navigate to the same route: `'/more/profile'`.

---

## Logout Row

Rendered below all sections, separated by 24 px.

- A standalone `GestureDetector` (not an `_Item`, not inside a section container).
- Background: `c.redSoft`, border radius 18, border: `c.red.withOpacity(0.2)`.
- Left icon container: background `c.surface`, radius 10, icon `Icons.logout` (size 20, color `c.redText`).
- Label: `'Log out'` in `labelBold` style, color `c.redText`.
- No trailing chevron.
- Tapping calls `ref.read(sessionControllerProvider.notifier).logout()`.
- There is no confirmation dialog before logout. The logout action fires immediately on tap.

---

## Settings / Toggles

There are no settings toggles, switches, or preference controls on this screen.

---

## Edge Cases

- If `user` is null (e.g., session not fully loaded), `name` defaults to `'Outlet'` and `email` displays as empty string. The avatar shows `'OU'`.
- All navigation is performed with `context.push(...)`, which means the More screen remains on the navigation stack (not replaced).
- All four navigation targets (`/more/profile`, `/more/payments`, `/more/service`, `/more/catalog`) are GoRouter push routes.
- Sections each contain exactly one menu item in the current implementation. The section wrapper supports multiple items with dividers between them, but none currently have more than one.

---

# Component: OutletPortalClient

## Purpose

A typed API client class that wraps all outlet-portal tRPC procedures. It holds a reference to a shared `ApiClient` instance and exposes one method per procedure. It is provided to the widget tree via `outletPortalClientProvider`.

---

## Provider

```
outletPortalClientProvider = Provider<OutletPortalClient>(
  (ref) => OutletPortalClient(ref.read(apiClientProvider))
)
```

The client is a singleton for the lifetime of the provider. It is not `autoDispose`. The underlying `ApiClient` is injected at construction time and immutable thereafter (the `_api` field is `final` and the constructor is `const`).

---

## tRPC Response Envelope (How Responses Are Unwrapped)

All methods delegate to `ApiClient.query` or `ApiClient.mutationVoid`. The `ApiClient._unwrap` method handles two response shapes:

**Batch shape** (array response from tRPC batch adapter):
```
[ { "result": { "data": { "json": <payload> } } } ]
```
The first element `[0]` is taken.

**Single shape** (non-batched object):
```
{ "result": { "data": { "json": <payload> } } }
```

In both cases, the final extracted value is `first['result']['data']['json']`.

**Error shape** (tRPC error envelope):
```
{ "error": { "json": { "message": "...", "data": { "httpStatus": 400 } } } }
```
When the `'error'` key is present, an `ApiException` is thrown with the extracted message string and optional HTTP status code integer.

If the response does not match any of these shapes, an `ApiException('Unexpected response shape')` is thrown.

---

## tRPC Request Encoding

**Queries** (GET): The input map is JSON-encoded as `{"json": <inputMap>}` and sent as a `input` query parameter on `GET /trpc/<procedure>`.

**Mutations** (POST): The input map is JSON-encoded as `{"json": <inputMap>}` and sent as the POST body with `Content-Type: application/json` on `POST /trpc/<procedure>`.

---

## Authentication Headers

The underlying `Dio` instance automatically injects (via interceptor before every request):
- `Authorization: Bearer <accessToken>` — from `TokenStore`.
- `x-actor-id: <userId>` — from `TokenStore`.
- `x-org-id: <orgId>` — from `TokenStore`.

On a 401 response the interceptor automatically refreshes the token via `POST /trpc/auth.refresh` and retries the original request once.

---

## How `outletId` Is Obtained

There are two patterns in this client:

1. **`myProfile()` and `updateBilling()`** — these procedures take **no `outletId` parameter** in their tRPC input. The server resolves the outlet from the authenticated session (the `x-actor-id` / `x-org-id` headers). The client sends an empty input map `{}` for `myProfile` and the billing fields (with possible nulls) for `updateBilling`.

2. **All other methods** — these require an explicit `outletId: String` parameter that the caller must provide. The caller is responsible for knowing the outlet ID (typically read from `TokenStore.outletId` stored after login).

---

## Method Reference

### `summary(String outletId)`

- **tRPC procedure:** `outletPortal.summary` (query / GET)
- **Input shape:** `{ "outletId": "<id>" }`
- **Returns:** `Future<OutletSummaryDto>`
- **Response parsing:** `OutletSummaryDto.fromJson(json)`
- **No optional parameters.**

---

### `myProfile()`

- **tRPC procedure:** `outletPortal.myProfile` (query / GET)
- **Input shape:** `{}` (empty map — no parameters sent)
- **Returns:** `Future<OutletProfileDto>`
- **Response parsing:** `OutletProfileDto.fromJson(json)`
- **outletId:** Not sent; server derives identity from auth session.
- **No optional parameters.**

---

### `orderHistory(String outletId, {String? cursor, int limit = 20, String? status, String? q})`

- **tRPC procedure:** `outletPortal.orderHistory` (query / GET)
- **Required input:** `outletId`
- **Optional input fields** (only included in the map when non-null):
  - `cursor` — pagination cursor string
  - `status` — order status filter string
  - `q` — search query string
- **Always-included input fields:** `outletId`, `limit` (default `20`)
- **Full input shape example (all fields):** `{ "outletId": "...", "limit": 20, "cursor": "...", "status": "...", "q": "..." }`
- **Returns:** `Future<PagedOrders>`
- **Response parsing:** `PagedOrders.fromJson(json)`

---

### `orderDetail(String outletId, String orderId)`

- **tRPC procedure:** `outletPortal.orderDetail` (query / GET)
- **Input shape:** `{ "outletId": "<id>", "orderId": "<id>" }`
- **Returns:** `Future<OrderDto>`
- **Response parsing:** `OrderDto.fromJson(json)`
- **No optional parameters.**

---

### `invoiceHistory(String outletId, {String? cursor, int limit = 20, String? q})`

- **tRPC procedure:** `outletPortal.invoiceHistory` (query / GET)
- **Required input:** `outletId`
- **Optional input fields** (only included when non-null): `cursor`, `q`
- **Always-included:** `outletId`, `limit` (default `20`)
- **Full input shape example:** `{ "outletId": "...", "limit": 20, "cursor": "...", "q": "..." }`
- **Returns:** `Future<PagedInvoices>`
- **Response parsing:** `PagedInvoices.fromJson(json)`

---

### `invoiceDetail(String outletId, String invoiceId)`

- **tRPC procedure:** `outletPortal.invoiceDetail` (query / GET)
- **Input shape:** `{ "outletId": "<id>", "invoiceId": "<id>" }`
- **Returns:** `Future<InvoiceDetailDto>`
- **Response parsing:** `InvoiceDetailDto.fromJson(json)`
- **No optional parameters.**

---

### `dispatchHistory(String outletId, {String? cursor, int limit = 20})`

- **tRPC procedure:** `outletPortal.dispatchHistory` (query / GET)
- **Required input:** `outletId`
- **Optional input fields** (only included when non-null): `cursor`
- **Always-included:** `outletId`, `limit` (default `20`)
- **Note:** No `status` or `q` filter — simpler than orderHistory/invoiceHistory.
- **Full input shape example:** `{ "outletId": "...", "limit": 20, "cursor": "..." }`
- **Returns:** `Future<PagedDispatches>`
- **Response parsing:** `PagedDispatches.fromJson(json)`

---

### `dispatchDetail(String outletId, String dispatchId)`

- **tRPC procedure:** `outletPortal.dispatchDetail` (query / GET)
- **Input shape:** `{ "outletId": "<id>", "dispatchId": "<id>" }`
- **Returns:** `Future<DispatchDetailDto>`
- **Response parsing:** `DispatchDetailDto.fromJson(json)`
- **No optional parameters.**

---

### `cancel(String outletId, String orderId)`

- **tRPC procedure:** `outletPortal.cancel` (mutation / POST)
- **Input shape:** `{ "outletId": "<id>", "orderId": "<id>" }`
- **Returns:** `Future<void>` — uses `mutationVoid`; the response body is not parsed into a return value.
- **No optional parameters.**

---

### `updateBilling({String? legalName, String? gstin, String? billingAddress1, String? billingAddress2, String? billingCity, String? billingState, String? billingPincode})`

- **tRPC procedure:** `outletPortal.updateBilling` (mutation / POST)
- **outletId:** Not sent; server resolves from auth session (same as `myProfile`).
- **All parameters are optional (nullable).** Null values are included in the payload as JSON `null` — they are NOT omitted.
- **Input shape (all fields always present, values may be null):**
  ```json
  {
    "legalName": "<string or null>",
    "gstin": "<string or null>",
    "billingAddress1": "<string or null>",
    "billingAddress2": "<string or null>",
    "billingCity": "<string or null>",
    "billingState": "<string or null>",
    "billingPincode": "<string or null>"
  }
  ```
- **Returns:** `Future<void>` — uses `mutationVoid`; no return value is parsed.
- **Caller-side null conversion:** The `_BillingEditSheet._save()` method converts empty-string values to `null` before calling this method (via `_nullIfEmpty`). The client itself does not perform this conversion — it sends whatever values it receives.

---

## Error Handling in OutletPortalClient

- All methods propagate exceptions thrown by `ApiClient.query` or `ApiClient.mutationVoid`.
- `ApiClient` throws `ApiException` for tRPC error responses or unexpected shapes.
- `ApiClient` re-throws `DioException` for network-level errors (connection timeout, no internet) when there is no response body to unwrap.
- `OutletPortalClient` adds no additional try/catch around any method. Error handling is entirely the caller's responsibility.

---

## Edge Cases for OutletPortalClient

- Optional parameters (`cursor`, `status`, `q`) are excluded from the input map using Dart's collection `if` syntax. They are completely absent from the JSON if null, not sent as JSON `null`. This differs from `updateBilling` where all nullable fields are always sent (even as null).
- `limit` always defaults to `20` for the three paginated list methods (`orderHistory`, `invoiceHistory`, `dispatchHistory`). There is no enforced maximum in the client.
- `mutationVoid` on a 4xx/5xx HTTP error: `ApiClient` calls `_unwrap` on the error response body, which will throw `ApiException` if the body contains a tRPC error envelope. This exception propagates to the caller.
- `mutationVoid` on a network error (no response): `ApiClient` re-throws the `DioException` directly.
- The `outletPortalClientProvider` is a standard (non-autoDispose) `Provider`, so the `OutletPortalClient` instance persists for the application lifetime.
