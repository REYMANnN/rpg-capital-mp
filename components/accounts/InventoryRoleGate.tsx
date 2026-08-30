'use client'

import { ReactNode, useEffect, useRef } from 'react'

type Role = 'cashier' | 'stock' | 'manager' | 'custom'

export default function InventoryRoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const buttons = root.current?.querySelectorAll('nav button')
    if (!buttons?.length) return
    if (role === 'cashier') (buttons[2] as HTMLButtonElement | undefined)?.click()
    if (role === 'stock') (buttons[0] as HTMLButtonElement | undefined)?.click()
  }, [role])

  return <div ref={root} data-balcao-role={role}>
    {children}
    <style jsx global>{`
      [data-balcao-role='cashier'] nav button:nth-child(1),
      [data-balcao-role='cashier'] nav button:nth-child(2),
      [data-balcao-role='cashier'] nav button:nth-child(4) { display: none !important; }
      [data-balcao-role='stock'] nav button:nth-child(3),
      [data-balcao-role='stock'] nav button:nth-child(4) { display: none !important; }
    `}</style>
  </div>
}
