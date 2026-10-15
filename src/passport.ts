import { addDays, isWorkingDay, isoDate, today } from './util'

export const PHOTO_CRITERIA = [
  { id: 'face', de: 'Gesicht frontal, gerade, vollständig sichtbar', en: 'Face frontal, straight, fully visible' },
  { id: 'expression', de: 'Neutraler Ausdruck, Mund geschlossen', en: 'Neutral expression, mouth closed' },
  { id: 'eyes', de: 'Augen offen, keine Reflexion, keine getönte Brille', en: 'Eyes open, no glare, no tinted glasses' },
  { id: 'background', de: 'Heller, einfarbiger Hintergrund ohne Muster', en: 'Light, plain background without pattern' },
  { id: 'lighting', de: 'Gleichmäßiges Licht, keine Schatten im Gesicht', en: 'Even light, no shadows on the face' },
  { id: 'sharpness', de: 'Scharf und kontrastreich', en: 'Sharp with good contrast' },
  { id: 'covering', de: 'Keine Kopfbedeckung (Ausnahme: religiöse Gründe)', en: 'No head covering (exception: religious reasons)' },
  { id: 'framing', de: 'Kopf zentriert, Kopf und Schultern im Bild (35×45 mm)', en: 'Head centred, head and shoulders in frame (35×45 mm)' },
]

export const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', enum: PHOTO_CRITERIA.map((c) => c.id) },
          status: { type: 'string', enum: ['pass', 'fail', 'unsure'] },
          note: { type: 'string' },
        },
        required: ['id', 'status'],
      },
    },
    overall: { type: 'string', enum: ['ok', 'retake', 'unsure'] },
    tip: { type: 'string', description: 'One concrete tip to fix the photo, in the target language' },
  },
  required: ['results', 'overall', 'tip'],
}

// Mock passport offices. Real data would come from the official authority directory.
export const OFFICES = [
  { id: 'w-mba-06', name: 'Magistratisches Bezirksamt 6 (Demo)', city: 'Wien', postal: '1060', address: 'Demo-Adresse, 1060 Wien' },
  { id: 'w-mba-07', name: 'Magistratisches Bezirksamt 7 (Demo)', city: 'Wien', postal: '1070', address: 'Demo-Adresse, 1070 Wien' },
  { id: 'w-mba-10', name: 'Magistratisches Bezirksamt 10 (Demo)', city: 'Wien', postal: '1100', address: 'Demo-Adresse, 1100 Wien' },
  { id: 'w-mba-15', name: 'Magistratisches Bezirksamt 15 (Demo)', city: 'Wien', postal: '1150', address: 'Demo-Adresse, 1150 Wien' },
  { id: 'n-bh-moe', name: 'Bezirkshauptmannschaft Mödling (Demo)', city: 'Mödling', postal: '2340', address: 'Demo-Adresse, 2340 Mödling' },
  { id: 'st-graz', name: 'Magistrat Graz (Demo)', city: 'Graz', postal: '8010', address: 'Demo-Adresse, 8010 Graz' },
]

// deterministic pseudo-random availability, so the demo looks stable
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967295
}

export function slotsFor(officeId: string, count = 6) {
  const out: string[] = []
  let d = addDays(today(), 1)
  for (let i = 0; i < 20 && out.length < count; i++, d = addDays(d, 1)) {
    if (!isWorkingDay(d)) continue
    for (let m = 8 * 60; m < 12 * 60 && out.length < count; m += 20) {
      const slot = `${isoDate(d)}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
      if (hash(officeId + slot) > 0.86) out.push(slot)
    }
  }
  return out
}

export function rankOffices(postal: string) {
  const p = String(postal || '')
  return OFFICES.map((o) => {
    const score = o.postal === p ? 0 : o.postal.slice(0, 2) === p.slice(0, 2) ? 1 : o.postal[0] === p[0] ? 2 : 3
    const slots = slotsFor(o.id)
    return { ...o, score, slots, next: slots[0] ?? null }
  }).sort((a, b) => a.score - b.score || String(a.next).localeCompare(String(b.next)))
}

export function demoPhotoCheck() {
  return {
    demo: true,
    results: PHOTO_CRITERIA.map((c) => ({ id: c.id, status: c.id === 'lighting' ? 'unsure' : 'pass', note: '' })),
    overall: 'unsure',
    tip: 'Demo mode: AI photo check needs AWS Bedrock keys.',
  }
}
