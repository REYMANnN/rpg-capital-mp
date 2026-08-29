# Inventory v10.1 — Intake State Machine Design

## Goal
Make invoice intake impossible to confuse: first resolve every uncertain identity/unit decision, then show the full purchase review, and only then allow stock confirmation.

## Version rule
This release is `v10.1`. Future iterative releases remain `v10.x`; do not create `v11` unless explicitly requested by the user.

## Flow
1. Read/parse invoice.
2. Reject duplicate invoice before product questions.
3. Resolve every line into an explicit decision.
4. While any line needs a decision, show only the `IDENTIFICAÇÃO DE PRODUTOS` flow with `Pendência X de Y`. The final review and confirm button must not render.
5. After zero pending decisions, show the complete purchase review.
6. User can select/unselect and edit any line.
7. Only `CONFIRMAR ENTRADA — X ITENS` mutates stock.

## Identity decision priority
1. Explicit valid EAN from NF-e.
2. Global `(supplier CNPJ + cProd)` alias when no explicit EAN.
3. Deterministic name matching, prioritizing products already registered in the current store before global catalog candidates.
4. Manual decision: accept suggestion, choose known product, scan EAN, type EAN, or mark `não importar`.

Explicit EAN is authoritative for identity. If it conflicts with a historical supplier alias, mark a conflict and require an explicit user decision before review; never silently overwrite the alias.

## Two independent statuses
Each line has an identity status and a store/commercial status.

Identity: `ean`, `alias`, `suggested`, `manual`, `unresolved`, `conflict`.

Store status: `existing-priced`, `existing-unpriced`, `new`.

A line with valid EAN is identified even if the current store has no sale price. Missing sale price is not an identity question; it appears later in final review as `Preço de venda pendente`.

## Units and packages
Parse `uCom` from NF-e. Normalize direct inventory units (`UN`, `KG`). Package units such as `CX`, `FD`, `PCT`, `DISPLAY` require a known conversion factor or an explicit user decision before review.

For package factor `F`:
- invoice quantity remains `qCom` for fiscal display and line-total validation;
- stock quantity = invoice quantity × F;
- average purchase cost per inventory unit = invoice unit cost ÷ F.

Persist known package factor globally together with supplier alias so future invoices from the same supplier/cProd do not ask again.

## Final review
Show every invoice line, including deliberate exclusions. Each line shows product, original invoice description, EAN/cProd, recognition source, purchase unit, stock quantity, purchase quantity, unit cost, total, local sale-price status, and Edit.

Lines marked `não importar` remain visible and unchecked with a clear status.

## Error/fallback behavior
- invalid NF-e key: stop before processing;
- duplicate invoice: stop before identity questions;
- catalog unavailable: continue using local inventory, aliases, and manual scan/type/search;
- alias-write failure: intake may continue, but do not claim the association was globally learned;
- real NF-e XML unavailable by key: keep XML fallback.

## Test matrix
Cover: existing EAN+price, existing EAN without price, new EAN known by catalog, new EAN unknown by catalog, known alias, alias to product not yet in store, strong local suggestion, strong global suggestion, ambiguous suggestion, unresolved item, alias/EAN conflict, rejected suggestion then known product, scan/manual EAN, do-not-import, duplicate invoice, decimal quantity, zero-cost warning path, package unit with known factor, package unit with unknown factor, catalog outage, and alias persistence failure.