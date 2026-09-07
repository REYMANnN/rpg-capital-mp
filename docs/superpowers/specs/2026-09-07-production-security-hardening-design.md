# RPG para Balcões — Production Security Hardening Design

## Goal

Reduce the production attack surface without changing the current Google/Supabase Balcões account model or the operational inventory workflow.

## Security invariants

- Current Google sign-in remains the management identity flow: `/login` -> Google Identity Services -> Supabase `signInWithIdToken` -> `/auth/google/complete`.
- Management access remains membership-scoped and server-validated.
- Operational inventory access must always be authorized; production security must not depend on an optional environment flag.
- Temporary test-account access must not ship.
- Disconnected legacy Mercado Pago wallet/terminal/payment surfaces must not ship.
- Server secrets remain environment-only. Public/publishable identifiers are not treated as secrets.
- Browser security headers must prevent framing and MIME sniffing while preserving the barcode camera and Google login.
- Expensive/publicly callable application endpoints must either be authorization-scoped or intentionally public with bounded input/caching.
- Security regressions are enforced by automated tests and production build CI.

## Scope

### Remove temporary access

Delete the test-account button, personal Gmail literal, temporary magic-link endpoint and temporary callback.

### Remove disconnected legacy surfaces

Delete the old `/cadastro`, `/app`, `/u`, `/t` application and the old Mercado Pago/payment/terminal APIs that belong to it. The current Balcões routing only targets `/onboarding` and `/manage` after Google login.

### Enforce Balcões authorization

Remove the `BALCAO_ACCOUNTS_ENFORCED` fail-open path from the inventory page and inventory state API. Authorization becomes unconditional.

### HTTP hardening

Configure global headers using Next.js `headers()`:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

A strict enforcing CSP is deliberately not added blindly because Google Identity Services and externally hosted product imagery are active dependencies. Adding an incorrect CSP would break production authentication. CSP should be introduced after an explicit source inventory/report-only validation.

### Abuse resistance

The obsolete in-memory rate limiter disappears with the legacy payment routes. Vercel system mitigations remain the infrastructure-level DDoS layer. Application authorization and input bounds remain the primary protection for state-changing APIs.

## Verification

Security tests must prove the dangerous files are absent, no personal Gmail/test-account copy ships, the current Google auth remains intact, inventory cannot fail open, and global security headers are configured. The complete repository test suite and Next.js production build must pass together before integration.
