import { randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { evoDownloadMedia } from '@/lib/whatsapp-evolution'

const GRAPH_API_VERSION = 'v23.0'
export const RAFA_PROOF_BUCKET = 'rafa-invoice-proofs'

function token() {
  const value = process.env.WHATSAPP_TOKEN?.trim()
  if (!value) throw new Error('WHATSAPP_TOKEN is not configured')
  return value
}

export type MetaMedia = {
  bytes: Uint8Array
  mime: string
  fileSize: number
  filename: string
}

function extensionFor(mime: string) {
  return mime === 'image/jpeg' ? 'jpg'
    : mime === 'image/png' ? 'png'
      : mime === 'image/webp' ? 'webp'
        : mime === 'application/pdf' ? 'pdf'
          : mime.includes('ogg') ? 'ogg'
            : mime.includes('mpeg') ? 'mp3'
              : mime.includes('mp4') ? 'm4a'
                : 'bin'
}

export const EVOLUTION_MEDIA_PREFIX = 'evo:'

export async function downloadWhatsAppMedia(mediaId: string, filenameHint?: string | null): Promise<MetaMedia> {
  if (mediaId.startsWith(EVOLUTION_MEDIA_PREFIX)) {
    const media = await evoDownloadMedia(mediaId.slice(EVOLUTION_MEDIA_PREFIX.length))
    const safeHint = String(filenameHint || media.fileName || '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
    const filename = safeHint || `rafa-${randomUUID()}.${extensionFor(media.mime)}`
    return { bytes: media.bytes, mime: media.mime, fileSize: media.bytes.byteLength, filename }
  }

  const metadataResponse = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  const metadata = await metadataResponse.json().catch(() => null) as any
  if (!metadataResponse.ok || typeof metadata?.url !== 'string') {
    throw new Error(metadata?.error?.message || `Meta media metadata HTTP ${metadataResponse.status}`)
  }

  const mediaResponse = await fetch(metadata.url, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (!mediaResponse.ok) throw new Error(`Meta media download HTTP ${mediaResponse.status}`)

  const bytes = new Uint8Array(await mediaResponse.arrayBuffer())
  const mime = String(metadata.mime_type || mediaResponse.headers.get('content-type') || 'application/octet-stream').split(';')[0]
  const ext = mime === 'image/jpeg' ? 'jpg'
    : mime === 'image/png' ? 'png'
      : mime === 'image/webp' ? 'webp'
        : mime === 'application/pdf' ? 'pdf'
          : mime.includes('ogg') ? 'ogg'
            : mime.includes('mpeg') ? 'mp3'
              : mime.includes('mp4') ? 'm4a'
                : 'bin'
  const safeHint = String(filenameHint || '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)
  const filename = safeHint || `rafa-${randomUUID()}.${ext}`
  return { bytes, mime, fileSize: bytes.byteLength, filename }
}

export function mediaDataUri(media: Pick<MetaMedia, 'bytes' | 'mime'>) {
  return `data:${media.mime};base64,${Buffer.from(media.bytes).toString('base64')}`
}

export async function storeInvoiceProof(input: {
  storeId: string
  waId: string
  media: MetaMedia
}) {
  const admin = createAdminClient()
  const ext = input.media.filename.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${input.storeId}/${input.waId}/${Date.now()}-${randomUUID()}.${ext}`
  const { error } = await admin.storage.from(RAFA_PROOF_BUCKET).upload(path, input.media.bytes, {
    contentType: input.media.mime,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function loadInvoiceProofDataUri(path: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(RAFA_PROOF_BUCKET).download(path)
  if (error || !data) throw error || new Error('invoice_proof_missing')
  const bytes = new Uint8Array(await data.arrayBuffer())
  const ext = path.split('.').pop()?.toLowerCase()
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
        : ext === 'pdf' ? 'application/pdf'
          : 'application/octet-stream'
  return mediaDataUri({ bytes, mime })
}
