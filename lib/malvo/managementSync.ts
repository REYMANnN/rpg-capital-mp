import type { SupabaseClient } from '@supabase/supabase-js'
import { getMalvoItem, listMalvoAccounts, listMalvoTransactions, parseMalvoClientUserId } from './client'

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
  return value && typeof value === 'object' ? value : null
}

function counterparty(transaction: any) {
  const merchant = transaction?.merchant && typeof transaction.merchant === 'object' ? transaction.merchant : null
  if (merchant) return { name: merchant.businessName || merchant.name || null, taxId: merchant.cnpj || null }

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
  if (['LOGIN_ERROR', 'OUTDATED'].includes(String(item?.status)) || item?.error) return 'error'
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

export async function syncMalvoItemAsManagement(input: {
  itemId: string
  expectedBusinessId: string
  expectedStoreId: string
  supabase: SupabaseClient
}) {
  const item = await getMalvoItem(input.itemId)
  const clientUserId = String(item.clientUserId || '')
  const context = parseMalvoClientUserId(clientUserId)

  if (!context || context.businessId !== input.expectedBusinessId || context.storeId !== input.expectedStoreId) {
    throw new Error('A conexão bancária não pertence a esta loja.')
  }

  const remoteAccounts = (await listMalvoAccounts(input.itemId)).filter((account) => account?.type === 'BANK')
  const ownerDocuments = new Set(remoteAccounts.map((account) => digits(account.taxNumber)).filter(Boolean))
  const accounts: Array<Record<string, unknown>> = []
  const transactions: Array<Record<string, unknown>> = []

  for (const account of remoteAccounts) {
    const externalId = String(account.id || '')
    if (!externalId) continue

    accounts.push({
      externalId,
      accountName: account.name || account.marketingName || null,
      accountType: account.subtype || account.type || null,
      maskedNumber: maskedNumber(account.number),
      balanceCents: cents(account.balance),
      currency: account.currencyCode || 'BRL',
      lastSyncedAt: account.balanceUpdatedAt || item.lastUpdatedAt || new Date().toISOString(),
    })

    const remoteTransactions = await listMalvoTransactions(externalId)
    for (const transaction of remoteTransactions) {
      const amountCents = cents(transaction.amount)
      if (!transaction?.id || !transaction?.date || amountCents === 0) continue
      const party = counterparty(transaction)
      transactions.push({
        accountExternalId: externalId,
        externalId: String(transaction.id),
        postedAt: transaction.date,
        amountCents,
        description: String(transaction.description || transaction.descriptionRaw || 'Movimentação'),
        counterpartyName: party.name,
        counterpartyTaxId: party.taxId,
        category: transactionCategory(transaction),
        transactionType: transaction.operationType || transaction.type || null,
        isInternalTransfer: isInternalTransfer(transaction, ownerDocuments),
      })
    }
  }

  const { data, error } = await input.supabase.rpc('balcao_apply_malvo_snapshot', {
    p_store_id: input.expectedStoreId,
    p_item_id: input.itemId,
    p_client_user_id: clientUserId,
    p_institution_name: item?.connector?.name || null,
    p_institution_logo_url: item?.connector?.imageUrl || null,
    p_status: connectionStatus(item),
    p_execution_status: item?.executionStatus || null,
    p_consent_expires_at: item?.consentExpiresAt || null,
    p_last_synced_at: item?.lastUpdatedAt || new Date().toISOString(),
    p_accounts: accounts,
    p_transactions: transactions,
  })

  if (error) throw error
  return data as { itemId?: string; accountCount?: number; transactionCount?: number } | null
}
