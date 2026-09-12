import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root=process.cwd()
const source=(path:string)=>readFileSync(join(root,path),'utf8')

test('automation technical UI routes use capability RPCs instead of Vercel service role',()=>{
  const paths=[
    'app/api/balcao/automations/api-keys/route.ts',
    'app/api/balcao/automations/api-keys/[id]/route.ts',
    'app/api/balcao/automations/api-keys/[id]/rotate/route.ts',
    'app/api/balcao/automations/integrations/route.ts',
    'app/api/balcao/automations/webhooks/route.ts',
    'app/api/balcao/automations/webhooks/[id]/route.ts',
    'app/api/balcao/automations/webhooks/[id]/rotate/route.ts',
    'app/api/balcao/automations/webhooks/[id]/test/route.ts',
    'app/api/balcao/automations/logs/route.ts',
  ]
  for(const path of paths){
    const code=source(path)
    assert.doesNotMatch(code,/createAdminClient/,path)
    assert.match(code,/createInventoryCloudClient|automationTechnical/,path)
  }
})

test('v12 migration exposes capability-scoped technical RPCs',()=>{
  const migration=source('supabase/migrations/20260912_balcao_automation_center_v12.sql')
  for(const fn of [
    'balcao_automation_api_keys_state','balcao_automation_api_key_create','balcao_automation_api_key_action',
    'balcao_automation_integrations_state','balcao_automation_integration_create',
    'balcao_automation_webhooks_state','balcao_automation_webhook_create','balcao_automation_webhook_action',
    'balcao_automation_webhook_test_context','balcao_automation_delivery_logs'
  ]) assert.match(migration,new RegExp(fn))
})
