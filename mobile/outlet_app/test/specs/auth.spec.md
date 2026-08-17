# Auth Behavioral Specification

**Scope:** TokenStore, SessionController, SessionState / SessionUser, LoginScreen
**Source read:** 2026-06-06
**Audience:** Test writers who have not seen the source code.

---

# Component: TokenStore

## Purpose

TokenStore is the single point of access for persisting and retrieving auth credentials on the device. It wraps `FlutterSecureStorage` and exposes a fixed set of named slots. On Android the underlying storage uses `EncryptedSharedPreferences`. The class is not a Riverpod notifier — it holds no in-memory state of its own; every read goes directly to the OS keychain / secure storage.

## State / Fields

TokenStore itself carries no instance fields beyond the static `FlutterSecureStorage` instance and the five key constants. All state lives in the OS-level secure store.

| Storage Key             | Constant Name  | Purpose                                    |
|-------------------------|----------------|--------------------------------------------|
| `outlet_access_token`   | `_kAccess`     | JWT (or opaque) access token               |
| `outlet_refresh_token`  | `_kRefresh`    | Refresh token used to obtain new access tokens |
| `outlet_user_id`        | `_kUserId`     | ID of the authenticated user               |
| `outlet_org_id`         | `_kOrgId`      | Organisation ID the user belongs to        |
| `outlet_outlet_id`      | `_kOutletId`   | Outlet ID linked to the user account       |

## Methods / Behaviours

### `accessToken` (getter) → `Future<String?>`
- Reads the value stored at key `outlet_access_token` from secure storage.
- Returns `null` if the key has never been written or was deleted.
- Never throws under normal conditions; underlying storage errors propagate as exceptions from the platform channel.

### `refreshToken` (getter) → `Future<String?>`
- Reads `outlet_refresh_token`.
- Same null / error semantics as `accessToken`.

### `userId` (getter) → `Future<String?>`
- Reads `outlet_user_id`.

### `orgId` (getter) → `Future<String?>`
- Reads `outlet_org_id`.

### `outletId` (getter) → `Future<String?>`
- Reads `outlet_outlet_id`.

### `hasSession` (getter) → `Future<bool>`
- Calls `accessToken` internally.
- Returns `true` if and only if the retrieved value is both non-null AND non-empty string.
- Returns `false` if `accessToken` is `null` or an empty string `''`.
- Does NOT validate any other token or inspect expiry.

### `save({accessToken, refreshToken, userId, orgId, outletId})` → `Future<void>`
- All five parameters are required (non-nullable `String`).
- Writes all five values concurrently via `Future.wait`. The writes are not ordered relative to each other; all five are issued simultaneously.
- Side effects: the secure storage slot for each key is overwritten, whether or not a value previously existed there.
- Does not return a value. Throws if any individual `_storage.write` call throws (platform channel error).

### `clear()` → `Future<void>`
- Deletes all five keys concurrently via `Future.wait`.
- After completion, every getter returns `null` and `hasSession` returns `false`.
- Does not throw if a key did not exist prior to deletion.
- Throws if any individual `_storage.delete` call throws (platform channel error).

## Dependencies
- `flutter_secure_storage` package (`FlutterSecureStorage`).
- Android: `AndroidOptions(encryptedSharedPreferences: true)` — requires API 23+.

## Edge Cases
- If `save` is called with an empty string for `accessToken`, `hasSession` will return `false` even though a value is stored, because the check is `!= null && isNotEmpty`.
- Concurrent calls to `save` and `clear` have undefined merge behaviour; the caller must serialise these.
- `save` overwrites previous values without a read-modify-write; there is no merge logic.

---

# Component: SessionUser (model)

## Purpose

`SessionUser` is an immutable value object representing the authenticated user as returned by the `auth.me` backend endpoint. It is used both inside `SessionState` and as the output of `SessionController.restoreSession` / `login`.

## State / Fields

| Field         | Type            | Nullable | Description                                                                 |
|---------------|-----------------|----------|-----------------------------------------------------------------------------|
| `id`          | `String`        | No       | Unique user identifier (UUID string from backend)                           |
| `email`       | `String`        | No       | User's email address                                                        |
| `name`        | `String`        | No       | Display name                                                                |
| `userType`    | `String`        | No       | Role category string (e.g. `"outlet"`)                                      |
| `outletId`    | `String?`       | Yes      | ID of the linked outlet; `null` if user has no associated outlet            |
| `permissions` | `List<String>`  | No       | List of permission strings granted to this user (may be empty list)         |

## Methods / Behaviours

### `SessionUser.fromJson(Map<String, dynamic> j)` → `SessionUser`

This is the only way to construct a `SessionUser` from backend data. The mapping is:

| JSON key path                          | Maps to field   | Notes                                                                                     |
|----------------------------------------|-----------------|-------------------------------------------------------------------------------------------|
| `j['id']`                             | `id`            | Cast to `String`; throws `TypeError` if absent or wrong type                             |
| `j['email']`                          | `email`         | Cast to `String`; throws if absent or wrong type                                          |
| `j['name']`                           | `name`          | Cast to `String`; throws if absent or wrong type                                          |
| `j['userType']`                       | `userType`      | Cast to `String`; throws if absent or wrong type                                          |
| `j['outletId']`                       | `outletId`      | Cast to `String?`; `null` if key missing or value is JSON null                           |
| `j['role']['permissions']`            | `permissions`   | Navigates `j['role']` as `Map<String, dynamic>?`, then `['permissions']` as `List<dynamic>?`; cast to `List<String>`. Defaults to `[]` if either `role` or `permissions` is absent/null |

**Error behaviour of `fromJson`:**
- If `id`, `email`, `name`, or `userType` is missing from the map, a `TypeError` is thrown at the cast site (not a domain error — it is an unhandled runtime exception).
- If `role` key is missing entirely, `permissions` defaults to an empty `List<String>` (no throw).
- If `role` is present but `permissions` key is missing, `permissions` defaults to `[]`.
- If `role['permissions']` is present but contains non-String elements, the `.cast<String>()` call throws a `TypeError` at runtime (lazy cast in Dart; may surface later on first access depending on runtime).

## Dependencies
- No external packages. Pure Dart.

---

# Component: SessionState (model)

## Purpose

`SessionState` is the top-level immutable value object that Riverpod's `NotifierProvider` holds as the auth state of the entire app. All widgets and the router observe this object to determine whether the user is authenticated and what their identity is.

## State / Fields

| Field          | Type           | Nullable | Description                                                     |
|----------------|----------------|----------|-----------------------------------------------------------------|
| `accessToken`  | `String?`      | Yes      | The current access token; `null` in the empty/logged-out state  |
| `refreshToken` | `String?`      | Yes      | The current refresh token; `null` in the empty/logged-out state |
| `orgId`        | `String?`      | Yes      | Organisation ID; `null` in the empty state                      |
| `user`         | `SessionUser?` | Yes      | The authenticated user object; `null` in the empty state        |

## Computed Properties

### `isAuthenticated` → `bool`
- Returns `true` if and only if BOTH `accessToken != null` AND `user != null`.
- A state with a token but no user is NOT authenticated.
- A state with a user but no token is NOT authenticated.

### `outletId` → `String`
- Returns `user.outletId` if `user` is non-null and `user.outletId` is non-null.
- Returns an empty string `''` in all other cases (no user, or user with null outletId).
- Never returns `null`.

## Methods / Behaviours

### `SessionState.empty` (static const)
- A `SessionState` with all four fields set to `null`.
- This is the initial state of the app before any login or session restore.
- `isAuthenticated` is `false` on this value.
- `outletId` is `''` on this value.

### `copyWith({accessToken?, refreshToken?, orgId?, user?})` → `SessionState`
- Returns a new `SessionState` with any provided fields replaced.
- Fields not provided retain their current values.
- Does not mutate the existing instance.

## Dependencies
- `SessionUser` model.

## Edge Cases
- `isAuthenticated` is `false` if `accessToken` is an empty string `''` (because `'' != null` evaluates to true, so it would return `true` — see note below).
  - **Clarification:** The check is `accessToken != null && user != null`. An empty string access token is NOT null, so `isAuthenticated` would be `true` if both accessToken is `''` and user is non-null. The guard does not check for emptiness.
- `orgId` can be an empty string `''` (set explicitly by `login` when the backend returns null for orgId).

---

# Component: SessionController

## Purpose

`SessionController` is a Riverpod `Notifier<SessionState>` that acts as the single source of truth for the user's authentication lifecycle. It manages login, logout, and session restoration on app start. It coordinates between `TokenStore` (local credential persistence) and `ApiClient` (network calls). The GoRouter redirect guard watches `sessionControllerProvider` to drive navigation.

## State
The controller holds a `SessionState`. See the SessionState spec above for all fields.

**Initial state (on first build):** `SessionState.empty` — all fields null, `isAuthenticated` is `false`.

## Methods / Behaviours

### `restoreSession()` → `Future<void>`

Called during app startup to attempt silent re-authentication using stored tokens.

**Step-by-step:**
1. Calls `_tokens.hasSession` (reads `outlet_access_token` from secure storage).
2. **If no session (`hasSession == false`):** returns immediately. State remains `SessionState.empty`. No network call is made.
3. **If session exists:** calls `_api.query('auth.me', {}, mapper)` to fetch fresh user data from the backend.
   - The mapper passes the raw JSON to `SessionUser.fromJson`.
4. On success of `auth.me`:
   - Reads `orgId`, `accessToken`, and `refreshToken` individually from `_tokens`.
   - Sets state to a fully-populated `SessionState` with all four fields filled.
   - The state transition from empty → authenticated happens atomically via a single `state = ...` assignment.
5. **On any exception** (network error, 401, JSON parse error, or any other thrown error):
   - Calls `_tokens.clear()` to wipe stored credentials.
   - State remains `SessionState.empty` (no state assignment is made in the catch block).
   - The exception is silently swallowed (caught by bare `catch (_)`).

**State transitions:**

| Initial state           | Trigger / Outcome                          | Final state                    |
|-------------------------|--------------------------------------------|--------------------------------|
| `SessionState.empty`    | `hasSession == false`                      | `SessionState.empty` (no-op)   |
| `SessionState.empty`    | `hasSession == true`, `auth.me` succeeds   | Populated `SessionState`       |
| `SessionState.empty`    | `hasSession == true`, `auth.me` throws     | `SessionState.empty` + tokens cleared |

### `login(String email, String password)` → `Future<void>`

Called by the LoginScreen on form submit. Throws on any failure (callers must catch).

**Step-by-step:**
1. Calls `_api.mutation('auth.login', {'email': email, 'password': password}, mapper)`.
   - The mapper casts the result to `Map<String, dynamic>` directly.
2. Extracts from the result map:
   - `result['user']` → passed to `SessionUser.fromJson`
   - `result['accessToken']` → cast to `String`
   - `result['refreshToken']` → cast to `String`
   - `result['orgId']` → cast to `String?`; if null, defaults to empty string `''`
3. Calls `_tokens.save(...)` with: `accessToken`, `refreshToken`, `userId` (from `user.id`), `orgId`, `outletId` (from `user.outletId ?? ''`).
4. Sets state to a fully-populated `SessionState`.

**On any exception:** the exception propagates to the caller. No state is written. No token is saved. `_tokens.clear()` is NOT called.

**State transitions:**

| Initial state        | Outcome                   | Final state              |
|----------------------|---------------------------|--------------------------|
| Any state            | `auth.login` succeeds     | Populated `SessionState` |
| Any state            | `auth.login` throws       | State unchanged, exception re-thrown |

### `logout()` → `Future<void>`

**Step-by-step:**
1. Attempts to call `_api.mutationVoid('auth.logout', {})`.
   - If this throws for any reason, the error is silently swallowed (bare `catch (_) {}`).
2. Calls `_tokens.clear()` — always runs regardless of whether the network call succeeded or failed.
3. Sets state to `SessionState.empty`.

**State transitions:**

| Initial state           | Outcome                      | Final state           |
|-------------------------|------------------------------|-----------------------|
| Populated `SessionState`| Any (network may fail)       | `SessionState.empty`  |
| `SessionState.empty`    | Any                          | `SessionState.empty`  |

**Key behaviour:** Logout is always locally complete even if the server call fails. The server-side session invalidation is best-effort only.

## Dependencies
- `tokenStoreProvider` — provides `TokenStore`
- `apiClientProvider` — provides `ApiClient`
- `SessionUser.fromJson` — used to parse `auth.me` and `auth.login` responses
- `SessionState` — the state type

## Edge Cases
- `restoreSession` does not update `refreshToken` or `accessToken` in storage; it only reads them. If the stored tokens are stale, they remain stale in storage until `logout` clears them.
- If `auth.me` succeeds but a subsequent `_tokens.orgId` / `_tokens.accessToken` / `_tokens.refreshToken` read throws, the exception is caught and tokens are cleared, leaving the user unauthenticated even though the server confirmed the session was valid.
- `login` does NOT call `restoreSession` internally; they are independent flows.
- `login` can be called from any state (including already-authenticated state), and will overwrite both tokens and state if successful.
- If `login` is called with an email that has trailing/leading whitespace, the whitespace is preserved (trimming happens in the UI layer, not here).

---

# Component: LoginScreen

## Purpose

`LoginScreen` is the sole authentication UI surface. It presents two text input fields (email and password), a submit button, and inline error messaging. On successful login, it does not navigate itself — it relies on the GoRouter redirect guard reacting to the `sessionControllerProvider` state change. It is a `ConsumerStatefulWidget` backed by a `_LoginScreenState`.

## State / Fields

| Field        | Type                    | Initial value | Description                                                          |
|--------------|-------------------------|---------------|----------------------------------------------------------------------|
| `_emailCtrl` | `TextEditingController` | Empty         | Controls the email input field                                       |
| `_passCtrl`  | `TextEditingController` | Empty         | Controls the password input field                                    |
| `_obscure`   | `bool`                  | `true`        | Whether the password field text is obscured (masked)                 |
| `_loading`   | `bool`                  | `false`       | Whether a login request is in-flight                                 |
| `_error`     | `String?`               | `null`        | Current inline error message; `null` means no error is displayed     |

## Layout Structure

The screen is a `Scaffold` with no `AppBar`. The body is a two-section `Column`:
- **Top 35% (brand area):** A centred store icon (72x72, rounded rectangle) and the text `"Syrex Outlet"`.
- **Bottom 65% (login card):** A rounded-top container with a `SingleChildScrollView` containing: a welcome heading, a subtitle, the email field, the password field, the optional error text, and the Sign in button.

## Form Fields

### Email Field
- Label text: `"Email address"`
- Hint text: `"outlet@example.com"`
- Keyboard type: `TextInputType.emailAddress`
- Autocorrect: disabled
- Obscured: never (no obscure option wired)
- No suffix icon
- No `onSubmitted` handler

### Password Field
- Label text: `"Password"`
- Hint text: `"••••••••"`
- Keyboard type: default (`TextInputType.text`)
- Autocorrect: disabled
- Obscured: controlled by `_obscure` state (initially `true`)
- Suffix: a toggle icon button (see Visibility Toggle below)
- `onSubmitted` callback: triggers `_submit()` when the user presses the keyboard action button

### Visibility Toggle (password suffix)
- When `_obscure == true`: shows `Icons.visibility_off_outlined`
- When `_obscure == false`: shows `Icons.visibility_outlined`
- Pressing the button calls `setState(() => _obscure = !_obscure)`
- Toggling does not clear the password field or affect `_loading` or `_error`

## Methods / Behaviours

### `_submit()` → `Future<void>` (private)

The core submission handler. Called either by the Sign in button tap or by pressing the keyboard submit action on the password field.

**Step-by-step:**

1. Reads email: `_emailCtrl.text.trim()` — leading/trailing whitespace stripped.
2. Reads password: `_passCtrl.text` — NOT trimmed; whitespace is preserved exactly as typed.
3. **Empty field validation:** If either the trimmed email OR the password is an empty string:
   - Sets `_error = 'Please enter your email and password.'`
   - Returns immediately. No network call is made. `_loading` is NOT set to `true`.
4. **Pre-network state:** Sets `_loading = true` and `_error = null` atomically via one `setState`.
5. Calls `ref.read(sessionControllerProvider.notifier).login(email, password)`.
6. **On success (no exception thrown):**
   - The `try` block completes normally.
   - No explicit navigation code runs. Navigation is handled by GoRouter reacting to the `SessionState` change.
   - The `finally` block runs: if the widget is still mounted, sets `_loading = false`.
7. **On any exception:**
   - Sets `_error = 'Incorrect email or password. Please try again.'`
   - This single error message is used for ALL exception types (401, network failure, timeout, JSON parse error — no differentiation).
   - The `finally` block runs: if still mounted, sets `_loading = false`.

**State transitions during submit:**

| Phase                   | `_loading` | `_error`                                          |
|-------------------------|------------|---------------------------------------------------|
| Before submit (initial) | `false`    | `null` (or previous error)                        |
| Empty field detected    | `false`    | `'Please enter your email and password.'`         |
| Request in-flight       | `true`     | `null`                                            |
| Request succeeded       | `false`    | `null`                                            |
| Request failed          | `false`    | `'Incorrect email or password. Please try again.'`|

### Sign In Button behaviour
- When `_loading == true`: `onTap` is `null` (button is disabled). The `loading` prop on `AppButton` is also `true` (the button renders a loading indicator).
- When `_loading == false`: `onTap` is `_submit`.
- Tapping a disabled button (while loading) has no effect.

### Keyboard submit on password field
- Pressing the keyboard action key while focus is on the password field calls `_submit()` directly (via `onSubmitted`).
- This path bypasses no validation — `_submit()` is the full handler.

## Navigation

- The `LoginScreen` does NOT call `context.go(...)` or any GoRouter navigation method.
- Navigation away from the screen is driven entirely by the GoRouter redirect that watches `sessionControllerProvider`. When `SessionState.isAuthenticated` becomes `true`, the router redirects the user to the authenticated area (typically `/dashboard`).

## Resource Cleanup

- `dispose()` calls `_emailCtrl.dispose()` and `_passCtrl.dispose()` — both controllers are properly released.

## Dependencies
- `sessionControllerProvider` — reads the notifier to call `login`
- `AppThemeColors` — theming (light mode: `dark: false`)
- `AppTextStyles` — text style helpers
- `AppButton` — the submit button widget
- `go_router` — GoRouter is used by the router layer (not called directly in this widget)

## Edge Cases
- If `_submit()` completes (success or failure) after the widget is unmounted (e.g. GoRouter already navigated away), the `if (mounted)` guard in `finally` prevents calling `setState` on a disposed widget. `_loading` is effectively abandoned in that case.
- Password whitespace: a password consisting only of spaces passes the empty check because `_passCtrl.text` (not trimmed) would be non-empty. The server would receive the spaces as the password.
- Email containing only spaces: `email.isEmpty` after `.trim()` returns `true`, so the empty-field error fires correctly.
- Submitting while already loading: the button is disabled (`onTap == null`) so a second concurrent `_submit` call from the button is impossible. However, if `_submit` were invoked through another path while in-flight, there is no mutex guard in `_submit` itself.
- The `_error` state from a previous submission is cleared (set to `null`) at the start of each new submission attempt (step 4), so stale error messages do not persist across retries.
- Theme is always light mode (`AppThemeColors(dark: false)`); dark mode is not supported on this screen.
