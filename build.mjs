import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = import.meta.dirname
const dist = join(root, 'docs')
mkdirSync(dist, { recursive: true })

const FONT_DIR = join(root, 'node_modules', '@fontsource-variable', 'work-sans', 'files')
const FACES = [
  ['latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
  ['latin-ext', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'],
]

function fontCss() {
  return FACES.map(([subset, range]) => {
    const data = readFileSync(join(FONT_DIR, `work-sans-${subset}-wght-normal.woff2`)).toString('base64')
    return `@font-face{font-family:'Work Sans';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range}}`
  }).join('\n')
}

async function bundle(entry, define = {}) {
  const result = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    write: false,
    format: 'iife',
    target: ['safari14'],
    minify: true,
    legalComments: 'none',
    define,
  })
  return result.outputFiles[0].text
}

const appJs = (await bundle('src/main.ts')).replace(/<\/script/gi, '<\\/script')
const template = readFileSync(join(root, 'src', 'template.html'), 'utf8')
const html = template
  .replace('/*__FONTS__*/', () => fontCss())
  .replace('<!--__SCRIPT__-->', () => `<script>${appJs}</script>`)
writeFileSync(join(dist, 'index.html'), html)

const version = createHash('sha1').update(html).digest('hex').slice(0, 10)
writeFileSync(join(dist, 'sw.js'), await bundle('src/sw.ts', { __CACHE_VERSION__: JSON.stringify(version) }))

writeFileSync(
  join(dist, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: 'Kontak QR',
      short_name: 'Kontak QR',
      description: 'QR ile kartvizit ve Wi-Fi paylaşımı. İnternetsiz çalışır.',
      lang: 'tr',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#F6F5F5',
      theme_color: '#A32631',
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    },
    null,
    2,
  ),
)

for (const name of ['icon-180.png', 'icon-192.png', 'icon-512.png']) {
  const source = join(root, 'assets', name)
  if (existsSync(source)) copyFileSync(source, join(dist, name))
  else console.warn(`UYARI: assets/${name} yok, önce "node tools/make-icons.mjs" çalıştır`)
}

console.log(`docs/index.html ${(html.length / 1024).toFixed(0)} KB, önbellek sürümü ${version}`)
