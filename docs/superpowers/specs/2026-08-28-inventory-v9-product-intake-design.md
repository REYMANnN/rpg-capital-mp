# Inventory v9 — Product Intake and Editing Design

## Goal

Make product intake obvious for a small retailer by separating two jobs: unit barcode scans for one-off product registration/editing, and NF-e XML imports for bulk stock intake with purchase costs.

## UX model

### 1. Unit scan

The primary stock action is **Escanear produto**.

After a barcode is read:
- If the SKU already exists, open a product detail/editor.
- If it does not exist, query the product catalog and open a registration card.
- When the catalog recognizes the item, show product image, official name, brand and EAN. Name and EAN are read-only.
- When no catalog source recognizes it, allow the user to enter the name during first registration only. After save, name becomes read-only.

Fields in the unit flow:
- **Preço de venda** — mandatory before a product can be sold; explanatory copy says this is the amount charged to the customer.
- **Custo de compra** — mandatory when a manually-created product has no known cost; explanatory copy says this is the amount paid to the supplier per unit.
- **Quantidade inicial** — optional, defaults to zero.
- **Estoque mínimo** — optional.

For an existing product, the editor allows changing price of sale, purchase cost, minimum stock and stock adjustment. It must not allow editing EAN or name.

### 2. Purchase invoice import

The primary intake action is **Importar nota de compra** and accepts Brazilian NF-e XML.

Parse each `<det><prod>` item using:
- `cEAN` / `cEANTrib` as barcode when valid and different from `SEM GTIN`;
- `xProd` as invoice description;
- `qCom` as purchased quantity;
- `vUnCom` as purchase unit cost;
- `vProd` as line total;
- `cProd` as supplier item reference.

Before changing inventory, show a review table with product, quantity, unit cost and status.

Status rules:
- Existing SKU: add quantity and update weighted average purchase cost.
- New SKU with valid EAN: query catalog; create stock item with invoice quantity/cost. Sale price remains zero/pending.
- Item without usable EAN: keep it in review as **Precisa vincular** and do not import it into stock until a barcode/product is assigned.

The invoice import never asks for sale price. After import, products with sale price zero are marked **Preço de venda pendente**. A later unit scan opens that product directly and asks for its sale price.

### 3. Product cards

Each product card shows, in this order:
- image when available;
- official product name;
- brand + EAN;
- sale price or **Preço pendente**;
- average purchase cost;
- current stock;
- status and **Editar** action.

The interface must use explicit labels and helper text. Avoid unlabeled numeric inputs.

### 4. Catalog lookup

Use the existing `/api/products/lookup` pipeline and cached catalog data. Catalog image, brand and official name are identification metadata. The merchant controls only commercial data such as sale price, purchase cost and stock.

### 5. Persistence

Continue using the existing local-first state and Supabase `inventory_v1_*` synchronization. New NF-e imports are represented through products plus purchase movements, so the current cloud synchronization model remains compatible.

### 6. Versioning

Release this behavior as **v9**, using the single shared `INVENTORY_APP_VERSION` constant so UI and API remain aligned.

## Error handling

- Invalid or non-NF-e XML: show a clear message and make no state changes.
- Empty invoice or invoice without `<det>` items: reject before review.
- Catalog lookup failure: preserve invoice description as provisional identification while still requiring a valid EAN for automatic stock creation.
- A line without valid EAN remains pending in the review instead of being silently dropped.
- No partial stock update occurs before the user confirms the reviewed invoice.

## Testing

- Unit tests for NF-e parsing and GTIN normalization.
- Unit tests for weighted purchase-cost update behavior when importing invoice items.
- Production build/TypeScript verification.
- Production smoke test for `/inventory-v1`, `/api/products/lookup`, and Supabase synchronization endpoint.
