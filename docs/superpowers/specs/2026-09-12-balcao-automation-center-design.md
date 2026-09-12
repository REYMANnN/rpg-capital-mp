# BALCÃO Automation Center v12 — Design

## Goal
Transform Automações from a technical integration screen into the operational automation center of BALCÃO. Small merchants must understand what BALCÃO can do automatically without seeing API concepts. Technical users retain a separate Integrations & API workspace.

## Non-negotiable constraints
- Software-only scope. No Pix Out, payment initiation, transfer, wallet, bank write or BaaS action.
- No regional pricing data in this phase.
- Inventory staff keeps normal product cost/price editing. Automation policy is separate.
- Finance automations are read-only analysis/alerts.
- No raw JSON, stack trace, endpoint or server error is ever shown as user experience.
- Current production does not have SUPABASE_SERVICE_ROLE_KEY. The module must work through installation/authenticated capability RPCs instead of requiring a Vercel service-role secret.
- Manager has all store-level modules. TI is automation/integration-only. Custom roles can opt into automation permissions.

## Information architecture
Automações has six first-class views:
1. Visão geral
2. Minhas automações
3. Descobrir
4. Sugestões
5. Histórico
6. Integrações e API

The technical workspace contains connected systems, exports, API keys, webhooks, delivery logs and documentation. API/webhook vocabulary is kept out of the default merchant experience.

## Overview
Top metrics:
- active automations
- executions today
- items requiring attention
- estimated impact where an honest deterministic estimate exists

Below the metrics:
- recent activity
- top suggestions
- active automation health
- quick action to discover automations

## Recipe catalogue
Initial recipes are deterministic and require no LLM:

### Pricing and margin
- margin_protection: detect products below configured gross-margin floor and recommend a safe price
- smart_pricing: use cost, margin, 30-day velocity and days of inventory to recommend prices; modes off/recommend/automatic

### Inventory
- low_stock: stock at/below configured minimum
- stockout_risk: projected days of stock below threshold
- stagnant_stock: product has stock but no recent sales / very low velocity
- excess_stock: days of stock above threshold
- replenishment: recommended quantity to reach target cover
- missing_cost: stocked/sold product without reliable unit cost

### Sales
- sales_drop: current 7-day sales materially below preceding comparable window when sample is sufficient
- daily_summary: deterministic operational summary generated on request and on scheduled runner when configured

### Finance (read-only)
- unusual_expense: bank outflow category/counterparty materially above recent baseline when finance data is available
- card_effective_cost: show observed matched card settlement cost estimate; never claim it is the contractual MDR

## Automation modes
Each automation has status active/paused and mode:
- notify: create finding/history only
- recommend: create recommendation requiring approval
- automatic: execute supported safe action within guardrails

Only price-related recipes initially support automatic mutation. Automatic price changes must respect pricing guardrails: minimum margin, maximum percentage change, minimum interval, minimum sales history and confidence. All mutations are audited and rollbackable when the original state is still compatible.

## Simulation
Before activation/editing, the UI shows a deterministic 30-day simulation where data permits: matches, recommendations and estimated impact. The simulation never mutates data.

## Generic engine
Pipeline:
Event/state snapshot -> recipe trigger -> rule evaluation -> decision -> action -> run/action history.

Pricing Engine remains separate: it computes price recommendations. Automation Engine decides when to call it and whether to notify, recommend or apply.

## Persistence
New tables:
- balcao_automations: recipe instance, status, mode, scope, config
- balcao_automation_runs: every evaluation/execution
- balcao_automation_actions: individual finding/recommendation/mutation with before/after state and rollback metadata

Existing tables remain for API keys, integrations, webhooks, event outbox and pricing history/settings.

## Authorization and data access
All automation UI APIs derive the current installation from server cookies and use SECURITY DEFINER RPCs that validate store + installation capability or authenticated membership. They do not depend on createAdminClient in the current production path.

The generic engine receives inventory state through inventory_v1_get_state using the installation capability. Any state mutation goes through inventory_v1_sync_state with the same installation capability.

## Error UX
Every client action uses a shared request helper. Errors render in-app as:
- human-readable message
- "Tentar novamente" where appropriate
- stable diagnostic code such as AUT-LOAD-001
The browser never navigates to an API endpoint for exports. Downloads use fetch -> Blob -> object URL.

## Technical workspace
### Connections
Preserve source-of-truth by domain: products, inventory, sales, pricing, finance. Show status, direction, authority, last sync and last error.

### Exports
Products, inventory, sales and finance CSV downloads happen in-app with loading/success/error states. Scheduled exports are represented as automation recipes only when a delivery destination exists; no fake background email feature.

### API keys
Preserve least-privilege scopes and one-time secret display. High-impact write scopes remain explicit.

### Webhooks
Preserve signed HMAC delivery, test/pause/rotate/delete and event subscriptions. Delivery failures do not block checkout/inventory.

### Logs
Show safe metadata, status, HTTP response and duration with filters; never secrets/payload-sensitive data.

## Permissions
- owner/admin/manager: all store automation functionality
- it: automations.view/manage, integrations.view/manage, api_keys.manage, webhooks.manage; no automatic inventory/finance module access
- stock/cashier/finance: no automation policy management by default
- custom: explicit automation/integration permissions

## Version
This release is a major UX/backend reconstruction and bumps the visible BALCÃO version to v12.0.

## Acceptance criteria
- /automations renders a real app shell, never raw JSON.
- Overview, My automations, Discover, Suggestions, History and Integrations/API work on production without SUPABASE_SERVICE_ROLE_KEY.
- At least the 10 operational recipes above produce deterministic findings from available data.
- Activate/pause/edit/run-now flows persist and are auditable.
- Price recommendation can be approved; automatic price mutation obeys guardrails and logs before/after.
- Exports download via browser Blob flow and show readable errors.
- Existing API keys/webhooks/integrations remain accessible in technical workspace.
- TI/manager/custom permission behavior remains covered by tests.
- No money movement endpoint/action is introduced.
- Visible production badge shows v12.0.
