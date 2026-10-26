import type { Location, Profile } from './types.ts'
import { emptyProfile, newId } from './validate.ts'

interface Field {
  readonly name: string
  readonly types: readonly string[]
  readonly value: string
}

const LINKEDIN = /linkedin\.com/i
const X_HOST = /(^|[/.])(x|twitter)\.com/i
const WA_ME_NUMBER = /wa\.me\/\+?\d+\/?$/i
const WA_HOST = /(wa\.me|whatsapp\.com)\//i
const MAPS = /(maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.apple\.com|maps\.google)/i

/** Katlanmış satırları (ve vCard 2.1 quoted-printable devam satırlarını) birleştirir. */
function unfold(text: string): string[] {
  const out: string[] = []
  text.split(/\r\n|\n|\r/).forEach((raw) => {
    const prev = out[out.length - 1]
    if (prev !== undefined && /^[ \t]/.test(raw)) {
      out[out.length - 1] = prev + raw.slice(1)
    } else if (prev !== undefined && /quoted-printable/i.test(prev) && prev.endsWith('=')) {
      out[out.length - 1] = prev.slice(0, -1) + raw
    } else {
      out.push(raw)
    }
  })
  return out
}

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = []
  for (let i = 0; i < value.length; i += 1) {
    const hex = value.slice(i + 1, i + 3)
    if (value[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      bytes.push(...new TextEncoder().encode(value.charAt(i)))
    }
  }
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function unescapeText(value: string): string {
  return value.replace(/\\([\s\S])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char))
}

/** Bileşenlere ayrılacak değerler için: kaçışlanmamış ayırıcıdan böler, sonra çözer. */
function splitUnescaped(value: string, separator: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i)
    if (char === '\\') {
      current += value.slice(i, i + 2)
      i += 1
    } else if (char === separator) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map((part) => unescapeText(part).trim())
}

function parseField(line: string): Field | null {
  const colon = line.indexOf(':')
  if (colon <= 0) return null
  const head = line.slice(0, colon)
  const rawValue = line.slice(colon + 1)
  const pieces = head.split(';')
  const name = (pieces[0] ?? '').replace(/^.*\./, '').toUpperCase()
  const params = pieces.slice(1).map((p) => p.trim())
  const types = params
    .flatMap((p) => (/^type=/i.test(p) ? p.slice(5).split(',') : /^[a-z]+$/i.test(p) ? [p] : []))
    .map((t) => t.replace(/"/g, '').toLowerCase())
  const isQp = params.some((p) => /encoding=quoted-printable/i.test(p))
  return { name, types, value: isQp ? decodeQuotedPrintable(rawValue) : rawValue }
}

function pick(fields: readonly Field[], name: string, preferred: readonly string[] = []): Field | undefined {
  const matching = fields.filter((f) => f.name === name && f.value.trim() !== '')
  for (const type of preferred) {
    const found = matching.find((f) => f.types.includes(type))
    if (found !== undefined) return found
  }
  return matching[0]
}

function text(field: Field | undefined): string {
  return field === undefined ? '' : unescapeText(field.value).trim()
}

function parseName(fields: readonly Field[]): { first: string; last: string } {
  const n = pick(fields, 'N')
  if (n !== undefined) {
    const parts = splitUnescaped(n.value, ';')
    const family = parts[0] ?? ''
    const first = [parts[1] ?? '', parts[2] ?? ''].filter((s) => s !== '').join(' ')
    if (first !== '' || family !== '') return { first, last: family }
  }
  const words = text(pick(fields, 'FN')).split(/\s+/).filter((w) => w !== '')
  const last = words.length > 1 ? (words.pop() ?? '') : ''
  return { first: words.join(' '), last }
}

function parseAddress(fields: readonly Field[]): string {
  const adr = pick(fields, 'ADR', ['work', 'pref'])
  if (adr === undefined) return ''
  const parts = splitUnescaped(adr.value, ';')
  return [2, 3, 4, 5, 6]
    .map((i) => parts[i] ?? '')
    .filter((s) => s !== '')
    .join(', ')
}

type UrlSlots = Pick<Profile, 'website' | 'linkedin' | 'x' | 'whatsappLink' | 'locations'>

function classifyUrls(fields: readonly Field[]): UrlSlots {
  const slots = { website: '', linkedin: '', x: '', whatsappLink: '' }
  const locations: Location[] = []
  fields
    .filter((f) => f.name === 'URL' || f.name === 'X-SOCIALPROFILE')
    .map((f) => unescapeText(f.value).trim())
    .filter((url) => url !== '')
    .forEach((url) => {
      if (LINKEDIN.test(url)) slots.linkedin = slots.linkedin || url
      else if (X_HOST.test(url)) slots.x = slots.x || url
      else if (WA_ME_NUMBER.test(url)) return
      else if (WA_HOST.test(url)) slots.whatsappLink = slots.whatsappLink || url
      else if (MAPS.test(url)) locations.push({ id: newId(), label: '', place: url })
      else slots.website = slots.website || url
    })
  return { ...slots, locations }
}

function toProfile(fields: readonly Field[]): Profile | null {
  const name = parseName(fields)
  const orgField = pick(fields, 'ORG')
  const company = orgField === undefined ? '' : (splitUnescaped(orgField.value, ';')[0] ?? '')
  if (name.first === '' && name.last === '' && company === '') return null
  return {
    ...emptyProfile(false),
    firstName: name.first,
    lastName: name.last,
    company,
    title: text(pick(fields, 'TITLE')),
    phone: text(pick(fields, 'TEL', ['cell', 'iphone', 'mobile', 'pref', 'work'])),
    email: text(pick(fields, 'EMAIL', ['work', 'pref', 'internet'])),
    address: parseAddress(fields),
    ...classifyUrls(fields),
  }
}

/** Bir .vcf metnindeki tüm kişileri (iOS Rehber, Android, vCard 2.1/3.0/4.0) Profile'a çevirir. */
export function parseVCards(source: string): readonly Profile[] {
  const profiles: Profile[] = []
  let current: Field[] | null = null
  unfold(source).forEach((line) => {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      current = []
    } else if (upper === 'END:VCARD') {
      const profile = current === null ? null : toProfile(current)
      if (profile !== null) profiles.push(profile)
      current = null
    } else if (current !== null) {
      const field = parseField(line)
      if (field !== null) current.push(field)
    }
  })
  return profiles
}
