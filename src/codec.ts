import type { AppState, Profile } from './types.ts'
import { newId, sanitizeProfile, sanitizeState } from './validate.ts'

const PREFIX = 'KQR1:'
const TOKEN = /KQR1:([A-Za-z0-9_-]+)/

export type SharePayload =
  | { readonly kind: 'profile'; readonly profile: Profile }
  | { readonly kind: 'backup'; readonly state: AppState }

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeProfile(profile: Profile): string {
  const shared = { ...profile, isOwner: false }
  return PREFIX + toBase64Url(JSON.stringify({ k: 'p', d: shared }))
}

export function encodeBackup(state: AppState): string {
  return PREFIX + toBase64Url(JSON.stringify({ k: 'b', d: state }))
}

export function decodeShare(text: string): SharePayload | null {
  const match = TOKEN.exec(text)
  if (match === null || match[1] === undefined) return null
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(match[1]))
    if (typeof parsed !== 'object' || parsed === null) return null
    const envelope = parsed as { k?: unknown; d?: unknown }
    if (envelope.k === 'p') {
      const profile = sanitizeProfile(envelope.d)
      return profile === null ? null : { kind: 'profile', profile: { ...profile, id: newId(), isOwner: false } }
    }
    if (envelope.k === 'b') return { kind: 'backup', state: sanitizeState(envelope.d) }
    return null
  } catch {
    return null
  }
}
