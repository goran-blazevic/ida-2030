export const SERVICE_IDS = ['address_change', 'passport_renewal'] as const
export type ServiceId = (typeof SERVICE_IDS)[number]

type ServiceDef = {
  title: { de: string; en: string }
  required: string[]
  labels: { de: Record<string, string>; en: Record<string, string> }
  validate: (d: Record<string, any>) => string[]
}

export const SERVICES: Record<ServiceId, ServiceDef> = {
  address_change: {
    title: { de: 'Wohnsitz ummelden', en: 'Register change of address' },
    // Online Ummeldung with ID Austria: no host signature, but host name + address are required
    required: ['new_street', 'new_postal_code', 'new_city', 'move_in_date', 'residence_type', 'host_name', 'host_address'],
    labels: {
      de: {
        new_street: 'Neue Adresse', new_postal_code: 'PLZ', new_city: 'Ort', move_in_date: 'Einzugsdatum',
        residence_type: 'Art des Wohnsitzes', host_name: 'Unterkunftgeber:in', host_address: 'Adresse Unterkunftgeber:in',
        children: 'Mitgemeldete Kinder',
      },
      en: {
        new_street: 'New address', new_postal_code: 'Postal code', new_city: 'City', move_in_date: 'Move-in date',
        residence_type: 'Type of residence', host_name: 'Accommodation provider', host_address: 'Provider address',
        children: 'Children registered too',
      },
    },
    validate: (d) => {
      const e: string[] = []
      if (d.new_postal_code && !/^\d{4}$/.test(String(d.new_postal_code))) e.push('new_postal_code must have 4 digits')
      if (d.move_in_date && isNaN(Date.parse(d.move_in_date))) e.push('move_in_date must be YYYY-MM-DD')
      if (d.residence_type && !['main', 'secondary'].includes(d.residence_type)) e.push('residence_type must be main or secondary')
      return e
    },
  },
  passport_renewal: {
    title: { de: 'Reisepass beantragen', en: 'Apply for a new passport' },
    required: ['reason', 'photo_ready', 'office', 'delivery'],
    labels: {
      de: { reason: 'Grund', photo_ready: 'Passfoto geprüft', office: 'Passbehörde', delivery: 'Zustellung', slot: 'Termin' },
      en: { reason: 'Reason', photo_ready: 'Photo checked', office: 'Passport office', delivery: 'Delivery', slot: 'Appointment' },
    },
    validate: (d) => {
      const e: string[] = []
      if (d.reason && !['expired', 'expiring', 'lost', 'stolen', 'damaged', 'full'].includes(d.reason)) e.push('reason invalid')
      if (d.delivery && !['mail', 'collect'].includes(d.delivery)) e.push('delivery must be mail or collect')
      return e
    },
  },
}

export function missingFields(id: ServiceId, data: Record<string, any>) {
  return SERVICES[id].required.filter((f) => data[f] === undefined || data[f] === null || data[f] === '')
}
