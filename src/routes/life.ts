import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { loadSession, getCitizen, log } from '../db'
import { buildMovingPlan, templateText, type MovingInput } from '../life_events'
import { upsertDraft } from '../tools'
import { uiLang } from '../lang'

const life = new Hono<AppEnv>()

// Build the personal moving plan and pre-fill the Meldung draft
life.post('/moving', async (c) => {
  const body = await c.req.json()
  const s = await loadSession(c.env, body.sessionId)
  if (!s) return c.json({ error: 'session not found' }, 404)
  const input = body as MovingInput
  if (!input.move_in_date || isNaN(Date.parse(input.move_in_date))) return c.json({ error: 'move_in_date required' }, 400)
  const profile = await getCitizen(c.env, s.citizen_id)
  const plan = buildMovingPlan(profile, input)
  const draft = await upsertDraft(c.env, s, 'address_change', plan.draftFields)
  const l = uiLang(s.lang)
  const templates = Object.fromEntries(
    plan.steps.filter((st) => st.action === 'template').map((st) => [st.id, templateText(st.id, profile, input, l)])
  )
  await log(c.env, s.id, 'life_moving', { steps: plan.steps.length })
  return c.json({ ...plan, draft, templates })
})

// Simulated Once-Only notification of authorities after the Meldung is confirmed
life.post('/notify', async (c) => {
  const { sessionId, reference, targets = [] } = await c.req.json()
  const s = await loadSession(c.env, sessionId)
  if (!s) return c.json({ error: 'session not found' }, 404)
  if (!reference) return c.json({ error: 'confirm the Meldung first' }, 400)
  const now = new Date().toISOString()
  const stmts = (targets as string[]).slice(0, 20).map((t) =>
    c.env.DB.prepare('INSERT INTO notifications (id, case_ref, citizen_id, target, status) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), reference, s.citizen_id, t, 'sent (simulated)')
  )
  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ notified: (targets as string[]).map((t) => ({ target: t, status: 'sent', at: now })), simulated: true })
})

export default life
