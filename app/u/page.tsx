'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/logo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/lib/types'
import QRCode from 'qrcode'

type Tab = 'card' | 'history' | 'send'

export default function UFrontend() {
  const [tab, setTab] = useState<Tab>('card')
  const [user, setUser] = useState<any>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrExpiry, setQrExpiry] = useState<Date | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [qrLoading, setQrLoading] = useState(false)
  const [pin, setPin] = useState('')
  const [pixKey, setPixKey] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [sendLoading, setSendLoading] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)

  const supabase = createClient()

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token
  }, [supabase])

  const generateCard = useCallback(async () => {
    setQrLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/virtual-card', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.qr_token) {
        const dataUrl = await QRCode.toDataURL(data.qr_token, {
          width: 280,
          margin: 2,
          color: { dark: '#0057d2', light: '#ffffff' },
        })
        setQrDataUrl(dataUrl)
        const expiry = new Date(data.expires_at)
        setQrExpiry(expiry)
        setCountdown(Math.floor((expiry.getTime() - Date.now()) / 1000))
      }
    } finally {
      setQrLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { window.location.href = '/cadastro'; return }
      setUser(u)

      const token = await getToken()

      // Load balance
      fetch('/api/user/balance', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setBalance(d.balance))
        .catch(() => setBalance(0))

      // Load transactions
      const { data: txs } = await supabase
        .from('transactions')
        .select('*, merchants(business_name)')
        .eq('payer_user_id', u.id)
        .order('created_at', { ascending: false })
        .limit(20)
      setTransactions((txs as any) || [])
      setLoading(false)
    }
    init()
  }, [supabase, getToken])

  useEffect(() => {
    if (tab === 'card') generateCard()
  }, [tab, generateCard])

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { generateCard(); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [countdown, generateCard])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <Skeleton className="h-16 w-full mb-4 rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="bg-[#0057d2] px-4 py-4 flex items-center justify-between">
        <Logo size="sm" />
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-white/70 text-xs">Saldo</p>
            <p className="text-white font-bold text-sm">
              {balance === null ? '...' : formatCurrency(balance)}
            </p>
          </div>
          <button onClick={handleLogout} className="text-white/70 hover:text-white text-xs">
            Sair
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b flex">
        {([
          { id: 'card', label: 'Meu QR' },
          { id: 'history', label: 'Histórico' },
          { id: 'send', label: 'Enviar Pix' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'text-[#0057d2] border-b-2 border-[#0057d2]'
                : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 p-4 space-y-4">
        {tab === 'card' && (
          <div className="flex flex-col items-center space-y-4">
            <Card className="w-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-center text-[#0057d2]">
                  Seu Cartão Virtual
                </CardTitle>
                <p className="text-xs text-center text-slate-500">
                  Mostre este QR para pagar em qualquer terminal da rede
                </p>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                {qrLoading ? (
                  <Skeleton className="w-[280px] h-[280px] rounded-xl" />
                ) : qrDataUrl ? (
                  <>
                    <div className="p-4 bg-white rounded-2xl shadow-md border">
                      <img src={qrDataUrl} alt="QR Code" className="w-[240px] h-[240px]" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${countdown > 60 ? 'bg-green-500' : countdown > 20 ? 'bg-yellow-500' : 'bg-red-500'} animate-pulse`} />
                      <span className="text-sm text-slate-600">
                        Expira em {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-500 text-sm">Erro ao gerar QR</p>
                )}
                <Button
                  onClick={generateCard}
                  variant="outline"
                  className="w-full border-[#0057d2] text-[#0057d2]"
                  disabled={qrLoading}
                >
                  Atualizar QR Code
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            <h2 className="font-bold text-slate-800">Transações recentes</h2>
            {transactions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-slate-500 text-sm">Nenhuma transação ainda</p>
                </CardContent>
              </Card>
            ) : (
              transactions.map(tx => (
                <Card key={tx.id}>
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-slate-800">
                        {(tx as any).merchants?.business_name || 'Lojista'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(tx.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-600">-{formatCurrency(tx.amount)}</p>
                      <Badge
                        variant={tx.status === 'completed' ? 'default' : 'secondary'}
                        className={`text-xs ${tx.status === 'completed' ? 'bg-green-100 text-green-700' : ''}`}
                      >
                        {tx.status === 'completed' ? 'Aprovado' : tx.status === 'pending' ? 'Pendente' : tx.status === 'failed' ? 'Falhou' : 'Reembolsado'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === 'send' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-[#0057d2]">Enviar Pix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Chave Pix</Label>
                <Input
                  placeholder="CPF, email, telefone ou chave aleatória"
                  value={pixKey}
                  onChange={e => setPixKey(e.target.value)}
                />
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={sendAmount}
                  onChange={e => setSendAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                />
              </div>
              <div>
                <Label>PIN (4 dígitos)</Label>
                <Input
                  type="password"
                  placeholder="••••"
                  maxLength={4}
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                />
              </div>
              {sendError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{sendError}</p>
                </div>
              )}
              <Button
                className="w-full bg-[#0057d2] hover:bg-[#0046b0] text-white font-bold"
                disabled={sendLoading || !pixKey || !sendAmount || pin.length !== 4}
                onClick={async () => {
                  setSendLoading(true)
                  setSendError(null)
                  try {
                    const token = await getToken()
                    const res = await fetch('/api/pix/send', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ pix_key: pixKey, amount: parseFloat(sendAmount), pin }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error)
                    setPixKey('')
                    setSendAmount('')
                    setPin('')
                    alert('Pix enviado com sucesso!')
                  } catch (e: any) {
                    setSendError(e.message)
                  } finally {
                    setSendLoading(false)
                  }
                }}
              >
                {sendLoading ? 'Enviando...' : 'Enviar Pix'}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
