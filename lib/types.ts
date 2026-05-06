export type AccountType = 'pf' | 'pj'
export type TerminalStatus = 'online' | 'away' | 'offline'
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded'
export type ContactType = 'employee' | 'supplier' | 'other'

export interface User {
  id: string
  email: string
  name: string
  cpf: string
  account_type: AccountType
  mp_user_id?: string
  mp_access_token?: string
  mp_refresh_token?: string
  mp_public_key?: string
  mp_token_expires_at?: string
  pin_hash?: string
  created_at: string
}

export interface Merchant {
  id: string
  user_id: string
  business_name: string
  cnpj: string
  admin_password_hash?: string
  nfe_certificate_a1?: string
  nfe_focus_token?: string
  nfe_auto_emit: boolean
  created_at: string
}

export interface Terminal {
  id: string
  merchant_id: string
  device_id: string
  name: string
  status: TerminalStatus
  last_heartbeat_at?: string
  created_at: string
}

export interface Product {
  id: string
  merchant_id: string
  name: string
  price: number
  barcode?: string
  stock_quantity: number
  stock_alert_threshold: number
  created_at: string
}

export interface Contact {
  id: string
  merchant_id: string
  name: string
  pix_key: string
  contact_type: ContactType
  created_at: string
}

export interface Transaction {
  id: string
  payer_user_id: string
  merchant_id: string
  terminal_id?: string
  amount: number
  rpg_fee: number
  net_amount: number
  status: TransactionStatus
  mp_payment_id?: string
  created_at: string
  users?: User
  merchants?: Merchant
}

export interface VirtualCard {
  id: string
  user_id: string
  qr_token: string
  qr_expires_at: string
  created_at: string
}
