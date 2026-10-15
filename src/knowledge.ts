import type { Env } from './types'

export type Hit = { title: string; url: string; text: string; score: number }

export async function searchKnowledge(env: Env, query: string, topK = 4): Promise<Hit[]> {
  try {
    const emb: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: [query] } as any)
    const res = await env.VECTORIZE.query(emb.data[0], { topK, returnMetadata: 'all' })
    return res.matches
      .filter((m) => m.score > 0.45) // tune on test day
      .map((m: any) => ({ title: m.metadata.title, url: m.metadata.url, text: m.metadata.text, score: +m.score.toFixed(2) }))
  } catch (e) {
    console.error('knowledge search failed', e)
    return []
  }
}

export function chunk(text: string, size = 900) {
  const paras = text.split(/\n\s*\n/)
  const out: string[] = []
  let cur = ''
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > size && cur) {
      out.push(cur.trim())
      cur = ''
    }
    cur += '\n\n' + p
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

export async function ingest(env: Env, docs: { id: string; url: string; title: string; lang: string; text: string }[]) {
  let count = 0
  for (const d of docs) {
    const parts = chunk(d.text)
    for (let i = 0; i < parts.length; i += 20) {
      const batch = parts.slice(i, i + 20)
      const emb: any = await env.AI.run('@cf/baai/bge-m3' as any, { text: batch } as any)
      await env.VECTORIZE.upsert(
        batch.map((t, j) => ({
          id: `${d.id}-${i + j}`,
          values: emb.data[j],
          metadata: { url: d.url, title: d.title, lang: d.lang, text: t },
        }))
      )
      count += batch.length
    }
  }
  return count
}
