import 'server-only'

import { readSheet } from 'read-excel-file/node'
import { extractText, getDocumentProxy } from 'unpdf'
import { parseCsv, type Table } from '@/lib/rafa-import'

// Arquivos que chegam no WhatsApp: descobre o tipo e tira o conteúdo (tabela ou texto).

export type RafaFileKind = 'image' | 'pdf' | 'xlsx' | 'csv' | 'text' | 'unsupported'

const MAX_BYTES = 8 * 1024 * 1024

export function fileKind(mime: string, filename: string): RafaFileKind {
  const name = filename.toLowerCase()
  const type = mime.toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (type.includes('spreadsheetml') || name.endsWith('.xlsx')) return 'xlsx'
  if (type.includes('csv') || name.endsWith('.csv')) return 'csv'
  if (type.startsWith('text/') || name.endsWith('.txt')) return 'text'
  return 'unsupported'
}

export function tooBig(bytes: Uint8Array) {
  return bytes.byteLength > MAX_BYTES
}

function decodeText(bytes: Uint8Array) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  // Planilhas salvas pelo Excel em português costumam vir em Latin-1.
  if (utf8.includes('�')) return new TextDecoder('latin1').decode(bytes)
  return utf8.replace(/^﻿/, '')
}

export async function readTable(bytes: Uint8Array, kind: 'xlsx' | 'csv'): Promise<Table> {
  if (kind === 'csv') return parseCsv(decodeText(bytes))
  const data = await readSheet(Buffer.from(bytes))
  return data.map((row) => row.map((cell) => {
    if (cell === null || cell === undefined) return ''
    if (cell instanceof Date) return cell.toISOString().slice(0, 10)
    return String(cell)
  }))
}

export async function readPlainText(bytes: Uint8Array) {
  return decodeText(bytes).slice(0, 20_000)
}

export async function readPdfText(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20_000)
}

// DANFE / NF-e: texto típico ou chave de acesso de 44 dígitos.
export function looksLikeInvoice(text: string) {
  const compact = text.replace(/\s+/g, '')
  return /DANFE|DOCUMENTO AUXILIAR DA NOTA FISCAL|NOTA FISCAL ELETR/i.test(text) || /\d{44}/.test(compact)
}
