from pathlib import Path

ui = Path('app/inventory-v1/InvoiceIntakeV10_1.tsx')
text = ui.read_text(encoding='utf-8')
text = text.replace(
    "decisionState: requiresPackageFactor(line.purchaseUnit) && line.packageFactor <= 0 ? 'needs-package-factor' : 'resolved',\n      confirmed: !requiresPackageFactor(line.purchaseUnit) || line.packageFactor > 0,",
    "decisionState: requiresPackageFactor(line.purchaseUnit) ? 'needs-package-factor' : 'resolved',\n      confirmed: !requiresPackageFactor(line.purchaseUnit),",
)
text = text.replace(
    "decisionState: requiresPackageFactor(line.purchaseUnit) && line.packageFactor <= 0 ? 'needs-package-factor' : 'resolved',\n      confirmed: !requiresPackageFactor(line.purchaseUnit) || line.packageFactor > 0,",
    "decisionState: requiresPackageFactor(line.purchaseUnit) ? 'needs-package-factor' : 'resolved',\n      confirmed: !requiresPackageFactor(line.purchaseUnit),",
)
ui.write_text(text, encoding='utf-8')

inventory = Path('app/inventory-v1/InventoryV1.tsx')
text = inventory.read_text(encoding='utf-8')
old = """          product = {\n            id: uid(), barcode: line.barcode, name: line.name || line.description, unit: 'UN',\n            priceCents: 0, stockMilli: 0, minStockMilli: 0, averageCostCents: 0,\n"""
new = """          product = {\n            id: uid(), barcode: line.barcode, name: line.name || line.description, unit: line.inventoryUnit,\n            priceCents: 0, stockMilli: 0, minStockMilli: 0, averageCostCents: 0,\n"""
if old not in text:
    raise SystemExit('new-product-v10 snippet not found')
text = text.replace(old, new, 1)
old = "const update = calculatePurchaseUpdate(product.stockMilli, product.averageCostCents, line.quantityMilli, line.unitCostCents)"
new = "const update = calculatePurchaseUpdate(product.stockMilli, product.averageCostCents, line.stockQuantityMilli, line.inventoryUnitCostCents)"
if old not in text:
    raise SystemExit('purchase-update-v10 snippet not found')
text = text.replace(old, new, 1)
old = "id: uid(), productId: product.id, type: 'purchase', quantityMilli: line.quantityMilli,"
new = "id: uid(), productId: product.id, type: 'purchase', quantityMilli: line.stockQuantityMilli,"
if old not in text:
    raise SystemExit('movement-quantity-v10 snippet not found')
text = text.replace(old, new, 1)
inventory.write_text(text, encoding='utf-8')
