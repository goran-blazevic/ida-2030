import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { ingest } from '../knowledge'

const admin = new Hono<AppEnv>()

admin.use('*', async (c, next) => {
  if (!c.env.ADMIN_TOKEN || c.req.header('x-admin-token') !== c.env.ADMIN_TOKEN) return c.json({ error: 'unauthorized' }, 401)
  await next()
})

admin.get('/overview', async (c) => {
  const db = c.env.DB
  const [cases, handoffs, bookings, notes, lowConf, counts] = await Promise.all([
    db.prepare('SELECT * FROM cases ORDER BY created_at DESC LIMIT 50').all(),
    db.prepare('SELECT * FROM handoffs ORDER BY (status = \'open\') DESC, created_at DESC LIMIT 50').all(),
    db.prepare('SELECT * FROM bookings ORDER BY slot ASC LIMIT 50').all(),
    db.prepare('SELECT target, COUNT(*) AS n FROM notifications GROUP BY target ORDER BY n DESC').all(),
    db.prepare(`SELECT json_extract(payload, '$.text') AS text, created_at FROM logs
                WHERE type = 'turn' AND json_extract(payload, '$.confidence') = 'low'
                ORDER BY created_at DESC LIMIT 20`).all(),
    db.prepare(`SELECT
        (SELECT COUNT(*) FROM cases) AS cases,
        (SELECT COUNT(*) FROM handoffs WHERE status = 'open') AS open_handoffs,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COUNT(*) FROM notifications) AS notifications,
        (SELECT COUNT(*) FROM logs WHERE type = 'turn') AS turns,
        (SELECT COUNT(*) FROM logs WHERE type = 'letter_explain') AS letters`).first(),
  ])
  return c.json({
    counts, cases: cases.results, handoffs: handoffs.results, bookings: bookings.results,
    notifications: notes.results, low_confidence: lowConf.results,
  })
})

admin.post('/handoffs/:id/close', async (c) => {
  await c.env.DB.prepare("UPDATE handoffs SET status = 'closed' WHERE id = ?").bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

admin.post('/ingest', async (c) => {
  const docs = await c.req.json()
  return c.json({ ok: true, chunks: await ingest(c.env, docs) })
})

export default admin
