import { availableLinks, e164, webUrl } from './links.ts'
import type { Profile } from './types.ts'

const CRLF = '\r\n'

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function fullName(p: Pick<Profile, 'firstName' | 'lastName'>): string {
  return `${p.firstName} ${p.lastName}`.trim()
}

export function buildVCard(p: Profile, detail: 'full' | 'short'): string {
  const name = fullName(p)
  if (name === '' && p.company.trim() === '') return ''

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeText(p.lastName)};${escapeText(p.firstName)};;;`,
    `FN:${escapeText(name === '' ? p.company : name)}`,
  ]
  if (p.company.trim() !== '') lines.push(`ORG:${escapeText(p.company)}`)
  if (detail === 'full' && p.title.trim() !== '') lines.push(`TITLE:${escapeText(p.title)}`)
  if (p.phone.trim() !== '') lines.push(`TEL;TYPE=CELL,VOICE:${e164(p.phone)}`)
  if (p.email.trim() !== '') lines.push(`EMAIL;TYPE=INTERNET:${p.email.trim()}`)

  if (detail === 'full') {
    if (p.website.trim() !== '') lines.push(`URL:${webUrl(p.website)}`)
    if (p.address.trim() !== '') lines.push(`ADR;TYPE=WORK:;;${escapeText(p.address.trim())};;;;`)
    availableLinks(p)
      .filter((link) => link.key !== 'website')
      .forEach((link, index) => {
        const group = `item${index + 1}`
        lines.push(`${group}.URL:${link.url}`, `${group}.X-ABLabel:${escapeText(link.label)}`)
      })
  }

  lines.push('END:VCARD')
  return lines.join(CRLF)
}
