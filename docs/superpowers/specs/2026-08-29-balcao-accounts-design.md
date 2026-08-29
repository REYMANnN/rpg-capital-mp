# BALCÃO Accounts, Stores, Staff and Devices Design

## Scope
Implement the complete BALCÃO identity and access architecture, excluding billing/subscriptions.

## Principles
- Google is the only administrative identity provider.
- A user can belong to multiple businesses and businesses can own multiple stores.
- The UI hides business/store complexity when there is only one store.
- Operational staff do not need Google or email.
- Shared devices are authorized once; staff identify themselves with a 4-digit PIN.
- A PIN alone never grants internet-wide access; it is valid only on an authorized device.
- Sensitive management actions require a Google-authenticated manager/owner.
- Every important action is auditable.
- UI must remain simple, mobile-first, accessible, large-touch-target and plain-language.

## Entities
1. `auth.users`: Google-authenticated administrative identities.
2. `balcao_profiles`: contact/onboarding data for Google users.
3. `balcao_businesses`: legal/commercial entity.
4. `balcao_business_members`: owner/admin/manager membership.
5. `inventory_v1_stores`: existing operational store table extended with business/address/type fields.
6. `balcao_staff_profiles`: internal employees, optionally linked to a Google user.
7. `balcao_staff_store_access`: per-store role and optional custom permissions.
8. `balcao_terminals`: authorized browsers/devices.
9. `balcao_terminal_invites`: one-time expiring activation links.
10. `balcao_staff_sessions`: staff sessions bound to a terminal.
11. `balcao_audit_events`: immutable operational and security audit trail.

## Roles
- `stock`: inventory only: view/scan/create/edit/archive products, stock adjustments and purchase intake.
- `cashier`: checkout, product lookup and own/current-shift sales.
- `manager`: stock + cashier + operational reports + financial analysis + team/device management.
- `custom`: explicit permission set.
- Business owner/admin permissions are determined by Google-authenticated membership, not a staff PIN.

## Authentication flows
### Administrative login
- Landing page offers Entrar and Criar conta.
- Both call Supabase Google OAuth.
- OAuth callback exchanges the code for a Supabase session.
- Existing onboarded users go to `/manage`; new users go to `/onboarding`.
- Supabase SSR cookies persist the administrative session.

### Onboarding
Wizard, one task per screen:
1. business name + business type;
2. store address;
3. phone + CPF/CNPJ + optional Pix key;
4. acquisition source (`instagram`, `google`, `referral`, `ai`, `youtube_tiktok`, `other`) with required text when `other`;
5. completion.
The system creates a business, owner membership, first store and profile atomically enough to be safely retried. Incomplete onboarding resumes.

### Staff/device flow
- Manager creates staff profile and selects role/store.
- Manager creates an activation invite for a store/device.
- Invite token is random, stored hashed, expires after 15 minutes, is single-use and revocable.
- Opening the link authorizes the browser by setting a long-lived HttpOnly terminal credential cookie.
- Daily operation lists active staff assigned to that store.
- Employee chooses their name and enters a 4-digit PIN.
- PIN is bcrypt-hashed; raw PIN is never stored.
- Successful PIN creates a short staff session bound to the authorized terminal.
- After inactivity, staff PIN is required again while terminal authorization remains.

## PIN security and recovery
- Four numeric digits for speed.
- Five failures cause a 30-second lock; repeated failures progressively increase lock time.
- Managers do not recover old PINs; they reset them.
- PIN theft without the terminal credential is insufficient.
- Staff deactivation invalidates future PIN logins and active sessions.

## Device security
- Device credentials are random secrets stored hashed server-side; raw secret exists only in HttpOnly cookie.
- Manager can revoke a device at any time.
- Lost activation links do not matter: generate a new invite.
- Leaked invite links expire, are one-use and can be revoked before use.

## Management UI
Route `/manage`, Google-authenticated. Mobile navigation shows no more than six primary areas:
- Início
- Vendas
- Estoque
- Análises
- Equipe
- Mais
`Mais` contains Lojas, Dispositivos, Integrações/APIs and Configurações. Billing is excluded.

## Operational UI
Route `/work` for authorized devices.
- Staff selector + numeric PIN keypad.
- `cashier`: main action Nova venda.
- `stock`: main action Escanear produto.
- `manager`: both operational actions plus link to management when Google-authenticated.
- No advanced finance/API UI for stock/cashier.

## Existing inventory integration
- Existing inventory, sale and movement tables remain authoritative.
- Existing store IDs remain compatible.
- New store-scoped requests must derive the effective store from authenticated business/terminal context rather than trusting arbitrary client `store_id` values.
- Existing v10.5 catalog lookup remains available.

## Accessibility and UX requirements
- Minimum 44x44 CSS px touch targets; primary controls target 48px height.
- Form text and inputs at least 16px.
- Visible labels; placeholder is never the only label.
- Keyboard support and visible focus states.
- Errors in plain Brazilian Portuguese and adjacent to fields.
- Status is never conveyed by color alone.
- One primary task per screen and progressive disclosure for advanced settings.
- Do not expose technical terms such as token, role, OAuth, membership or UUID to users.

## Audit
Record business/store, Google actor or staff actor, terminal, action, entity and timestamp for sensitive/important actions including staff changes, PIN resets, device activation/revocation, stock changes, product archive, sales cancellation and sensitive settings.

## Out of scope
- Billing, subscription plans, invoices for BALCÃO itself and payment collection for BALCÃO fees.
- SMS/email OTP authentication.
- Employee email verification.
