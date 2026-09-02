# Balcão Financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o módulo Financeiro funcional com permissões por módulo, dados mockados no Supabase e contrato pronto para futura integração Malvo.

**Architecture:** O acesso operacional continua baseado em terminal + sessão de funcionário. O dashboard financeiro usa um endpoint server-side protegido, normaliza contas/transações/dados internos e entrega um contrato estável para uma nova aba `Financeiro`; dados de demonstração ficam em tabelas financeiras normalizadas com `source='mock'`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Tailwind, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-balcao-financeiro-design.md`

## Global Constraints

- Módulos atribuíveis por PIN: somente Estoque, Caixa e Financeiro.
- Entrada faz parte de Estoque.
- Gerente por PIN acessa os três módulos operacionais, mas não administração da conta.
- Personalizado só pode combinar os três módulos operacionais.
- Equipe, dispositivos, lojas, integrações e configurações permanecem na gestão Google.
- Financeiro por PIN não pode obter estado bruto do inventário se não possuir permissão de estoque/caixa.
- Dados financeiros nunca são lidos diretamente pelo browser do Supabase.
- Não adicionar dependência de gráficos.

---

### Task 1: Contrato de permissões por módulo

**Files:**
- Modify: `lib/accounts/access.ts`
- Modify: `lib/accounts/payloads.ts`
- Modify: `components/accounts/TeamManager.tsx`
- Modify: `components/accounts/StaffLogin.tsx`
- Modify: `components/accounts/InventoryRoleGate.tsx`
- Test: `tests/accounts/financeAccess.test.ts`

**Interfaces:**
- Produces: `StaffRole` com `finance`; `StaffModule = 'stock'|'checkout'|'finance'`; `permissionsForModules(modules)`; validação de `customPermissions` restrita à whitelist operacional.

- [ ] Escrever testes que exijam papel `finance`, gerente com três módulos, custom sem permissões administrativas e UI com Estoque/Caixa/Financeiro.
- [ ] Confirmar RED no CI do PR.
- [ ] Implementar tipos, mapeamentos e UI mínima para passar os testes.
- [ ] Confirmar GREEN.

### Task 2: Persistência e autorização financeira

**Files:**
- Create: `supabase/migrations/20260901_balcao_financeiro.sql`
- Test: `tests/accounts/financeMigration.test.ts`

**Interfaces:**
- Produces: tabelas `balcao_finance_accounts`, `balcao_finance_transactions`, `balcao_finance_daily_metrics`; role `finance` permitido; RPCs de equipe atualizados; RLS e grants de menor privilégio.

- [ ] Escrever teste de contrato SQL para role `finance`, whitelist de custom permissions, RLS e revogação de acesso direto.
- [ ] Confirmar RED.
- [ ] Escrever migration SQL idempotente e segura.
- [ ] Confirmar GREEN.

### Task 3: Snapshot de custo nas vendas

**Files:**
- Modify: `lib/inventory/core.ts`
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Test: `tests/financeSaleCost.test.ts`

**Interfaces:**
- Produces: `SaleItem.unitCostCents`, `SaleItem.lineCostCents`, `Sale.cogsCents`, `Sale.grossProfitCents`; `completeSale` congela custo médio atual.

- [ ] Escrever teste em que o custo do produto é congelado na venda.
- [ ] Confirmar RED.
- [ ] Implementar snapshot sem quebrar vendas antigas.
- [ ] Confirmar GREEN.

### Task 4: Motor de cálculo financeiro

**Files:**
- Create: `lib/finance/dashboard.ts`
- Test: `tests/accounts/financeDashboard.test.ts`

**Interfaces:**
- Produces: `buildFinanceDashboard(input)` com summary, séries, categorias, contas e transações; exclui transferências internas; usa métricas mock quando presentes e fallback para vendas reais.

- [ ] Escrever testes para margem ponderada, fluxo, transferência interna, valor de estoque e dias de estoque.
- [ ] Confirmar RED.
- [ ] Implementar o agregador puro.
- [ ] Confirmar GREEN.

### Task 5: API protegida e aba Financeiro

**Files:**
- Create: `app/api/balcao/finance/dashboard/route.ts`
- Create: `app/inventory-v1/FinanceDashboard.tsx`
- Modify: `app/inventory-v1/InventoryV1.tsx`
- Modify: `app/inventory-v1/page.tsx`
- Modify: `components/accounts/InventoryRoleGate.tsx`
- Test: `tests/accounts/financeUi.test.ts`

**Interfaces:**
- Consumes: `buildFinanceDashboard`, tabelas financeiras e `authorizeInventoryContext`.
- Produces: GET `/api/balcao/finance/dashboard?days=7|30|90` e aba Financeiro.

- [ ] Escrever testes de contrato para endpoint protegido, seletor 7/30/90, cards e nav Financeiro.
- [ ] Confirmar RED.
- [ ] Implementar endpoint e UI.
- [ ] Garantir que finance-only não carrega `/api/inventory/state` nem localStorage de inventário.
- [ ] Confirmar GREEN e build.

### Task 6: Mock de produção e verificação

**Files:**
- No hardcoded seed IDs committed.

**Interfaces:**
- Produces: dados mockados apenas no `mercado de teste`, marcados `source='mock'`.

- [ ] Aplicar migration no projeto Supabase.
- [ ] Inserir contas, transações e 30 dias de métricas mock por SQL parametrizado com os IDs existentes do negócio/loja de teste.
- [ ] Consultar as tabelas e validar totais.
- [ ] Rodar advisors/security checks disponíveis.
- [ ] Verificar CI e build do PR.
- [ ] Fazer revisão do diff e só então integrar ao `master`.
