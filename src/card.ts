import type { HideableField, Profile } from './types.ts'

/** Formda gösterilen sıra ve etiketler. */
export const HIDEABLE_FIELDS: readonly { readonly key: HideableField; readonly label: string }[] = [
  { key: 'title', label: 'Pozisyon' },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-posta' },
  { key: 'website', label: 'Web sitesi' },
  { key: 'address', label: 'Firma adresi' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'x', label: 'X' },
  { key: 'whatsapp', label: 'WhatsApp' },
]

const HIDEABLE_KEYS: ReadonlySet<string> = new Set(HIDEABLE_FIELDS.map((f) => f.key))

export function isHideableField(value: unknown): value is HideableField {
  return typeof value === 'string' && HIDEABLE_KEYS.has(value)
}

/**
 * Tam kart, Kısa kart ve "Kişiyi gönder" için paylaşılacak hali: kullanıcının gizlediği alanlar boşaltılır,
 * paylaşıma kapalı konumlar çıkarılır. Tek link modu bunu kullanmaz, orada seçim bilerek yapılır.
 */
export function forCard(p: Profile): Profile {
  const hidden = new Set<string>(p.hiddenFields)
  const phoneHidden = hidden.has('phone')
  return {
    ...p,
    title: hidden.has('title') ? '' : p.title,
    phone: phoneHidden ? '' : p.phone,
    email: hidden.has('email') ? '' : p.email,
    website: hidden.has('website') ? '' : p.website,
    address: hidden.has('address') ? '' : p.address,
    linkedin: hidden.has('linkedin') ? '' : p.linkedin,
    x: hidden.has('x') ? '' : p.x,
    // wa.me/<numara> linki numarayı ele verir: telefon gizliyse telefondan üretilen WhatsApp da gizlenir.
    whatsappFromPhone: hidden.has('whatsapp') || phoneHidden ? false : p.whatsappFromPhone,
    whatsappLink: hidden.has('whatsapp') ? '' : p.whatsappLink,
    locations: p.locations.filter((loc) => loc.shared),
  }
}
