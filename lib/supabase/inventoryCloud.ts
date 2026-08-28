import { createClient } from '@supabase/supabase-js'

const INVENTORY_SUPABASE_URL = 'https://kftmhqugsswieuxqznfk.supabase.co'
const INVENTORY_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lgi_tCRVGcbVx5iHGeKDcQ_DUMSjXrH'

export function createInventoryCloudClient() {
  return createClient(INVENTORY_SUPABASE_URL, INVENTORY_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
