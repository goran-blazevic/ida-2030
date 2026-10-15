export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setUTCDate(x.getUTCDate() + n)
  return x
}

// Fixed-date Austrian public holidays (Easter-based holidays are not included: demo simplification)
const FIXED_HOLIDAYS = ['01-01', '01-06', '05-01', '08-15', '10-26', '11-01', '12-08', '12-25', '12-26']
export const isWorkingDay = (d: Date) =>
  d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !FIXED_HOLIDAYS.includes(isoDate(d).slice(5))

// Electronic delivery with proof (RSa/RSb in Mein Postkorb): deemed delivered on the first working day after notification
export function deemedDelivery(notified: Date) {
  let d = addDays(notified, 1)
  while (!isWorkingDay(d)) d = addDays(d, 1)
  return d
}

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5)

export const today = () => {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

export function icsEscape(s: string) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}
