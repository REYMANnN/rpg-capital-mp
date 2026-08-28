from pathlib import Path
import re

path = Path('app/inventory-v1/InventoryV1.tsx')
text = path.read_text(encoding='utf-8')

if "import InvoiceIntakeV10 from './InvoiceIntakeV10'" not in text:
    text = text.replace(
        "import QuaggaScanner from './QuaggaScanner'\n",
        "import QuaggaScanner from './QuaggaScanner'\nimport InvoiceIntakeV10 from './InvoiceIntakeV10'\nimport type { InvoiceReviewLineV10 } from '@/lib/inventory/invoiceReview'\n",
    )

old_movement = """type Movement = {
  id: string
  productId: string
  type: 'initial' | 'purchase' | 'sale' | 'adjustment'
  quantityMilli: number
  createdAt: string
  note: string
}"""
new_movement = """type Movement = {
  id: string
  productId: string
  type: 'initial' | 'purchase' | 'sale' | 'adjustment'
  quantityMilli: number
  createdAt: string
  note: string
  supplierDocument?: string
  supplierName?: string
  invoiceKey?: string
  invoiceNumber?: string
}"""
if old_movement in text:
    text = text.replace(old_movement, new_movement, 1)

if 'function confirmInvoiceV10(' not in text:
    anchor = "  async function handleCode(raw: string) {"
    if anchor not in text:
        raise SystemExit('handleCode anchor missing')
    fn = r'''  function confirmInvoiceV10(invoice: ParsedNfe, importable: InvoiceReviewLineV10[]) {
    if (!importable.length) return fail('Selecione ao menos um item identificado para importar.')
    const marker = invoiceMarker(invoice)
    if (data.movements.some((movement) => movement.type === 'purchase' && (movement.invoiceKey === invoice.accessKey || movement.note.includes(marker)))) {
      return fail('Esta NF-e já foi importada.')
    }

    setData((current) => {
      let products = current.products.map((product) => ({ ...product }))
      const movements = [...current.movements]
      const now = new Date().toISOString()

      for (const line of importable) {
        let product = products.find((candidate) => candidate.barcode === line.barcode)
        if (!product) {
          product = {
            id: uid(), barcode: line.barcode, name: line.name || line.description, unit: 'UN',
            priceCents: 0, stockMilli: 0, minStockMilli: 0, averageCostCents: 0,
            catalogSource: line.source || undefined, catalogBrand: line.brand || undefined,
            catalogImageUrl: line.imageUrl || undefined,
          }
          products.push(product)
        }

        const update = calculatePurchaseUpdate(product.stockMilli, product.averageCostCents, line.quantityMilli, line.unitCostCents)
        products = products.map((candidate) => candidate.id === product!.id ? { ...candidate, ...update } : candidate)
        movements.push({
          id: uid(), productId: product.id, type: 'purchase', quantityMilli: line.quantityMilli,
          createdAt: now,
          note: `${marker} · NF ${invoice.number || 's/n'} · ${invoice.supplierName || 'Fornecedor'}`,
          supplierDocument: invoice.supplierDocument || undefined,
          supplierName: invoice.supplierName || undefined,
          invoiceKey: invoice.accessKey || undefined,
          invoiceNumber: invoice.number || undefined,
        })
      }
      return { ...current, products, movements }
    })
    flash(`${importable.length} item(ns) confirmados e adicionados ao estoque. Produtos novos ficaram com preço de venda pendente.`)
  }

'''
    text = text.replace(anchor, fn + anchor, 1)

if '<InvoiceIntakeV10 products={data.products}' not in text:
    pattern = re.compile(r"\{tab === 'intake' && \(\n\s*<Intake[\s\S]*?\n\s*/>\n\s*\)\}", re.M)
    replacement = """{tab === 'intake' && (
          <InvoiceIntakeV10
            products={data.products}
            onCommit={confirmInvoiceV10}
            fail={fail}
            flash={flash}
          />
        )}"""
    text, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise SystemExit(f'intake replacement count={count}')

text = text.replace(
    'Versão {INVENTORY_APP_VERSION}. Scan unitário para cadastro/edição e NF-e XML para entrada em massa.',
    'Versão {INVENTORY_APP_VERSION}. Scan unitário para produtos e scan de chave NF-e com revisão inteligente para compras.',
)

required = ['InvoiceIntakeV10', 'confirmInvoiceV10', 'invoiceKey?: string', 'onCommit={confirmInvoiceV10}']
for needle in required:
    if needle not in text:
        raise SystemExit(f'missing wiring: {needle}')
path.write_text(text, encoding='utf-8')

# Focused behavioral fixes in the v10 intake component.
intake_path = Path('app/inventory-v1/InvoiceIntakeV10.tsx')
intake = intake_path.read_text(encoding='utf-8')

intake = intake.replace(
    "import { pickBestProductCandidate, type ProductCandidate } from '@/lib/inventory/productMatcher'",
    "import { pickBestProductCandidate, scoreProductCandidate, type ProductCandidate } from '@/lib/inventory/productMatcher'",
)

old_number = "const numberValue = (value: string) => Number(value.replace(/\\./g, '').replace(',', '.'))"
new_number = """const numberValue = (value: string) => {
  const raw = value.trim().replace(/\\s+/g, '')
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\\./g, '').replace(',', '.'))
  if (raw.includes(',')) return Number(raw.replace(',', '.'))
  return Number(raw)
}"""
if old_number in intake:
    intake = intake.replace(old_number, new_number, 1)

old_resolve = """  async function resolveWithBarcode(line: InvoiceReviewLineV10, rawBarcode: string) {
    const barcode = String(rawBarcode).replace(/\\D+/g, '')
    if (!/^\\d{8,14}$/.test(barcode)) return fail('EAN inválido.')
    const product = await productByBarcode(barcode, products)
    finishQuestion(line, { ...product, barcode, resolution: 'manual', selected: true })
  }
"""
new_resolve = """  async function resolveWithBarcode(line: InvoiceReviewLineV10, rawBarcode: string) {
    const barcode = String(rawBarcode).replace(/\\D+/g, '')
    if (!/^\\d{8,14}$/.test(barcode)) return fail('EAN inválido.')
    setScanner(null)
    const product = await productByBarcode(barcode, products)
    finishQuestion(line, { ...product, barcode, resolution: 'manual', selected: true })
  }

  async function updateEditedWithBarcode(line: InvoiceReviewLineV10, rawBarcode: string) {
    const barcode = String(rawBarcode).replace(/\\D+/g, '')
    if (!/^\\d{8,14}$/.test(barcode)) return fail('EAN inválido.')
    setScanner(null)
    const product = await productByBarcode(barcode, products)
    const next = editInvoiceReviewLine(line, { ...product, barcode, resolution: 'manual', confirmed: true, selected: true })
    setLines((current) => current.map((item) => item.line === line.line ? next : item))
    void saveAlias(next)
  }
"""
if old_resolve in intake:
    intake = intake.replace(old_resolve, new_resolve, 1)

old_search = """      const result = await response.json()
      setSearchResults(Array.isArray(result?.items) ? result.items : [])
    } finally { setSearching(false) }
"""
new_search = """      const result = await response.json()
      const remote: ProductCandidate[] = Array.isArray(result?.items) ? result.items : []
      const local = products
        .map((product) => ({
          candidate: { barcode: product.barcode, name: product.name, brand: product.catalogBrand || '', imageUrl: product.catalogImageUrl || '', source: 'Inventário' },
          score: scoreProductCandidate(query, product.name),
        }))
        .filter((item) => item.score >= 0.2)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.candidate)
      const merged = new Map<string, ProductCandidate>()
      for (const candidate of [...local, ...remote]) if (candidate.barcode) merged.set(candidate.barcode, candidate)
      setSearchResults([...merged.values()].slice(0, 24))
    } finally { setSearching(false) }
"""
if old_search in intake:
    intake = intake.replace(old_search, new_search, 1)

old_handler = "scanner === 'invoice' ? void scanInvoiceKey(code) : currentQuestion ? void resolveWithBarcode(currentQuestion, code) : editLine ? void resolveWithBarcode(editLine, code) : setScanner(null)"
new_handler = "scanner === 'invoice' ? void scanInvoiceKey(code) : currentQuestion ? void resolveWithBarcode(currentQuestion, code) : editLine ? void updateEditedWithBarcode(editLine, code) : setScanner(null)"
if old_handler in intake:
    intake = intake.replace(old_handler, new_handler, 1)

for needle in ['updateEditedWithBarcode', 'scoreProductCandidate', "setScanner(null)\n    const product = await productByBarcode"]:
    if needle not in intake:
        raise SystemExit(f'missing intake fix: {needle}')
intake_path.write_text(intake, encoding='utf-8')
print('Inventory v10 wiring and intake fixes applied')
