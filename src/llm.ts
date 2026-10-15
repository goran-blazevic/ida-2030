import { AwsClient } from 'aws4fetch'
import type { Env } from './types'

export const hasBedrock = (env: Env) =>
  Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.BEDROCK_MODEL_ID && !env.BEDROCK_MODEL_ID.startsWith('PASTE'))

/** Raw call to the Bedrock Converse API (Claude / Nova). */
export async function converse(env: Env, body: Record<string, unknown>, timeoutMs = 25_000): Promise<any> {
  if (!hasBedrock(env)) throw new Error('Bedrock not configured')
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    region: env.AWS_REGION,
    service: 'bedrock',
  })
  const url = `https://bedrock-runtime.${env.AWS_REGION}.amazonaws.com/model/${encodeURIComponent(env.BEDROCK_MODEL_ID)}/converse`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await aws.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Bedrock ${res.status}: ${await res.text()}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Structured output: we force the model to call ONE tool whose input schema is the JSON we want.
 * Much more reliable than "please answer in JSON".
 */
export async function structured<T = any>(
  env: Env,
  system: string,
  content: any[],
  name: string,
  description: string,
  schema: Record<string, unknown>,
  maxTokens = 1500
): Promise<T> {
  const out = await converse(env, {
    system: [{ text: system }],
    messages: [{ role: 'user', content }],
    toolConfig: {
      tools: [{ toolSpec: { name, description, inputSchema: { json: schema } } }],
      toolChoice: { tool: { name } },
    },
    inferenceConfig: { maxTokens, temperature: 0.1 },
  })
  const block = out?.output?.message?.content?.find((b: any) => b.toolUse)
  if (!block) throw new Error('model returned no structured output')
  return block.toolUse.input as T
}

/** Cloudflare Workers AI text model: used as fallback when Bedrock is down or not configured. */
export async function workersText(env: Env, system: string, user: string, maxTokens = 600): Promise<string> {
  const opts = env.AI_GATEWAY_ID ? { gateway: { id: env.AI_GATEWAY_ID } } : undefined
  const r: any = await env.AI.run(
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any,
    { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: maxTokens } as any,
    opts as any
  )
  return String(r?.response ?? '').trim()
}
