// Runs tests/cases.json against the deployed Worker and writes tests/results.md.  Usage:
//   BASE=https://ida-2030.<sub>.workers.dev node scripts/run-tests.mjs
import fs from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:8787'
const cases = JSON.parse(fs.readFileSync('tests/cases.json', 'utf8'))
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json())

const rows = []
for (const c of cases) {
  const { sessionId } = await post('/api/session', { citizenId: c.persona, lang: c.lang })
  let last, tools = [], services = new Set(), handoff = false
  for (const text of c.turns) {
    last = await post('/api/chat', { sessionId, text, lang: c.lang })
    tools.push(...(last.debug?.tools ?? []))
    if (last.draft) services.add(last.draft.service)
    if (last.handoff) handoff = true
  }
  const e = c.expect, fails = []
  for (const t of e.tools ?? []) if (!tools.includes(t)) fails.push(`missing ${t}`)
  for (const t of e.no_tools ?? []) if (tools.includes(t)) fails.push(`used ${t}`)
  if (e.service && !services.has(e.service)) fails.push(`no ${e.service} draft`)
  if (e.handoff && !handoff) fails.push('no handoff')
  if (e.max_confidence === 'medium' && last.confidence === 'high') fails.push('overconfident')
  if (last.degraded) fails.push('degraded mode')
  rows.push({ id: c.id, pass: !fails.length, fails, conf: last.confidence, ms: last.debug?.ms, reply: last.message })
  console.log(c.id, fails.length ? 'FAIL ' + fails.join(', ') : 'PASS')
}

const pass = rows.filter((r) => r.pass).length
const md = [
  `# Test results\n\n**${pass}/${rows.length} passed** (${new Date().toISOString()})\n`,
  '| Case | Result | Confidence | ms | Notes | Reply |', '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.conf} | ${r.ms} | ${r.fails.join('; ')} | ${String(r.reply).replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 160)} |`),
].join('\n')
fs.writeFileSync('tests/results.md', md)
