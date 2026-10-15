export type Env = {
  AI: Ai
  VECTORIZE: VectorizeIndex
  DB: D1Database
  AWS_REGION: string
  BEDROCK_MODEL_ID: string
  AI_GATEWAY_ID?: string
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  ELEVENLABS_API_KEY?: string
  ELEVENLABS_VOICE_ID?: string
  ADMIN_TOKEN?: string
}

export type Lang = 'de' | 'en' | 'bcs' | 'tr' | 'ar' | 'uk'

export type Session = {
  id: string
  citizen_id: string
  lang: Lang
  simple: boolean
  messages: any[] // Bedrock Converse message format
  pending: any[] // toolResult blocks sent with the next user message
}

export type ChatResult = {
  message: string
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
  quick_replies: string[]
  draft?: any
  handoff?: { id: string }
  degraded?: boolean
  debug: { tools: string[]; ms: number }
}

export type AppEnv = { Bindings: Env }
