/**
 * Puppeteer yükleyicisi (yalnızca geliştirme araçları için).
 * Varsayılan olarak `puppeteer` paketini kullanır. Başka bir kurulum için
 * PUPPETEER_MODULE ortam değişkenine puppeteer.js dosyasının tam yolunu verin.
 */
import { pathToFileURL } from 'node:url'

const custom = process.env.PUPPETEER_MODULE
const mod = await import(custom ? pathToFileURL(custom).href : 'puppeteer')

export default mod.default
