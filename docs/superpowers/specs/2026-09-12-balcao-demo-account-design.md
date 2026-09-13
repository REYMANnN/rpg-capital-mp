# BALCÃO Demo Account Design

## Goal

Add a public test-account experience that opens directly from the landing page and behaves like a BALCÃO manager workspace, with realistic mock data and no access to administrator-only or real-money actions.

## User experience

- The public landing page exposes a prominent **Conta de teste** / **Testar conta demo** call to action.
- The CTA opens `/demo` without login, email, password, signup, card, or onboarding.
- `/demo` renders the same operational BALCÃO experience used by a manager: Estoque, Entrada, Caixa, Financeiro and Automações.
- The demo clearly identifies itself as a demonstration environment, but does not obstruct normal use.
- Administrator/account-management pages are not exposed from the demo.

## Isolation and persistence

The first release uses browser-session isolation instead of provisioning real database tenants. Each browser tab/session receives an independent seeded store state in `sessionStorage`. Changes persist while the tab is open and never write to the production inventory API, finance API, automation API, Pix API, Open Finance, webhooks, email or other external side effects.

This gives each visitor a private, resettable demo while keeping production data and credentials completely isolated. A future server-side disposable-tenant implementation can replace the storage adapter without changing the demo UX.

## Demo data

The seed represents a small convenience market with:

- a populated inventory;
- realistic prices, costs, minimum stock and quantities;
- historical sales across the previous weeks;
- inventory movements consistent with the current stock and sales;
- a mock bank account and mock banking transactions for the Financeiro;
- configured demo automations and recent demo activity.

Two products visible in the current BALCÃO inventory are preserved as scanner examples:

- Leite Condensado Integral Moça — EAN 7891000100103;
- Detergente Limpol — EAN 7891022638004.

## Operational behavior

### Estoque / Entrada

The existing inventory component is reused. Product creation, editing, deletion, barcode scanning, search, profile, stock adjustments and NF-e review continue to work against the demo session state.

### Caixa

Sales update demo stock, sales history and movements exactly as normal local BALCÃO behavior does. Card and cash confirmations are local. Pix is simulated in demo mode and must never call the production Pix endpoint.

### Financeiro

The existing Financeiro UI is reused with a dashboard generated from the current demo inventory/sales plus mock bank inputs. Because the dashboard is rebuilt from current demo state, new demo sales immediately affect sales, CMV and margin metrics. Open Finance connection actions are disabled/replaced by a demo explanation.

### Automações

The demo exposes a safe operational automation screen with mock recipes, configured rules and activity. Users may activate/pause/run demo automations locally, but no production automation endpoints, API keys, integrations or webhooks are called.

## Safety requirements

- No production authentication is created for demo visitors.
- No production inventory state endpoint is read or written from demo mode.
- No real Pix charge is generated.
- No bank connection is initiated.
- No real automation/integration/webhook action is invoked.
- Demo data never becomes visible to another visitor through shared storage.

## Testing

Unit tests cover seed consistency, known scanner EANs, referential integrity of sales/movements, finance dashboard generation, and demo-session reset/clone semantics where applicable. Production build must pass before merge/deploy.
