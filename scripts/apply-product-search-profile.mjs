import { readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from 'node:fs'

const inventoryPath = 'app/inventory-v1/InventoryV1.tsx'
const cssPath = 'app/inventory-v1/inventory.module.css'

let source = readFileSync(inventoryPath, 'utf8')

function replaceOnce(before, after, label) {
  const first = source.indexOf(before)
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`)
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous patch anchor: ${label}`)
  source = source.slice(0, first) + after + source.slice(first + before.length)
}

replaceOnce(
`  RotateCcw,\n  ScanLine,\n  Settings,`,
`  RotateCcw,\n  ScanLine,\n  Search,\n  Settings,`,
'add Search icon',
)

replaceOnce(
`import { completeSale, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'`,
`import { completeSale, searchProducts, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'`,
'import searchProducts',
)

replaceOnce(
`  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)`,
`  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null)\n  const [profileProductId, setProfileProductId] = useState<string | null>(null)`,
'profile state',
)

replaceOnce(
`  const visibleProducts = useMemo(() => activeProducts(data.products), [data.products])\n  const pendingPriceCount = useMemo(() => visibleProducts.filter((p) => p.priceCents <= 0).length, [visibleProducts])`,
`  const visibleProducts = useMemo(() => activeProducts(data.products), [data.products])\n  const pendingPriceCount = useMemo(() => visibleProducts.filter((p) => p.priceCents <= 0).length, [visibleProducts])\n  const profileProduct = useMemo(\n    () => profileProductId ? visibleProducts.find((product) => product.id === profileProductId) || null : null,\n    [profileProductId, visibleProducts],\n  )\n  const profileMovements = useMemo(\n    () => profileProduct\n      ? data.movements.filter((movement) => movement.productId === profileProduct.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))\n      : [],\n    [data.movements, profileProduct],\n  )`,
'profile derivations',
)

replaceOnce(
`            edit={editProduct}\n            deleteCurrent={requestDeleteCurrentProduct}`,
`            edit={editProduct}\n            view={(product) => setProfileProductId(product.id)}\n            deleteCurrent={requestDeleteCurrentProduct}`,
'stock view prop',
)

replaceOnce(
`            manual={handleCode}\n            change={(id, delta) => setCart((current) => current.map((line) => line.productId === id ? { ...line, quantityMilli: Math.max(0, line.quantityMilli + delta) } : line).filter((line) => line.quantityMilli > 0))}`,
`            manual={handleCode}\n            add={(product) => addCart(product, 1000)}\n            view={(product) => setProfileProductId(product.id)}\n            change={(id, delta) => setCart((current) => current.map((line) => line.productId === id ? { ...line, quantityMilli: Math.max(0, line.quantityMilli + delta) } : line).filter((line) => line.quantityMilli > 0))}`,
'checkout search actions',
)

replaceOnce(
`      {scannerOpen && <QuaggaScanner onCode={handleCode} close={() => setScannerOpen(false)} />}`,
`      {profileProduct && (\n        <ProductProfile\n          product={profileProduct}\n          movements={profileMovements}\n          close={() => setProfileProductId(null)}\n          edit={() => {\n            setProfileProductId(null)\n            setTab('stock')\n            editProduct(profileProduct)\n          }}\n        />\n      )}\n\n      {scannerOpen && <QuaggaScanner onCode={handleCode} close={() => setScannerOpen(false)} />}`,
'profile overlay mount',
)

replaceOnce(
`  edit,\n  deleteCurrent,`,
`  edit,\n  view,\n  deleteCurrent,`,
'stock parameter view',
)

replaceOnce(
`  edit: (product: AppProduct) => void\n  deleteCurrent: () => void`,
`  edit: (product: AppProduct) => void\n  view: (product: AppProduct) => void\n  deleteCurrent: () => void`,
'stock view type',
)

replaceOnce(
`  view: (product: AppProduct) => void\n  deleteCurrent: () => void\n}) {\n  const manualName = mode === 'new' && lookup.status === 'new'\n  return (`,
`  view: (product: AppProduct) => void\n  deleteCurrent: () => void\n}) {\n  const manualName = mode === 'new' && lookup.status === 'new'\n  const [query, setQuery] = useState('')\n  const filteredProducts = useMemo(() => searchProducts(products, query), [products, query])\n  return (`,
'stock search state',
)

replaceOnce(
`      {mode && (\n        <section className={styles.card}>`,
`      <ProductSearch query={query} setQuery={setQuery} resultCount={filteredProducts.length} />\n\n      {mode && (\n        <section className={styles.card}>`,
'stock search input',
)

replaceOnce(
`      <section className={styles.productlist}>\n        {products.length === 0 ? (\n          <div className={styles.empty}><Boxes /><b>Nenhum produto</b><span>Escaneie um produto ou importe uma NF-e para começar.</span></div>\n        ) : products.map((product) => (`,
`      <section className={styles.productlist}>\n        {products.length === 0 ? (\n          <div className={styles.empty}><Boxes /><b>Nenhum produto</b><span>Escaneie um produto ou importe uma NF-e para começar.</span></div>\n        ) : filteredProducts.length === 0 ? (\n          <div className={styles.empty}><Search /><b>Nenhum resultado</b><span>Tente outro nome ou código.</span></div>\n        ) : filteredProducts.map((product) => (`,
'stock filtered list',
)

replaceOnce(
`            <button className={styles.editButton} onClick={() => edit(product)}><Pencil />Editar</button>`,
`            <div className={styles.productActions}>\n              <button className={styles.profileButton} onClick={() => view(product)}>Ver perfil</button>\n              <button className={styles.editButton} onClick={() => edit(product)}><Pencil />Editar</button>\n            </div>`,
'stock profile action',
)

replaceOnce(
`function Checkout({ products, cart, total, scan, manual, change, remove, checkout }: { products: AppProduct[]; cart: CartLine[]; total: number; scan: () => void; manual: (value: string) => void | Promise<void>; change: (id: string, delta: number) => void; remove: (id: string) => void; checkout: () => void }) {\n  const [code, setCode] = useState('')`,
`function ProductSearch({ query, setQuery, resultCount }: { query: string; setQuery: (value: string) => void; resultCount: number }) {\n  return (\n    <section className={styles.productSearch} aria-label="Pesquisa de produtos">\n      <div className={styles.productSearchInput}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto por nome ou código" autoComplete="off" /></div>\n      <small>{query.trim() ? resultCount + ' resultado(s)' : 'Digite o nome, EAN ou código do produto.'}</small>\n    </section>\n  )\n}\n\nfunction Checkout({ products, cart, total, scan, manual, add, view, change, remove, checkout }: { products: AppProduct[]; cart: CartLine[]; total: number; scan: () => void; manual: (value: string) => void | Promise<void>; add: (product: AppProduct) => void; view: (product: AppProduct) => void; change: (id: string, delta: number) => void; remove: (id: string) => void; checkout: () => void }) {\n  const [code, setCode] = useState('')\n  const [productQuery, setProductQuery] = useState('')\n  const searchResults = useMemo(() => searchProducts(products, productQuery), [products, productQuery])`,
'product search component and checkout props',
)

replaceOnce(
`      <section className={styles.scanbar}><input inputMode="numeric" placeholder="Leitor USB / código manual" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && code.trim()) { void manual(code); setCode('') } }} /><button onClick={() => { void manual(code); setCode('') }}>Adicionar</button></section>\n      <section className={styles.checkoutgrid}>`,
`      <section className={styles.scanbar}><input inputMode="numeric" placeholder="Leitor USB / código manual" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && code.trim()) { void manual(code); setCode('') } }} /><button onClick={() => { void manual(code); setCode('') }}>Adicionar</button></section>\n      <ProductSearch query={productQuery} setQuery={setProductQuery} resultCount={searchResults.length} />\n      {productQuery.trim() && (\n        <section className={styles.searchResults}>\n          {searchResults.length === 0 ? <div className={styles.empty}><Search /><b>Nenhum resultado</b><span>Tente outro nome ou código.</span></div> : searchResults.slice(0, 8).map((product) => (\n            <article className={styles.searchResult} key={product.id}>\n              <div className={styles.productPhoto}>{product.catalogImageUrl ? <img src={product.catalogImageUrl} alt="" /> : <Barcode />}</div>\n              <div className={styles.grow}><b>{product.name}</b><small>{product.catalogBrand ? product.catalogBrand + ' · ' : ''}EAN {product.barcode}</small><small>{money(product.priceCents)} · {qty(product.stockMilli, product.unit)} em estoque</small></div>\n              <div className={styles.searchActions}><button className={styles.profileButton} onClick={() => view(product)}>Ver perfil</button><button className={styles.primary} disabled={product.stockMilli <= 0 || product.priceCents <= 0} onClick={() => { add(product); setProductQuery('') }}>Adicionar</button></div>\n            </article>\n          ))}\n        </section>\n      )}\n      <section className={styles.checkoutgrid}>`,
'checkout search results',
)

replaceOnce(
`function SettingsView({ cloud, exportBackup, importBackup, reset }: { cloud: string; exportBackup: () => void; importBackup: (file: File) => void; reset: () => void }) {`,
`function ProductProfile({ product, movements, close, edit }: { product: AppProduct; movements: Movement[]; close: () => void; edit: () => void }) {\n  const marginCents = product.priceCents - product.averageCostCents\n  const marginPercent = product.priceCents > 0 ? (marginCents / product.priceCents) * 100 : 0\n  const stockCostCents = Math.round((product.averageCostCents * product.stockMilli) / 1000)\n  const stockRetailCents = Math.round((product.priceCents * product.stockMilli) / 1000)\n  const movementLabel: Record<Movement['type'], string> = { initial: 'Estoque inicial', purchase: 'Entrada', sale: 'Venda', adjustment: 'Ajuste' }\n\n  return (\n    <div className={styles.deleteOverlay} role="presentation" onClick={close}>\n      <section className={styles.productProfile} role="dialog" aria-modal="true" aria-labelledby="product-profile-title" onClick={(event) => event.stopPropagation()}>\n        <div className={styles.profileHeader}>\n          <div className={styles.identityMedia}>{product.catalogImageUrl ? <img src={product.catalogImageUrl} alt="" /> : <Barcode />}</div>\n          <div className={styles.grow}><span className={styles.eyebrow}>Perfil do produto</span><h2 id="product-profile-title">{product.name}</h2><p>{product.catalogBrand || 'Marca não informada'} · EAN {product.barcode}{product.scaleCode ? ' · Código ' + product.scaleCode : ''}</p></div>\n          <button className={styles.iconButton} onClick={close} aria-label="Fechar perfil"><X /></button>\n        </div>\n\n        <div className={styles.profileGrid}>\n          <div><span>Preço de venda</span><strong>{product.priceCents > 0 ? money(product.priceCents) : 'Pendente'}</strong></div>\n          <div><span>Custo médio</span><strong>{product.averageCostCents > 0 ? money(product.averageCostCents) : 'Não informado'}</strong></div>\n          <div><span>Margem bruta</span><strong>{product.priceCents > 0 ? money(marginCents) + ' · ' + marginPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—'}</strong></div>\n          <div><span>Quantidade</span><strong>{qty(product.stockMilli, product.unit)}</strong></div>\n          <div><span>Estoque mínimo</span><strong>{qty(product.minStockMilli, product.unit)}</strong></div>\n          <div><span>Unidade</span><strong>{product.unit}</strong></div>\n          <div><span>Valor em estoque · custo</span><strong>{money(stockCostCents)}</strong></div>\n          <div><span>Valor em estoque · venda</span><strong>{money(stockRetailCents)}</strong></div>\n          <div><span>Fonte do cadastro</span><strong>{product.catalogSource || 'Cadastro manual'}</strong></div>\n        </div>\n\n        <div className={styles.profileSectionTitle}><div><span className={styles.eyebrow}>Histórico do item</span><h3>Movimentações</h3></div><button className={styles.editButton} onClick={edit}><Pencil />Editar produto</button></div>\n        <div className={styles.movementList}>\n          {movements.length === 0 ? <div className={styles.empty}><Boxes /><b>Sem movimentações</b><span>O histórico aparece conforme entradas, vendas e ajustes forem registrados.</span></div> : movements.slice(0, 50).map((movement) => (\n            <article className={styles.movementRow} key={movement.id}>\n              <div><b>{movementLabel[movement.type]}</b><small>{new Date(movement.createdAt).toLocaleString('pt-BR')}</small></div>\n              <div className={styles.grow}><small>{movement.note}</small>{movement.supplierName && <small>{movement.supplierName}{movement.invoiceNumber ? ' · NF ' + movement.invoiceNumber : ''}</small>}</div>\n              <strong className={movement.quantityMilli < 0 ? styles.negativeMovement : styles.positiveMovement}>{movement.quantityMilli > 0 ? '+' : ''}{qty(movement.quantityMilli, product.unit)}</strong>\n            </article>\n          ))}\n        </div>\n      </section>\n    </div>\n  )\n}\n\nfunction SettingsView({ cloud, exportBackup, importBackup, reset }: { cloud: string; exportBackup: () => void; importBackup: (file: File) => void; reset: () => void }) {`,
'product profile component',
)

writeFileSync(inventoryPath, source)

const cssMarker = '.productSearch{'
const css = readFileSync(cssPath, 'utf8')
if (!css.includes(cssMarker)) {
  appendFileSync(cssPath, `\n.productSearch{background:white;border:1px solid #dfe4df;border-radius:14px;padding:13px 14px;margin-bottom:16px;box-shadow:0 3px 16px #14201808}.productSearchInput{display:flex;align-items:center;gap:10px}.productSearchInput>svg{width:20px;color:#167849;flex:0 0 20px}.productSearchInput input{width:100%;height:46px;border:0;outline:none;background:transparent;color:#17201b;font-size:16px}.productSearchInput input::placeholder{color:#8a948e}.productSearch>small{display:block;margin:6px 0 0 30px;color:#748078;font-size:11px}.productActions,.searchActions{display:flex;align-items:center;gap:8px}.profileButton{border:1px solid #cfd8d1;background:white;color:#176941;border-radius:10px;padding:9px 11px;font-weight:800;cursor:pointer;white-space:nowrap}.searchResults{display:flex;flex-direction:column;gap:8px;margin:-6px 0 18px}.searchResult{display:flex;align-items:center;gap:12px;background:white;border:1px solid #dfe4df;border-radius:13px;padding:12px}.searchResult .primary{padding:9px 12px}.productProfile{width:min(860px,100%);max-height:min(88vh,900px);overflow:auto;box-sizing:border-box;background:white;border:1px solid #dfe4df;border-radius:20px;padding:24px;box-shadow:0 24px 80px #06110d55}.profileHeader{display:flex;align-items:center;gap:16px;margin-bottom:20px}.profileHeader .identityMedia{margin:0;width:92px;height:92px;flex-basis:92px}.profileHeader h2{font-size:26px;margin:5px 0 5px}.profileHeader p{margin:0;color:#667169}.profileGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:24px}.profileGrid>div{background:#f6f8f6;border:1px solid #e0e6e1;border-radius:12px;padding:13px;min-width:0}.profileGrid span{display:block;color:#748078;font-size:11px;margin-bottom:5px}.profileGrid strong{display:block;font-size:14px;overflow-wrap:anywhere}.profileSectionTitle{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:10px}.profileSectionTitle h3{margin:3px 0 0}.movementList{display:flex;flex-direction:column;gap:7px}.movementRow{display:grid;grid-template-columns:150px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #e2e7e3;border-radius:11px;padding:11px 12px}.movementRow small{display:block;color:#748078;margin-top:2px}.movementRow>strong{white-space:nowrap}.positiveMovement{color:#167849}.negativeMovement{color:#b42318}@media(max-width:800px){.profileGrid{grid-template-columns:1fr 1fr}.movementRow{grid-template-columns:1fr auto}.movementRow .grow{grid-column:1/3}.productActions{width:100%;justify-content:flex-end}.searchResult{align-items:flex-start;flex-wrap:wrap}.searchActions{width:100%;justify-content:flex-end}}@media(max-width:480px){.productProfile{padding:16px}.profileHeader{align-items:flex-start}.profileHeader .identityMedia{width:70px;height:78px;flex-basis:70px}.profileHeader h2{font-size:21px}.profileGrid{grid-template-columns:1fr}.profileSectionTitle{align-items:flex-start;flex-direction:column}.profileSectionTitle .editButton{width:100%;justify-content:center}.searchActions{display:grid;grid-template-columns:1fr 1fr}.searchActions button{width:100%}}\n`)
}

for (const path of ['scripts/apply-product-search-profile.mjs', '.github/workflows/product-search-profile-apply.yml']) {
  if (existsSync(path)) unlinkSync(path)
}
