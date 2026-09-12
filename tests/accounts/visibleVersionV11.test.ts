import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

test('global BALCAO build badge uses the same v11 app version shown by inventory', () => {
  const layout = source('app/layout.tsx')
  const inventoryVersion = source('lib/inventory/version.ts')
  assert.match(inventoryVersion, /v11\.0/)
  assert.match(layout, /INVENTORY_APP_VERSION/)
  assert.doesNotMatch(layout, /const softwareVersion = "0\.3\.0"/)
})
