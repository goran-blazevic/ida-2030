import type { Env, Session } from './types'
import { normLang } from './lang'

export async function loadSession(env: Env, id: string): Promise<Session | null> {
  if (!id) return null
  const r: any = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(id).first()
  if (!r) return null
  return {
    id: r.id,
    citizen_id: r.citizen_id,
    lang: normLang(r.lang),
    simple: false,
    messages: JSON.parse(r.messages || '[]'),
    pending: JSON.parse(r.pending || '[]'),
  }
}

export async function saveSession(env: Env, s: Session) {
  await env.DB.prepare(
    "UPDATE sessions SET messages = ?, pending = ?, lang = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(JSON.stringify(s.messages), JSON.stringify(s.pending), s.lang, s.id).run()
}

export async function getCitizen(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM citizens WHERE id = ?').bind(id).first<any>()
}

export async function log(env: Env, sessionId: string | null, type: string, payload: unknown) {
  try {
    await env.DB.prepare('INSERT INTO logs (session_id, type, payload) VALUES (?, ?, ?)')
      .bind(sessionId, type, JSON.stringify(payload)).run()
  } catch (e) {
    console.error('log failed', e)
  }
}
