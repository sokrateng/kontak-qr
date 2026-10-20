import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from './browser.mjs'


const out = join(import.meta.dirname, '..', 'assets')
mkdirSync(out, { recursive: true })

const finder = (x, y) =>
  `<rect x="${x}" y="${y}" width="22" height="22" rx="4" fill="#262424"/><rect x="${x + 4}" y="${y + 4}" width="14" height="14" rx="2" fill="#FFFFFF"/><rect x="${x + 8}" y="${y + 8}" width="6" height="6" rx="1" fill="#A32631"/>`
const dots = [[32, 6], [40, 14], [32, 24], [50, 24], [74, 28], [8, 36], [8, 48], [24, 44], [34, 42], [42, 58], [58, 50], [66, 58], [74, 66], [50, 66], [34, 74], [58, 74]]
  .map(([x, y]) => `<rect x="${x}" y="${y}" width="6" height="6" rx="1" fill="#262424"/>`)
  .join('')

const html = (size) => `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 160 160">
<defs>
<linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B42C38"/><stop offset="1" stop-color="#800000"/></linearGradient>
</defs>
<rect width="160" height="160" fill="url(#g1)"/>
<g transform="translate(24 24)">
<rect width="112" height="112" rx="18" fill="#FFFFFF"/>
<g transform="translate(14 14)">${finder(0, 0)}${finder(60, 0)}${finder(0, 60)}${dots}</g>
</g>
</svg></body></html>`

const browser = await puppeteer.launch({ headless: true })
try {
  const page = await browser.newPage()
  for (const size of [180, 192, 512]) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 })
    await page.setContent(html(size))
    await page.screenshot({ path: join(out, `icon-${size}.png`) })
    console.log(`icon-${size}.png`)
  }
} finally {
  await browser.close()
}
