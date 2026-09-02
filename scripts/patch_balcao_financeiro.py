from pathlib import Path

path = Path('app/inventory-v1/InventoryV1.tsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "  ShoppingCart,\n  Trash2,",
        "  ShoppingCart,\n  WalletCards,\n  Trash2,",
    ),
    (
        "import InvoiceIntakeV10 from './InvoiceIntakeV10'\n",
        "import InvoiceIntakeV10 from './InvoiceIntakeV10'\nimport FinanceDashboard from './FinanceDashboard'\n",
    ),
    (
        "const [tab, setTab] = useState<'stock' | 'intake' | 'checkout' | 'settings'>('stock')",
        "const [tab, setTab] = useState<'stock' | 'intake' | 'checkout' | 'finance' | 'settings'>('stock')",
    ),
    (
        "        <button className={tab === 'checkout' ? styles.active : ''} onClick={() => setTab('checkout')}><ShoppingCart />Caixa</button>\n        <button className={tab === 'settings' ? styles.active : ''} onClick={() => setTab('settings')}><Settings />Ajustes</button>",
        "        <button className={tab === 'checkout' ? styles.active : ''} onClick={() => setTab('checkout')}><ShoppingCart />Caixa</button>\n        <button className={tab === 'finance' ? styles.active : ''} onClick={() => setTab('finance')}><WalletCards />Financeiro</button>\n        <button className={tab === 'settings' ? styles.active : ''} onClick={() => setTab('settings')}><Settings />Ajustes</button>",
    ),
    (
        "        {tab === 'settings' && (\n          <SettingsView",
        "        {tab === 'finance' && <FinanceDashboard />}\n\n        {tab === 'settings' && (\n          <SettingsView",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f'Expected InventoryV1 fragment not found: {old[:100]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
