# ida 2030: Digital Public Service Assistant (Hackathon prototype)

Cloudflare Workers (Hono, TypeScript) backend + HTML / CSS / jQuery / Bootstrap 5 frontend.
AI: AWS Bedrock (Claude or Nova) · Workers AI (embeddings, fallback) · Vectorize (RAG) · D1 (data) · ElevenLabs (voice).
All citizen data is **simulated**.

## Pages

| Page | What it shows |
|---|---|
| `/` | "What happened?" intent box (text or voice), life-event tiles, proactive nudges (passport expiry, letter deadlines) |
| `/umzug.html` | **Life Event Navigator**: one form, then a personal plan in 3 lanes (ida does it / automatic / your tasks), pre-filled Meldung, confirm, simulated Once-Only notification of authorities, templates |
| `/brief.html` | **Deadline Radar**: demo Postkorb, AI letter explainer (photo/PDF/text), red deadline stamp, amount, to-dos, reply draft, `.ics` calendar file, RSb delivery rule |
| `/reisepass.html` | **Counter-ready passport**: eligibility, checklist, AI photo pre-check (camera/upload), appointment finder across all offices, QR counter pass |
| `/assistant.html` | Agent chat (Bedrock tools), sources, confidence, form draft + citizen-only confirm |
| `/admin.html` | **Officials' cockpit**: KPIs, submitted cases (structured JSON), call backs with summary, bookings, questions without good answers |
| every page | **Explain this page** (plain language + any language), **Talk to a person** (call back with context), language switch DE/EN/BCS/TR/AR/UK (RTL for Arabic), plain language, large text, read aloud |

## Run it

```bash
npm install
npx wrangler login
npx wrangler d1 create gov-db                 # paste database_id into wrangler.jsonc
npx wrangler vectorize create gov-docs --dimensions=1024 --metric=cosine
npm run db:local && npm run db:remote         # schema + demo personas + demo letters
cp .dev.vars.example .dev.vars                # fill in keys
npm run dev                                   # http://localhost:8787 (remote mode: real Workers AI + Vectorize)
```

Secrets for production:

```bash
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_VOICE_ID
npx wrangler secret put ADMIN_TOKEN
npm run deploy
ADMIN_TOKEN=... BASE=https://ida-2030.<sub>.workers.dev npm run ingest
BASE=https://ida-2030.<sub>.workers.dev npm test
```

Set `BEDROCK_MODEL_ID` in `wrangler.jsonc` to your inference profile ID (Bedrock console > Cross-region inference, region eu-central-1).

## Demo mode (works before keys are set)

- No AWS keys: letters use prepared sample explanations, photo check returns a demo result, the assistant answers in degraded mode via Workers AI. A yellow strip shows "Demo mode".
- No ElevenLabs keys: read-aloud uses the browser voice, the mic uses browser speech recognition (Chrome/Edge).

## Guardrails (for the jury)

- The model has **no submit tool**. Only the citizen's Confirm button calls `/api/drafts/:id/confirm`.
- Every agent turn ends with a forced `final_answer` (message, confidence, sources, quick replies).
- Facts only from `search_knowledge` (RAG on oesterreich.gv.at pages in `content/`), sources shown.
- Letters and photos are **not stored**.
- Bedrock timeout 25 s, max 6 agent steps, degraded mode, human handoff works without AI.

## API

`GET /api/status` · `POST /api/session` · `GET /api/me` · `POST /api/intent` · `POST /api/chat` · `POST /api/drafts/:id/confirm` · `POST /api/handoff`
`POST /api/life/moving` · `POST /api/life/notify`
`GET /api/letters` · `POST /api/letters/explain` · `GET /api/letters/calendar.ics`
`GET /api/passport/status` · `POST /api/passport/photo-check` · `GET /api/passport/offices` · `POST /api/passport/book`
`POST /api/explain` · `POST /api/stt` · `POST /api/tts`
`GET /api/admin/overview` · `POST /api/admin/handoffs/:id/close` · `POST /api/admin/ingest` (header `x-admin-token`)

## Known limitations

Mock offices and appointment slots, mock letters, simulated authority notifications, fixed-date holidays only (no Easter-based ones), UI texts complete in DE/EN/BCS (TR/AR/UK UI falls back to English, AI answers come in the chosen language). Verify all content in `content/` against the live pages before the demo.
