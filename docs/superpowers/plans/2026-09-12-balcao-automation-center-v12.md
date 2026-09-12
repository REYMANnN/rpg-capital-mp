# BALCÃO Automation Center v12 — Implementation Plan

## Task 1 — RED tests for product contract
Create tests that require: v12 visible version, six automation navigation views, recipe catalogue, no direct export anchors, human error component, manager/TI permissions, no money movement routes.

## Task 2 — Data model and capability RPCs
Add migration for balcao_automations, balcao_automation_runs and balcao_automation_actions plus indexes/RLS/service grants. Add SECURITY DEFINER RPCs for current installation to list/upsert/update automation instances and append/list run history. Extend balcao_automation_store_context with installationId.

## Task 3 — Remove service-role dependency from automation context
Refactor automationsContext and inventoryAdapter so the current production path uses installation capability + publishable Supabase client. Preserve enforced-account fallback. Return installationId in AutomationActor.

## Task 4 — Deterministic recipe engine
Create recipe catalogue and pure analysis engine for margin protection, smart pricing, low stock, stockout risk, stagnant stock, excess stock, replenishment, missing cost, sales drop and daily summary. Finance recipes return unavailable/empty when no finance data is supplied rather than fabricating results.

## Task 5 — Automation center service/API
Create GET overview endpoint, POST activation, PATCH configuration/status, POST run-now and history endpoints. Persist run/action audit through RPC. Build suggestions from current deterministic findings. Simulate without mutation.

## Task 6 — Pricing integration
Make pricing settings/history/current recommendation usable without service-role in current production. Connect margin protection/smart pricing recipes to the existing Pricing Engine. Keep automatic mutations behind existing guardrails. Add rollback metadata/history.

## Task 7 — Rebuild UX
Replace AutomationsHub with a responsive shell containing Overview, My Automations, Discover, Suggestions, History and Integrations & API. Add cards, filters, status chips, recipe detail/configuration drawer/page, simulation preview and run-now controls.

## Task 8 — Technical workspace
Preserve and improve Integrations, API Keys, Webhooks and Logs behind the technical workspace. Add friendly empty/loading/error states and documentation copy. Do not expose technical concepts on default merchant views.

## Task 9 — Fix exports/raw JSON
Replace direct API anchors with fetch/Blob downloads. Add progress, success and friendly error handling. Ensure a failed export never navigates away from BALCÃO.

## Task 10 — Shared error UX
Add a client request helper/error boundary pattern with stable diagnostic codes. Replace raw/generic action failures in automation panels with recoverable in-app errors.

## Task 11 — Version + navigation
Bump INVENTORY_APP_VERSION to v12.0 and ensure global badge inherits it. Preserve main operational Automações nav for authorized roles.

## Task 12 — GREEN CI and regression
Run all existing account/inventory tests and Next production build in GitHub Actions. Fix only implementation defects, not expectations, except obsolete version-specific assertions.

## Task 13 — Supabase deploy
Apply v12 migration to project kftmhqugsswieuxqznfk. Verify tables/functions exist and capability RPC works against a real active installation without service-role.

## Task 14 — PR review / merge
Open PR, inspect diff, run verification-before-completion and code review workflow. Merge only after all three existing workflows are green.

## Task 15 — Vercel production deploy and smoke test
Wait for production deployment READY. Verify `/inventory-v1` and `/automations` return 200, production badge is v12.0, no new 500 logs, and a real automation center API request succeeds. Verify export failure stays inside UI rather than rendering JSON.
