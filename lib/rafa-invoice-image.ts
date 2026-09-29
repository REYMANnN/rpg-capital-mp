import sharp from 'sharp'

const JPEG_QUALITY = 85
const MIN_WIDTH = 1200
const MAX_HEIGHT = 3000

async function encodeJpeg(bytes: Buffer, left?: number, top?: number, width?: number, height?: number) {
  let image = sharp(bytes)
  if (left != null && top != null && width != null && height != null) image = image.extract({ left, top, width, height })
  const metadata = await image.metadata()
  const currentWidth = Math.max(1, Number(metadata.width || width || 1))
  const currentHeight = Math.max(1, Number(metadata.height || height || 1))
  const scale = currentWidth < MIN_WIDTH ? MIN_WIDTH / currentWidth : 1
  const targetWidth = Math.max(MIN_WIDTH, Math.round(currentWidth * scale))
  const targetHeight = Math.min(MAX_HEIGHT, Math.round(currentHeight * scale))
  const output = await image
    .resize({ width: targetWidth, height: targetHeight, fit: 'inside', withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer()
  return `data:image/jpeg;base64,${output.toString('base64')}`
}

export async function prepareInvoiceImages(bytes: Uint8Array): Promise<string[]> {
  const normalized = await sharp(Buffer.from(bytes))
    .rotate()
    .trim({ threshold: 40 })
    .toBuffer()
  const meta = await sharp(normalized).metadata()
  const width = Math.max(1, Number(meta.width || 1))
  const height = Math.max(1, Number(meta.height || 1))
  const ratio = height / width
  if (ratio <= 1.6) return [await encodeJpeg(normalized)]

  const count = Math.min(3, Math.ceil(ratio / 1.3))
  const tileHeight = Math.min(height, Math.ceil(height / (count - 0.1 * (count - 1))))
  const overlap = Math.max(1, Math.round(tileHeight * 0.1))
  const step = Math.max(1, tileHeight - overlap)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const top = i === count - 1 ? Math.max(0, height - tileHeight) : Math.min(Math.max(0, i * step), Math.max(0, height - tileHeight))
    const h = Math.min(tileHeight, height - top)
    out.push(await encodeJpeg(normalized, 0, top, width, h))
  }
  return out
}
