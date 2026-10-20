import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from './tools/browser.mjs'


const [url = 'http://localhost:3000', label = '', width = '390', height = '844'] = process.argv.slice(2)
const dir = join(import.meta.dirname, 'temporary screenshots')
mkdirSync(dir, { recursive: true })
const last = existsSync(dir)
  ? Math.max(0, ...readdirSync(dir).map((f) => Number(/^screenshot-(\d+)/.exec(f)?.[1] ?? 0)))
  : 0
const file = join(dir, `screenshot-${last + 1}${label === '' ? '' : `-${label}`}.png`)

const browser = await puppeteer.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: Number(width), height: Number(height), deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.goto(url, { waitUntil: 'networkidle0' })
  await new Promise((r) => setTimeout(r, 900))
  await page.screenshot({ path: file })
  console.log(file)
} finally {
  await browser.close()
}
