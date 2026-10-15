// Upload content/*.md into Vectorize via the Worker.  Usage:
//   ADMIN_TOKEN=... BASE=https://ida-2030.<sub>.workers.dev node scripts/ingest.mjs
import fs from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:8787'
const docs = fs.readdirSync('content').filter((f) => f.endsWith('.md')).map((f) => {
  const raw = fs.readFileSync(`content/${f}`, 'utf8').replace(/\r\n/g, '\n')
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error(`bad frontmatter in ${f}`)
  const meta = Object.fromEntries(m[1].split('\n').map((l) => {
    const i = l.indexOf(':')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
  }))
  return { ...meta, text: m[2].trim() }
})

const r = await fetch(`${BASE}/api/admin/ingest`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-admin-token': process.env.ADMIN_TOKEN ?? '' },
  body: JSON.stringify(docs),
})
console.log(r.status, await r.text())
