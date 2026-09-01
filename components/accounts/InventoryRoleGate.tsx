'use client'

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LogOut, UserRound } from 'lucide-react'
import { can, permissionsForRole, type Permission, type StaffRole } from '@/lib/accounts/access'

type Role = StaffRole
type StaffIdentity = {
  id: string
  displayName: string
  role: Role
  customPermissions?: Permission[]
}

type WorkContext = {
  authorized?: boolean
  store?: { displayName?: string }
  currentStaff?: StaffIdentity | null
}

const ROLE_NAME: Record<Role, string> = {
  cashier: 'Caixa',
  stock: 'Estoque',
  manager: 'Gerente',
  custom: 'Personalizado',
}

function normalizedLabel(button: HTMLButtonElement) {
  return (button.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export default function InventoryRoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const [effectiveRole, setEffectiveRole] = useState<Role>(role)
  const [customPermissions, setCustomPermissions] = useState<Permission[]>([])
  const [currentStaff, setCurrentStaff] = useState<StaffIdentity | null>(null)
  const [storeName, setStoreName] = useState('')
  const [resolved, setResolved] = useState(false)
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true
    async function resolveOperationalIdentity() {
      try {
        const response = await fetch('/api/balcao/work/context', { cache: 'no-store' })
        const payload = await response.json().catch(() => ({})) as WorkContext
        if (!active) return
        if (response.ok && payload.authorized && payload.currentStaff) {
          setCurrentStaff(payload.currentStaff)
          setEffectiveRole(payload.currentStaff.role)
          setCustomPermissions(Array.isArray(payload.currentStaff.customPermissions) ? payload.currentStaff.customPermissions : [])
          setStoreName(payload.store?.displayName ?? '')
        } else {
          setCurrentStaff(null)
          setEffectiveRole(role)
          setCustomPermissions([])
          setStoreName('')
        }
      } catch {
        if (!active) return
        setCurrentStaff(null)
        setEffectiveRole(role)
        setCustomPermissions([])
        setStoreName('')
      } finally {
        if (active) setResolved(true)
      }
    }
    void resolveOperationalIdentity()
    return () => { active = false }
  }, [role])

  const permissions = useMemo(
    () => permissionsForRole(effectiveRole, customPermissions),
    [effectiveRole, customPermissions],
  )
  const canStock = can(permissions, 'inventory.write') || can(permissions, 'products.manage')
  const canIntake = can(permissions, 'inventory.write')
  const canCheckout = can(permissions, 'checkout.sell')
  const canSettings = can(permissions, 'settings.manage')

  useEffect(() => {
    if (!resolved || !root.current) return
    const header = root.current.querySelector('header') as HTMLElement | null
    setHeaderTarget(header)

    const buttons = Array.from(root.current.querySelectorAll('nav button')) as HTMLButtonElement[]
    let firstAllowed: HTMLButtonElement | null = null
    let activeAllowed = false

    for (const button of buttons) {
      const label = normalizedLabel(button)
      const allowed = label.includes('estoque') ? canStock
        : label.includes('entrada') ? canIntake
          : label.includes('caixa') ? canCheckout
            : label.includes('ajustes') ? canSettings
              : true

      button.style.display = allowed ? '' : 'none'
      button.setAttribute('aria-hidden', allowed ? 'false' : 'true')
      if (allowed && !firstAllowed) firstAllowed = button
      if (allowed && button.className.includes('active')) activeAllowed = true
    }

    if (!activeAllowed) firstAllowed?.click()
  }, [resolved, canStock, canIntake, canCheckout, canSettings])

  async function switchStaff() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await fetch('/api/balcao/staff/logout', { method: 'POST' })
    } finally {
      window.location.assign('/work')
    }
  }

  const profile = resolved && currentStaff && headerTarget ? createPortal(
    <div className="relative ml-2 flex items-center font-sans">
      <button
        type="button"
        aria-label="Perfil do usuário"
        aria-expanded={profileOpen}
        onClick={() => setProfileOpen((open) => !open)}
        className="flex min-h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-sm font-bold text-white transition hover:bg-white/15"
      >
        <UserRound className="h-4 w-4" />
        <span className="hidden max-w-32 truncate sm:inline">{currentStaff.displayName}</span>
      </button>
      {profileOpen ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl">
          <div className="px-2 py-2">
            <p className="truncate text-sm font-bold">{currentStaff.displayName}</p>
            <p className="mt-1 text-xs text-slate-500">{ROLE_NAME[currentStaff.role]}{storeName ? ` · ${storeName}` : ''}</p>
          </div>
          <button
            type="button"
            disabled={loggingOut}
            onClick={switchStaff}
            className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl bg-slate-100 px-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-200 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? 'Saindo…' : 'Trocar funcionário'}
          </button>
        </div>
      ) : null}
    </div>,
    headerTarget,
  ) : null

  return (
    <div ref={root} data-balcao-role={effectiveRole} data-balcao-access-resolved={resolved ? 'true' : 'false'}>
      {children}
      {profile}
      {!resolved ? <style jsx global>{`[data-balcao-access-resolved='false'] nav { visibility: hidden; }`}</style> : null}
    </div>
  )
}
