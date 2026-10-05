# 0005 — JWT + rotating refresh cookie; phone OTP for technicians

**Context.** PLAN.md §3 and §14.1: staff log in with email + password. Technicians log in with phone + OTP and need a long session. Tokens must not live in `localStorage`.

**Decision.**
- `identity.users` follows PLAN §7.3. Passwords are hashed with ASP.NET Core Identity's `PasswordHasher` (PBKDF2). The full Identity framework isn't used; its tables add nothing here.
- **Access token:** a JWT with a 15-minute lifetime, held in memory by the SPA and sent as `Authorization: Bearer`. Claims: `sub`, `tenant_id`, `role`, `technician_id` (technicians).
- **Refresh token:** random 256-bit, stored **hashed** in `identity.refresh_tokens`, sent as an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`. It rotates on every use. Reuse of a revoked token revokes the whole chain (theft detection). Lifetime is 30 days for technicians and 12 hours for staff.
- **OTP:** 6 digits, stored hashed in `identity.otp_challenges`. 5-minute expiry, max 5 attempts, and a resend cooldown. Codes go out through the `IOtpSender` port, which Notifications implements. In Development the code is also logged.
- **Authorisation:** policies `Staff` (OWNER/ADMIN/DISPATCHER), `Admin` (OWNER/ADMIN) and `Technician`. Technicians can only see and act on jobs assigned to them; handlers check this as resource-based authorisation.
- Endpoints that issue tokens are rate-limited.

**Consequences.** The SPAs call `/auth/refresh` on startup and after a 401. The apps sit behind the same origin as the API (Vite dev proxy locally, reverse proxy in production), so the cookie stays first-party.
