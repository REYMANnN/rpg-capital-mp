export type StaffRole = 'stock' | 'cashier' | 'manager' | 'custom'

export type Permission =
  | 'inventory.view'
  | 'inventory.write'
  | 'products.lookup'
  | 'products.manage'
  | 'checkout.sell'
  | 'sales.view'
  | 'analysis.financial'
  | 'team.manage'
  | 'devices.manage'
  | 'stores.manage'
  | 'integrations.manage'
  | 'settings.manage'

export type PermissionSet = ReadonlySet<Permission>

const ROLE_PERMISSIONS: Record<Exclude<StaffRole, 'custom'>, readonly Permission[]> = {
  stock: ['inventory.view', 'inventory.write', 'products.lookup', 'products.manage'],
  cashier: ['inventory.view', 'products.lookup', 'checkout.sell', 'sales.view'],
  manager: [
    'inventory.view',
    'inventory.write',
    'products.lookup',
    'products.manage',
    'checkout.sell',
    'sales.view',
    'analysis.financial',
    'team.manage',
    'devices.manage',
    'stores.manage',
    'integrations.manage',
    'settings.manage',
  ],
}

export function permissionsForRole(role: StaffRole, custom: readonly Permission[] = []): PermissionSet {
  return new Set(role === 'custom' ? custom : ROLE_PERMISSIONS[role])
}

export function can(permissions: PermissionSet, permission: Permission): boolean {
  return permissions.has(permission)
}

export function nextPinLock(failedAttempts: number, nowMs = Date.now()): { lockedUntil: number; level: number } | null {
  if (failedAttempts < 5) return null
  const level = Math.max(1, Math.floor(failedAttempts / 5))
  const durations = [30_000, 120_000, 300_000, 900_000, 3_600_000]
  const duration = durations[Math.min(level - 1, durations.length - 1)]
  return { lockedUntil: nowMs + duration, level }
}

export function isBusinessManagementRole(role: string | null | undefined): role is 'owner' | 'admin' | 'manager' {
  return role === 'owner' || role === 'admin' || role === 'manager'
}
