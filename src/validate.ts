import { normalizeIban } from './iban.ts'
import type { AppState, BankAccount, Location, Profile, WifiNetwork, WifiSecurity } from './types.ts'

const MAX_LEN = 400
const MAX_LOCATIONS = 12

export function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_LEN) : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyProfile(isOwner: boolean): Profile {
  return {
    id: newId(),
    isOwner,
    firstName: '',
    lastName: '',
    company: '',
    title: '',
    phone: '',
    whatsappFromPhone: true,
    whatsappLink: '',
    email: '',
    website: '',
    address: '',
    locations: [],
    linkedin: '',
    x: '',
  }
}

export function emptyNetwork(): WifiNetwork {
  return { id: newId(), label: '', ssid: '', password: '', security: 'WPA', hidden: false }
}

export function emptyAccount(): BankAccount {
  return { id: newId(), label: '', holder: '', bank: '', iban: '', note: '' }
}

export function emptyLocation(): Location {
  return { id: newId(), label: '', place: '' }
}

function sanitizeLocations(raw: Record<string, unknown>): readonly Location[] {
  const list = Array.isArray(raw.locations) ? raw.locations : []
  const fromList = list
    .filter(isRecord)
    .map((item) => ({ id: str(item.id) || newId(), label: str(item.label), place: str(item.place) }))
    .filter((loc) => loc.place.trim() !== '')
  // Eski sürümdeki tek "mapsUrl" alanı ilk konum olarak taşınır.
  const legacy = str(raw.mapsUrl).trim()
  const migrated = fromList.length === 0 && legacy !== '' ? [{ id: newId(), label: '', place: legacy }] : fromList
  return migrated.slice(0, MAX_LOCATIONS)
}

export function sanitizeProfile(raw: unknown, fallbackOwner = false): Profile | null {
  if (!isRecord(raw)) return null
  const base = emptyProfile(fallbackOwner)
  return {
    id: str(raw.id) || base.id,
    isOwner: raw.isOwner === true,
    firstName: str(raw.firstName),
    lastName: str(raw.lastName),
    company: str(raw.company),
    title: str(raw.title),
    phone: str(raw.phone),
    whatsappFromPhone: raw.whatsappFromPhone !== false,
    whatsappLink: str(raw.whatsappLink),
    email: str(raw.email),
    website: str(raw.website),
    address: str(raw.address),
    locations: sanitizeLocations(raw),
    linkedin: str(raw.linkedin),
    x: str(raw.x),
  }
}

/** Yarım kalan form taslağı: normal temizlemeden farkla, henüz doldurulmamış boş konum satırlarını da korur. */
export function sanitizeProfileDraft(raw: unknown): Profile | null {
  const profile = sanitizeProfile(raw)
  if (profile === null || !isRecord(raw)) return profile
  const rows = Array.isArray(raw.locations) ? raw.locations : []
  const locations = rows
    .filter(isRecord)
    .map((item) => ({ id: str(item.id) || newId(), label: str(item.label), place: str(item.place) }))
    .slice(0, MAX_LOCATIONS)
  return { ...profile, locations }
}

function sanitizeSecurity(value: unknown): WifiSecurity {
  return value === 'WEP' || value === 'nopass' ? value : 'WPA'
}

export function sanitizeNetwork(raw: unknown): WifiNetwork | null {
  if (!isRecord(raw)) return null
  return {
    id: str(raw.id) || newId(),
    label: str(raw.label),
    ssid: str(raw.ssid),
    password: str(raw.password),
    security: sanitizeSecurity(raw.security),
    hidden: raw.hidden === true,
  }
}

export function sanitizeAccount(raw: unknown): BankAccount | null {
  if (!isRecord(raw)) return null
  const iban = normalizeIban(str(raw.iban))
  if (iban === '') return null
  return {
    id: str(raw.id) || newId(),
    label: str(raw.label),
    holder: str(raw.holder),
    bank: str(raw.bank),
    iban,
    note: str(raw.note),
  }
}

export function emptyState(): AppState {
  return {
    version: 1,
    profiles: [],
    networks: [],
    activeProfileId: null,
    activeNetworkId: null,
    accounts: [],
    activeAccountId: null,
  }
}

function pickActive(list: readonly { readonly id: string }[], wanted: unknown): string | null {
  return list.some((item) => item.id === wanted) ? (wanted as string) : (list[0]?.id ?? null)
}

export function sanitizeState(raw: unknown): AppState {
  if (!isRecord(raw)) return emptyState()
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : [])
    .map((item: unknown) => sanitizeProfile(item))
    .filter((item): item is Profile => item !== null)
  const networks = (Array.isArray(raw.networks) ? raw.networks : [])
    .map((item: unknown) => sanitizeNetwork(item))
    .filter((item): item is WifiNetwork => item !== null)
  const accounts = (Array.isArray(raw.accounts) ? raw.accounts : [])
    .map((item: unknown) => sanitizeAccount(item))
    .filter((item): item is BankAccount => item !== null)
  return {
    version: 1,
    profiles,
    networks,
    activeProfileId: pickActive(profiles, raw.activeProfileId),
    activeNetworkId: pickActive(networks, raw.activeNetworkId),
    accounts,
    activeAccountId: pickActive(accounts, raw.activeAccountId),
  }
}
