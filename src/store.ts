import type { AppState, Profile } from './types.ts'
import { emptyState, sanitizeProfileDraft, sanitizeState } from './validate.ts'

const KEY = 'kontak-qr:v1'
const PENDING_KEY = 'kontak-qr:pending'

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

/** Başka uygulamaya (ör. Haritalar) geçerken yarım kalan profil formu. */
export interface PendingForm {
  readonly profile: Profile
  readonly owner: boolean
  readonly savedAt: number
}

export function savePending(pending: PendingForm): void {
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(pending))
  } catch {
    // depolama kapalıysa taslak saklanamaz, form açık kalmaya devam eder
  }
}

export function clearPending(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY)
  } catch {
    // önemsiz
  }
}

export function loadPending(maxAgeMs: number, now: number = Date.now()): PendingForm | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const record = parsed as { profile?: unknown; owner?: unknown; savedAt?: unknown }
    const savedAt = typeof record.savedAt === 'number' ? record.savedAt : 0
    const profile = sanitizeProfileDraft(record.profile)
    if (profile === null || now - savedAt > maxAgeMs) {
      clearPending()
      return null
    }
    return { profile, owner: record.owner === true, savedAt }
  } catch {
    return null
  }
}
