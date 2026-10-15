import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { hasBedrock, structured, workersText } from '../llm'
import { LANG_NAMES, levelText, normLang } from '../lang'
import { hasVoice, stt, tts } from '../voice'
import { log } from '../db'

const misc = new Hono<AppEnv>()

const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-3 sentences' },
    key_points: { type: 'array', items: { type: 'string' }, description: '3-5 short points' },
    for_me: { type: 'string', description: 'What this means for the citizen, using the profile if given' },
    terms: {
      type: 'array',
      items: { type: 'object', properties: { term: { type: 'string' }, explanation: { type: 'string' } }, required: ['term', 'explanation'] },
      description: 'Up to 4 official German terms with a simple explanation',
    },
  },
  required: ['summary', 'key_points', 'terms'],
}

// "Explain this page" + any-language mode for every page of the site
misc.post('/explain', async (c) => {
  const { text = '', lang, simple = true, profile = null } = await c.req.json()
  const l = normLang(lang)
  const page = String(text).replace(/\s+/g, ' ').slice(0, 8000)
  if (page.length < 40) return c.json({ error: 'not enough text' }, 400)
  const system = `You rewrite Austrian public service web pages for citizens. Output in ${LANG_NAMES[l]}. ${levelText(!!simple)}
Keep official German terms in brackets. Only use what the page says. Add: "Only the German original is legally binding." in the target language at the end of the summary when the target language is not German.`
  try {
    if (hasBedrock(c.env)) {
      const r = await structured(c.env, system, [{ text: `PAGE:\n${page}\n\nPROFILE: ${JSON.stringify(profile)}` }], 'page_explanation', 'Plain language explanation of a page', EXPLAIN_SCHEMA, 1000)
      await log(c.env, null, 'explain', { lang: l })
      return c.json(r)
    }
    const txt = await workersText(c.env, system + '\nAnswer with a short summary and then 3-5 bullet points starting with "- ".', page, 700)
    const lines = txt.split('\n').map((x) => x.trim()).filter(Boolean)
    return c.json({
      summary: lines.filter((x) => !x.startsWith('-')).join(' '),
      key_points: lines.filter((x) => x.startsWith('-')).map((x) => x.slice(1).trim()),
      terms: [], degraded: true,
    })
  } catch (e) {
    console.error(e)
    return c.json({ error: 'explain failed' }, 502)
  }
})

misc.post('/stt', async (c) => {
  if (!hasVoice(c.env)) return c.json({ error: 'voice not configured' }, 501)
  const body = await c.req.parseBody()
  const audio = body['audio']
  if (!(audio instanceof File)) return c.json({ error: 'no audio' }, 400)
  return c.json(await stt(c.env, audio))
})

misc.post('/tts', async (c) => {
  if (!hasVoice(c.env)) return c.json({ error: 'voice not configured' }, 501)
  const { text } = await c.req.json()
  const stream = await tts(c.env, String(text ?? ''))
  return new Response(stream, { headers: { 'content-type': 'audio/mpeg' } })
})

export default misc
