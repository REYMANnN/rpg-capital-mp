'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import type { Terminal, Product, Contact, Transaction } from '@/lib/types'

type Tab = 'financeiro' | 'terminais' | 'estoque' | 'contatos'

export default function AppDashboard() {
  const [tab, setTab] = useState<Tab>('financeiro')
  const [showProductDialog, setShowProductDialog] = useState(false)
  const [showContactDialog, setShowContactDialog] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [merchant, setMerchant] = useState<any>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  // Product form
  const [newProduct, setNewProduct] = useState({ name: '', price: '', barcode: '', stock_quantity: '', stock_alert_threshold: '5' })
  const [productLoading, setProductLoading] = useState(false)

  // Contact form
  const [newContact, setNewContact] = useState({ name: '', pix_key: '', contact_type: 'other' as 'employee' | 'supplier' | 'other' })
  const [contactLoading, setContactLoading] = useState(false)

  const supabase = createClient()

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { window.location.href = '/cadastro'; return }
      setUser(u)

      const token = await getToken()

      // Load merchant
      const { data: m } = await supabase
        .from('merchants')
        .select('*')
        .eq('user_id', u.id)
        .single()
      setMerchant(m)

      if (m) {
        // Load transactions
        const { data: txs } = await supabase
          .from('transactions')
          .select('*')
          .eq('merchant_id', m.id)
          .order('created_at', { ascending: false })
          .limit(20)
        setTransactions((txs as any) || [])

        // Load terminals
        const { data: terms } = await supabase
          .from('terminals')
          .select('*')
          .eq('merchant_id', m.id)
          .order('created_at', { ascending: false })
        setTerminals((terms as any) || [])

        // Load products
        const { data: prods } = await supabase
          .from('products')
          .select('*')
          .eq('merchant_id', m.id)
          .order('name')
        setProducts((prods as any) || [])

        // Load contacts
        const { data: conts } = await supabase
          .from('contacts')
          .select('*')
          .eq('merchant_id', m.id)
          .order('name')
        setContacts((conts as any) || [])
      }

      // Load balance
      fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setBalance(d.balance))
        .catch(() => setBalance(0))

      setLoading(false)
    }
    init()
  }, [supabase, getToken])

  // Real-time terminal status
  useEffect(() => {
    if (!merchant) return
    const channel = supabase
      .channel('terminals')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'terminals', filter: `merchant_id=eq.${merchant.id}` },
        (payload) => {
          setTerminals(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as Terminal : t))
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, merchant])

  const handleAddProduct = async () => {
    if (!merchant || !newProduct.name || !newProduct.price) return
    setProductLoading(true)
    try {
      const { data, error } = await supabase.from('products').insert({
        merchant_id: merchant.id,
        name: newProduct.name,
        price: parseFloat(newProduct.price),
        barcode: newProduct.barcode || null,
        stock_quantity: parseInt(newProduct.stock_quantity) || 0,
        stock_alert_threshold: parseInt(newProduct.stock_alert_threshold) || 5,
      }).select().single()
      if (error) throw error
      setProducts(prev => [...prev, data as Product])
      setNewProduct({ name: '', price: '', barcode: '', stock_quantity: '', stock_alert_threshold: '5' })
    } finally {
      setProductLoading(false)
    }
  }

  const handleAddContact = async () => {
    if (!merchant || !newContact.name || !newContact.pix_key) return
    setContactLoading(true)
    try {
      const { data, error } = await supabase.from('contacts').insert({
        merchant_id: merchant.id,
        name: newContact.name,
        pix_key: newContact.pix_key,
        contact_type: newContact.contact_type,
      }).select().single()
      if (error) throw error
      setContacts(prev => [...prev, data as Contact])
      setNewContact({ name: '', pix_key: '', contact_type: 'other' })
    } finally {
      setContactLoading(false)
    }
  }

  const getTerminalStatus = (t: Terminal) => {
    if (!t.last_heartbeat_at) return 'offline'
    const diff = Date.now() - new Date(t.last_heartbeat_at).getTime()
    if (diff < 30000) return 'online'
    if (diff < 120000) return 'away'
    return 'offline'
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <header className="bg-[#0057d2] px-4 py-4">
        <div className="flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-white/70 text-xs">{merchant?.business_name || 'Lojista'}</p>
              <p className="text-white font-bold text-sm">
                {balance === null ? '...' : formatCurrency(balance)}
              </p>
            </div>
            <button onClick={handleLogout} className="text-white/70 hover:text-white text-xs">
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b overflow-x-auto">
        <div className="flex min-w-max">
          {([
            { id: 'financeiro', label: 'Financeiro' },
            { id: 'terminais', label: 'Terminais' },
            { id: 'estoque', label: 'Estoque' },
            { id: 'contatos', label: 'Contatos' },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'text-[#0057d2] border-b-2 border-[#0057d2]' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-4 space-y-4">
        {/* FINANCEIRO */}
        {tab === 'financeiro' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-slate-500">Saldo disponível</p>
                  <p className="text-xl font-black text-[#0057d2]">
                    {balance === null ? '...' : formatCurrency(balance)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-xs text-slate-500">Transações hoje</p>
                  <p className="text-xl font-black text-slate-800">
                    {transactions.filter(t => new Date(t.created_at).toDateString() === new Date().toDateString()).length}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">Transações recentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {transactions.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">Nenhuma transação</p>
                ) : (
                  transactions.slice(0, 10).map(tx => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="text-sm font-medium">Pagamento recebido</p>
                        <p className="text-xs text-slate-500">
                          {new Date(tx.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">+{formatCurrency(tx.net_amount)}</p>
                        <Badge
                          variant="secondary"
                          className={`text-xs ${tx.status === 'completed' ? 'bg-green-100 text-green-700' : ''}`}
                        >
                          {tx.status === 'completed' ? 'Aprovado' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* TERMINAIS */}
        {tab === 'terminais' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Terminais ({terminals.length})</h2>
              <a href="/t" target="_blank" className="text-xs text-[#0057d2] underline">
                Abrir maquininha →
              </a>
            </div>
            {terminals.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-slate-500 text-sm mb-2">Nenhum terminal vinculado</p>
                  <p className="text-xs text-slate-400">Acesse /t em qualquer dispositivo para vincular</p>
                </CardContent>
              </Card>
            ) : (
              terminals.map(t => {
                const status = getTerminalStatus(t)
                return (
                  <Card key={t.id}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-slate-500 font-mono">{t.device_id.slice(0, 20)}...</p>
                        {t.last_heartbeat_at && (
                          <p className="text-xs text-slate-400">
                            Último sinal: {new Date(t.last_heartbeat_at).toLocaleTimeString('pt-BR')}
                          </p>
                        )}
                      </div>
                      <Badge
                        className={`${
                          status === 'online' ? 'bg-green-100 text-green-700' :
                          status === 'away' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}
                        variant="secondary"
                      >
                        {status === 'online' ? 'Online' : status === 'away' ? 'Ausente' : 'Offline'}
                      </Badge>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {/* ESTOQUE */}
        {tab === 'estoque' && (
          <div className="space-y-3">
            <Button className="w-full bg-[#0057d2] text-white" onClick={() => setShowProductDialog(true)}>
              + Adicionar produto
            </Button>
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo produto</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome</Label>
                    <Input placeholder="Nome do produto" value={newProduct.name} onChange={e => setNewProduct(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Preço (R$)</Label>
                    <Input type="number" placeholder="0,00" value={newProduct.price} onChange={e => setNewProduct(p => ({ ...p, price: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Código de barras</Label>
                    <Input placeholder="EAN-13" value={newProduct.barcode} onChange={e => setNewProduct(p => ({ ...p, barcode: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Estoque</Label>
                      <Input type="number" placeholder="0" value={newProduct.stock_quantity} onChange={e => setNewProduct(p => ({ ...p, stock_quantity: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Alerta</Label>
                      <Input type="number" placeholder="5" value={newProduct.stock_alert_threshold} onChange={e => setNewProduct(p => ({ ...p, stock_alert_threshold: e.target.value }))} />
                    </div>
                  </div>
                  <Button className="w-full bg-[#0057d2] text-white" onClick={handleAddProduct} disabled={productLoading}>
                    {productLoading ? 'Salvando...' : 'Salvar produto'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {products.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-slate-500 text-sm">Nenhum produto cadastrado</p>
                </CardContent>
              </Card>
            ) : (
              products.map(p => (
                <Card key={p.id} className={p.stock_quantity <= p.stock_alert_threshold ? 'border-orange-300' : ''}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      {p.barcode && <p className="text-xs text-slate-400">{p.barcode}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#0057d2]">{formatCurrency(p.price)}</p>
                      <p className={`text-xs ${p.stock_quantity <= p.stock_alert_threshold ? 'text-orange-600 font-medium' : 'text-slate-500'}`}>
                        {p.stock_quantity} em estoque
                        {p.stock_quantity <= p.stock_alert_threshold && ' ⚠'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {/* CONTATOS */}
        {tab === 'contatos' && (
          <div className="space-y-3">
            <Button className="w-full bg-[#0057d2] text-white" onClick={() => setShowContactDialog(true)}>
              + Adicionar contato
            </Button>
            <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo contato Pix</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome</Label>
                    <Input placeholder="Nome do contato" value={newContact.name} onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Chave Pix</Label>
                    <Input placeholder="CPF, email, telefone..." value={newContact.pix_key} onChange={e => setNewContact(c => ({ ...c, pix_key: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Tipo de contato</Label>
                    <select
                      className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                      value={newContact.contact_type}
                      onChange={e => setNewContact(c => ({ ...c, contact_type: e.target.value as 'employee' | 'supplier' | 'other' }))}
                    >
                      <option value="employee">Funcionário</option>
                      <option value="supplier">Fornecedor</option>
                      <option value="other">Outro</option>
                    </select>
                  </div>
                  <Button className="w-full bg-[#0057d2] text-white" onClick={handleAddContact} disabled={contactLoading}>
                    {contactLoading ? 'Salvando...' : 'Salvar contato'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {contacts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-slate-500 text-sm">Nenhum contato cadastrado</p>
                </CardContent>
              </Card>
            ) : (
              contacts.map(c => (
                <Card key={c.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.pix_key} · {{ employee: 'Funcionário', supplier: 'Fornecedor', other: 'Outro' }[c.contact_type] || c.contact_type}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-[#ffde00] hover:bg-yellow-300 text-black text-xs font-bold"
                    >
                      Pagar
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
