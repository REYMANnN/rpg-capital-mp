# Owner Open Finance Settings and Onboarding Design

## Goal
Make Open Finance a first-class owner setting and a required step for new Balcão onboardings, while preserving existing users and reusing the existing Malvo integration.

## Owner experience
- Replace the management navigation item `Mais` with `Configurações`.
- `Configurações` contains stores/devices plus a `Contas bancárias / Open Finance` section using the same connection component as Financeiro.
- Owners can connect, refresh/reconsent, and disconnect a bank. Staff with Finance permission can view finance data but cannot create or revoke consent.

## Disconnect semantics
- Disconnect calls Malvo `DELETE /items/{id}` server-side with the application API key.
- The local connection and normalized account rows are marked `disconnected`; webhook `item/deleted` remains idempotent and can reinforce that state.
- The UI requires explicit confirmation before revocation.

## New onboarding
- Existing four data-collection steps remain.
- Submitting step 4 creates/updates business + store but leaves `balcao_profiles.onboarding_completed=false` for new/incomplete onboardings.
- The wizard moves to step 5 `Conecte sua conta bancária` and reuses BankConnections in onboarding mode.
- At least one connection in an accepted state (`active`, `updating`, or `pending` with a provider item already created) is required before final completion; the finalization endpoint validates the connection server-side and then sets `onboarding_completed=true`.
- `/manage` redirects incomplete users back to `/onboarding`.
- Existing profiles that already have `onboarding_completed=true` remain completed and are not retroactively blocked.

## OAuth return
- Connect-token accepts a safe return target chosen by the server from `finance` or `onboarding` contexts.
- Finance/settings return to `/inventory-v1?finance=connections` by default; onboarding returns to `/onboarding?step=bank`.
- Query parameters are not accepted as arbitrary redirect URLs.

## Security
- Malvo client ID, secret and API key never reach the browser.
- Only Google-authenticated management may connect/disconnect.
- Revocation is scoped by Balcão business/store ownership before calling Malvo.
- Local financial tables remain RLS-protected and service-role accessed only in server routes.

## Tests
- Management shell exposes Configurações and Open Finance.
- BankConnections renders disconnect only when `canManage`.
- Disconnect route requires Google management authorization and calls Malvo delete helper.
- Onboarding creates an incomplete profile, exposes a fifth bank step, and cannot finalize without a valid connection.
- Existing completed users continue to reach `/manage`.
