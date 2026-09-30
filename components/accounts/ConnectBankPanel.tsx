'use client'

import { useState } from 'react'
import BankConnections from '@/app/inventory-v1/finance/BankConnections'

// /conectar-banco: a mesma janela de banco do cadastro. Quando aparece uma conexão válida,
// mostra "Pronto" e o botão de voltar para a Rafa.
export default function ConnectBankPanel({ storeId, whatsappHref }: { storeId: string; whatsappHref: string }) {
  const [count, setCount] = useState(0)

  return <>
    {count > 0 ? <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      <p className="text-lg font-bold">Pronto! A Rafa já vê seu banco.</p>
      <p className="mt-1 text-sm">Pode voltar pro WhatsApp e perguntar o saldo. Os dados podem levar alguns minutos para aparecer completos.</p>
      <a href={whatsappHref} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 font-bold text-white">Voltar pro WhatsApp</a>
    </div> : null}
    <div className="mt-6">
      <BankConnections storeId={storeId} returnTo="conectar-banco" onConnectionCountChange={setCount} />
    </div>
  </>
}
