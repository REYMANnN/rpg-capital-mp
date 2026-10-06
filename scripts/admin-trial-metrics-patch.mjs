import { readFileSync, writeFileSync } from 'node:fs'

const path = 'lib/admin/metrics.ts'
const source = readFileSync(path, 'utf8')
const before = "      ownerName: row.created_by ? userNameById.get(String(row.created_by)) || 'Dono' : 'Dono',"
const after = "      ownerName: row.primary_contact_name ? String(row.primary_contact_name) : row.created_by ? userNameById.get(String(row.created_by)) || 'Dono' : 'Dono',"
const first = source.indexOf(before)
if (first < 0) throw new Error('ownerName anchor not found')
if (source.indexOf(before, first + before.length) >= 0) throw new Error('ownerName anchor is not unique')
writeFileSync(path, source.slice(0, first) + after + source.slice(first + before.length))
