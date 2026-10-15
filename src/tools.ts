import type { Env, Session } from './types'
import { SERVICES, SERVICE_IDS, missingFields, type ServiceId } from './services'
import { getCitizen } from './db'
import { searchKnowledge } from './knowledge'
import { uiLang } from './lang'

const tool = (name: string, description: string, properties: any = {}, required: string[] = []) => ({
  toolSpec: { name, description, inputSchema: { json: { type: 'object', properties, required } } },
})

export const TOOLS = [
  tool('search_knowledge',
    'Search official Austrian public service information (oesterreich.gv.at). ALWAYS use before stating any rule, fee, deadline, office or required document.',
    { query: { type: 'string', description: 'Search query in German works best' } }, ['query']),
  tool('get_citizen_profile', 'Get the logged-in citizen profile (simulated ID Austria data). Use it instead of asking for known data.'),
  tool('check_prerequisites', 'Check if the citizen can use a service and what they need.',
    { service: { type: 'string', enum: SERVICE_IDS } }, ['service']),
  tool('prepare_form',
    'Create or update the form draft with field values collected so far. Returns missing fields and errors. This does NOT submit anything.',
    { service: { type: 'string', enum: SERVICE_IDS }, fields: { type: 'object', description: 'Field values, dates as YYYY-MM-DD' } },
    ['service', 'fields']),
  tool('request_human',
    'Hand over to a human official. Use if the citizen asks for a person, seems lost or frustrated, or the case is unusual or unsupported.',
    { reason: { type: 'string' }, summary: { type: 'string', description: 'Short factual summary for the official, in German' } },
    ['reason', 'summary']),
  tool('final_answer', 'Send the reply to the citizen. EVERY turn must end with this tool.', {
    message: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    sources: { type: 'array', items: { type: 'string' }, description: 'URLs from search_knowledge you used' },
    quick_replies: { type: 'array', items: { type: 'string' }, description: '2-4 short answer buttons for the citizen' },
  }, ['message', 'confidence']),
]

export type TurnCtx = { draft?: any; handoff?: { id: string }; sources: Set<string> }

export async function upsertDraft(env: Env, s: Session, id: ServiceId, fields: Record<string, any>) {
  const svc = SERVICES[id]
  const existing: any = await env.DB.prepare("SELECT * FROM drafts WHERE session_id = ? AND service = ? AND status = 'draft'")
    .bind(s.id, id).first()
  const data = { ...(existing ? JSON.parse(existing.data) : {}), ...(fields || {}) }
  const errors = svc.validate(data)
  const missing = missingFields(id, data)
  const draftId = existing?.id ?? crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO drafts (id, session_id, service, data, missing) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, missing = excluded.missing`
  ).bind(draftId, s.id, id, JSON.stringify(data), JSON.stringify(missing)).run()
  const l = uiLang(s.lang)
  return { id: draftId, service: id, title: svc.title[l], labels: svc.labels[l], data, missing, errors }
}

export async function runTool(env: Env, s: Session, ctx: TurnCtx, name: string, input: any): Promise<Record<string, any>> {
  switch (name) {
    case 'search_knowledge': {
      const hits = await searchKnowledge(env, input.query)
      hits.forEach((h) => ctx.sources.add(h.url))
      if (!hits.length) return { found: false, note: 'No official source found. Do not guess. Say you are not sure and offer a human contact.' }
      return { found: true, hits }
    }
    case 'get_citizen_profile': {
      const p = await getCitizen(env, s.citizen_id)
      return p ? { ...p, today: new Date().toISOString().slice(0, 10) } : { error: 'not logged in' }
    }
    case 'check_prerequisites': {
      const p = await getCitizen(env, s.citizen_id)
      if (input.service === 'passport_renewal') {
        if (p?.nationality !== 'AT') {
          return { eligible: false, reason: 'Austrian passports are only issued to Austrian citizens. Foreign citizens renew at their own embassy or consulate.', suggest_human: true }
        }
        const daysLeft = p.passport_expiry ? Math.round((Date.parse(p.passport_expiry) - Date.now()) / 864e5) : null
        return {
          eligible: true, passport_expiry: p.passport_expiry, days_left: daysLeft,
          needs: ['current passport', 'passport photo meeting the photo criteria', 'personal visit to a passport office (fingerprints)'],
          note: 'Application must be made in person, at any passport office in Austria. Confirm fees with search_knowledge. The citizen can use the passport page of this app for photo check and appointment.',
        }
      }
      if (input.service === 'address_change') {
        const nonStandard = p && p.residence_status !== 'citizen'
        return {
          eligible: true,
          current_address: p ? `${p.street}, ${p.postal_code} ${p.city}` : null,
          needs: ['Online with ID Austria: name + address of the accommodation provider (no signature needed)', 'On paper: Meldezettel signed by the accommodation provider + ID document'],
          deadline: 'Registration of a new residence within 3 days after moving in',
          non_standard_residency: nonStandard ? p.residence_status : null,
          note: nonStandard ? 'Unusual residency status: check with search_knowledge whether other authorities must be informed; if unclear, set confidence medium and offer a human.' : 'The moving page of this app builds a full personal plan.',
        }
      }
      return { error: 'unknown service' }
    }
    case 'prepare_form': {
      if (!SERVICES[input.service as ServiceId]) return { error: 'unsupported service' }
      const d = await upsertDraft(env, s, input.service, input.fields)
      ctx.draft = d
      return {
        draftId: d.id, missing: d.missing, errors: d.errors, ready: !d.missing.length && !d.errors.length,
        note: 'You cannot submit. When ready, ask the citizen to check the form on screen and press Confirm.',
      }
    }
    case 'request_human': {
      const id = crypto.randomUUID()
      await env.DB.prepare('INSERT INTO handoffs (id, session_id, citizen_id, reason, summary) VALUES (?, ?, ?, ?, ?)')
        .bind(id, s.id, s.citizen_id, input.reason, input.summary).run()
      ctx.handoff = { id }
      return { ok: true, handoff_id: id, info: 'An official will call back within 1 working day (demo).' }
    }
    default:
      return { error: `unknown tool ${name}` }
  }
}
