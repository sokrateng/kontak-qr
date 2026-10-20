import type { CardMode, LinkKey, Profile } from './types.ts'

export type Tab = 'card' | 'wifi' | 'people' | 'more'

export type Sheet =
  | { readonly kind: 'profile'; readonly id: string | null; readonly owner: boolean; readonly draft?: Profile }
  | { readonly kind: 'wifi'; readonly id: string | null }
  | { readonly kind: 'order-networks' }
  | { readonly kind: 'import' }
  | { readonly kind: 'appqr' }
  | null

export interface UiState {
  readonly tab: Tab
  readonly mode: CardMode
  readonly linkKey: LinkKey
  readonly reveal: boolean
  readonly sheet: Sheet
}

export const initialUi: UiState = {
  tab: 'card',
  mode: 'full',
  linkKey: 'linkedin',
  reveal: false,
  sheet: null,
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function initials(first: string, last: string, fallback: string): string {
  const letters = `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toLocaleUpperCase('tr-TR')
  return letters === '' ? fallback.trim().charAt(0).toLocaleUpperCase('tr-TR') || '·' : letters
}
