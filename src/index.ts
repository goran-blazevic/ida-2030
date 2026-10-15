import { Hono } from 'hono'
import type { AppEnv } from './types'
import core from './routes/core'
import life from './routes/life'
import letters from './routes/letters'
import passport from './routes/passport'
import misc from './routes/misc'
import admin from './routes/admin'

const app = new Hono<AppEnv>()

app.route('/api', core)
app.route('/api', misc)
app.route('/api/life', life)
app.route('/api/letters', letters)
app.route('/api/passport', passport)
app.route('/api/admin', admin)

app.notFound((c) => c.json({ error: 'not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'internal', message: 'Something went wrong. Please try again or talk to a person.' }, 500)
})

export default app
