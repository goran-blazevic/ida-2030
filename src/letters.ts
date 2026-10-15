import type { Env } from './types'
import { addDays, daysBetween, deemedDelivery, isoDate, today } from './util'

export async function listLetters(env: Env) {
  const rows = (await env.DB.prepare('SELECT * FROM letters ORDER BY notified_offset_days DESC').all<any>()).results
  const t = today()
  return rows.map((r) => {
    const notified = addDays(t, r.notified_offset_days)
    const delivered = r.delivery === 'RSb' ? deemedDelivery(notified) : notified
    const deadline = r.deadline_days ? addDays(delivered, r.deadline_days) : null
    return {
      id: r.id,
      sender: r.sender,
      subject: r.subject,
      delivery: r.delivery,
      notified_at: isoDate(notified),
      delivered_at: isoDate(delivered),
      deadline: deadline ? isoDate(deadline) : null,
      days_left: deadline ? daysBetween(t, deadline) : null,
      amount_eur: r.amount_eur,
      body: String(r.body).replace(/\\n/g, '\n').replace('{{deadline}}', deadline ? fmtDE(deadline) : '-'),
    }
  })
}

const fmtDE = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`

export const LETTER_SCHEMA = {
  type: 'object',
  properties: {
    sender: { type: 'string' },
    subject: { type: 'string' },
    letter_type: { type: 'string', enum: ['payment', 'request_documents', 'decision', 'information', 'appointment', 'other'] },
    summary_plain: { type: 'string', description: 'What this letter means, 2-4 short sentences in the target language and level' },
    deadline_date: { type: 'string', description: 'YYYY-MM-DD if a concrete date is written in the letter, else empty string' },
    deadline_text: { type: 'string', description: 'The deadline as written in the letter, e.g. "binnen zwei Wochen", else empty string' },
    amount_eur: { type: 'number', description: 'Amount to pay in EUR, 0 if none' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          kind: { type: 'string', enum: ['pay', 'send_documents', 'appeal', 'reply', 'appointment', 'nothing', 'ask_human'] },
        },
        required: ['label', 'kind'],
      },
    },
    consequences: { type: 'string', description: 'What happens if the citizen does nothing (only if stated in the letter)' },
    reply_draft: { type: 'string', description: 'Short polite reply in German if a reply or documents are needed, else empty string' },
    uncertain: { type: 'array', items: { type: 'string' }, description: 'Parts that are unreadable or unclear' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['sender', 'subject', 'letter_type', 'summary_plain', 'actions', 'confidence'],
}

/** Canned explanations so the UI works before AWS keys are set (DEMO MODE). */
export function demoExplanation(id: string, lang: 'de' | 'en', letter?: any) {
  const de = lang === 'de'
  const base = { demo: true, uncertain: [], confidence: 'high', deadline_date: letter?.deadline ?? null, amount_eur: letter?.amount_eur ?? null, sender: letter?.sender ?? '', subject: letter?.subject ?? '' }
  if (id === 'L1') return { ...base, letter_type: 'payment',
    summary_plain: de ? 'Sie haben beim Parken nicht bezahlt. Wenn Sie 36 Euro rechtzeitig zahlen, ist alles erledigt. Einspruch ist bei diesem Brief nicht möglich.' : 'You did not pay for parking. If you pay 36 euros in time, the matter is closed. You cannot appeal this letter.',
    deadline_text: de ? 'bis zum angegebenen Datum einzahlen' : 'pay by the date in the letter',
    consequences: de ? 'Wenn Sie nicht zahlen, startet ein Strafverfahren gegen die Person, die gefahren ist.' : 'If you do not pay, a penalty procedure starts against the driver.',
    actions: [{ label: de ? '36 € mit dem Zahlschein überweisen' : 'Pay €36 with the payment slip', kind: 'pay' }, { label: de ? 'Frist in den Kalender' : 'Add deadline to calendar', kind: 'nothing' }],
    reply_draft: null }
  if (id === 'L2') return { ...base, letter_type: 'request_documents',
    summary_plain: de ? 'Das Finanzamt braucht Belege für Ihre Krankheitskosten und Spenden. Schicken Sie diese rechtzeitig, sonst zählen die Beträge nicht.' : 'The tax office needs receipts for your medical costs and donations. Send them in time, otherwise these amounts will not count.',
    deadline_text: de ? 'bis zum angegebenen Datum' : 'by the date in the letter',
    consequences: de ? 'Ohne Belege werden 1.240 € Krankheitskosten nicht berücksichtigt.' : 'Without receipts, €1,240 medical costs will not be considered.',
    actions: [{ label: de ? 'Belege über FinanzOnline hochladen' : 'Upload receipts via FinanzOnline', kind: 'send_documents' }, { label: de ? 'Mit einer Person sprechen' : 'Talk to a person', kind: 'ask_human' }],
    reply_draft: 'Sehr geehrte Damen und Herren,\n\nanbei übermittle ich die angeforderten Belege zur Arbeitnehmerveranlagung 2025 (Krankheitskosten und Spendenbestätigung).\n\nMit freundlichen Grüßen' }
  return { ...base, letter_type: 'request_documents',
    summary_plain: de ? 'Die Krankenkasse braucht eine Bestätigung, dass Ihr Angehöriger bei Ihnen wohnt. Eine Meldebestätigung reicht.' : 'The health insurance needs proof that your family member lives with you. A registration confirmation (Meldebestätigung) is enough.',
    deadline_text: de ? 'bis zum angegebenen Datum' : 'by the date in the letter',
    consequences: de ? 'Sonst kann die Mitversicherung enden.' : 'Otherwise the co-insurance may end.',
    actions: [{ label: de ? 'Meldebestätigung online holen' : 'Get Meldebestätigung online', kind: 'send_documents' }, { label: de ? 'Bei der ÖGK hochladen' : 'Upload at ÖGK', kind: 'send_documents' }],
    reply_draft: null }
}
