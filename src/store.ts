import type { AppState } from './types.ts'
import { emptyState, sanitizeState } from './validate.ts'

const KEY = 'kontak-qr:v1'

export function loadState(): AppState {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw === null ? emptyState() : sanitizeState(JSON.parse(raw))
  } catch {
    return emptyState()
  }
}

export function saveState(state: AppState): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}
