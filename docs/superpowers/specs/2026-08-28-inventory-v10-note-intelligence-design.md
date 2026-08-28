# Inventory v10 — Note Intelligence Design

## Goal

Turn purchase intake into a camera-first workflow: scan a DANFE/NF-e barcode, resolve product identities with zero-LLM deterministic matching whenever possible, ask only about uncertain items, show a fully editable final review, and only then update inventory.

## User flow

1. Entrada shows **Escanear nota** as the primary action and **Importar XML** as a fallback.
2. Escanear nota opens the existing proven barcode scanner and accepts a 44-digit NF-e access key in Code 128.
3. The key is validated with the NF-e modulo-11 check digit.
4. The backend attempts to resolve the key into NF-e data. For the synthetic test key used in this project, it returns a deterministic demo NF-e so the complete v10 flow is testable end-to-end. Real keys use a provider adapter contract; if an authorized distribution provider/certificate is not configured, the UI explains that the key was read successfully and offers XML fallback instead of pretending line-item data is publicly available.
5. Parsed NF-e lines are identified in this order:
   - valid EAN/GTIN from the NF-e;
   - global exact mapping `supplier_document + supplier_code -> EAN`;
   - deterministic name similarity against known catalog products, using normalized tokens, brand-like terms, quantities/measurements and string similarity; no LLM;
   - unresolved.
6. Exact EAN and trusted global supplier mappings require no question. A strong name candidate becomes **Confirmar produto**. The user confirms or rejects it before final review. Rejection allows product search or barcode scan/manual EAN association.
7. Confirming a supplier-code association writes global knowledge keyed by supplier CNPJ/CPF + cProd. Future users reuse it. Existing mapping is never silently overwritten by a conflicting EAN; conflicts are surfaced.
8. After uncertainties are resolved, show the complete invoice list. All importable items are checked by default. The user can check/uncheck all, check individual lines, and edit any line before import.
9. The line editor can change associated product/EAN, quantity, unit purchase cost and description. Editing quantity/cost affects only this purchase. Changing the supplier-code-to-product association updates global knowledge after confirmation.
10. **Confirmar entrada — N itens** imports only checked lines, updates stock and weighted average cost, records supplier CNPJ/name and NF-e key/number on purchase movements, and blocks duplicate NF-e imports.

## Global supplier-product memory

Table: `inventory_v10_supplier_product_aliases`

Key: `(supplier_document, supplier_code)`.

Stored fields: EAN, canonical product name, original supplier description, confidence/source, confirmation count, conflict flag, first/last confirmation timestamps.

Security model: direct client table access is blocked with RLS. Reads and confirmations happen through narrowly-scoped RPCs. A conflicting EAN does not replace a trusted mapping; it marks the alias conflicted. Description drift is checked in the application before automatic use.

## Deterministic matching

No LLM is required. Normalize accents, punctuation, spacing and common unit aliases (`LT/LITRO -> L`, `GR/GRAMAS -> G`, etc.). Compare supplier description with known catalog product names using token overlap plus normalized edit similarity, with strong penalties for conflicting numeric measurements. The matcher returns a score and candidate. Only high-scoring candidates are proposed; lower scores remain unresolved.

## NF-e key resolution

A 44-digit key alone does not expose line items through a universal unauthenticated public API. Production resolution therefore uses an adapter contract for an authorized NF-e distribution provider/certificate belonging to the recipient. v10 includes the complete scanner and resolver API boundary plus a synthetic test-key fixture for end-to-end testing. XML import remains an explicit fallback.

## UX states

Each invoice item is one of:
- `Identificado por EAN`
- `Reconhecido pelo fornecedor`
- `Confirmar produto`
- `Não identificado`

Only the latter two interrupt the user before final review.

## Version

Visible inventory version becomes `v10` only when the scanner, deterministic matching, global supplier mapping, ambiguity resolution, final editable review, and checked-item import are all present and production build verification passes.
