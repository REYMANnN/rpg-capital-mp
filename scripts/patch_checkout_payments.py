from pathlib import Path

inventory_path = Path('app/inventory-v1/InventoryV1.tsx')
css_path = Path('app/inventory-v1/inventory.module.css')

source = inventory_path.read_text(encoding='utf-8')

old_import = "import { completeSale, searchProducts, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'"
new_import = "import { completeSale, searchProducts, type PaymentMethod, type Product, type Sale, type ScaleRule } from '@/lib/inventory/core'"
assert old_import in source, 'inventory core import not found'
source = source.replace(old_import, new_import, 1)

old_checkout = '''  function checkout() {
    if (!cart.length) return
    const pendingProduct = cart
      .map((line) => data.products.find((product) => product.id === line.productId))
      .find((product) => product && product.priceCents <= 0)
    if (pendingProduct) return fail(`Defina o preço de venda de ${pendingProduct.name} antes de concluir.`)

    try {
      const result = completeSale(
        data.products,
        cart.map((line) => ({ productId: line.productId, quantityMilli: line.quantityMilli })),
        uid(),
      )
      const byId = new Map(result.products.map((product) => [product.id, product]))
      const nextProducts = data.products.map((product) => ({
        ...product,
        stockMilli: byId.get(product.id)?.stockMilli ?? product.stockMilli,
      }))
      const movements: Movement[] = cart.map((line) => ({
        id: uid(),
        productId: line.productId,
        type: 'sale',
        quantityMilli: -line.quantityMilli,
        createdAt: result.sale.createdAt,
        note: `Venda ${result.sale.id.slice(0, 8)}`,
      }))
      setData((current) => ({
        ...current,
        products: nextProducts,
        sales: [result.sale, ...current.sales],
        movements: [...current.movements, ...movements],
      }))
      setCart([])
      flash(`Venda registrada: ${money(result.sale.totalCents)}.`)
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Falha ao concluir venda.')
    }
  }
'''
new_checkout = '''  function checkout(method: PaymentMethod) {
    if (!cart.length) return false
    const pendingProduct = cart
      .map((line) => data.products.find((product) => product.id === line.productId))
      .find((product) => product && product.priceCents <= 0)
    if (pendingProduct) {
      fail(`Defina o preço de venda de ${pendingProduct.name} antes de concluir.`)
      return false
    }

    try {
      const confirmedAt = new Date().toISOString()
      const result = completeSale(
        data.products,
        cart.map((line) => ({ productId: line.productId, quantityMilli: line.quantityMilli })),
        uid(),
        { method, confirmedAt },
      )
      const byId = new Map(result.products.map((product) => [product.id, product]))
      const nextProducts = data.products.map((product) => ({
        ...product,
        stockMilli: byId.get(product.id)?.stockMilli ?? product.stockMilli,
      }))
      const movements: Movement[] = cart.map((line) => ({
        id: uid(),
        productId: line.productId,
        type: 'sale',
        quantityMilli: -line.quantityMilli,
        createdAt: result.sale.createdAt,
        note: `Venda ${result.sale.id.slice(0, 8)}`,
      }))
      setData((current) => ({
        ...current,
        products: nextProducts,
        sales: [result.sale, ...current.sales],
        movements: [...current.movements, ...movements],
      }))
      setCart([])
      flash(`Venda registrada: ${money(result.sale.totalCents)}.`)
      return true
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Falha ao concluir venda.')
      return false
    }
  }
'''
assert old_checkout in source, 'checkout handler not found'
source = source.replace(old_checkout, new_checkout, 1)

start = source.index('function Checkout({ products, cart, total, scan, manual, add, view, change, remove, checkout }')
end = source.index('\nfunction ProductProfile(', start)
old_component = source[start:end]
new_component = r'''function Checkout({ products, cart, total, scan, manual, add, view, change, remove, checkout }: { products: AppProduct[]; cart: CartLine[]; total: number; scan: () => void; manual: (value: string) => void | Promise<void>; add: (product: AppProduct) => void; view: (product: AppProduct) => void; change: (id: string, delta: number) => void; remove: (id: string) => void; checkout: (method: PaymentMethod) => boolean }) {
  const [code, setCode] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const searchResults = useMemo(() => searchProducts(products, productQuery), [products, productQuery])
  const [pixCharge, setPixCharge] = useState<{ amountCents: number; payload: string; qrDataUrl: string } | null>(null)
  const [pixBusy, setPixBusy] = useState(false)
  const [pixError, setPixError] = useState('')
  const [copied, setCopied] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentConfirm, setPaymentConfirm] = useState<'card' | 'cash' | null>(null)
  const [saleBusy, setSaleBusy] = useState(false)

  async function chargePix() {
    if (!cart.length || total <= 0) return
    setPixBusy(true)
    setPixError('')
    setCopied(false)
    try {
      const response = await fetch('/api/balcao/checkout/pix', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountCents: total }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Não foi possível gerar a cobrança Pix.')
      setPixCharge({ amountCents: result.amountCents, payload: result.payload, qrDataUrl: result.qrDataUrl })
    } catch (cause) {
      setPixError(cause instanceof Error ? cause.message : 'Não foi possível gerar a cobrança Pix.')
    } finally {
      setPixBusy(false)
    }
  }

  async function copyPix() {
    if (!pixCharge) return
    try {
      await navigator.clipboard.writeText(pixCharge.payload)
      setCopied(true)
    } catch {
      setPixError('Não foi possível copiar automaticamente. Selecione o código abaixo.')
    }
  }

  function finishSale(method: PaymentMethod) {
    if (saleBusy) return false
    setSaleBusy(true)
    try {
      const completed = checkout(method)
      if (completed) {
        setPaymentOpen(false)
        setPaymentConfirm(null)
        setProductQuery('')
      }
      return completed
    } finally {
      setSaleBusy(false)
    }
  }

  function confirmPixPayment() {
    if (!finishSale('pix')) return
    setPixCharge(null)
    setCopied(false)
  }

  function choosePayment(method: PaymentMethod) {
    if (method === 'pix') {
      setPaymentOpen(false)
      void chargePix()
      return
    }
    setPaymentOpen(false)
    setPaymentConfirm(method)
  }

  return (
    <>
      <section className={styles.hero}><div><span>Checkout</span><h1>Caixa</h1><p>Leia o código do produto. SKU sem preço de venda abre automaticamente no editor antes de entrar no carrinho.</p></div><button className={styles.primary} onClick={scan}><ScanLine />Escanear item</button></section>
      <section className={styles.scanbar}><input inputMode="numeric" placeholder="Leitor USB / código manual" value={code} onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && code.trim()) { void manual(code); setCode('') } }} /><button onClick={() => { void manual(code); setCode('') }}>Adicionar</button></section>
      <ProductSearch query={productQuery} setQuery={setProductQuery} resultCount={searchResults.length} />
      {productQuery.trim() && (
        <section className={styles.searchResults}>
          {searchResults.length === 0 ? <div className={styles.empty}><Search /><b>Nenhum resultado</b><span>Tente outro nome ou código.</span></div> : searchResults.slice(0, 8).map((product) => (
            <article className={styles.searchResult} key={product.id}>
              <div className={styles.productPhoto}>{product.catalogImageUrl ? <img src={product.catalogImageUrl} alt="" /> : <Barcode />}</div>
              <div className={styles.grow}><b>{product.name}</b><small>{product.catalogBrand ? product.catalogBrand + ' · ' : ''}EAN {product.barcode}</small><small>{money(product.priceCents)} · {qty(product.stockMilli, product.unit)} em estoque</small></div>
              <div className={styles.searchActions}><button className={styles.profileButton} onClick={() => view(product)}>Ver perfil</button><button className={styles.primary} disabled={product.stockMilli <= 0 || product.priceCents <= 0} onClick={() => { add(product); setProductQuery('') }}>Adicionar</button></div>
            </article>
          ))}
        </section>
      )}
      <section className={styles.checkoutgrid}>
        <div className={styles.productlist}>{cart.length === 0 ? <div className={styles.empty}><ShoppingCart /><b>Carrinho vazio</b><span>Toque em “Escanear item”.</span></div> : cart.map((line) => { const product = products.find((candidate) => candidate.id === line.productId); if (!product) return null; return <article className={styles.cartline} key={line.productId}><div className={styles.grow}><b>{product.name}</b><small>{qty(line.quantityMilli, product.unit)}</small></div><div className={styles.cartstep}><button onClick={() => change(product.id, -1000)}>−</button><strong>{qty(line.quantityMilli, product.unit)}</strong><button onClick={() => change(product.id, 1000)}>+</button></div><b>{money(Math.round((product.priceCents * line.quantityMilli) / 1000))}</b><button className={styles.trash} onClick={() => remove(product.id)}><Trash2 /></button></article> })}</div>
        <aside className={styles.total}><span>Total</span><strong>{money(total)}</strong><button className={styles.pay} disabled={!cart.length || pixBusy || saleBusy} onClick={() => setPaymentOpen(true)}>COBRAR {money(total)}</button>{pixError ? <small role="alert" style={{ color: '#fecaca', opacity: 1 }}>{pixError}</small> : <small>Escolha Pix, Cartão ou Dinheiro. A venda só é concluída após a confirmação.</small>}</aside>
      </section>

      {paymentOpen && (
        <div className={styles.deleteOverlay} role="presentation" onClick={() => setPaymentOpen(false)}>
          <div className={styles.deleteDialog} role="dialog" aria-modal="true" aria-labelledby="payment-method-title" onClick={(event) => event.stopPropagation()}>
            <span className={styles.eyebrow}>Cobrança</span>
            <h2 id="payment-method-title">Como o cliente vai pagar?</h2>
            <p>Total da compra: <b>{money(total)}</b></p>
            <div className={styles.paymentChoices}>
              <button className={styles.paymentChoice} disabled={pixBusy || saleBusy} onClick={() => choosePayment('pix')}><strong>Pix</strong><span>Gerar QR Code</span></button>
              <button className={styles.paymentChoice} disabled={pixBusy || saleBusy} onClick={() => choosePayment('card')}><strong>Cartão</strong><span>Pagamento na maquininha</span></button>
              <button className={styles.paymentChoice} disabled={pixBusy || saleBusy} onClick={() => choosePayment('cash')}><strong>Dinheiro</strong><span>Recebimento em espécie</span></button>
            </div>
            <div className={styles.actions}><button className={styles.secondary} onClick={() => setPaymentOpen(false)}>Cancelar</button></div>
          </div>
        </div>
      )}

      {paymentConfirm && (
        <div className={styles.deleteOverlay} role="presentation" onClick={() => !saleBusy && setPaymentConfirm(null)}>
          <div className={styles.deleteDialog} role="dialog" aria-modal="true" aria-labelledby="payment-confirm-title" onClick={(event) => event.stopPropagation()}>
            <span className={styles.eyebrow}>{paymentConfirm === 'card' ? 'Cartão' : 'Dinheiro'}</span>
            <h2 id="payment-confirm-title">{paymentConfirm === 'card' ? 'Pagamento aprovado na maquininha?' : `Recebeu ${money(total)} em dinheiro?`}</h2>
            <p>{paymentConfirm === 'card' ? 'Confirme somente depois que a maquininha mostrar que o pagamento foi aprovado.' : 'Ao confirmar, a venda será registrada e os produtos serão baixados do estoque.'}</p>
            <div className={styles.actions}>
              <button className={styles.secondary} disabled={saleBusy} onClick={() => setPaymentConfirm(null)}>Voltar</button>
              <button className={styles.primary} disabled={saleBusy} onClick={() => finishSale(paymentConfirm)}><Check />{saleBusy ? 'REGISTRANDO…' : paymentConfirm === 'card' ? 'PAGAMENTO APROVADO' : 'CONFIRMAR RECEBIMENTO'}</button>
            </div>
          </div>
        </div>
      )}

      {pixCharge && (
        <div className={styles.deleteOverlay} role="presentation" onClick={() => { if (!saleBusy) { setPixCharge(null); setCopied(false) } }}>
          <div className={styles.deleteDialog} role="dialog" aria-modal="true" aria-label="Cobrança Pix" onClick={(event) => event.stopPropagation()}>
            <span className={styles.eyebrow}>Cobrança Pix</span>
            <h2>Receber {money(pixCharge.amountCents)}</h2>
            <p>Peça ao cliente para escanear o QR Code. O valor já vai preenchido no aplicativo do banco.</p>
            <div style={{ display: 'grid', placeItems: 'center', margin: '18px 0' }}>
              <img src={pixCharge.qrDataUrl} alt={`QR Code Pix de ${money(pixCharge.amountCents)}`} style={{ width: 'min(320px, 100%)', height: 'auto', borderRadius: 12, background: 'white' }} />
            </div>
            <label className={styles.fieldLabel}>Pix Copia e Cola
              <textarea readOnly value={pixCharge.payload} onFocus={(event) => event.currentTarget.select()} style={{ width: '100%', minHeight: 94, boxSizing: 'border-box', resize: 'vertical', border: '1px solid #c8d1ca', borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.4 }} />
            </label>
            <div className={styles.actions} style={{ marginTop: 16 }}>
              <button className={styles.secondary} disabled={saleBusy} onClick={() => void copyPix()}>{copied ? 'Código copiado' : 'Copiar código Pix'}</button>
              <button className={styles.primary} disabled={saleBusy} onClick={confirmPixPayment}><Check />{saleBusy ? 'REGISTRANDO…' : 'PAGAMENTO RECEBIDO'}</button>
              <button className={styles.secondary} disabled={saleBusy} onClick={() => { setPixCharge(null); setCopied(false) }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
'''
source = source[:start] + new_component + source[end:]
inventory_path.write_text(source, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
marker = '/* checkout-payment-selector-v1 */'
if marker not in css:
    css += r'''

/* checkout-payment-selector-v1 */
.paymentChoices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 20px 0 6px;
}

.paymentChoice {
  min-height: 112px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 7px;
  padding: 18px;
  border: 1px solid #d9e1dc;
  border-radius: 16px;
  background: #fff;
  color: #153428;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s ease, transform .15s ease, box-shadow .15s ease;
}

.paymentChoice:hover:not(:disabled),
.paymentChoice:focus-visible {
  border-color: #17834f;
  box-shadow: 0 8px 24px rgba(19, 74, 50, .10);
  transform: translateY(-1px);
  outline: none;
}

.paymentChoice strong {
  font-size: 18px;
}

.paymentChoice span {
  color: #66756d;
  font-size: 13px;
  line-height: 1.35;
}

.paymentChoice:disabled {
  cursor: not-allowed;
  opacity: .55;
}

@media (max-width: 700px) {
  .paymentChoices {
    grid-template-columns: 1fr;
  }

  .paymentChoice {
    min-height: 86px;
  }
}
'''
    css_path.write_text(css, encoding='utf-8')
