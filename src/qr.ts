import qrcode from 'qrcode-generator'

const encoder = new TextEncoder()
qrcode.stringToBytes = (s: string): number[] => Array.from(encoder.encode(s))

export interface QrResult {
  readonly svg: string
  readonly version: number
  readonly tier: 1 | 2 | 3 | 4 | 5
  readonly bytes: number
}

const QUIET_ZONE = 4
const DARK = '#262424'
const LIGHT = '#FFFFFF'

function tierFor(version: number): QrResult['tier'] {
  if (version <= 8) return 1
  if (version <= 11) return 2
  if (version <= 15) return 3
  if (version <= 20) return 4
  return 5
}

function build(text: string, level: 'M' | 'L') {
  const qr = qrcode(0, level)
  qr.addData(text, 'Byte')
  qr.make()
  return qr
}

export function makeQr(text: string): QrResult | null {
  if (text === '') return null
  try {
    let qr = build(text, 'M')
    if (qr.getModuleCount() > 17 + 4 * 11) qr = build(text, 'L')
    const size = qr.getModuleCount()
    const total = size + QUIET_ZONE * 2
    let path = ''
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`
      }
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR kod">` +
      `<rect width="${total}" height="${total}" fill="${LIGHT}"/><path d="${path}" fill="${DARK}"/></svg>`
    const version = (size - 17) / 4
    return { svg, version, tier: tierFor(version), bytes: encoder.encode(text).length }
  } catch {
    return null
  }
}
