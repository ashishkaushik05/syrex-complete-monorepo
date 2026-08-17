# Service Complaints — Behavioral Specification

**Audience:** Test writers. This document is the sole source of truth; no access to source code is assumed.
**Scope:** All screens, models, and API client methods in the Service Complaints feature.

---

## Table of Contents

1. [Models](#1-models)
2. [ServiceClient](#2-serviceclient)
3. [ComplaintsListScreen](#3-complaintslistscreen)
4. [ComplaintDetailScreen](#4-complaintdetailscreen)
5. [RaiseComplaintScreen](#5-raisecomplaintscreen)

---

# 1. Models

## 1.1 ComplaintLineDto

### Purpose
Represents a single product unit (line item) attached to a service complaint. Each line corresponds to one physical unit reported as faulty.

### Fields

| Field | Dart type | JSON key | Nullable | Notes |
|---|---|---|---|---|
| `id` | `String` | `"id"` | No | Required; complaint line identifier |
| `serialNumber` | `String?` | `"serialNumber"` | Yes | Physical unit serial number |
| `productId` | `String?` | `"productId"` | Yes | Product catalogue reference |
| `notes` | `String?` | `"notes"` | Yes | Free-text notes specific to this line |

### fromJson Contract
- Input: `Map<String, dynamic>`
- `id`: cast as `String` — must be present; absence causes a runtime cast error
- `serialNumber`, `productId`, `notes`: cast as `String?` — missing keys or JSON `null` both produce `null` in Dart

### Edge Cases
- If the JSON object contains none of the optional fields, all three nullable fields are `null`
- No validation is performed at parse time beyond the type cast

---

## 1.2 ComplaintAssignment

### Purpose
Records a single assignment event — the moment a complaint was assigned to an Area Service Inspector (ASI) and/or Service Engineer (SE). A complaint may have zero, one, or many assignments over its lifetime.

### Fields

| Field | Dart type | JSON key | Nullable | Notes |
|---|---|---|---|---|
| `asiName` | `String?` | `"asiUserName"` (nested) | Yes | Display name of the ASI user |
| `seName` | `String?` | `"seUserName"` (nested) | Yes | Display name of the SE user |
| `createdAt` | `String?` | `"createdAt"` | Yes | ISO 8601 timestamp string of assignment |

### fromJson Contract
- Input: `Map<String, dynamic>`
- `asiName`: read from key `"asiUserName"` (not `"asiName"`) — cast as `String?`
- `seName`: read from key `"seUserName"` (not `"seName"`) — cast as `String?`
- `createdAt`: read from key `"createdAt"` — cast as `String?`

### Edge Cases
- The JSON key names differ from the Dart field names (`asiUserName` → `asiName`, `seUserName` → `seName`). Tests that construct mock JSON must use the JSON key names.
- All three fields are nullable; a fully empty assignment object (`{}`) is valid.

---

## 1.3 ComplaintActivity

### Purpose
Represents a single activity/event in the complaint timeline — e.g., status changes, notes added by staff. (Model is defined in source; it is not currently rendered in any screen but is available for future use.)

### Fields

| Field | Dart type | JSON key / path | Nullable | Notes |
|---|---|---|---|---|
| `actorName` | `String?` | `actor.name` (nested object) | Yes | Name of the user who performed the action |
| `action` | `String` | `"action"` | No | Required; the action type string |
| `note` | `String?` | `"note"` | Yes | Optional free-text note |
| `createdAt` | `String?` | `"createdAt"` | Yes | ISO 8601 timestamp string |

### fromJson Contract
- Input: `Map<String, dynamic>`
- `actorName`: resolved by reading key `"actor"` as `Map<String, dynamic>?`, then reading `"name"` from that map. If `"actor"` is absent or `null`, `actorName` is `null`.
- `action`: cast as `String` — must be present; absence causes a runtime cast error
- `note`: cast as `String?`
- `createdAt`: cast as `String?`

### Edge Cases
- `actorName` is null when `"actor"` key is absent, when `"actor"` is JSON null, or when the actor object has no `"name"` key.
- No circular dependencies; the actor object is read inline.

---

## 1.4 ComplaintDto

### Purpose
The primary model returned by both the list and detail API endpoints. Carries the full state of a single service complaint including its status, parties involved, line items, and assignment history.

### Fields

| Field | Dart type | JSON key | Nullable | Notes |
|---|---|---|---|---|
| `id` | `String` | `"id"` | No | Complaint UUID |
| `complaintNumber` | `String` | `"complaintNumber"` | No | Human-readable reference (e.g. `"SC-0042"`) |
| `status` | `String` | `"status"` | No | One of the known status strings (see Status Values) |
| `title` | `String?` | `"title"` | Yes | Short summary of the issue |
| `description` | `String?` | `"description"` | Yes | Full text description |
| `customerName` | `String?` | `"customerName"` | Yes | Name of the end customer |
| `customerPhone` | `String?` | `"customerPhone"` | Yes | Phone number of the end customer |
| `resolutionNote` | `String?` | `"resolutionNote"` | Yes | Note added at resolution time |
| `createdAt` | `String?` | `"createdAt"` | Yes | ISO 8601 creation timestamp |
| `assignedAsiName` | `String?` | See derivation below | Yes | Display name of the currently assigned ASI |
| `lines` | `List<ComplaintLineDto>` | `"lines"` | No (defaults to `[]`) | Line items; empty list if key absent or null |
| `assignments` | `List<ComplaintAssignment>` | `"assignments"` | No (defaults to `[]`) | Assignment history; empty list if key absent or null |

### assignedAsiName Derivation Logic
This field is derived in two steps:
1. **Primary:** Read `j['assignedAsiName']` directly as `String?`. If it is non-null, use it.
2. **Fallback:** If the primary value is `null`, iterate through `assignments` in **reverse order** (most recent first) and use the `asiName` of the first assignment that has a non-null `asiName`.
3. If both steps yield `null`, `assignedAsiName` is `null`.

### Known Status Values (used by screens and labels)

| Status string | Human label |
|---|---|
| `"raised"` | Raised — awaiting assignment |
| `"assigned"` | Assigned to service engineer |
| `"visit"` | Field visit scheduled |
| `"test_result_submitted"` | Test result submitted |
| `"retest_requested"` | Retest requested |
| `"resolved"` | Resolved |
| `"telephonic_closure"` | Closed (telephonic) |
| `"cancelled"` | Cancelled |

Any status string not in the above table is displayed as-is (the raw string).

### "Resolved-family" statuses
The statuses `"resolved"`, `"telephonic_closure"`, and `"cancelled"` are treated as terminal/closed states. The detail screen uses this group to apply special green colour to the resolution note.

### fromJson Contract
- `lines`: if `j['lines']` is `null` or key is absent, defaults to `[]`; otherwise each element is parsed with `ComplaintLineDto.fromJson`
- `assignments`: if `j['assignments']` is `null` or key is absent, defaults to `[]`; otherwise each element is parsed with `ComplaintAssignment.fromJson`
- `id`, `complaintNumber`, `status` must be present; absence causes runtime cast errors

### Edge Cases
- A complaint with no assignments and no top-level `assignedAsiName` produces `assignedAsiName == null`.
- A complaint with multiple assignments: only the most-recent assignment with a non-null `asiName` is used for the fallback.
- If the top-level `assignedAsiName` field is present and non-null, the `assignments` list is not consulted at all.

---

## 1.5 PagedComplaints

### Purpose
Wraps the paginated list response from `serviceComplaints.list`.

### Fields

| Field | Dart type | JSON key | Nullable | Notes |
|---|---|---|---|---|
| `items` | `List<ComplaintDto>` | `"items"` | No | The current page of complaints; never null (will throw if key absent) |
| `nextCursor` | `String?` | `"nextCursor"` | Yes | Opaque cursor string for fetching next page; `null` means no more pages |

### fromJson Contract
- `items`: always present; each element parsed by `ComplaintDto.fromJson`
- `nextCursor`: absent key or JSON `null` both produce `null`

### Edge Cases
- An empty page is valid: `items` is `[]` and `nextCursor` is `null`.
- The `items` key must exist; if it is absent a runtime cast error occurs.

---

## 1.6 CreateComplaintLineInput

### Purpose
Input payload for one unit line in the complaint creation request.

### Fields

| Field | Dart type | Nullable | Included in JSON? |
|---|---|---|---|
| `serialNumber` | `String?` | Yes | Only if non-null |
| `productId` | `String?` | Yes | Only if non-null |
| `notes` | `String?` | Yes | Only if non-null |

### toJson Contract
- Produces a `Map<String, dynamic>` containing only keys for non-null fields.
- An instance with all fields null produces `{}`.

---

## 1.7 CreateComplaintInput

### Purpose
Full input payload for the complaint creation mutation.

### Fields

| Field | Dart type | Nullable | Included in JSON? |
|---|---|---|---|
| `title` | `String?` | Yes | Only if non-null |
| `description` | `String?` | Yes | Only if non-null |
| `customerName` | `String?` | Yes | Only if non-null |
| `customerPhone` | `String?` | Yes | Only if non-null |
| `lines` | `List<CreateComplaintLineInput>` | No | Always; may be empty `[]` |

### toJson Contract
- `title`, `description`, `customerName`, `customerPhone`: omitted entirely from JSON when null.
- `lines`: always present in JSON; value is the result of mapping each element through `CreateComplaintLineInput.toJson()`. An empty lines list serializes as `"lines": []`.

### Edge Cases
- A payload where all optional fields are null and lines is empty produces `{"lines": []}`.

---

# 2. ServiceClient

## Purpose
The `ServiceClient` class is the single API boundary for all service complaint operations. It wraps a generic `ApiClient` and exposes typed, future-returning methods. A Riverpod `Provider<ServiceClient>` named `serviceClientProvider` makes it available throughout the widget tree.

## Provider
```
serviceClientProvider  →  Provider<ServiceClient>
  reads: apiClientProvider (the shared Dio-based HTTP client)
```

---

## Method: listComplaints

### Signature
```dart
Future<PagedComplaints> listComplaints({String? cursor, int limit = 20, String? status})
```

### tRPC Procedure
`serviceComplaints.list` — called as a **query** (HTTP GET)

### Input Shape Sent to API
```json
{
  "limit": <int>,
  "cursor": "<string>",   // omitted if cursor is null
  "status": "<string>"    // omitted if status is null
}
```
- `limit` is always present; defaults to `20` if not supplied by caller.
- `cursor` is included only when non-null.
- `status` is included only when non-null.

### Return Value
`PagedComplaints` — parsed via `PagedComplaints.fromJson` from the JSON response.

### Usage in Screens
The list screen calls this with only the `status` parameter:
- `status: null` when the "all" filter chip is selected
- `status: <chip_value>` (e.g. `"raised"`, `"assigned"`) for any other chip

### Edge Cases
- When called from the list screen, `cursor` is never passed (defaults to `null`), so pagination beyond the first 20 results is not supported from that screen.
- The `limit` default of 20 means at most 20 complaints are loaded per fetch.

---

## Method: getComplaint

### Signature
```dart
Future<ComplaintDto> getComplaint(String id)
```

### tRPC Procedure
`serviceComplaints.detail` — called as a **query** (HTTP GET)

### Input Shape Sent to API
```json
{
  "id": "<complaint-uuid>"
}
```

### Return Value
`ComplaintDto` — parsed via `ComplaintDto.fromJson`.

### Edge Cases
- If the server returns a 404 or error response, the `ApiClient` throws an exception. The detail screen catches this and shows an error state.

---

## Method: createComplaint

### Signature
```dart
Future<ComplaintDto> createComplaint(CreateComplaintInput input)
```

### tRPC Procedure
`serviceComplaints.create` — called as a **mutation** (HTTP POST)

### Input Shape Sent to API
The result of `CreateComplaintInput.toJson()`. All nullable fields are omitted when null. `lines` is always present. Example with all fields populated and one line:
```json
{
  "title": "Battery not charging",
  "description": "Customer reports battery does not charge after first cycle.",
  "customerName": "Ravi Kumar",
  "customerPhone": "9876543210",
  "lines": [
    { "serialNumber": "SRX12345678" }
  ]
}
```

### Return Value
`ComplaintDto` — the created complaint as returned by the server, parsed via `ComplaintDto.fromJson`.

### Edge Cases
- If the server returns an error, the client throws an exception (propagated to the form screen, which catches it).

---

## Method: updateComplaint

### Signature
```dart
Future<ComplaintDto> updateComplaint(String id, {String? description, String? notes})
```

### tRPC Procedure
`serviceComplaints.update` — called as a **mutation** (HTTP POST)

### Input Shape Sent to API
```json
{
  "id": "<complaint-uuid>",
  "description": "<string>"   // included only if description parameter is non-null
}
```
Note: the `notes` parameter accepted by the Dart method is **not** included in the JSON payload sent to the API. Only `id` (always present) and `description` (conditional) are serialized.

### Return Value
`ComplaintDto` — the updated complaint, parsed via `ComplaintDto.fromJson`.

### Edge Cases
- This method is defined but **not called from any current screen**. It exists in the client for future use.
- Calling with both `description` and `notes` as null sends only `{"id": "<id>"}`.

---

# 3. ComplaintsListScreen

## Purpose
Displays the outlet's service complaints as a scrollable card list with status-filter tabs. Allows the user to navigate to an existing complaint's detail or to raise a new complaint.

## Route
Reached at the route `/more/service` (inferred from navigation calls in the codebase).

## Provider Structure

```
_complaintsProvider  →  FutureProvider.autoDispose.family<PagedComplaints, String?>
  family parameter: status string (null for "all")
  reads: serviceClientProvider → ServiceClient.listComplaints(status: <arg>)
```

- The provider is `autoDispose`, so its state is disposed when no widget is watching it.
- The provider is a `family`: a separate cache entry exists per unique `String?` status argument.
- The currently active provider instance is determined by the selected filter chip.

---

## Filter Chip Row

### Available Chips (in order)
1. `"all"`
2. `"raised"`
3. `"assigned"`
4. `"visit"`
5. `"resolved"`
6. `"cancelled"`

### Behavior
- Default selected chip on screen open: `"all"`
- Selecting a chip calls `setState` updating `_filter` to the chip's string value.
- When `_filter == "all"`, the `statusArg` passed to the provider is `null`.
- When `_filter` is any other value, `statusArg` equals the chip's string (e.g. `"raised"`).
- Changing the selected chip triggers a new watch on a different family parameter, causing the provider for the new status to load. The previous provider's data is discarded from view.
- Only one chip is selected at a time.
- The chip row spans horizontal padding of 18 dp left and right, with 12 dp bottom padding.

---

## UI States

### Loading State
- Displayed while the `_complaintsProvider` is in its `loading` state.
- Shows a skeleton list: 5 placeholder cards, each 84 dp tall, with rounded corners (18 dp radius), filled with the theme's `sunken` colour.
- Cards are separated by 10 dp vertical gaps.
- The skeleton list uses the same left/right padding (18 dp) and bottom padding (24 dp) as the data list.

### Error State
- Displayed when the provider emits an error.
- Shows a single `Text` widget centred on screen with the message: **"Failed to load complaints"**
- Text colour: `c.textMute`
- No retry button is shown; the user can pull-to-refresh.

### Empty State (data loaded, zero items)
- Displayed when the provider returns successfully but `page.items` is empty.
- Uses the `EmptyState` widget with:
  - Icon: `Icons.build_circle_outlined`
  - Title: **"No complaints"**
  - Subtitle: **"Service complaints you raise will appear here."**
  - Action button label: **"Raise a complaint"**
  - Action button behaviour: navigates to `/more/service/new`
- The empty state is placed inside a `ListView` so that pull-to-refresh works even when the list is empty.

### Data State (items present)
- Shows a scrollable `ListView.separated` of complaint tiles.
- Padding: 18 dp left, 18 dp right, 24 dp bottom.
- Items separated by 10 dp vertical gaps.
- Each item is a `_ComplaintTile` (see below).

---

## Complaint Tile (`_ComplaintTile`)

Each tile is wrapped in an `AppCard` (tappable card widget).

### Tap Behaviour
Navigates to `/more/service/<complaint.id>` using `context.push`.

### Content (top to bottom)

**Row 1 — Number and Status Badge:**
- Left: `"#<complaintNumber>"` — e.g. `"#SC-0042"`. Style: `AppTextStyles.itemTitle`, colour `c.text`. Wrapped in `Expanded` to fill available width.
- Right: `StatusBadge` widget with `complaint.status`.

**Conditional Title Row (only if `complaint.title != null`):**
- `complaint.title` text. Style: `AppTextStyles.label`, colour `c.textMute`. Single line with ellipsis overflow. Preceded by 6 dp vertical gap.

**Row 3 — Meta Row (always present, 8 dp below the title/number row):**
- Calendar icon (`Icons.calendar_today_outlined`, size 13, colour `c.textFaint`)
- 5 dp gap
- Formatted creation date: `fmtDateStr(complaint.createdAt)`. Style: `AppTextStyles.smallLabel`, colour `c.textFaint`.
- If `complaint.assignedAsiName != null`:
  - 12 dp gap
  - Person icon (`Icons.person_outline`, size 13, colour `c.textFaint`)
  - 5 dp gap
  - `complaint.assignedAsiName` text. Style: `AppTextStyles.smallLabel`, colour `c.textFaint`.

### Edge Cases
- If `complaint.title` is null, the title row is entirely absent (no gap, no text).
- If `complaint.assignedAsiName` is null, the person icon and name are entirely absent.
- If `complaint.createdAt` is null, `fmtDateStr` receives `null` — the formatted output depends on `fmtDateStr`'s null behaviour (assumed to return a fallback string like `"—"`).

---

## FAB (Floating Action Button)

- Always visible — shown in all states (loading, error, empty, data).
- Type: `FloatingActionButton.extended`
- Background colour: `c.accent`
- Foreground colour: `Colors.white`
- Icon: `Icons.add`
- Label: **"Raise complaint"**
- On tap: navigates to `/more/service/new` using `context.push`.

---

## Pull-to-Refresh

- Available in all data states (loading state shows the skeleton instead of the refresh indicator trigger, but the `RefreshIndicator` widget wraps the content area).
- On refresh: calls `ref.invalidate(_complaintsProvider(statusArg))` for the currently active status filter.
- Refresh indicator colour: `c.accent`.
- Invalidating the provider causes it to re-fetch from the API.

---

## App Bar

- Title: **"Service"**
- Shows a back button (`showBack: true`).

---

## Navigation

| Trigger | Destination |
|---|---|
| Tap a complaint tile | `context.push('/more/service/<id>')` |
| Tap FAB | `context.push('/more/service/new')` |
| Tap "Raise a complaint" in empty state | `context.push('/more/service/new')` |

---

## Edge Cases
- Switching filter chips does not preserve scroll position; the list always starts at the top for the new filter.
- The provider family is `autoDispose`; navigating away and back will re-fetch if the provider has been disposed.
- The filter chips do not display counts; only the label text is shown.
- There is no search or sort functionality.
- The "visit" chip maps to status `"visit"` — this is the filter chip label used for the `field visit scheduled` status.

---

# 4. ComplaintDetailScreen

## Purpose
Displays the full details of a single service complaint, including its description, meta-information, status, resolution note, and unit line items. Supports pull-to-refresh and a manual refresh button in the app bar.

## Route
Reached at `/more/service/<complaintId>`. The `complaintId` string is passed as a constructor parameter.

## Provider Structure

```
_complaintDetailProvider  →  FutureProvider.autoDispose.family<ComplaintDto, String>
  family parameter: complaintId (String, non-nullable)
  reads: serviceClientProvider → ServiceClient.getComplaint(id)
```

- `autoDispose` and `family` — same disposal and caching semantics as the list provider.
- The screen is a `ConsumerWidget` (not stateful).

---

## UI States

### Loading State
- Renders a `_Loading` widget: a `ListView` with 4 placeholder items, each 52 dp tall, rounded corners (16 dp radius), filled with `c.sunken` colour, with 10 dp bottom padding between items. Overall padding: 18 dp on all sides.

### Error State
- A `Center` widget containing a single `Text`: **"Failed to load complaint"**
- Colour: `c.textMute`
- No retry button; user can navigate back and return.

### Data State
- Rendered by `_Body`. Uses a `CustomScrollView` with `AlwaysScrollableScrollPhysics` (ensures pull-to-refresh works even if content does not fill the screen).
- Wrapped in a `RefreshIndicator` (colour: `c.accent`).
- The scroll view contains:
  1. App bar (sliver)
  2. Content padding sliver: 18 dp left/right, 32 dp bottom padding

---

## App Bar (Data State)

- Title: **`"#<complaintNumber>"`** (e.g. `"#SC-0042"`)
- Subtitle: **"SERVICE"** (displayed below the title)
- Shows back button (`showBack: true`)
- Trailing row (right side of app bar):
  1. `StatusBadge` for `complaint.status`
  2. 6 dp gap
  3. Refresh icon button: 36x36 dp container, colour `c.surface`, border `c.line`, corner radius 10 dp, icon `Icons.refresh_rounded` size 18 colour `c.textMute`. Tapping calls `_refresh()`.

---

## Refresh Behaviour

Two refresh entry points, both call `ref.invalidate(_complaintDetailProvider(complaint.id))`:
1. Pull-to-refresh gesture on the `CustomScrollView`
2. Tap the refresh icon button in the app bar trailing area

---

## Content Sections (Data State)

### Section 1 — Issue Card
Condition: shown only if `complaint.title != null` **OR** `complaint.description != null`. If both are null, the entire card is absent.

Content:
- If `complaint.title != null`: displays title text. Style: `AppTextStyles.bodyHeavy`, colour `c.text`. Followed by 6 dp gap if description also present.
- If `complaint.description != null`: displays description text. Style: `AppTextStyles.label`, colour `c.textMute`.

The card is always a full-width `AppCard`. If only description is present, no title text is rendered. If only title is present, no description text is rendered.

---

### Section 2 — Meta Info Card (14 dp below Section 1)
Always shown. Uses `KVRow` widgets (key-value row layout). Fields in order:

| Row | Label | Value | Condition |
|---|---|---|---|
| 1 | `"Raised on"` | `fmtDateStr(complaint.createdAt)` | Always |
| 2 | `"Customer"` | `complaint.customerName` | Only if `customerName != null` |
| 3 | `"Phone"` | `complaint.customerPhone` | Only if `customerPhone != null` |
| 4 | `"Assigned to"` | `complaint.assignedAsiName` | Only if `assignedAsiName != null` |
| 5 | `"Status"` | `_statusLabel(complaint.status)` | Always |
| 6 | `"Resolution"` | `complaint.resolutionNote` | Only if `resolutionNote != null` |

**Row separator logic (`last` property):**
- Row 5 ("Status"): `last: complaint.resolutionNote == null` — it is the last row when there is no resolution note.
- Row 6 ("Resolution"): `last: true` — always the last row when present.
- All other rows: `last` is not explicitly set (defaults to whatever `KVRow` default is, assumed `false`).

**Resolution note colour:**
- When `complaint.status` is `"resolved"`, `"telephonic_closure"`, or `"cancelled"`, the resolution note value text uses colour `c.greenText`.
- For all other statuses, the resolution note value text uses the default KVRow value colour.

**Status label mapping** (the `_statusLabel` function):

| Raw status | Displayed label |
|---|---|
| `"raised"` | `"Raised — awaiting assignment"` |
| `"assigned"` | `"Assigned to service engineer"` |
| `"visit"` | `"Field visit scheduled"` |
| `"test_result_submitted"` | `"Test result submitted"` |
| `"retest_requested"` | `"Retest requested"` |
| `"resolved"` | `"Resolved"` |
| `"telephonic_closure"` | `"Closed (telephonic)"` |
| `"cancelled"` | `"Cancelled"` |
| Any other value | The raw status string itself |

---

### Section 3 — Units Section
Condition: shown only if `complaint.lines.isNotEmpty`. When the lines list is empty, this entire section is absent.

Layout:
- 16 dp gap above section
- Section heading: **"Units"** — `AppTextStyles.sectionTitle`, colour `c.text`
- 10 dp gap below heading
- One `AppCard` per line item, each with 10 dp bottom padding below it

**Per-line card content (using `KVRow` widgets):**
Three possible states for each line card:
1. `serialNumber != null` and `notes != null`: Two rows — `"Serial no."` / `serialNumber`, then `"Notes"` / `notes` (notes row has `last: true`; serial row has `last: notes == null` which evaluates to `false` here).
2. `serialNumber != null` and `notes == null`: One row — `"Serial no."` / `serialNumber` with `last: true` (since `notes == null`).
3. `notes != null` and `serialNumber == null`: One row — `"Notes"` / `notes` with `last: true`.
4. Both `serialNumber == null` and `notes == null`: One row — `"Unit"` / `"—"` with `last: true`.

Note: `productId` from `ComplaintLineDto` is never rendered in the UI.

---

## FAB
No FAB on the detail screen.

---

## Navigation
- Back navigation via the back button in `OutletAppBar`.
- No navigation to other screens from within the detail screen.

---

## Edge Cases
- The detail screen has no filter, no edit functionality, and no action buttons for changing the complaint status.
- If `complaint.assignedAsiName` is null (derived via the fallback logic in `ComplaintDto.fromJson`), the "Assigned to" row is absent from the meta card.
- Both `"telephonic_closure"` and `"cancelled"` are terminal statuses where `resolutionNote` may be shown in green.
- `complaint.createdAt` may be null; `fmtDateStr(null)` is called and its output depends on the formatter utility.
- There is no activity timeline rendered in this screen (despite `ComplaintActivity` being defined in the models file).

---

# 5. RaiseComplaintScreen

## Purpose
A form screen for creating a new service complaint. Contains three sections (Issue, Customer, Unit), validates inputs before submission, calls the create API, and navigates back on success.

## Route
`/more/service/new`

## Widget Type
`ConsumerStatefulWidget` — maintains form controller state and loading boolean.

## Provider Dependency
- Reads `serviceClientProvider` to obtain `ServiceClient` on submit.
- Reads `themeModeProvider` to determine dark/light theme.

---

## Form Fields

The form is logically grouped into three sections. The `Form` widget wraps the entire content with a `GlobalKey<FormState>`. However, validation is performed manually in `_submit()` — the `Form`'s built-in `validate()` mechanism is NOT invoked; custom checks occur before calling the API.

### Section 1 — Issue

Group label shown as: **"ISSUE"** (uppercased, letter spacing 0.5, bold)

| Field | Controller | Label | Hint | maxLines | Keyboard type | Required |
|---|---|---|---|---|---|---|
| Title | `_titleCtrl` | `"Title"` | `"Brief description"` | 1 | text | Conditionally (see validation) |
| Details | `_descCtrl` | `"Details"` | `"Full issue description"` | 4 | text | Conditionally (see validation) |

### Section 2 — Customer (optional)

Group label shown as: **"CUSTOMER (OPTIONAL)"** (uppercased)

| Field | Controller | Label | Hint | maxLines | Keyboard type | Required |
|---|---|---|---|---|---|---|
| Customer name | `_customerNameCtrl` | `"Customer name"` | none | 1 | text | No |
| Phone | `_customerPhoneCtrl` | `"Phone"` | none | 1 | phone | No |

### Section 3 — Unit (optional)

Group label shown as: **"UNIT (OPTIONAL)"** (uppercased)

| Field | Controller | Label | Hint | maxLines | Keyboard type | Required |
|---|---|---|---|---|---|---|
| Serial number | `_serialCtrl` | `"Serial number"` | `"e.g. SRX12345678"` | 1 | text | No |

---

## Validation Rules

Validation occurs in `_submit()` **before** the API is called. All validation is performed on the trimmed text values. The form is NOT submitted if any validation fails; a `SnackBar` is shown instead.

### Rule 1 — Title or Description required
- Condition: `_descCtrl.text.trim().isEmpty && _titleCtrl.text.trim().isEmpty`
- If true: show SnackBar with message **"Please enter at least a title or description."**
- Behaviour: return without submitting.

### Rule 2 — Phone minimum length
- Condition: phone is non-empty AND `phone.length < 5`
- If true: show SnackBar with message **"Phone number must be at least 5 digits."**
- Behaviour: return without submitting.
- Note: if phone is empty, this rule is skipped entirely (empty phone is allowed).

### Rule 3 — Serial number minimum length
- Condition: serial is non-empty AND `serial.length < 2`
- If true: show SnackBar with message **"Serial number must be at least 2 characters."**
- Behaviour: return without submitting.
- Note: if serial is empty, this rule is skipped entirely (empty serial is allowed).

### Validation Order
Rules are evaluated in order: Rule 1, then Rule 2, then Rule 3. The first failing rule stops further evaluation and shows its SnackBar.

---

## Submit Behaviour

### Pre-submit State
- `_loading` is set to `true` via `setState`.
- The submit button is disabled: `onTap` receives `null` when `_loading` is `true`.
- The `AppButton` reflects the loading state visually (spinner or disabled appearance — defined by `AppButton`).

### API Call

Calls `ServiceClient.createComplaint(CreateComplaintInput(...))` with:

| Input field | Source | Included? |
|---|---|---|
| `title` | `_titleCtrl.text.trim()` | Only if non-empty (empty → `null`) |
| `description` | `_descCtrl.text.trim()` | Only if non-empty (empty → `null`) |
| `customerName` | `_customerNameCtrl.text.trim()` | Only if non-empty (empty → `null`) |
| `customerPhone` | `_customerPhoneCtrl.text.trim()` | Only if non-empty (empty → `null`) |
| `lines` | List built from serial | Empty `[]` if serial is empty; one `CreateComplaintLineInput(serialNumber: serial)` if serial is non-empty |

A `CreateComplaintLineInput` is created only when the serial field is non-empty after trimming. The `productId` and `notes` fields of `CreateComplaintLineInput` are never set from this screen.

### On Success
1. Show SnackBar: **"Complaint submitted successfully."** (default background colour)
2. Call `context.pop()` — navigates back to the previous screen (the complaints list).
3. `_loading` is set back to `false` in the `finally` block.

### On Failure
1. Show SnackBar with message: **`"Failed to submit: <error.toString()>"`** — background colour: `Colors.red`
2. `_loading` is set back to `false` in the `finally` block.
3. The form remains visible and fields retain their content; the user can correct and retry.

### Mounted Guard
Both success and failure paths check `if (mounted)` before attempting UI updates (SnackBar, navigation, setState) to prevent operations on a disposed widget.

---

## Submit Button

- Widget: `AppButton`
- Label: **"Submit complaint"**
- Full width: `true`
- Size: `AppButtonSize.lg` (large)
- Loading state: shows loading indicator when `_loading == true`
- Disabled: `onTap` is `null` when `_loading == true`; otherwise `onTap` calls `_submit()`
- Position: below all three field groups, preceded by 28 dp vertical gap

---

## App Bar

- Title: **"Raise complaint"**
- Shows back button (`showBack: true`)
- No trailing actions

---

## Layout

- Body uses `CustomScrollView` with two slivers: the app bar and a `SliverPadding` (18 dp left/right, 32 dp bottom) containing a `SliverList`.
- Within the list: Issue group, 16 dp gap, Customer group, 16 dp gap, Unit group, 28 dp gap, submit button.
- The `Form` widget wraps the entire `CustomScrollView`.

---

## Resource Disposal

The `dispose()` method explicitly disposes all five `TextEditingController` instances:
- `_titleCtrl`
- `_descCtrl`
- `_customerNameCtrl`
- `_customerPhoneCtrl`
- `_serialCtrl`

---

## Navigation

| Trigger | Behaviour |
|---|---|
| Back button | Standard pop (no form data is preserved) |
| Successful submission | `context.pop()` — returns to previous screen |

---

## List Refresh After Submission

The `RaiseComplaintScreen` does NOT explicitly invalidate `_complaintsProvider` after a successful submission. The complaints list will only show the new complaint if it re-fetches, which happens when:
- The user pulls-to-refresh on the list screen.
- The list screen's `autoDispose` provider was disposed while the form was open and re-runs on return.

---

## Edge Cases

- Submitting with only a title (empty description): valid, passes Rule 1. API receives `title` only.
- Submitting with only a description (empty title): valid, passes Rule 1. API receives `description` only.
- Phone field with exactly 5 characters: passes Rule 2 (minimum is 5, and `length < 5` is false for length = 5).
- Phone field with 4 characters: fails Rule 2.
- Serial field with exactly 2 characters: passes Rule 3 (minimum is 2, and `length < 2` is false for length = 2).
- Serial field with 1 character: fails Rule 3.
- Customer name has no length validation; any non-empty value is accepted.
- Multiple rapid taps on the submit button are prevented: the button's `onTap` is set to `null` once `_loading` is `true`.
- There is no character limit enforced in the UI on any field.
- The `Form` widget's `validate()` is never called; validator functions on `TextFormField` are not used for this form's submission flow.

---

## Summary Table — Validation Messages

| Rule | Condition | SnackBar message | Background |
|---|---|---|---|
| Title/Description required | Both title and description are empty after trimming | `"Please enter at least a title or description."` | Default |
| Phone too short | Phone is non-empty and length < 5 | `"Phone number must be at least 5 digits."` | Default |
| Serial too short | Serial is non-empty and length < 2 | `"Serial number must be at least 2 characters."` | Default |
| Submit success | — | `"Complaint submitted successfully."` | Default |
| Submit failure | API throws | `"Failed to submit: <error>"` | `Colors.red` |

---

*End of specification.*
