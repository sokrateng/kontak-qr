import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from './browser.mjs'


const url = process.argv[2] ?? 'http://localhost:3000'
const width = Number(process.argv[3] ?? 390)
const height = Number(process.argv[4] ?? 844)
const tag = process.argv[5] ?? `${width}x${height}`
const dir = join(import.meta.dirname, '..', 'temporary screenshots')
mkdirSync(dir, { recursive: true })

const seed = {
  version: 1,
  activeProfileId: 'me',
  activeNetworkId: 'home',
  profiles: [
    { id: 'me', isOwner: true, firstName: 'Ayşe', lastName: 'Yılmaz', company: 'Örnek Teknoloji', title: 'Yazılım Mühendisi', phone: '0532 123 45 67', whatsappFromPhone: true, email: 'ayse@example.com', website: 'ornek.com.tr', address: 'Örnek Mah. Atatürk Cad. No:1 Kadıköy / İstanbul', mapsUrl: 'https://maps.app.goo.gl/abc123', linkedin: 'ayseyilmaz', x: '@ayseyilmaz' },
    { id: 'f1', isOwner: false, firstName: 'Zeynep', lastName: 'Kaya', company: 'Orman Ürünleri', title: 'Satış Direktörü', phone: '0533 555 11 22', whatsappFromPhone: true, email: 'zeynep@example.com', website: '', address: '', mapsUrl: '', linkedin: '', x: '' },
  ],
  networks: [{ id: 'home', label: 'Ev', ssid: 'EvAgi_5G', password: 'merhaba-2026', security: 'WPA', hidden: false }],
}

const browser = await puppeteer.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.evaluateOnNewDocument((data) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('kontak-qr:v1', JSON.stringify(data))
      sessionStorage.setItem('seeded', '1')
    }
  }, seed)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await page.goto(url, { waitUntil: 'networkidle0' })
  const shot = async (name) => {
    await new Promise((r) => setTimeout(r, 900))
    await page.screenshot({ path: join(dir, `${tag}-${name}.png`) })
    console.log(`${tag}-${name}.png`)
  }
  const click = (selector) => page.evaluate((sel) => document.querySelector(sel).click(), selector)
  await shot('1-kart-tam')
  await click('[data-act="mode"][data-mode="short"]')
  await shot('2-kart-kisa')
  await click('[data-act="mode"][data-mode="link"]')
  await shot('3-kart-link')
  await click('[data-act="tab"][data-tab="wifi"]')
  await shot('4-wifi')
  await click('[data-act="reveal"]')
  await click('[data-act="tab"][data-tab="people"]')
  await shot('5-kisiler')
  await click('[data-act="tab"][data-tab="more"]')
  await shot('6-paylas')
  await click('[data-act="tab"][data-tab="people"]')
  await click('[data-act="edit-profile"]')
  await shot('7-form')
  if (errors.length > 0) console.log('HATALAR:', errors)
} finally {
  await browser.close()
}
