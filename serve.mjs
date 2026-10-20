import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const root = join(import.meta.dirname, 'docs')
const port = Number(process.env.PORT ?? 3000)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
}

createServer((req, res) => {
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')
  const safe = normalize(pathname).replace(/^([/\\])+/, '')
  let file = join(root, safe === '' ? 'index.html' : safe)
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(res)
}).listen(port, () => console.log(`http://localhost:${port}`))
