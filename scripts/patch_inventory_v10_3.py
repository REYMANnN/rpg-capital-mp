from pathlib import Path

inventory_path = Path('app/inventory-v1/InventoryV1.tsx')
css_path = Path('app/inventory-v1/inventory.module.css')
version_path = Path('lib/inventory/version.ts')

src = inventory_path.read_text()


def replace_once(old: str, new: str):
    global src
    if old not in src:
        raise SystemExit(f'anchor not found:\n{old[:180]}')
    src = src.replace(old, new, 1)

replace_once(
    "import type { InvoiceReviewLineV10 } from '@/lib/inventory/invoiceReview'\n",
    "import type { InvoiceReviewLineV10 } from '@/lib/inventory/invoiceReview'\nimport { activeProducts, reactivateProduct, softDeleteProduct } from '@/lib/inventory/productLifecycle'\n",
)

replace_once(
    "  catalogImageUrl?: string\n}\n",
    "  catalogImageUrl?: string\n  deletedAt?: string\n}\n",
)

replace_once(
    "  const [invoiceLoading, setInvoiceLoading] = useState(false)\n",
    "  const [invoiceLoading, setInvoiceLoading] = useState(false)\n  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)\n",
)

replace_once(
    "  const pendingPriceCount = useMemo(() => data.products.filter((p) => p.priceCents <= 0).length, [data.products])\n",
    "  const visibleProducts = useMemo(() => activeProducts(data.products), [data.products])\n  const pendingPriceCount = useMemo(() => visibleProducts.filter((p) => p.priceCents <= 0).length, [visibleProducts])\n",
)

replace_once(
    "  async function prepareProduct(code: string) {\n    const existing = data.products.find((p) => p.barcode === code)\n    if (existing) {\n      editProduct(existing)\n      return 'existing' as const\n    }\n",
    "  async function prepareProduct(code: string) {\n    const existing = data.products.find((p) => p.barcode === code)\n    if (existing?.deletedAt) {\n      const restored = reactivateProduct(existing)\n      setData((current) => ({\n        ...current,\n        products: current.products.map((product) => product.id === existing.id ? restored : product),\n      }))\n      editProduct(restored)\n      flash(`Produto reativado: ${restored.name}. Estoque reiniciado em 0.`)\n      return 'reactivated' as const\n    }\n    if (existing) {\n      editProduct(existing)\n      return 'existing' as const\n    }\n",
)

replace_once(
    "  function receive(productId: string, amount: string, cost: string, note: string) {\n",
    "  function requestDeleteCurrentProduct() {\n    if (productMode !== 'edit' || !editingProductId) return\n    setDeleteCandidateId(editingProductId)\n  }\n\n  function confirmDeleteProduct() {\n    if (!deleteCandidateId) return\n    const existing = data.products.find((product) => product.id === deleteCandidateId)\n    if (!existing) {\n      setDeleteCandidateId(null)\n      return\n    }\n    const now = new Date().toISOString()\n    const deletion = softDeleteProduct(existing, now)\n    setData((current) => ({\n      ...current,\n      products: current.products.map((product) => product.id === existing.id ? deletion.product : product),\n      movements: deletion.stockAdjustmentMilli\n        ? [...current.movements, {\n            id: uid(),\n            productId: existing.id,\n            type: 'adjustment' as const,\n            quantityMilli: deletion.stockAdjustmentMilli,\n            createdAt: now,\n            note: 'Produto removido do estoque',\n          }]\n        : current.movements,\n    }))\n    setCart((current) => current.filter((line) => line.productId !== existing.id))\n    setDeleteCandidateId(null)\n    closeProductPanel()\n    flash(`${existing.name} foi removido do estoque.`)\n  }\n\n  function receive(productId: string, amount: string, cost: string, note: string) {\n",
)

replace_once(
    "        let product = products.find((candidate) => candidate.barcode === line.barcode)\n        if (!product) {\n",
    "        let product = products.find((candidate) => candidate.barcode === line.barcode)\n        if (product?.deletedAt) {\n          product = reactivateProduct(product)\n          products = products.map((candidate) => candidate.id === product!.id ? product! : candidate)\n        }\n        if (!product) {\n",
)

# Apply the same reactivation behavior to the v10 confirmation path (second occurrence).
marker = "        let product = products.find((candidate) => candidate.barcode === line.barcode)\n        if (!product) {\n"
if marker in src:
    src = src.replace(
        marker,
        "        let product = products.find((candidate) => candidate.barcode === line.barcode)\n        if (product?.deletedAt) {\n          product = reactivateProduct(product)\n          products = products.map((candidate) => candidate.id === product!.id ? product! : candidate)\n        }\n        if (!product) {\n",
        1,
    )

replace_once(
    "    const product = data.products.find((candidate) => candidate.barcode === code)\n",
    "    const product = visibleProducts.find((candidate) => candidate.barcode === code)\n",
)

replace_once(
    "      await prepareProduct(code)\n      flash('Produto novo identificado. Complete preço de venda, custo de compra e salve.')\n      return\n",
    "      const result = await prepareProduct(code)\n      if (result !== 'reactivated') flash('Produto novo identificado. Complete preço de venda, custo de compra e salve.')\n      return\n",
)

replace_once(
    "  const cloudText =\n    cloud === 'synced' ? 'Nuvem sincronizada' : cloud === 'syncing' ? 'Sincronizando…' : cloud === 'offline' ? 'Modo local' : 'Conectando…'\n",
    "  const cloudText =\n    cloud === 'synced' ? 'Nuvem sincronizada' : cloud === 'syncing' ? 'Sincronizando…' : cloud === 'offline' ? 'Modo local' : 'Conectando…'\n  const deleteCandidate = deleteCandidateId ? data.products.find((product) => product.id === deleteCandidateId) || null : null\n",
)

src = src.replace("products={data.products}", "products={visibleProducts}")

replace_once(
    "            edit={editProduct}\n          />\n",
    "            edit={editProduct}\n            deleteCurrent={requestDeleteCurrentProduct}\n          />\n",
)

replace_once(
    "      {scannerOpen && <QuaggaScanner onCode={handleCode} close={() => setScannerOpen(false)} />}\n",
    "      {deleteCandidate && (\n        <div className={styles.deleteOverlay} role=\"presentation\" onClick={() => setDeleteCandidateId(null)}>\n          <div className={styles.deleteDialog} role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"delete-product-title\" onClick={(event) => event.stopPropagation()}>\n            <span className={styles.eyebrow}>Remover do estoque</span>\n            <h2 id=\"delete-product-title\">Quer mesmo apagar “{deleteCandidate.name} — {deleteCandidate.barcode}” do seu estoque?</h2>\n            <p>O produto some do estoque e do caixa, mas vendas e movimentações antigas continuam preservadas.</p>\n            <div className={styles.actions}>\n              <button className={styles.secondary} onClick={() => setDeleteCandidateId(null)}>Cancelar</button>\n              <button className={styles.danger} onClick={confirmDeleteProduct}><Trash2 />Apagar produto</button>\n            </div>\n          </div>\n        </div>\n      )}\n\n      {scannerOpen && <QuaggaScanner onCode={handleCode} close={() => setScannerOpen(false)} />}\n",
)

replace_once(
    "  edit,\n}: {\n",
    "  edit,\n  deleteCurrent,\n}: {\n",
)

replace_once(
    "  edit: (product: AppProduct) => void\n}) {\n",
    "  edit: (product: AppProduct) => void\n  deleteCurrent: () => void\n}) {\n",
)

replace_once(
    "<div className={styles.actions}><button className={styles.primary} onClick={save} disabled={lookup.status === 'loading'}>{mode === 'edit' ? 'Salvar alterações' : 'Cadastrar produto'}</button><button className={styles.secondary} onClick={close}>Cancelar</button></div>\n",
    "<div className={styles.actions}><button className={styles.primary} onClick={save} disabled={lookup.status === 'loading'}>{mode === 'edit' ? 'Salvar alterações' : 'Cadastrar produto'}</button><button className={styles.secondary} onClick={close}>Cancelar</button></div>\n{mode === 'edit' && <button className={styles.deleteFromStock} onClick={deleteCurrent}><Trash2 />Apagar esse produto do meu estoque</button>}\n",
)

inventory_path.write_text(src)

css = css_path.read_text()
if '.deleteOverlay{' not in css:
    css += "\n.deleteFromStock{margin-top:14px;border:0;background:transparent;color:#b42318;font-weight:800;padding:8px 0;display:inline-flex;align-items:center;gap:7px;cursor:pointer}.deleteFromStock svg{width:17px}.deleteOverlay{position:fixed;inset:0;z-index:80;background:#06110dbf;display:grid;place-items:center;padding:18px}.deleteDialog{width:min(520px,100%);box-sizing:border-box;background:white;border:1px solid #dfe4df;border-radius:18px;padding:24px;box-shadow:0 24px 80px #06110d55}.deleteDialog h2{margin:7px 0 10px;font-size:22px;line-height:1.25}.deleteDialog p{color:#667169;line-height:1.5;margin:0 0 20px}.deleteDialog .danger{background:#b42318;color:white}\n"
css_path.write_text(css)

version_path.write_text("export const INVENTORY_APP_VERSION = 'v10.3'\n")
