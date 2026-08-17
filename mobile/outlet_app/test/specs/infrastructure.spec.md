# Behavioral Specification: Infrastructure Layer
## outlet_app — Syrex Mobile

> This document is written for a test writer who does not have access to the source code.
> Every value, path, and behavior stated here is taken verbatim from the implementation.
> Do not deviate from these exact details when writing tests.

---

# Component: ApiClient

## Purpose

`ApiClient` is the single HTTP gateway for all tRPC calls in the app. It wraps a
configured `Dio` instance, encodes tRPC request envelopes, unwraps tRPC response
envelopes, and exposes three public methods: `query`, `mutation`, and `mutationVoid`.

---

## Detailed Behaviour

### Base URL Configuration

- The base URL is set at compile time via the Dart `--dart-define` flag:
  `--dart-define=BASE_URL=<value>`
- The environment variable name is exactly `BASE_URL` (all caps).
- If the flag is not provided at compile time, the default fallback URL is:
  `https://overprecise-nestor-raspingly.ngrok-free.dev/`
  (note the trailing slash).
- This value is stored in the compile-time constant `_baseUrl` (private, file-scoped).
- The same `_baseUrl` constant is used for both the main `Dio` instance and the
  separate bare `Dio` instance created during the 401 refresh flow.

---

### Timeout Values

All three timeouts are set on the `Dio` `BaseOptions`:

| Timeout type      | Value      |
|-------------------|------------|
| `connectTimeout`  | 10 seconds |
| `receiveTimeout`  | 20 seconds |
| `sendTimeout`     | 10 seconds |

---

### Request Headers Injected (Auth Interceptor)

Before every request, an `InterceptorsWrapper.onRequest` handler reads three values
from `TokenStore` and injects them as headers:

| Header            | Source                       | Condition for injection                  |
|-------------------|------------------------------|------------------------------------------|
| `Authorization`   | `tokens.accessToken` (async) | Injected as `Bearer <token>` only if non-null |
| `x-actor-id`      | `tokens.userId` (async)      | Injected only if non-null                |
| `x-org-id`        | `tokens.orgId` (async)       | Injected only if non-null                |

If any of these values is null, the corresponding header is simply not added; no
error is thrown at the request-injection stage.

---

### tRPC Query — `query<T>()` Method

**Signature:**
```
Future<T> query<T>(
  String procedure,
  Map<String, dynamic> input,
  T Function(dynamic json) fromJson,
)
```

**URL construction:**
- HTTP method: `GET`
- Path: `/trpc/<procedure>` — the procedure name is appended verbatim after `/trpc/`.
- Query parameter: a single parameter named `input`.
- The value of `input` is a JSON-encoded string of the object `{"json": <input map>}`.
  That is, the input map is nested one level under the key `"json"` before encoding.

**Example:** For procedure `"outlet.summary"` and input `{"outletId": "abc"}`, the
request URL query string is:
`?input=%7B%22json%22%3A%7B%22outletId%22%3A%22abc%22%7D%7D`
(URL-encoding of `{"json":{"outletId":"abc"}}`).

**Response handling:**
- On success: the response data is passed to `_unwrap()`, and the unwrapped payload
  is passed to `fromJson`. The result of `fromJson` is returned.
- On `DioException` where `e.response != null`: the error response body is passed to
  `_unwrap()` (which may throw `ApiException`), and if `_unwrap` returns, `fromJson`
  is called on that result and returned. This means a non-2xx response with a valid
  tRPC error envelope is re-thrown as `ApiException`, not returned as a value.
- On `DioException` where `e.response == null` (network error, timeout, etc.): the
  exception is re-thrown unchanged.

---

### tRPC Mutation — `mutation<T>()` Method

**Signature:**
```
Future<T> mutation<T>(
  String procedure,
  Map<String, dynamic> input,
  T Function(dynamic json) fromJson,
)
```

**URL construction:**
- HTTP method: `POST`
- Path: `/trpc/<procedure>`
- No query parameters.

**Request body:**
- The body is a JSON-encoded string of the object `{"json": <input map>}`.
  The input map is nested one level under the key `"json"` before JSON encoding.
- The `Content-Type` header is explicitly set to `application/json` via
  `Options(headers: {'Content-Type': 'application/json'})`.
  Note: this is set per-request and overrides or supplements the Dio-level headers.

**Response handling:** identical to `query<T>()` — success calls `_unwrap` then
`fromJson`; `DioException` with a response body calls `_unwrap` (may throw
`ApiException`); `DioException` with no response is re-thrown.

---

### tRPC Mutation (void) — `mutationVoid()` Method

**Signature:**
```
Future<void> mutationVoid(String procedure, Map<String, dynamic> input)
```

**URL construction and body:** identical to `mutation<T>()` — POST to
`/trpc/<procedure>` with body `{"json": <input>}` and `Content-Type: application/json`.

**Response handling:**
- On success: the response data is ignored (no `_unwrap`, no `fromJson`). Returns void.
- On `DioException` where `e.response != null`: `_unwrap` is called on the error body
  (which may throw `ApiException`), and if it does not throw, the method returns normally.
- On `DioException` where `e.response == null`: re-thrown unchanged.

---

### tRPC Response Envelope Unwrapping — `_unwrap()` (private)

This method is called for every response (success and error-with-body) to extract the
actual payload from the tRPC envelope.

**Step 1 — Normalize to a single map:**
- If the raw data is a `List` and is non-empty: take `data[0]` and cast to
  `Map<String, dynamic>`. This handles tRPC batch responses (batch=1).
- If the raw data is a `Map<String, dynamic>`: use it directly. This handles tRPC
  single-object (non-batch) responses.
- Any other shape (empty list, null, primitive, etc.): throw
  `ApiException('Unexpected response shape')` with no status code.

**Step 2 — Check for error key:**
- If the normalized map contains the key `"error"`:
  - Read `map["error"]` as `Map<String, dynamic>`.
  - Extract message: `error["json"]["message"]` cast as `String?`; if null or absent,
    use the string `"Unknown error"`.
  - Extract HTTP status code: `error["json"]["data"]["httpStatus"]` cast as `int?`;
    may be null.
  - Throw `ApiException(message, statusCode: code)`.

**Step 3 — Extract payload (success path):**
- Navigate the chain: `map["result"]["data"]["json"]`
  - `map["result"]` cast to `Map<String, dynamic>`
  - `["data"]` cast to `Map<String, dynamic>`
  - `["json"]` — no further cast, returned as `dynamic`
- Return the resulting `dynamic` value. This is the raw payload passed to `fromJson`.

**Exact key chain for success:** `result` → `data` → `json`
**Exact key chain for error message:** `error` → `json` → `message`
**Exact key chain for error HTTP status:** `error` → `json` → `data` → `httpStatus`

---

### 401 Refresh Flow

When any request receives a 401 HTTP status code, the `onError` interceptor executes
the following steps in order:

1. Read `tokens.refreshToken` asynchronously.
2. If `refreshToken` is null: skip the refresh attempt entirely and pass the original
   error to `handler.next(err)` (no token clear, no retry).
3. If `refreshToken` is non-null: attempt a token refresh:
   a. Create a **new, bare `Dio` instance** with `BaseOptions(baseUrl: _baseUrl)`.
      This instance has no interceptors (no auth header injection, no retry logic).
   b. POST to `/trpc/auth.refresh` with:
      - Body: `{"json": {"refreshToken": "<refresh token value>"}}`
      - Header: `Content-Type: application/json`
   c. Parse the refresh response using inline navigation (not `_unwrap()`):
      - If `resp.data` is a `List`: take `raw[0]`; otherwise use `raw` directly.
      - Navigate: `first["result"]["data"]["json"]` cast to `Map<String, dynamic>`.
   d. Call `tokens.save(...)` with exactly these fields extracted from the JSON map:
      - `accessToken`: `json["accessToken"]` as `String`
      - `refreshToken`: `json["refreshToken"]` as `String`
      - `userId`: `json["user"]["id"]` as `String`
      - `orgId`: `json["orgId"]` as `String?`, defaulting to empty string `""` if null
      - `outletId`: `json["user"]["outletId"]` as `String?`, defaulting to `""` if null
   e. Retry the original request using the original `Dio` instance (`dio.fetch(opts)`):
      - Before retrying, read the new access token from `tokens.accessToken`.
      - Set `opts.headers["Authorization"] = "Bearer <newToken>"`.
      - The retry uses the same request options (`err.requestOptions`) as the original.
   f. Resolve the handler with the retry response: `handler.resolve(retryResp)`.
4. If the refresh request throws any exception (network error, parse error, non-2xx
   from auth server, etc.):
   - Call `tokens.clear()` to wipe all stored tokens.
   - Fall through to `handler.next(err)` — the original 401 error propagates.
5. If there was no 401, pass the error straight through: `handler.next(err)`.

---

### ApiException

`ApiException` implements `Exception`.

**Fields:**
| Field        | Type     | Required | Description                              |
|--------------|----------|----------|------------------------------------------|
| `message`    | `String` | Yes      | Human-readable error description         |
| `statusCode` | `int?`   | No       | HTTP status code, may be null            |

**Constructor:**
```
const ApiException(this.message, {this.statusCode})
```

**`toString()` output format:**
`ApiException(<statusCode>): <message>`
Example: `ApiException(404): Not found`
When `statusCode` is null: `ApiException(null): <message>`

---

### Riverpod Providers

Three providers are declared at the top level of `api_client.dart`:

| Provider name       | Type              | What it creates                                |
|---------------------|-------------------|------------------------------------------------|
| `tokenStoreProvider`| `Provider<TokenStore>` | A plain `TokenStore()` instance          |
| `dioProvider`       | `Provider<Dio>`   | Result of `buildDio(tokens, ref)`              |
| `apiClientProvider` | `Provider<ApiClient>` | `ApiClient(dio, tokens)` using the above two |

All three use `ref.read` (not `ref.watch`), meaning they do not rebuild on changes.

---

## Edge Cases

- If the tRPC response data is an empty list `[]`, `_unwrap` throws
  `ApiException('Unexpected response shape')`.
- If the tRPC response data is `null` or a primitive (int, string, bool), `_unwrap`
  throws `ApiException('Unexpected response shape')`.
- If the error envelope's `json.message` field is missing or null, the fallback
  message is the string `"Unknown error"` (exact casing).
- If `tokens.accessToken` is null at request time, no `Authorization` header is sent.
  The request proceeds unauthenticated.
- If `tokens.userId` is null, no `x-actor-id` header is sent.
- If `tokens.orgId` is null, no `x-org-id` header is sent.
- During the 401 refresh flow, if `refreshToken` is null, the error is forwarded
  without calling `tokens.clear()` — stored tokens are preserved.
- During retry after successful refresh, the auth interceptor's `onRequest` handler
  will also run and set the `Authorization` header again from the newly saved token.
  The explicit header set before `dio.fetch(opts)` and the interceptor both set the
  same value, so there is no conflict.

---

---

# Component: Formatters

## Purpose

Utility functions (top-level, no class wrapper) for formatting currency amounts,
dates, and parsing decimal strings. All are in `lib/core/utils/formatters.dart`.
The `intl` package (`^0.19.0`) is used for number and date formatting.

---

## Detailed Behaviour

### `fmtINR(num amount, {bool paise = false})`

**Purpose:** Format a number as an Indian Rupee amount.

**Input:**
- `amount`: any `num` (int or double), positive or negative.
- `paise` (named, optional): `bool`, default `false`.

**Output:** `String`

**Behavior:**
1. Determine sign: if `amount < 0`, the prefix is `"−₹"` (Unicode minus sign U+2212,
   not a hyphen). If `amount >= 0`, the prefix is `"₹"`.
2. Take the absolute value of `amount`.
3. Format using `NumberFormat` with locale `"en_IN"` (Indian number grouping):
   - If `paise == false`: format string is `'#,##,##,##0'` — integer grouping,
     no decimal places. Uses Indian lakh/crore grouping (e.g., 1,23,456).
   - If `paise == true`: format string is `'#,##,##,##0.00'` — always two decimal
     places. Uses Indian lakh/crore grouping.
4. Prepend the sign+symbol prefix to the formatted number string.

**Examples:**
- `fmtINR(123456)` → `"₹1,23,456"`
- `fmtINR(1234567.89, paise: true)` → `"₹12,34,567.89"`
- `fmtINR(-5000)` → `"−₹5,000"` (note: Unicode minus, not hyphen)
- `fmtINR(0)` → `"₹0"`

**Edge cases:**
- Zero: formatted as `"₹0"` (no decimal) or `"₹0.00"` (with paise).
- Negative zero (`-0.0`): treated as `amount < 0` is false (since `-0.0 < 0` is false
  in Dart), so prefix is `"₹"`. Formatted as `"₹0.00"`.
- The currency symbol is `"₹"` (U+20B9 Indian Rupee Sign), not `"Rs"` or `"INR"`.
- The negative sign is `"−"` (U+2212 MINUS SIGN), not `"-"` (U+002D HYPHEN-MINUS).

---

### `fmtCompact(num amount)`

**Purpose:** Format large amounts compactly using Indian units (Lakh, Crore).

**Input:** `amount`: any `num`.
**Output:** `String`

**Behavior:**
1. Take the absolute value (`v = amount.abs()`).
2. If `v >= 1e7` (10,000,000 — one crore):
   - Divide `amount` (not `v`) by `1e7`.
   - Format to exactly 2 decimal places using `toStringAsFixed(2)`.
   - Strip a trailing `".00"` suffix using the regex `\.00$` (if the result ends in
     exactly `.00`, remove it).
   - Prepend `"₹"` and append `" Cr"`.
   - Example: `fmtCompact(25000000)` → `"₹2.50 Cr"`;
     `fmtCompact(20000000)` → `"₹2 Cr"` (`.00` stripped).
3. Else if `v >= 1e5` (100,000 — one lakh):
   - Divide `amount` by `1e5`.
   - Format to exactly 2 decimal places, strip trailing `".00"`.
   - Prepend `"₹"` and append `" L"`.
   - Example: `fmtCompact(125000)` → `"₹1.25 L"`;
     `fmtCompact(100000)` → `"₹1 L"`.
4. Otherwise (v < 1e5): call `fmtINR(amount)` and return its result unchanged.

**Edge cases:**
- Negative amounts at crore/lakh scale: `amount / 1e7` preserves the negative sign,
  so the result will have a negative number before `" Cr"` or `" L"`.
  Example: `fmtCompact(-25000000)` → `"₹-2.50 Cr"`.
  (Note: unlike `fmtINR`, this does not use the Unicode minus sign or the `"−₹"` prefix.)
- Zero: falls into the `fmtINR` branch (v=0 < 1e5). Returns `"₹0"`.
- Exactly 1e5 (100000): formatted as `"₹1 L"`.
- Exactly 1e7 (10000000): formatted as `"₹1 Cr"`.
- Values between 1e5 and 1e7 use the Lakh branch.

---

### `fmtDate(DateTime dt)`

**Purpose:** Format a `DateTime` as a full date string.

**Input:** `dt`: a non-null `DateTime`.
**Output:** `String`

**Format string:** `'dd MMM yyyy'`
**Locale:** uses `intl` default (no explicit locale specified).

**Examples:**
- June 6, 2026 → `"06 Jun 2026"`
- January 1, 2024 → `"01 Jan 2024"`

---

### `fmtDateShort(DateTime dt)`

**Purpose:** Format a `DateTime` as a short date (day and abbreviated month, no year).

**Input:** `dt`: a non-null `DateTime`.
**Output:** `String`

**Format string:** `'dd MMM'`

**Examples:**
- June 6, 2026 → `"06 Jun"`
- December 31 → `"31 Dec"`

---

### `fmtRelative(DateTime dt)`

**Purpose:** Format a `DateTime` as a human-readable relative time string.

**Input:** `dt`: a non-null `DateTime` (assumed to be in the past).
**Output:** `String`

**Behavior:** Computes `diff = DateTime.now().difference(dt)` and applies the
following rules in order (first matching rule wins):

| Condition                    | Output                              |
|------------------------------|-------------------------------------|
| `diff.inSeconds < 60`        | `"Just now"` (exact string)         |
| `diff.inMinutes < 60`        | `"<N> min ago"` where N is `diff.inMinutes` |
| `diff.inHours < 24`          | `"<N> hr ago"` where N is `diff.inHours` |
| `diff.inDays == 1`           | `"Yesterday"` (exact string)        |
| `diff.inDays < 7`            | `"<N> days ago"` where N is `diff.inDays` |
| (fallback)                   | `fmtDate(dt)` — full date format    |

**Important details:**
- `diff.inSeconds`, `diff.inMinutes`, `diff.inHours`, `diff.inDays` are Dart's
  integer truncations of the total duration.
- "Just now" threshold is strictly less than 60 seconds (0–59 seconds inclusive).
- Minutes threshold is strictly less than 60 minutes (1–59 minutes).
- Hours threshold is strictly less than 24 hours (1–23 hours).
- `diff.inDays == 1` is exactly 1 day (24–47 hours truncated to days).
- `diff.inDays < 7` covers 2–6 days (2 days ago through 6 days ago).
- 7+ days falls through to `fmtDate(dt)`.
- Future dates (dt > now): `diff` will be negative. `inSeconds < 0` is `< 60` so
  a future date returns `"Just now"`.

---

### `tryParseDate(String? s)`

**Purpose:** Safely parse an ISO 8601 date/datetime string into a `DateTime`.

**Input:** `s`: nullable `String`.
**Output:** `DateTime?` (nullable)

**Behavior:**
- If `s` is null: return null immediately.
- Otherwise: return `DateTime.tryParse(s)`.
  - Returns a `DateTime` if `s` is a valid ISO 8601 string.
  - Returns null if `s` is invalid (malformed, empty, non-date string).

**Edge cases:**
- Empty string `""`: `DateTime.tryParse("")` returns null, so this returns null.
- `"not-a-date"`: returns null.
- Valid ISO strings: `"2026-06-06"`, `"2026-06-06T12:00:00Z"` — all return `DateTime`.

---

### `fmtDateStr(String? s, {String fallback = '—'})`

**Purpose:** Format an optional ISO date string as a full date, or return a fallback.

**Input:**
- `s`: nullable `String`.
- `fallback` (named, optional): `String`, default is `"—"` (em dash, U+2014).

**Output:** `String`

**Behavior:**
1. Call `tryParseDate(s)`.
2. If the result is a non-null `DateTime`: return `fmtDate(dt)`.
3. If the result is null (s was null, empty, or invalid): return `fallback`.

**Edge cases:**
- `fmtDateStr(null)` → `"—"`
- `fmtDateStr(null, fallback: 'N/A')` → `"N/A"`
- `fmtDateStr("")` → `"—"` (empty string fails parsing)
- `fmtDateStr("2026-06-06")` → `"06 Jun 2026"`

---

### `parseAmount(dynamic v)`

**Purpose:** Parse a decimal value from a dynamic input (handles strings and numbers).
Used because tRPC returns Prisma `Decimal` fields as strings.

**Input:** `v`: `dynamic` — may be null, a `num`, a `String`, or any other type.
**Output:** `double`

**Behavior:**
1. If `v` is null: return `0.0`.
2. If `v` is a `num` (int or double): return `v.toDouble()`.
3. Otherwise: call `v.toString()` and then `double.tryParse(...)`:
   - If parsing succeeds: return the parsed `double`.
   - If parsing fails (e.g., `"abc"`, `""`): return `0.0`.

**Edge cases:**
- `parseAmount(null)` → `0.0`
- `parseAmount(0)` → `0.0`
- `parseAmount(0.0)` → `0.0`
- `parseAmount("1234.56")` → `1234.56`
- `parseAmount("0")` → `0.0`
- `parseAmount("")` → `0.0` (`double.tryParse("")` is null)
- `parseAmount("abc")` → `0.0`
- `parseAmount(true)` → `0.0` (`"true".toString()` is `"true"`, which fails parsing)
- `parseAmount("-500.25")` → `-500.25`

---

## Edge Cases (Formatters — Global)

- All formatter functions are stateless top-level functions; they hold no state.
- None accept nullable `DateTime`; callers must unwrap before passing.
- `fmtINR` and `fmtCompact` accept `num`, so both `int` and `double` are valid.
- `fmtCompact` does not use `fmtINR`'s Unicode minus for negative Crore/Lakh values.

---

---

# Component: Router

## Purpose

The router wires GoRouter with session-based auth guarding. It is exposed as a
Riverpod `Provider<GoRouter>` named `routerProvider`. Auth state is bridged from
`sessionControllerProvider` (Riverpod) to GoRouter's `refreshListenable` via a
private `ChangeNotifier` class `_SessionRouterNotifier`.

---

## Detailed Behaviour

### Auth Guard

**`_SessionRouterNotifier`:**
- Holds a `Ref` and listens to `sessionControllerProvider`.
- Calls `notifyListeners()` whenever `SessionState` changes, which triggers GoRouter
  to re-evaluate the `redirect` callback.
- `isLoggedIn` getter: reads `sessionControllerProvider` and returns
  `SessionState.isAuthenticated`.

**`redirect` callback rules (evaluated on every navigation and on session change):**

| Condition                                                     | Redirect target |
|---------------------------------------------------------------|-----------------|
| User is NOT logged in AND current location is NOT `/login`    | `/login`        |
| User IS logged in AND current location IS `/login`            | `/home`         |
| Any other case                                                | `null` (no redirect, allow through) |

- `state.matchedLocation == '/login'` is used (not `fullPath`).
- Initial location on app start is `/home` (before auth guard evaluates).

---

### Named Routes — Complete List

All routes are registered under the `GoRouter`. The shell routes (tabs) are wrapped
in a `StatefulShellRoute.indexedStack`.

#### Outside the Shell (no bottom nav bar)

| Path     | Screen shown  | Notes                        |
|----------|---------------|------------------------------|
| `/login` | `LoginScreen` | Auth entry point; redirect target when unauthenticated |

#### Inside the Shell (wrapped in `ShellScreen`, has bottom nav bar)

**Branch 0 — Home tab:**

| Path    | Screen       | Notes         |
|---------|--------------|---------------|
| `/home` | `HomeScreen` | Shell index 0 |

**Branch 1 — Orders tab:**

| Path              | Screen              | Notes                                                                      |
|-------------------|---------------------|----------------------------------------------------------------------------|
| `/orders`         | `OrdersListScreen`  | Accepts optional query parameter `filter` passed as `initialFilter` prop   |
| `/orders/new`     | `CreateOrderFlow`   | Full-screen dialog (`MaterialPage(fullscreenDialog: true)`)                |
| `/orders/:id`     | `OrderDetailScreen` | `:id` path parameter passed as `orderId` prop                              |

**Branch 2 — Dispatches tab:**

| Path               | Screen                 | Notes                                          |
|--------------------|------------------------|------------------------------------------------|
| `/dispatches`      | `DispatchesListScreen` | Shell index 2                                  |
| `/dispatches/:id`  | `DispatchDetailScreen` | `:id` path parameter passed as `dispatchId` prop |

**Branch 3 — Invoices tab:**

| Path              | Screen               | Notes                                            |
|-------------------|----------------------|--------------------------------------------------|
| `/invoices`       | `InvoicesListScreen` | Shell index 3                                    |
| `/invoices/:id`   | `InvoiceDetailScreen`| `:id` path parameter passed as `invoiceId` prop  |

**Branch 4 — More tab (nested routes under `/more`):**

| Path                  | Screen                  | Notes                                          |
|-----------------------|-------------------------|------------------------------------------------|
| `/more`               | `MoreScreen`            | Shell index 4                                  |
| `/more/profile`       | `ProfileScreen`         |                                                |
| `/more/payments`      | `PaymentsListScreen`    |                                                |
| `/more/payments/:id`  | `PaymentDetailScreen`   | `:id` passed as `paymentId` prop               |
| `/more/service`       | `ComplaintsListScreen`  |                                                |
| `/more/service/new`   | `RaiseComplaintScreen`  |                                                |
| `/more/service/:id`   | `ComplaintDetailScreen` | `:id` passed as `complaintId` prop             |
| `/more/catalog`       | `CatalogScreen`         |                                                |

---

### Shell

The shell is built with `StatefulShellRoute.indexedStack`, meaning each branch
maintains its own navigation stack. Switching tabs does not destroy the previous
tab's state.

The shell wrapper widget is `ShellScreen` (see Shell Screen section below).

---

## Edge Cases

- Navigating to `/orders` with no `filter` query parameter: `initialFilter` is null
  (GoRouter's `state.uri.queryParameters` returns null for absent keys).
- `/orders/new` is a sibling route to `/orders/:id`. Because `new` is listed first
  in the routes array, the path `/orders/new` matches the `new` route, not the `:id`
  route.
- There are no named route constants defined in this file. Navigation must use path
  strings directly (e.g., `context.go('/orders')`, `context.push('/orders/new')`).
- The router provider is disposed via `ref.onDispose(notifier.dispose)` to prevent
  memory leaks when the provider is destroyed.

---

---

# Component: ShellScreen

## Purpose

`ShellScreen` is the persistent scaffold that wraps all tab-based screens. It renders
the active branch's content as the body and a custom `OutletTabBar` as the bottom
navigation bar. It is a `ConsumerWidget` (has access to Riverpod).

---

## Detailed Behaviour

### Tab Structure

There are exactly **5 tabs** in order:

| Index | `OutletTab` enum value | Label (displayed) | Icon (`Icons.*`)              | Path        |
|-------|------------------------|-------------------|-------------------------------|-------------|
| 0     | `OutletTab.home`       | `"Home"`          | `Icons.home_outlined`         | `/home`     |
| 1     | `OutletTab.orders`     | `"Orders"`        | `Icons.assignment_outlined`   | `/orders`   |
| 2     | `OutletTab.dispatches` | `"Dispatch"`      | `Icons.local_shipping_outlined` | `/dispatches` |
| 3     | `OutletTab.invoices`   | `"Invoices"`      | `Icons.receipt_long_outlined` | `/invoices` |
| 4     | `OutletTab.more`       | `"More"`          | `Icons.more_horiz`            | `/more`     |

Note: the tab label for index 2 is `"Dispatch"` (singular), not `"Dispatches"`.

The icon size for all tabs is **24** logical pixels.

---

### Tab Navigation Behavior

When a tab is tapped (`_onTab` called):

- If the tapped tab is **already the active tab** (same index):
  `shell.goBranch(idx, initialLocation: true)` — navigates to the root of that branch
  (pops the branch's stack back to the root route).
- If the tapped tab is **different from the active tab**:
  `shell.goBranch(idx)` — switches to that branch, restoring its last position.

---

### Badge / Notification Indicators

The `OutletTabBar` accepts an optional `Map<OutletTab, int>? badges` parameter.
`ShellScreen` does **not** pass a `badges` argument to `OutletTabBar` — badges is
left as null (default).

When `badges` is null at the tab bar level, no badge is shown on any tab.

When `badges` is provided (in other contexts or future use):
- A badge is shown on a tab only if `badges[tab] != null && badges[tab]! > 0`.
- A badge of `0` is not shown (strictly greater than zero required).
- The badge is a small red circular container positioned at top-right of the icon,
  at offset `top: -3, right: -6` relative to the icon.
- Badge container: minimum width and height of 16 logical pixels, horizontal padding
  of 4 logical pixels on each side.
- Badge border: 2-pixel border matching the surface color (creates a "cutout" effect).
- Badge text: white, font size 10, font weight 800, center-aligned.
- Badge background color: `c.red` (from theme).

---

### Theme Awareness

`ShellScreen` watches `themeModeProvider`:
- If the theme mode is `ThemeMode.dark`, `dark: true` is passed to `AppThemeColors`.
- Otherwise, `dark: false`.
- `AppThemeColors(dark: dark)` is passed to `OutletTabBar` as the `c` parameter,
  which controls colors for active/inactive tabs, surface, border, and shadow.

In dark mode, the tab bar has **no box shadow** (`boxShadow: []`).
In light mode, the tab bar has a single box shadow:
- Color: `Color(0xFF211F1A)` at 25% opacity
- Blur radius: 22
- Offset: `Offset(0, -6)` (shadow above the bar)
- Spread radius: -16

---

### Layout

- The `Scaffold` body is the `shell` (the active branch content).
- The bottom navigation bar is an `OutletTabBar` inside a `Container`.
- Container padding: `EdgeInsets.fromLTRB(6, 8, 6, <bottom>)` where `<bottom>` is:
  - `MediaQuery.of(context).padding.bottom` if that value is greater than 0
    (device has a home indicator / bottom safe area).
  - `16` (logical pixels) if `MediaQuery.of(context).padding.bottom == 0`
    (no home indicator, e.g., older Android phones).
- There is a top border on the container: `BorderSide(color: c.line)`.

---

## Edge Cases

- If `shell.currentIndex` is any value other than 0–4, `_activeTab` defaults to
  `OutletTab.home`. (The `switch` has a `default` clause returning `OutletTab.home`.)
- `ShellScreen` is a `ConsumerWidget` — it rebuilds when `themeModeProvider` changes.
- The tab bar uses `OutletTab.values` (the enum's values list) to render tabs in
  declaration order: home → orders → dispatches → invoices → more.

---

---

# Component: Models — OutletSummaryDto

## Purpose

Data transfer object representing a summary of an outlet's financial and order state,
deserialized from a tRPC response payload.

## Fields

| Field                  | Dart type | JSON key                 | Notes                                              |
|------------------------|-----------|--------------------------|----------------------------------------------------|
| `outletId`             | `String`  | `"outletId"`             | Cast directly as `String`                          |
| `outstandingLive`      | `String`  | `"outstandingLive"`      | Converted via `.toString()` — may come as num or string |
| `outstandingSnapshot`  | `String`  | `"outstandingSnapshot"`  | Converted via `.toString()`                        |
| `openInvoicesCount`    | `int`     | `"openInvoicesCount"`    | Cast as `num` then `.toInt()`                      |
| `ordersCount`          | `int`     | `"ordersCount"`          | Cast as `num` then `.toInt()`                      |

All fields are required (no optional fields). The constructor is `const`.

---

# Component: Models — OutletProfileDto

## Purpose

Data transfer object for an outlet's full profile, including billing and credit
information.

## Fields

| Field                | Dart type  | JSON key               | Required | Notes                                          |
|----------------------|------------|------------------------|----------|------------------------------------------------|
| `id`                 | `String`   | `"id"`                 | Yes      |                                                |
| `outletCode`         | `String`   | `"outletCode"`         | Yes      |                                                |
| `name`               | `String`   | `"name"`               | Yes      |                                                |
| `ownerName`          | `String`   | `"ownerName"`          | Yes      |                                                |
| `phone`              | `String`   | `"phone"`              | Yes      |                                                |
| `address`            | `String`   | `"address"`            | Yes      |                                                |
| `creditLimit`        | `String`   | `"creditLimit"`        | Yes      | `.toString()` conversion                       |
| `outstandingBalance` | `String`   | `"outstandingBalance"` | Yes      | `.toString()` conversion                       |
| `isActive`           | `bool`     | `"isActive"`           | Yes      | Cast as `bool?`, defaults to `true` if null    |
| `legalName`          | `String?`  | `"legalName"`          | No       | Nullable                                       |
| `gstin`              | `String?`  | `"gstin"`              | No       | Nullable                                       |
| `billingAddress1`    | `String?`  | `"billingAddress1"`    | No       | Nullable                                       |
| `billingAddress2`    | `String?`  | `"billingAddress2"`    | No       | Nullable                                       |
| `billingCity`        | `String?`  | `"billingCity"`        | No       | Nullable                                       |
| `billingState`       | `String?`  | `"billingState"`       | No       | Nullable                                       |
| `billingPincode`     | `String?`  | `"billingPincode"`     | No       | Nullable                                       |
| `warehouseId`        | `String?`  | `"warehouseId"`        | No       | Nullable                                       |

### `initials` getter

Computes a 1–2 character initials string from `name`:

1. Trim `name` and split by space.
2. If there are 2 or more parts: take the first character of parts[0] and parts[1],
   concatenate, and convert to uppercase. Result is always 2 characters.
3. If there is only 1 part: take `name.substring(0, name.length.clamp(0, 2))` and
   convert to uppercase. Result is 0–2 characters.

**Examples:**
- `"Ashish Kaushik"` → `"AK"`
- `"Ravi Kumar Singh"` → `"RK"` (only first two parts used)
- `"Ravi"` → `"RA"`
- `"A"` → `"A"` (single character name, clamp(0,2) yields 1)
- `""` (empty string, after trim): split gives `[""]`, parts.length == 1,
  `name.substring(0, 0)` → `""`, toUpperCase → `""`

---

# Component: Models — SessionUser

## Purpose

Represents the authenticated user's identity and permissions.

## Fields

| Field         | Dart type      | JSON key / source                                        | Required |
|---------------|----------------|----------------------------------------------------------|----------|
| `id`          | `String`       | `j["id"]`                                               | Yes      |
| `email`       | `String`       | `j["email"]`                                            | Yes      |
| `name`        | `String`       | `j["name"]`                                             | Yes      |
| `userType`    | `String`       | `j["userType"]`                                         | Yes      |
| `outletId`    | `String?`      | `j["outletId"]`                                         | No       |
| `permissions` | `List<String>` | `j["role"]["permissions"]` cast from `List<dynamic>`    | Yes      |

**`permissions` extraction logic:**
- Navigate: `(j["role"] as Map<String, dynamic>?)?["permissions"]` cast to
  `List<dynamic>?`.
- If null (role absent or permissions absent): defaults to `[]` (empty list).
- Cast the list to `List<String>`.

---

# Component: Models — SessionState

## Purpose

Top-level auth state object held by `sessionControllerProvider`.

## Fields

| Field          | Dart type      | Required | Notes                     |
|----------------|----------------|----------|---------------------------|
| `accessToken`  | `String?`      | No       | Nullable                  |
| `refreshToken` | `String?`      | No       | Nullable                  |
| `orgId`        | `String?`      | No       | Nullable                  |
| `user`         | `SessionUser?` | No       | Nullable                  |

## Computed Properties

### `isAuthenticated`
Returns `true` if and only if **both** `accessToken != null` AND `user != null`.
Either being null yields `false`.

### `outletId`
Returns `user?.outletId ?? ''`.
- If `user` is null: returns empty string `""`.
- If `user` is non-null but `user.outletId` is null: returns `""`.
- If `user.outletId` is non-null: returns the outlet ID string.

## Static Constant

`SessionState.empty` is a compile-time constant `SessionState()` with all fields null.
`SessionState.empty.isAuthenticated` is `false`.
`SessionState.empty.outletId` is `""`.

## `copyWith`

Returns a new `SessionState` replacing only the provided fields. Uses `??` so passing
null for a field retains the current value. There is no way to explicitly null out a
field using `copyWith`.
