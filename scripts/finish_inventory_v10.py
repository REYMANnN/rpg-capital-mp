from pathlib import Path

inventory = Path('app/inventory-v1/InventoryV1.tsx').read_text(encoding='utf-8')
for needle in ['InvoiceIntakeV10', 'confirmInvoiceV10', 'invoiceKey?: string', 'onCommit={confirmInvoiceV10}']:
    if needle not in inventory:
        raise SystemExit(f'v10 parent wiring missing: {needle}')

path = Path('app/inventory-v1/InvoiceIntakeV10.tsx')
text = path.read_text(encoding='utf-8')

text = text.replace(
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
if old_number in text:
    text = text.replace(old_number, new_number, 1)

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
if old_resolve in text:
    text = text.replace(old_resolve, new_resolve, 1)

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
if old_search in text:
    text = text.replace(old_search, new_search, 1)

old_handler = "scanner === 'invoice' ? void scanInvoiceKey(code) : currentQuestion ? void resolveWithBarcode(currentQuestion, code) : editLine ? void resolveWithBarcode(editLine, code) : setScanner(null)"
new_handler = "scanner === 'invoice' ? void scanInvoiceKey(code) : currentQuestion ? void resolveWithBarcode(currentQuestion, code) : editLine ? void updateEditedWithBarcode(editLine, code) : setScanner(null)"
if old_handler in text:
    text = text.replace(old_handler, new_handler, 1)

for needle in ['updateEditedWithBarcode', 'scoreProductCandidate', "setScanner(null)\n    const product = await productByBarcode"]:
    if needle not in text:
        raise SystemExit(f'missing v10 intake fix: {needle}')

path.write_text(text, encoding='utf-8')
print('Inventory v10 final UX fixes applied')
