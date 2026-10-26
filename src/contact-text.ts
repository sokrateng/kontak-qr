import { availableLinks, formatPhone, webUrl } from './links.ts'
import type { LinkEntry, Profile } from './types.ts'
import { fullName } from './vcard.ts'

function displayName(p: Profile): string {
  return fullName(p) || p.company
}

function join(lines: readonly (string | null)[]): string {
  return lines
    .filter((line): line is string => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Mesaj olarak gönderilen, okunabilir kişi bilgisi. Alıcı numaraya dokunup rehbere ekleyebilir.
 * "short": QR'daki kısa kartla aynı alanlar (ad, firma, telefon, e-posta).
 * "full": tüm bilgiler.
 */
export function contactText(p: Profile, detail: 'full' | 'short' = 'full'): string {
  const name = displayName(p)
  const phone = p.phone.trim() === '' ? null : `Telefon: ${formatPhone(p.phone)}`
  const email = p.email.trim() === '' ? null : `E-posta: ${p.email.trim()}`

  if (detail === 'short') {
    const company = p.company.trim() !== '' && p.company !== name ? p.company : null
    return join([name, company, '', phone, email])
  }

  const role = [p.title, p.company].filter((s) => s.trim() !== '' && s !== name).join(' · ')
  const links = availableLinks(p)
  const linkLine = (key: string, label: string): string | null => {
    const found = links.find((l) => l.key === key)
    return found === undefined ? null : `${label}: ${found.url}`
  }
  const locationLines = links.filter((l) => l.key.startsWith('loc:')).map((l) => `${l.label}: ${l.url}`)
  return join([
    name,
    role === '' ? null : role,
    '',
    phone,
    email,
    p.website.trim() === '' ? null : `Web: ${webUrl(p.website)}`,
    p.address.trim() === '' ? null : `Adres: ${p.address.trim().replace(/\s*\n\s*/g, ', ')}`,
    ...locationLines,
    linkLine('linkedin', 'LinkedIn'),
    linkLine('x', 'X'),
    linkLine('whatsapp', 'WhatsApp'),
  ])
}

/** "Tek link" modunda gönderilen mesaj: kimin hangi linki olduğu ve link. */
export function linkMessage(p: Profile, link: LinkEntry): string {
  return `${displayName(p)} · ${link.label}\n${link.url}`
}
