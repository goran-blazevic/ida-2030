import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { getCitizen, loadSession, log } from '../db'
import { PHOTO_CRITERIA, PHOTO_SCHEMA, OFFICES, demoPhotoCheck, rankOffices } from '../passport'
import { hasBedrock, structured } from '../llm'
import { LANG_NAMES, normLang, uiLang } from '../lang'
import { daysBetween, today, toBase64 } from '../util'

const passport = new Hono<AppEnv>()

passport.get('/status', async (c) => {
  const p = await getCitizen(c.env, c.req.query('citizenId') || 'anna')
  if (!p) return c.json({ error: 'unknown citizen' }, 404)
  const l = uiLang(normLang(c.req.query('lang')))
  const eligible = p.nationality === 'AT'
  const days = p.passport_expiry ? daysBetween(today(), new Date(p.passport_expiry + 'T00:00:00Z')) : null
  return c.json({
    eligible, days_left: days, passport_expiry: p.passport_expiry, postal: p.postal_code,
    criteria: PHOTO_CRITERIA.map((x) => ({ id: x.id, label: x[l] })),
    source: 'https://www.oesterreich.gv.at/de/themen/persoenliche_dokumente_und_bestaetigungen/reisepass/Seite.020100',
  })
})

passport.post('/photo-check', async (c) => {
  const form = await c.req.parseBody()
  const lang = normLang(form['lang'])
  const f = form['file']
  if (!(f instanceof File)) return c.json({ error: 'no photo' }, 400)
  if (f.size > 3_500_000) return c.json({ error: 'photo too large' }, 413)
  if (!hasBedrock(c.env)) return c.json(demoPhotoCheck())
  const format = ({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as any)[f.type]
  if (!format) return c.json({ error: 'unsupported image type' }, 415)
  try {
    const criteria = PHOTO_CRITERIA.map((x) => `- ${x.id}: ${x.en}`).join('\n')
    const result = await structured(
      c.env,
      `You pre-check passport photos against these criteria:\n${criteria}\nBe strict but fair. If you cannot judge a criterion, use "unsure". Write notes and tip in ${LANG_NAMES[lang]}. This is only a pre-check; the passport office decides.`,
      [{ image: { format, source: { bytes: toBase64(await f.arrayBuffer()) } } }, { text: 'Check this passport photo.' }],
      'photo_check', 'Passport photo pre-check result', PHOTO_SCHEMA, 800
    )
    await log(c.env, null, 'photo_check', { overall: result.overall })
    return c.json(result)
  } catch (e) {
    console.error(e)
    return c.json({ ...demoPhotoCheck(), degraded: true })
  }
})

passport.get('/offices', (c) => c.json({ offices: rankOffices(c.req.query('postal') || '1060') }))

passport.post('/book', async (c) => {
  const { sessionId, officeId, slot, checklist = {}, photo = 'unknown' } = await c.req.json()
  const s = await loadSession(c.env, sessionId)
  if (!s) return c.json({ error: 'session not found' }, 404)
  const office = OFFICES.find((o) => o.id === officeId)
  if (!office || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)) return c.json({ error: 'invalid office or slot' }, 400)
  const p = await getCitizen(c.env, s.citizen_id)
  const reference = `PASS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
  // "Counter-ready" summary the official scans as QR code
  const summary = {
    ref: reference, service: 'passport_renewal', office: office.name, slot,
    citizen: { name: `${p.first_name} ${p.last_name}`, birth_date: p.birth_date, old_passport: p.passport_number },
    checklist, photo_precheck: photo, simulated: true,
  }
  await c.env.DB.prepare('INSERT INTO bookings (id, citizen_id, office_id, slot, data) VALUES (?, ?, ?, ?, ?)')
    .bind(reference, s.citizen_id, office.id, slot, JSON.stringify(summary)).run()
  return c.json({ reference, office, slot, summary })
})

export default passport
