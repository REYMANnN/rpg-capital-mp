import { readFileSync, writeFileSync } from 'node:fs'

const path = 'lib/whatsapp-inbound.ts'
const source = readFileSync(path, 'utf8')
const before = "          const saved = await savePixForStore(pixResolved.storeId, pixSubmission.key)"
const after = "          if (pixSubmission.status !== 'valid') return\n          const saved = await savePixForStore(pixResolved.storeId, pixSubmission.key)"
const first = source.indexOf(before)
if (first < 0) throw new Error(`${path}: Pix save anchor not found`)
if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${path}: Pix save anchor is not unique`)
writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length))
