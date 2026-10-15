import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { LETTER_SCHEMA, demoExplanation, listLetters } from '../letters'
import { hasBedrock, structured } from '../llm'
import { LANG_NAMES, levelText, normLang, uiLang } from '../lang'
import { log } from '../db'
import { icsEscape, toBase64 } from '../util'

const letters = new Hono<AppEnv>()

letters.get('/', async (c) => c.json({ letters: await listLetters(c.env) }))

/**
 * Explain a letter. Accepts multipart form-data:
 *  - letterId (one of the demo Postkorb letters) OR file (jpeg/png/webp image or pdf) OR text
 *  - lang, simple
 * The letter is NOT stored (privacy by design).
 */
letters.post('/explain', async (c) => {
  const form = await c.req.parseBody()
  const lang = normLang(form['lang'])
  const simple = form['simple'] === 'true'
  const letterId = String(form['letterId'] || '')
  const all = await listLetters(c.env)
  const stored = all.find((l) => l.id === letterId)

  const content: any[] = []
  if (stored) content.push({ text: `LETTER (received ${stored.delivered_at}):\n${stored.body}` })
  else if (form['text']) content.push({ text: `LETTER:\n${String(form['text']).slice(0, 12000)}` })
  else if (form['file'] instanceof File) {
    const f = form['file'] as File
    if (f.size > 3_500_000) return c.json({ error: 'file too large (max 3.5 MB)' }, 413)
    const bytes = toBase64(await f.arrayBuffer())
    if (f.type === 'application/pdf') content.push({ document: { format: 'pdf', name: 'letter', source: { bytes } } })
    else {
      const format = ({ 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as any)[f.type]
      if (!format) return c.json({ error: 'unsupported file type' }, 415)
      content.push({ image: { format, source: { bytes } } })
    }
  } else return c.json({ error: 'send letterId, text or file' }, 400)

  if (!hasBedrock(c.env)) {
    if (stored) return c.json({ ...demoExplanation(stored.id, uiLang(lang), stored), letter: stored })
    return c.json({ error: 'demo mode: AI letter reading needs AWS Bedrock keys. Try one of the sample letters.' }, 503)
  }

  content.push({ text: `Explain this official letter to the citizen. Today is ${new Date().toISOString().slice(0, 10)}.` })
  try {
    const result = await structured(
      c.env,
      `You explain official Austrian letters to citizens. Write summary_plain, actions and consequences in ${LANG_NAMES[lang]}. ${levelText(simple)}
Only use what is written in the letter. Never invent deadlines or amounts. If something is unreadable, put it in "uncertain" and lower the confidence.
This is not legal advice; for appeals recommend talking to the authority or a counselling service.`,
      content, 'letter_explanation', 'Structured explanation of an official letter', LETTER_SCHEMA
    )
    if (stored) {
      // our computed deadline (deemed delivery for RSb) wins over the model's reading
      result.deadline_date = stored.deadline
      result.amount_eur = stored.amount_eur ?? result.amount_eur
    }
    await log(c.env, null, 'letter_explain', { letterId: letterId || 'upload', confidence: result.confidence })
    return c.json({ ...result, letter: stored ?? null })
  } catch (e) {
    console.error(e)
    if (stored) return c.json({ ...demoExplanation(stored.id, uiLang(lang), stored), degraded: true, letter: stored })
    return c.json({ error: 'Could not read the letter right now. Please try again or talk to a person.' }, 502)
  }
})

// Calendar file for a deadline (all-day event + reminder 3 days before)
letters.get('/calendar.ics', (c) => {
  const title = c.req.query('title') || 'Frist'
  const date = (c.req.query('date') || '').replace(/-/g, '')
  const desc = c.req.query('desc') || ''
  if (!/^\d{8}$/.test(date)) return c.text('bad date', 400)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ida 2030//DE', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${crypto.randomUUID()}@ida2030`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${date}`, `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(desc)}`,
    'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  return new Response(ics, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="frist.ics"' },
  })
})

export default letters
