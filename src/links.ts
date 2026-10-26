import type { LinkEntry, Profile } from './types.ts'

const SCHEME = /^https?:\/\//i

export function phoneDigits(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, '')
  if (cleaned === '') return ''
  if (cleaned.startsWith('+')) return cleaned.slice(1).replace(/\D/g, '')
  if (cleaned.startsWith('00')) return cleaned.slice(2)
  if (cleaned.startsWith('0') && cleaned.length === 11) return `90${cleaned.slice(1)}`
  if (cleaned.length === 10 && cleaned.startsWith('5')) return `90${cleaned}`
  return cleaned
}

export function e164(raw: string): string {
  const digits = phoneDigits(raw)
  return digits === '' ? '' : `+${digits}`
}

export function formatPhone(raw: string): string {
  const digits = phoneDigits(raw)
  if (digits === '') return ''
  if (digits.startsWith('90') && digits.length === 12) {
    return `+90 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10)}`
  }
  return `+${digits}`
}

export function whatsappUrl(raw: string): string {
  const digits = phoneDigits(raw)
  return digits === '' ? '' : `https://wa.me/${digits}`
}

/** WhatsApp'ın kullanıcı adı için ürettiği linki olduğu gibi kabul eder. Düz "@ad" bir link olmadığı için yok sayılır. */
export function whatsappProfileUrl(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  return SCHEME.test(value) || /^(www\.)?(wa\.me|whatsapp\.com)\//i.test(value) ? webUrl(value) : ''
}

export function webUrl(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  return SCHEME.test(value) ? value : `https://${value.replace(/^\/+/, '')}`
}

/** Paylaşım linklerindeki takip parametrelerini (?utm_source=..., #...) atar, QR'ı kısaltır. */
function withoutTracking(url: string): string {
  return url.replace(/[?#].*$/, '')
}

function handleUrl(raw: string, hostPattern: RegExp, base: string): string {
  const value = raw.trim()
  if (value === '') return ''
  if (SCHEME.test(value)) return withoutTracking(value)
  if (hostPattern.test(value)) return withoutTracking(webUrl(value))
  return `${base}${withoutTracking(value).replace(/^@/, '').replace(/^\/+/, '')}`
}

export function linkedinUrl(raw: string): string {
  return handleUrl(raw, /linkedin\.com/i, 'https://www.linkedin.com/in/')
}

export function xUrl(raw: string): string {
  return handleUrl(raw, /(^|\.)(x|twitter)\.com/i, 'https://x.com/')
}

/** Harita linki ya da düz adres. Düz adres, Google Haritalar arama linkine çevrilir. */
export function locationUrl(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  if (SCHEME.test(value) || /^(www\.)?(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.apple\.com)/i.test(value)) {
    return webUrl(value)
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
}

/** "İş" -> "İş konumu", boşsa "Konum". Kullanıcı zaten "konum" yazdıysa olduğu gibi bırakır. */
export function locationLabel(label: string): string {
  const value = label.trim()
  if (value === '') return 'Konum'
  return /konum/i.test(value) ? value : `${value} konumu`
}

export function availableLinks(p: Profile): readonly LinkEntry[] {
  const locations: LinkEntry[] = p.locations.map((loc) => ({
    key: `loc:${loc.id}` as const,
    label: locationLabel(loc.label),
    url: locationUrl(loc.place),
  }))
  const entries: LinkEntry[] = [
    { key: 'linkedin', label: 'LinkedIn', url: linkedinUrl(p.linkedin) },
    { key: 'x', label: 'X', url: xUrl(p.x) },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      url: whatsappProfileUrl(p.whatsappLink) || (p.whatsappFromPhone ? whatsappUrl(p.phone) : ''),
    },
    { key: 'website', label: 'Web', url: webUrl(p.website) },
    ...locations,
  ]
  return entries.filter((entry) => entry.url !== '')
}
