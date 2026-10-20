import type { AppState, Profile, WifiNetwork, WifiSecurity } from './types.ts'

const MAX_LEN = 400

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
    mapsUrl: '',
    linkedin: '',
    x: '',
  }
}

export function emptyNetwork(): WifiNetwork {
  return { id: newId(), label: '', ssid: '', password: '', security: 'WPA', hidden: false }
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
    mapsUrl: str(raw.mapsUrl),
    linkedin: str(raw.linkedin),
    x: str(raw.x),
  }
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

export function emptyState(): AppState {
  return { version: 1, profiles: [], networks: [], activeProfileId: null, activeNetworkId: null }
}

export function sanitizeState(raw: unknown): AppState {
  if (!isRecord(raw)) return emptyState()
  const profiles = (Array.isArray(raw.profiles) ? raw.profiles : [])
    .map((item: unknown) => sanitizeProfile(item))
    .filter((item): item is Profile => item !== null)
  const networks = (Array.isArray(raw.networks) ? raw.networks : [])
    .map((item: unknown) => sanitizeNetwork(item))
    .filter((item): item is WifiNetwork => item !== null)
  const activeProfileId = profiles.some((p) => p.id === raw.activeProfileId)
    ? (raw.activeProfileId as string)
    : (profiles[0]?.id ?? null)
  const activeNetworkId = networks.some((n) => n.id === raw.activeNetworkId)
    ? (raw.activeNetworkId as string)
    : (networks[0]?.id ?? null)
  return { version: 1, profiles, networks, activeProfileId, activeNetworkId }
}
