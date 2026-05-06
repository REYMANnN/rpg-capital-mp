'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Logo } from '@/components/logo'
import { formatCurrency } from '@/lib/utils'

interface CartItem {
  id: string
  name: string
  quantity: number
  unit_price: number
  product_id?: string
}

interface MerchantInfo {
  id: string
  business_name: string
}

export default function TerminalPage() {
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [merchant, setMerchant] = useState<MerchantInfo | null>(null)
  const [terminalId, setTerminalId] = useState<string | null>(null)
  const [showBind, setShowBind] = useState(false)
  const [bindCode, setBindCode] = useState('')
  const [bindName, setBindName] = useState('')
  const [bindLoading, setBindLoading] = useState(false)
  const [bindError, setBindError] = useState<string | null>(null)

  const [cart, setCart] = useState<CartItem[]>([])
  const [manualItem, setManualItem] = useState('')
  const [manualPrice, setManualPrice] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')

  const [showQrScanner, setShowQrScanner] = useState(false)
  const [qrInput, setQrInput] = useState('')
  const [pin, setPin] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [paySuccess, setPaySuccess] = useState<any>(null)

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Generate/load device ID
  useEffect(() => {
    let id = localStorage.getItem('rpg_device_id')
    if (!id) {
      id = `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('rpg_device_id', id)
    }
    setDeviceId(id)

    const savedMerchant = localStorage.getItem('rpg_merchant')
    const savedTerminalId = localStorage.getItem('rpg_terminal_id')
    if (savedMerchant) {
      setMerchant(JSON.parse(savedMerchant))
      setTerminalId(savedTerminalId)
    } else {
      setShowBind(true)
    }
  }, [])

  // Heartbeat
  const sendHeartbeat = useCallback(async (id: string) => {
    try {
      await fetch('/api/terminal/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: id }),
      })
    } catch {}
  }, [])

  useEffect(() => {
    if (!deviceId || !merchant) return
    sendHeartbeat(deviceId)
    heartbeatRef.current = setInterval(() => sendHeartbeat(deviceId), 15000)
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current) }
  }, [deviceId, merchant, sendHeartbeat])

  const handleBind = async () => {
    if (!deviceId || !bindCode) return
    setBindLoading(true)
    setBindError(null)
    try {
      const res = await fetch('/api/terminal/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          merchant_code: bindCode,
          terminal_name: bindName || 'Terminal',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      localStorage.setItem('rpg_merchant', JSON.stringify(data.merchant))
      localStorage.setItem('rpg_terminal_id', data.terminal_id || '')
      setMerchant(data.merchant)
      setTerminalId(data.terminal_id || null)
      setShowBind(false)
    } catch (e: any) {
      setBindError(e.message)
    } finally {
      setBindLoading(false)
    }
  }

  const addManualItem = () => {
    if (!manualItem || !manualPrice) return
    const price = parseFloat(manualPrice)
    if (isNaN(price) || price <= 0) return
    setCart(prev => [...prev, {
      id: Date.now().toString(),
      name: manualItem,
      quantity: 1,
      unit_price: price,
    }])
    setManualItem('')
    setManualPrice('')
  }

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i).filter(i => i.quantity > 0))
  }

  const removeItem = (id: string) => setCart(prev => prev.filter(i => i.id !== id))

  const total = cart.reduce((sum, i) => sum + i.unit_price * i.quantity, 0)

  const handlePay = async () => {
    if (!merchant || cart.length === 0 || !qrInput || pin.length !== 4) return
    setPayLoading(true)
    setPayError(null)
    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer terminal' },
        body: JSON.stringify({
          qr_token: qrInput,
          merchant_id: merchant.id,
          terminal_id: terminalId,
          amount: total,
          items: cart.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            product_id: i.product_id || null,
          })),
          pin,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPaySuccess(data.receipt)
      setCart([])
      setQrInput('')
      setPin('')
    } catch (e: any) {
      setPayError(e.message)
    } finally {
      setPayLoading(false)
      setShowQrScanner(false)
    }
  }

  // Bind modal
  if (showBind) {
    return (
      <div className="min-h-screen bg-[#0057d2] flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="mb-2">
              <Logo size="sm" />
            </div>
            <CardTitle className="text-xl text-[#0057d2]">Vincular Terminal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Código do Lojista</Label>
              <Input
                type="password"
                placeholder="Senha do terminal"
                value={bindCode}
                onChange={e => setBindCode(e.target.value)}
              />
            </div>
            <div>
              <Label>Nome do Terminal (opcional)</Label>
              <Input
                placeholder="Ex: Caixa 1"
                value={bindName}
                onChange={e => setBindName(e.target.value)}
              />
            </div>
            {bindError && (
              <p className="text-red-600 text-sm bg-red-50 p-2 rounded">{bindError}</p>
            )}
            <Button
              className="w-full bg-[#ffde00] hover:bg-yellow-300 text-black font-bold"
              onClick={handleBind}
              disabled={bindLoading || !bindCode}
            >
              {bindLoading ? 'Vinculando...' : 'Vincular'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Payment success
  if (paySuccess) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-sm w-full">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto">
            <span className="text-white text-4xl">✓</span>
          </div>
          <h2 className="text-2xl font-black text-green-700">Pagamento aprovado!</h2>
          <Card>
            <CardContent className="py-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Lojista</span>
                <span className="font-medium">{paySuccess.merchant}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-bold text-lg">{formatCurrency(paySuccess.amount)}</span>
              </div>
              {paySuccess.fee > 0 && (
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Taxa RPG</span>
                  <span>{formatCurrency(paySuccess.fee)}</span>
                </div>
              )}
            </CardContent>
          </Card>
          <Button
            className="w-full bg-[#0057d2] text-white font-bold"
            onClick={() => setPaySuccess(null)}
          >
            Nova cobrança
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
      {/* Terminal header */}
      <header className="bg-[#0057d2] px-4 py-3">
        <div className="flex items-center justify-between">
          <Logo size="sm" />
          <div className="text-right">
            <p className="text-white text-xs font-medium">{merchant?.business_name}</p>
            <Badge variant="secondary" className="text-xs bg-green-400/20 text-green-200 border-green-400/30">
              Online
            </Badge>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* Add items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Adicionar item</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input placeholder="Nome do item" value={manualItem} onChange={e => setManualItem(e.target.value)} />
              </div>
              <div className="w-28">
                <Input
                  type="number"
                  placeholder="R$ 0,00"
                  value={manualPrice}
                  onChange={e => setManualPrice(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <Button
                className="bg-[#0057d2] text-white px-3"
                onClick={addManualItem}
                disabled={!manualItem || !manualPrice}
              >
                +
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Código de barras"
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && barcodeInput) {
                    setCart(prev => [...prev, {
                      id: Date.now().toString(),
                      name: `Produto #${barcodeInput}`,
                      quantity: 1,
                      unit_price: 0,
                    }])
                    setBarcodeInput('')
                  }
                }}
              />
              <Button variant="outline" className="border-[#0057d2] text-[#0057d2]">
                Buscar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cart */}
        {cart.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Itens ({cart.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2 py-1">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-slate-500">{formatCurrency(item.unit_price)} un.</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="w-6 h-6 rounded-full bg-slate-200 text-sm flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="w-6 h-6 rounded-full bg-slate-200 text-sm flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <p className="w-20 text-right text-sm font-bold">
                    {formatCurrency(item.unit_price * item.quantity)}
                  </p>
                  <button onClick={() => removeItem(item.id)} className="text-red-400 text-xs">✕</button>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between items-center pt-1">
                <span className="font-bold text-lg">Total</span>
                <span className="font-black text-xl text-[#0057d2]">{formatCurrency(total)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Charge button */}
        <Button
          className="w-full bg-[#ffde00] hover:bg-yellow-300 text-black font-black text-xl py-6 rounded-2xl shadow-lg"
          disabled={cart.length === 0}
          onClick={() => setShowQrScanner(true)}
        >
          Cobrar {formatCurrency(total)}
        </Button>
      </main>

      {/* QR Scanner Modal */}
      <Dialog open={showQrScanner} onOpenChange={setShowQrScanner}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[#0057d2]">Escanear QR do cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Peça ao cliente para mostrar o QR Code do aplicativo, ou insira o código manualmente.
            </p>
            <div>
              <Label>Código QR</Label>
              <Input
                placeholder="Cole o código QR aqui"
                value={qrInput}
                onChange={e => setQrInput(e.target.value)}
              />
            </div>
            <div>
              <Label>PIN do cliente (4 dígitos)</Label>
              <Input
                type="password"
                placeholder="••••"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
            </div>
            {payError && (
              <p className="text-red-600 text-sm bg-red-50 p-2 rounded">{payError}</p>
            )}
            <Button
              className="w-full bg-[#0057d2] text-white font-bold"
              onClick={handlePay}
              disabled={payLoading || !qrInput || pin.length !== 4}
            >
              {payLoading ? 'Processando...' : `Confirmar ${formatCurrency(total)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
