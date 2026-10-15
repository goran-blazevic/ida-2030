import { addDays, isoDate } from './util'

const SRC_AFTER = 'https://www.oesterreich.gv.at/de/themen/bauen_und_wohnen/umzug/3/Seite.180520'
const SRC_BEFORE = 'https://www.oesterreich.gv.at/de/themen/bauen_und_wohnen/umzug/3/Seite.180510'
const SRC_MELDUNG = 'https://www.oesterreich.gv.at/de/landingpages/meldewesen'

/**
 * lane:
 *  'ida'  = ida prepares it / notifies with the citizen's consent (Vision 2030, simulated Once-Only)
 *  'auto' = nothing to do, per official source
 *  'you'  = the citizen must do it (private providers etc.), ida gives a template/link
 */
export type Step = {
  id: string
  lane: 'ida' | 'auto' | 'you'
  title: { de: string; en: string }
  detail: { de: string; en: string }
  authority: string
  deadline?: string
  source: string
  action?: 'confirm_meldung' | 'notify' | 'template' | 'link'
  link?: string
}

export type MovingInput = {
  new_street: string
  new_postal_code: string
  new_city: string
  move_in_date: string
  residence_type: 'main' | 'secondary'
  host_name: string
  host_address: string
  has_car?: boolean
  plate_changes?: boolean
  has_dog?: boolean
  children?: number
  employed?: boolean
  unemployed?: boolean
  student?: boolean
}

export function buildMovingPlan(profile: any, input: MovingInput) {
  const moveIn = new Date(input.move_in_date + 'T00:00:00Z')
  const meldungDeadline = isoDate(addDays(moveIn, 3))
  const kids = Number(input.children || 0)
  const steps: Step[] = []

  steps.push({
    id: 'meldung', lane: 'ida', action: 'confirm_meldung', authority: 'Meldebehörde',
    title: { de: 'Wohnsitz ummelden (Meldezettel)', en: 'Register your new address (Meldezettel)' },
    detail: {
      de: `ida hat das Formular schon ausgefüllt${kids ? `, inklusive ${kids} Kind(er)` : ''}. Sie prüfen und bestätigen. Frist: 3 Tage nach dem Einzug.`,
      en: `ida has pre-filled the form${kids ? `, including ${kids} child(ren)` : ''}. You check and confirm. Deadline: 3 days after moving in.`,
    },
    deadline: meldungDeadline, source: SRC_MELDUNG,
  })

  if (input.has_car) {
    if (input.plate_changes) {
      steps.push({
        id: 'kfz', lane: 'you', action: 'link', authority: 'Zulassungsstelle',
        title: { de: 'Auto: neues Kennzeichen', en: 'Car: new licence plate' },
        detail: {
          de: 'Ihr Bezirk ändert sich, deshalb ändert sich das Kennzeichen. Melden Sie das bei der Zulassungsstelle (Frist: eine Woche). Danach die Digitale Vignette umregistrieren.',
          en: 'Your district changes, so your plate changes. Report it to the registration office (deadline: one week). Then re-register your digital vignette.',
        },
        deadline: isoDate(addDays(moveIn, 7)), source: SRC_AFTER,
      })
    } else {
      steps.push({
        id: 'kfz', lane: 'auto', authority: 'Zulassungsbehörde',
        title: { de: 'Auto: Zulassung', en: 'Car registration' },
        detail: {
          de: 'Gleiche Behörde, gleiches Kennzeichen: Sie müssen nichts tun.',
          en: 'Same authority, same plate: you do not need to do anything.',
        },
        source: SRC_AFTER,
      })
    }
    steps.push({
      id: 'parken', lane: 'you', action: 'link', authority: 'Gemeinde',
      title: { de: 'Parkerlaubnis (Parkpickerl)', en: 'Parking permit' },
      detail: { de: 'Falls nötig: alte Parkerlaubnis zurücklegen, neue beantragen.', en: 'If needed: return the old parking permit, apply for a new one.' },
      source: SRC_AFTER,
    })
  }

  if (input.has_dog) {
    steps.push({
      id: 'hund', lane: 'you', action: 'link', authority: 'Gemeinde',
      title: { de: 'Hund ab- und anmelden', en: 'Deregister and register your dog' },
      detail: { de: 'Bei der alten Gemeinde abmelden, bei der neuen anmelden.', en: 'Deregister at your old municipality, register at the new one.' },
      source: SRC_AFTER,
    })
  }

  const notify = (id: string, authority: string, de: string, en: string) =>
    steps.push({
      id, lane: 'ida', action: 'notify', authority,
      title: { de, en },
      detail: {
        de: 'Mit Ihrer Zustimmung schickt ida die neue Adresse direkt weiter (Vision 2030, hier simuliert).',
        en: 'With your consent ida forwards the new address directly (Vision 2030, simulated here).',
      },
      source: SRC_AFTER,
    })

  notify('finanzamt', 'Finanzamt Österreich', 'Finanzamt informieren', 'Inform the tax office')
  notify('oegk', 'Krankenkasse (z.B. ÖGK)', 'Krankenkasse informieren', 'Inform your health insurance')
  notify('pva', 'Pensionsversicherungsanstalt', 'Pensionsversicherung informieren', 'Inform the pension insurance')
  notify('orf', 'ORF-Beitrag Service GmbH', 'ORF-Beitrag: Adresse ändern', 'ORF fee: change address')
  if (input.unemployed) notify('ams', 'AMS', 'AMS informieren', 'Inform the AMS (employment service)')
  if (input.student) notify('stip', 'Studienbeihilfenbehörde', 'Studienbeihilfe: Adresse ändern', 'Student grant office: change address')

  if (input.employed) {
    steps.push({
      id: 'arbeit', lane: 'you', action: 'template', authority: 'Arbeitgeber:in',
      title: { de: 'Arbeitgeber:in informieren', en: 'Inform your employer' },
      detail: { de: 'ida hat eine kurze E-Mail vorbereitet. Kopieren und senden.', en: 'ida prepared a short email. Copy and send.' },
      source: SRC_AFTER,
    })
  }
  if (kids) {
    steps.push({
      id: 'schule', lane: 'you', action: 'link', authority: 'Kindergarten / Schule',
      title: { de: 'Kindergarten / Schule', en: 'Kindergarten / school' },
      detail: { de: 'Neue Adresse melden, wenn nötig rechtzeitig neu anmelden.', en: 'Report the new address, register in time if you change school.' },
      source: SRC_BEFORE,
    })
  }

  const priv: [string, string, string][] = [
    ['post', 'Nachsendeauftrag bei der Post', 'Mail forwarding at the post office'],
    ['energie', 'Strom, Gas, Fernwärme ummelden', 'Move electricity, gas, heating contracts'],
    ['internet', 'Telefon und Internet', 'Phone and internet'],
    ['versicherung', 'Haushaltsversicherung informieren', 'Inform your home insurance'],
    ['bank', 'Bank und Daueraufträge anpassen', 'Update bank and standing orders'],
  ]
  for (const [id, de, en] of priv) {
    steps.push({
      id, lane: 'you', action: 'template', authority: 'Privat',
      title: { de, en },
      detail: { de: 'Das ist ein privater Vertrag. ida gibt Ihnen eine Vorlage.', en: 'This is a private contract. ida gives you a template.' },
      source: SRC_AFTER,
    })
  }

  const draftFields = {
    new_street: input.new_street, new_postal_code: input.new_postal_code, new_city: input.new_city,
    move_in_date: input.move_in_date, residence_type: input.residence_type,
    host_name: input.host_name, host_address: input.host_address,
    ...(kids ? { children: kids } : {}),
  }

  return {
    meldung_deadline: meldungDeadline,
    current_address: profile ? `${profile.street}, ${profile.postal_code} ${profile.city}` : null,
    steps,
    draftFields,
    sources: [SRC_MELDUNG, SRC_AFTER, SRC_BEFORE],
  }
}

export function templateText(stepId: string, profile: any, input: MovingInput, lang: 'de' | 'en') {
  const name = profile ? `${profile.first_name} ${profile.last_name}` : ''
  const addr = `${input.new_street}, ${input.new_postal_code} ${input.new_city}`
  if (lang === 'de') {
    return `Betreff: Adressänderung\n\nSehr geehrte Damen und Herren,\n\nbitte ändern Sie meine Adresse ab ${input.move_in_date} auf:\n${addr}\n\nMit freundlichen Grüßen\n${name}`
  }
  return `Subject: Change of address\n\nDear Sir or Madam,\n\nplease update my address from ${input.move_in_date} to:\n${addr}\n\nKind regards\n${name}`
}
