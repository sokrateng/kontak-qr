import jsQR from 'jsqr'

/**
 * Yalnızca testler içindir (uygulamaya girmez): `makeQr` ya da ekrandaki QR'ın SVG'sini piksele çevirip
 * jsQR ile geri okur. Böylece QR'ın içeriğinin beklenenle birebir aynı olduğu doğrulanır.
 */
export function decodeQrSvg(svg: string): string | null {
  const total = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1])
  const scale = 6
  const px = total * scale
  const data = new Uint8ClampedArray(px * px * 4).fill(255)
  for (const m of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const i = ((Number(m[2]) * scale + dy) * px + Number(m[1]) * scale + dx) * 4
        data[i] = data[i + 1] = data[i + 2] = 0
      }
    }
  }
  return jsQR(data, px, px)?.data ?? null
}
