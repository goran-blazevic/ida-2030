import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { runAgent } from '../agent'
import { loadSession, saveSession, getCitizen, log } from '../db'
import { SERVICES, missingFields, type ServiceId } from '../services'
import { normLang } from '../lang'
import { hasBedrock } from '../llm'
import { hasVoice } from '../voice'
import { listLetters } from '../letters'
import { daysBetween, today } from '../util'

const core = new Hono<AppEnv>()

core.get('/status', (c) =>
  c.json({ bedrock: hasBedrock(c.env), voice: hasVoice(c.env), demo: !hasBedrock(c.env) })
)

// Simulated ID Austria login = pick a persona
core.post('/session', async (c) => {
  const { citizenId = 'anna', lang = 'de' } = await c.req.json().catch(() => ({}))
  const citizen = await getCitizen(c.env, citizenId)
  if (!citizen) return c.json({ error: 'unknown citizen' }, 404)
  const id = crypto.randomUUID()
  await c.env.DB.prepare("INSERT INTO sessions (id, citizen_id, lang, messages, pending, updated_at) VALUES (?, ?, ?, '[]', '[]', datetime('now'))")
    .bind(id, citizenId, normLang(lang)).run()
  return c.json({ sessionId: id, citizen })
})

// Profile + proactive nudges
core.get('/me', async (c) => {
  const p = await getCitizen(c.env, c.req.query('citizenId') || 'anna')
  if (!p) return c.json({ error: 'unknown citizen' }, 404)
  const nudges: any[] = []
  if (p.passport_expiry) {
    const days = daysBetween(today(), new Date(p.passport_expiry + 'T00:00:00Z'))
    if (days <= 180) nudges.push({ kind: 'passport', days, href: '/reisepass.html' })
  }
  const letters = (await listLetters(c.env)).filter((l) => l.days_left !== null && l.days_left >= 0)
  if (letters.length) nudges.push({ kind: 'letters', count: letters.length, next: letters.sort((a, b) => a.days_left! - b.days_left!)[0], href: '/brief.html' })
  return c.json({ citizen: p, nudges })
})

// Very small intent router for the home page search box (the assistant handles everything else)
core.post('/intent', async (c) => {
  const { text = '' } = await c.req.json().catch(() => ({}))
  const t = String(text).toLowerCase()
  const route =
    /umzug|umgezogen|umzogn|übersied|neue wohnung|ummeld|meldezettel|moved|moving|new flat|address|adresse|preseli|selidb|adres|taşın|переїх/.test(t) ? '/umzug.html'
    : /brief|bescheid|schreiben|postkorb|strafe|mahnung|letter|fine|pismo|rješenj|rešenj|kazn|mektup|лист/.test(t) ? '/brief.html'
    : /reisepass|\bpass\b|passport|pasoš|pasos|putovnic|pasaport|паспорт/.test(t) ? '/reisepass.html'
    : /mensch|person|human|čovjek|čovek|insan|людин/.test(t) ? 'handoff'
    : '/assistant.html'
  return c.json({ route })
})

// Main assistant turn
core.post('/chat', async (c) => {
  const { sessionId, text, lang, simple } = await c.req.json()
  const clean = String(text ?? '').trim().slice(0, 2000)
  if (!clean) return c.json({ error: 'empty message' }, 400)
  const s = await loadSession(c.env, sessionId)
  if (!s) return c.json({ error: 'session not found' }, 404)
  s.lang = normLang(lang ?? s.lang)
  s.simple = !!simple
  const result = await runAgent(c.env, s, clean)
  if (!result.degraded) await saveSession(c.env, s)
  await log(c.env, s.id, 'turn', { text: clean, confidence: result.confidence, tools: result.debug.tools, degraded: !!result.degraded, ms: result.debug.ms })
  return c.json(result)
})

// The ONLY way to submit anything: the citizen presses Confirm in the UI
core.post('/drafts/:id/confirm', async (c) => {
  const { sessionId } = await c.req.json()
  const d: any = await c.env.DB.prepare("SELECT * FROM drafts WHERE id = ? AND session_id = ? AND status = 'draft'")
    .bind(c.req.param('id'), sessionId).first()
  if (!d) return c.json({ error: 'draft not found' }, 404)
  const svc = SERVICES[d.service as ServiceId]
  const data = JSON.parse(d.data)
  const missing = missingFields(d.service, data)
  if (missing.length || svc.validate(data).length) return c.json({ error: 'draft incomplete', missing }, 422)

  const s = await loadSession(c.env, sessionId)
  const reference = `AT-2030-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
  const output = {
    reference, service: d.service, status: 'submitted', submitted_at: new Date().toISOString(),
    citizen: await getCitizen(c.env, s!.citizen_id),
    form: data,
    channel: 'ida-2030-assistant', consent: true, simulated: true,
  }
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO cases (id, draft_id, citizen_id, service, data, status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(reference, d.id, s!.citizen_id, d.service, JSON.stringify(output), 'submitted'),
    c.env.DB.prepare("UPDATE drafts SET status = 'submitted' WHERE id = ?").bind(d.id),
  ])
  await log(c.env, sessionId, 'submit', { reference, service: d.service })
  return c.json(output)
})

// Human handoff with context (works even if the AI is down)
core.post('/handoff', async (c) => {
  const { sessionId, reason = 'citizen pressed human button', contact = '', page = '' } = await c.req.json()
  const s = await loadSession(c.env, sessionId)
  if (!s) return c.json({ error: 'session not found' }, 404)
  const lastTexts = s.messages
    .flatMap((m: any) => m.content.filter((b: any) => b.text).map((b: any) => `${m.role === 'user' ? 'Bürger:in' : 'ida'}: ${b.text}`))
    .slice(-6)
  const summary = [`Seite: ${page || '-'}`, ...lastTexts].join('\n')
  const id = crypto.randomUUID()
  await c.env.DB.prepare('INSERT INTO handoffs (id, session_id, citizen_id, reason, summary, contact) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, s.id, s.citizen_id, reason, summary, String(contact).slice(0, 200)).run()
  return c.json({ id, summary })
})

export default core
