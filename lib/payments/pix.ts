type StaticPixInput = {
  pixKey: string
  amountCents: number
  merchantName: string
  merchantCity: string
  txid?: string
}

function utf8Length(value: string) {
  return Buffer.byteLength(value, 'utf8')
}

function emv(id: string, value: string) {
  const length = utf8Length(value)
  if (length > 99) throw new Error(`Campo Pix ${id} excede o tamanho permitido.`)
  return `${id}${String(length).padStart(2, '0')}${value}`
}

function normalizeMerchant(value: string, maxLength: number, fallback: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
  return normalized || fallback
}

export function crc16Ccitt(value: string) {
  const bytes = Buffer.from(value, 'utf8')
  let crc = 0xffff
  for (const byte of bytes) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function buildStaticPixPayload(input: StaticPixInput) {
  const pixKey = input.pixKey.trim()
  if (!pixKey) throw new Error('Chave Pix não configurada.')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Valor Pix inválido.')

  const merchantName = normalizeMerchant(input.merchantName, 25, 'BALCAO')
  const merchantCity = normalizeMerchant(input.merchantCity, 15, 'BRASIL')
  const txid = (input.txid?.trim() || '***').slice(0, 25)
  const merchantAccount = emv('00', 'BR.GOV.BCB.PIX') + emv('01', pixKey)
  const additionalData = emv('05', txid)
  const amount = (input.amountCents / 100).toFixed(2)

  const withoutCrc = [
    emv('00', '01'),
    emv('26', merchantAccount),
    emv('52', '0000'),
    emv('53', '986'),
    emv('54', amount),
    emv('58', 'BR'),
    emv('59', merchantName),
    emv('60', merchantCity),
    emv('62', additionalData),
    '6304',
  ].join('')

  return withoutCrc + crc16Ccitt(withoutCrc)
}
