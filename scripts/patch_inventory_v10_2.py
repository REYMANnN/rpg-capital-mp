from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing patch target in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Version
replace_once('lib/inventory/version.ts', "export const INVENTORY_APP_VERSION = 'v10.1'", "export const INVENTORY_APP_VERSION = 'v10.2'")

# Demo invoice: remove grain/KG scenario and report v10.2
route = Path('app/api/inventory/nfe/by-key/route.ts')
text = route.read_text()
text = text.replace("    { line: 9, supplierCode: 'DECIMAL-KG', barcode: '', description: 'PRODUTO GRANEL TESTE', purchaseUnit: 'KG', quantityMilli: 1750, unitCostCents: 1200, totalCents: 2100 },\n", '')
text = text.replace("version: 'v10.1'", "version: 'v10.2'")
route.write_text(text)

# Branding in browser metadata
replace_once(
    'app/inventory-v1/page.tsx',
    "  title: 'RPG Inventário V1',\n  description: 'Inventário e checkout testável para mercadinhos',",
    "  title: 'BALCÃO',\n  description: 'Inventário, entrada de compras e checkout para mercadinhos',",
)

# BALCÃO branding + footer
replace_once(
    'app/inventory-v1/InventoryV1.tsx',
    '<div><span className={styles.brand}>RPG</span><strong>Mercadinho</strong></div>',
    '<div><span className={styles.brand}>BALCÃO</span></div>',
)
replace_once(
    'app/inventory-v1/InventoryV1.tsx',
    "      </main>\n\n      {scannerOpen && <QuaggaScanner onCode={handleCode} close={() => setScannerOpen(false)} />}",
    "      </main>\n\n      <footer className={styles.powered}>Powered by RPG System</footer>\n\n      {scannerOpen && <QuaggaScanner onCode={handleCode} close={() => setScannerOpen(false)} />}",
)

css = Path('app/inventory-v1/inventory.module.css')
css_text = css.read_text()
if '.powered{' not in css_text:
    css_text += "\n.powered{text-align:center;padding:0 16px 82px;color:#7d8881;font-size:10px;letter-spacing:.04em}.scanConfirmation{display:flex;align-items:center;gap:10px;margin:0 0 18px;padding:14px 16px;border:1px solid #bfe5cf;border-radius:12px;background:#e8f7ee;color:#146b40;font-weight:800;line-height:1.4}.scanConfirmation svg{width:20px;flex:0 0 20px}\n@media(min-width:801px){.powered{padding-bottom:24px}}\n"
css.write_text(css_text)

# Visual confirmation after scanning an EAN to resolve an unknown item
intake = Path('app/inventory-v1/InvoiceIntakeV10_1.tsx')
text = intake.read_text()
text = text.replace(
    "  const [learningWarning, setLearningWarning] = useState(false)\n",
    "  const [learningWarning, setLearningWarning] = useState(false)\n  const [scanConfirmation, setScanConfirmation] = useState('')\n",
    1,
)
text = text.replace(
    "    setLearningWarning(false)\n  }\n",
    "    setLearningWarning(false)\n    setScanConfirmation('')\n  }\n",
    1,
)
text = text.replace(
    "  async function chooseBarcode(line: InvoiceReviewLineV10, rawBarcode: string, source = 'EAN confirmado manualmente') {",
    "  async function chooseBarcode(line: InvoiceReviewLineV10, rawBarcode: string, source = 'EAN confirmado manualmente', showScanConfirmation = false) {",
    1,
)
needle = """    await applyDecision(line, {
      barcode,
      ...product,
      source,
      resolution: 'manual',
      identityStatus: 'manual',
      decisionState: requiresPackageFactor(line.purchaseUnit) ? 'needs-package-factor' : 'resolved',
      confirmed: !requiresPackageFactor(line.purchaseUnit),
      selected: true,
      conflictingAliasBarcode: undefined,
    })
"""
replacement = """    if (showScanConfirmation) {
      setScanConfirmation(`✓ Pronto! Este código será salvo como ${product.name || line.description} — EAN ${barcode}.`)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1600))
      setScanConfirmation('')
    }

    await applyDecision(line, {
      barcode,
      ...product,
      source,
      resolution: 'manual',
      identityStatus: 'manual',
      decisionState: requiresPackageFactor(line.purchaseUnit) ? 'needs-package-factor' : 'resolved',
      confirmed: !requiresPackageFactor(line.purchaseUnit),
      selected: true,
      conflictingAliasBarcode: undefined,
    })
"""
if needle not in text:
    raise SystemExit('missing chooseBarcode applyDecision block')
text = text.replace(needle, replacement, 1)
text = text.replace(
    "          </div>\n\n          {currentQuestion.decisionState === 'needs-identity' && <>",
    "          </div>\n\n          {scanConfirmation && <div className={styles.scanConfirmation}><Check /><span>{scanConfirmation}</span></div>}\n\n          {currentQuestion.decisionState === 'needs-identity' && <>",
    1,
)
text = text.replace(
    "if (scanner === 'question-item' && currentQuestion) return void chooseBarcode(currentQuestion, code, 'EAN escaneado da embalagem')",
    "if (scanner === 'question-item' && currentQuestion) return void chooseBarcode(currentQuestion, code, 'EAN escaneado da embalagem', true)",
    1,
)
intake.write_text(text)
