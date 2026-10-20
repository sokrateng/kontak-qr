export type WifiSecurity = 'WPA' | 'WEP' | 'nopass'

export interface Profile {
  readonly id: string
  readonly isOwner: boolean
  readonly firstName: string
  readonly lastName: string
  readonly company: string
  readonly title: string
  readonly phone: string
  readonly whatsappFromPhone: boolean
  readonly whatsappLink: string
  readonly email: string
  readonly website: string
  readonly address: string
  readonly mapsUrl: string
  readonly linkedin: string
  readonly x: string
}

export interface WifiNetwork {
  readonly id: string
  readonly label: string
  readonly ssid: string
  readonly password: string
  readonly security: WifiSecurity
  readonly hidden: boolean
}

export interface AppState {
  readonly version: 1
  readonly profiles: readonly Profile[]
  readonly networks: readonly WifiNetwork[]
  readonly activeProfileId: string | null
  readonly activeNetworkId: string | null
}

export type CardMode = 'full' | 'short' | 'link'
export type LinkKey = 'linkedin' | 'x' | 'whatsapp' | 'website' | 'maps'

export interface LinkEntry {
  readonly key: LinkKey
  readonly label: string
  readonly url: string
}
