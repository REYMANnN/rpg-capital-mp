export type StaffRole = 'stock' | 'cashier' | 'finance' | 'it' | 'manager' | 'custom'

export type Permission =
  | 'inventory.view'
  | 'inventory.write'
  | 'products.lookup'
  | 'products.manage'
  | 'checkout.sell'
  | 'sales.view'
  | 'analysis.financial'
  | 'automations.view'
  | 'automations.manage'
  | 'integrations.view'
  | 'integrations.manage'
  | 'api_keys.manage'
  | 'webhooks.manage'
  | 'team.manage'
  | 'devices.manage'
  | 'stores.manage'
  | 'settings.manage'

export const OPERATIONAL_PERMISSIONS = [
  'inventory.view', 'inventory.write', 'products.lookup', 'products.manage',
  'checkout.sell', 'sales.view', 'analysis.financial',
  'automations.view', 'automations.manage', 'integrations.view', 'integrations.manage',
  'api_keys.manage', 'webhooks.manage',
] as const satisfies readonly Permission[]

export type OperationalPermission = typeof OPERATIONAL_PERMISSIONS[number]
export type StaffModule = 'stock' | 'checkout' | 'finance' | 'automations'
export type PermissionSet = ReadonlySet<Permission>

const MODULE_PERMISSIONS: Record<StaffModule, readonly OperationalPermission[]> = {
  stock: ['inventory.view', 'inventory.write', 'products.lookup', 'products.manage'],
  checkout: ['inventory.view', 'products.lookup', 'checkout.sell', 'sales.view'],
  finance: ['analysis.financial'],
  automations: ['automations.view', 'automations.manage', 'integrations.view', 'integrations.manage', 'api_keys.manage', 'webhooks.manage'],
}

const OPERATIONAL_PERMISSION_SET = new Set<Permission>(OPERATIONAL_PERMISSIONS)
const MANAGER_PERMISSIONS: readonly Permission[] = [...new Set<Permission>([
  ...MODULE_PERMISSIONS.stock,
  ...MODULE_PERMISSIONS.checkout,
  ...MODULE_PERMISSIONS.finance,
  ...MODULE_PERMISSIONS.automations,
  'team.manage', 'devices.manage', 'stores.manage', 'settings.manage',
])]

const ROLE_PERMISSIONS: Record<Exclude<StaffRole, 'custom'>, readonly Permission[]> = {
  stock: MODULE_PERMISSIONS.stock,
  cashier: MODULE_PERMISSIONS.checkout,
  finance: MODULE_PERMISSIONS.finance,
  it: MODULE_PERMISSIONS.automations,
  manager: MANAGER_PERMISSIONS,
}

export function permissionsForModules(modules: readonly StaffModule[]): PermissionSet {
  const permissions = new Set<Permission>()
  for (const module of modules) for (const permission of MODULE_PERMISSIONS[module] ?? []) permissions.add(permission)
  return permissions
}

export function modulesForPermissions(permissions: readonly Permission[]): StaffModule[] {
  const set = new Set<Permission>(permissions)
  return (Object.keys(MODULE_PERMISSIONS) as StaffModule[]).filter((module) => MODULE_PERMISSIONS[module].every((permission) => set.has(permission)))
}

export function permissionsForRole(role: StaffRole, custom: readonly Permission[] = []): PermissionSet {
  if (role !== 'custom') return new Set(ROLE_PERMISSIONS[role] ?? [])
  return new Set(custom.filter((permission) => OPERATIONAL_PERMISSION_SET.has(permission)))
}

export function can(permissions: PermissionSet, permission: Permission): boolean { return permissions.has(permission) }

export function nextPinLock(failedAttempts: number, nowMs = Date.now()): { lockedUntil: number; level: number } | null {
  if (failedAttempts < 5) return null
  const level = Math.max(1, Math.floor(failedAttempts / 5))
  const durations = [30_000, 120_000, 300_000, 900_000, 3_600_000]
  return { lockedUntil: nowMs + durations[Math.min(level - 1, durations.length - 1)], level }
}

export function isBusinessManagementRole(role: string | null | undefined): role is 'owner' | 'admin' | 'manager' {
  return role === 'owner' || role === 'admin' || role === 'manager'
}
