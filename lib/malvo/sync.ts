import { createAdminClient } from '@/lib/supabase/admin'
import { getMalvoItem, listMalvoAccounts, listMalvoTransactions, parseMalvoClientUserId } from '@/lib/malvo/client'

function cents(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : 0
}

function digits(value: unknown) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : ''
}

function maskedNumber(value: unknown) {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\s+/g, '')
  return clean.length > 4 ? clean.slice(-4) : clean || null
}

function paymentParty(paymentData: any, direction: 'payer' | 'receiver') {
  const value = paymentData?.[direction]
  if (!value || typeof value !== 'object') return null
  return value
}

function counterparty(transaction: any) {
  const merchant = transaction?.merchant && typeof transaction.merchant === 'object' ? transaction.merchant : null
  if (merchant) {
    return {
      name: merchant.businessName || merchant.name || null,
      taxId: merchant.cnpj || null,
    }
  }
  const debit = transaction?.type === 'DEBIT'
  const party = paymentParty(transaction?.paymentData, debit ? 'receiver' : 'payer')
  return {
    name: party?.name || party?.legalName || null,
    taxId: party?.document || party?.taxNumber || null,
  }
}

function connectionStatus(item: any) {
  if (item?.status === 'UPDATED' && ['SUCCESS', 'PARTIAL_SUCCESS'].includes(String(item?.executionStatus))) return 'active'
  if (['CREATING', 'UPDATING', 'LOGIN_IN_PROGRESS'].includes(String(item?.status))) return 'updating'
  if (['WAITING_USER_INPUT', 'WAITING_USER_ACTION'].includes(String(item?.status))) return 'attention'
  if (['USER_AUTHORIZATION_PENDING', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION'].includes(String(item?.executionStatus))) return 'attention'
  if (['LOGIN_ERROR', 'OUTDATED'].includes(String(item?.status))) return 'error'
  if (item?.error) return 'error'
  return 'pending'
}

function transactionCategory(transaction: any) {
  return transaction?.merchant?.category || transaction?.category || 'Outros'
}

function isInternalTransfer(transaction: any, ownerDocuments: Set<string>) {
  const payer = digits(transaction?.paymentData?.payer?.document || transaction?.paymentData?.payer?.taxNumber)
  const receiver = digits(transaction?.paymentData?.receiver?.document || transaction?.paymentData?.receiver?.taxNumber)
  if (payer && receiver && payer === receiver) return true
  return Boolean(payer && receiver && ownerDocuments.has(payer) && ownerDocuments.has(receiver))
}

async function upsertConnection(input: {
  businessId: string
  storeId: string
  item: any
  clientUserId: string
  status?: string
  error?: { code?: string | null; message?: string | null }
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin.from('balcao_finance_connections').upsert({
    business_id: input.businessId,
    store_id: input.storeId,
    provider: 'malvo',
    provider_item_id: String(input.item.id),
    client_user_id: input.clientUserId,
    institution_name: input.item?.connector?.name || null,
    institution_logo_url: input.item?.connector?.imageUrl || null,
    status: input.status || connectionStatus(input.item),
    execution_status: input.item?.executionStatus || null,
    consent_expires_at: input.item?.consentExpiresAt || null,
    last_synced_at: input.item?.lastUpdatedAt || null,
    last_error_code: input.error?.code || input.item?.error?.code || null,
    last_error_message: input.error?.message || input.item?.error?.message || null,
    updated_at: now,
  }, { onConflict: 'provider,provider_item_id' }).select('*').single()
  if (error) throw error
  return data
}

export async function syncMalvoItem(input: { itemId: string; clientUserId?: string | null }) {
  const item = await getMalvoItem(input.itemId)
  const clientUserId = String(item.clientUserId || input.clientUserId || '')
  const context = parseMalvoClientUserId(clientUserId)
  if (!context) throw new Error('Invalid Balcao clientUserId on Malvo item')

  const admin = createAdminClient()
  await upsertConnection({ ...context, item, clientUserId })

  const remoteAccounts = (await listMalvoAccounts(input.itemId)).filter((account) => account?.type === 'BANK')
  const ownerDocuments = new Set(remoteAccounts.map((account) => digits(account.taxNumber)).filter(Boolean))
  const activeExternalIds: string[] = []
  let transactionCount = 0

  for (const account of remoteAccounts) {
    const externalId = String(account.id)
    activeExternalIds.push(externalId)
    const { data: localAccount, error: accountError } = await admin.from('balcao_finance_accounts').upsert({
      business_id: context.businessId,
      store_id: context.storeId,
      provider: 'malvo',
      external_id: externalId,
      institution_name: item?.connector?.name || 'Instituição financeira',
      account_name: account.name || account.marketingName || null,
      account_type: account.subtype || account.type || null,
      masked_number: maskedNumber(account.number),
      balance_cents: cents(account.balance),
      currency: account.currencyCode || 'BRL',
      status: 'active',
      source: 'malvo',
      last_synced_at: account.balanceUpdatedAt || item.lastUpdatedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id,provider,external_id' }).select('id').single()
    if (accountError || !localAccount?.id) throw accountError || new Error('Could not persist Malvo account')

    const remoteTransactions = await listMalvoTransactions(externalId)
    const rows = remoteTransactions.map((transaction) => {
      const party = counterparty(transaction)
      return {
        business_id: context.businessId,
        store_id: context.storeId,
        account_id: localAccount.id,
        external_id: String(transaction.id),
        posted_at: transaction.date,
        amount_cents: cents(transaction.amount),
        description: String(transaction.description || transaction.descriptionRaw || 'Movimentação'),
        counterparty_name: party.name,
        counterparty_tax_id: party.taxId,
        category: transactionCategory(transaction),
        category_confidence: null,
        transaction_type: transaction.operationType || transaction.type || null,
        is_internal_transfer: isInternalTransfer(transaction, ownerDocuments),
        source: 'malvo',
      }
    }).filter((row) => row.posted_at && row.amount_cents !== 0)

    for (let start = 0; start < rows.length; start += 500) {
      const batch = rows.slice(start, start + 500)
      if (!batch.length) continue
      const { error: txError } = await admin.from('balcao_finance_transactions')
        .upsert(batch, { onConflict: 'account_id,external_id' })
      if (txError) throw txError
      transactionCount += batch.length
    }
  }

  if (activeExternalIds.length) {
    const { data: existing } = await admin.from('balcao_finance_accounts')
      .select('id, external_id')
      .eq('business_id', context.businessId)
      .eq('store_id', context.storeId)
      .eq('provider', 'malvo')
    const staleIds = (existing || []).filter((row) => !activeExternalIds.includes(String(row.external_id))).map((row) => row.id)
    if (staleIds.length) await admin.from('balcao_finance_accounts').update({ status: 'disconnected' }).in('id', staleIds)
  }

  await upsertConnection({
    ...context,
    item: { ...item, lastUpdatedAt: item.lastUpdatedAt || new Date().toISOString() },
    clientUserId,
    status: connectionStatus(item),
  })

  return { itemId: input.itemId, accountCount: remoteAccounts.length, transactionCount }
}

export async function markMalvoConnectionError(input: {
  itemId: string
  clientUserId?: string | null
  code?: string | null
  message?: string | null
}) {
  const context = parseMalvoClientUserId(input.clientUserId)
  if (!context) return
  const admin = createAdminClient()
  const { data: existing } = await admin.from('balcao_finance_connections')
    .select('*').eq('provider', 'malvo').eq('provider_item_id', input.itemId).maybeSingle()
  const item = {
    id: input.itemId,
    connector: { name: existing?.institution_name || null, imageUrl: existing?.institution_logo_url || null },
    executionStatus: input.code || null,
  }
  await upsertConnection({
    ...context,
    item,
    clientUserId: String(input.clientUserId),
    status: 'error',
    error: { code: input.code, message: input.message },
  })
}
