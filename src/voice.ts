import type { Env } from './types'

export const hasVoice = (env: Env) => Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID)

// Speech to text (ElevenLabs Scribe). Language auto-detected: works for dialect and mixed languages.
export async function stt(env: Env, audio: File) {
  const fd = new FormData()
  fd.append('model_id', 'scribe_v1')
  fd.append('file', audio, 'speech.webm')
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY! },
    body: fd,
  })
  if (!r.ok) throw new Error(`STT ${r.status}: ${await r.text()}`)
  const j: any = await r.json()
  return { text: String(j.text || '').trim(), language: j.language_code }
}

// Text to speech (ElevenLabs, low-latency multilingual model), streamed to the browser
export async function tts(env: Env, text: string) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}/stream?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': env.ELEVENLABS_API_KEY!, 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 800), model_id: 'eleven_flash_v2_5' }),
    }
  )
  if (!r.ok) throw new Error(`TTS ${r.status}: ${await r.text()}`)
  return r.body!
}
