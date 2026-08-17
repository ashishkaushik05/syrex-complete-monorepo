# Module: Auth / Users / Roles / Invitations
#status/done

## What it does
JWT-based authentication with refresh tokens. Role-based permission system where each role holds a set of `resource:action` permission strings. Users belong to an org via their role. Invitation flow creates pending users.

## Components
- **Backend:** `auth.ts`, `users.ts`, `roles.ts`, `invitations.ts`
- **Web:** LoginPage, UsersPage, RolesPage, PermissionsCatalogPage, InvitationAcceptPage
- **Mobile:** Flutter login screen, session controller, token store (FlutterSecureStorage), auto-refresh interceptor

## Status
- ✅ JWT auth with refresh tokens
- ✅ Bearer token middleware resolves actor before tRPC context
- ✅ Role + permission system (wildcard `"*"` for admin)
- ✅ Password hashing (bcrypt)
- ✅ Rate limiting on login / refresh
- ✅ Flutter offline session persistence
- ✅ Tests: `auth.test.ts`, `roles.test.ts`, `users.test.ts`
- ⚠️ H-03: `changePassword` has no current-password verification
- ⚠️ H-04: `users.remove` does hard delete (violates soft-delete convention)
- ⚠️ Invitation flow may be removed (Batch 08/09 — see H-06)

## Open Issues
- H-03 → [[audit/ISSUES#H-03]]
- H-04 → [[audit/ISSUES#H-04]]

## Key Decisions
- [[decisions/auth]] — all auth/user/role decisions

## Related Docs
- [[api-spec/01-TRANSPORT_AUTH_ERRORS]]
- [[audit/agent-batches/01-jwt-auth-migration]]
- [[audit/agent-batches/02-roles-permissions]]
