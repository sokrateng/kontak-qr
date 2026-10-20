import type { WifiNetwork } from './types.ts'

function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1')
}

export function buildWifi(n: WifiNetwork): string {
  if (n.ssid === '') return ''
  const parts = [`T:${n.security}`, `S:${escapeWifi(n.ssid)}`]
  if (n.security !== 'nopass') parts.push(`P:${escapeWifi(n.password)}`)
  if (n.hidden) parts.push('H:true')
  return `WIFI:${parts.join(';')};;`
}
