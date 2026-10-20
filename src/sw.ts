declare const __CACHE_VERSION__: string

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request
  respondWith(response: Promise<Response> | Response): void
}

interface WorkerScope {
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  addEventListener(type: 'install' | 'activate' | 'fetch', listener: (event: Event) => void): void
}

const sw = self as unknown as WorkerScope
const CACHE = `kontak-qr-${__CACHE_VERSION__}`
const PAGE = './index.html'
const NETWORK_TIMEOUT_MS = 3500
const ASSETS: readonly string[] = [
  './',
  PAGE,
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
]

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Sayfa: önce ağdan en yeni sürüm, internet yoksa ya da yavaşsa önbellekten. */
function networkFirstPage(request: Request): Promise<Response> {
  return withTimeout(fetch(request.url, { cache: 'no-store', credentials: 'same-origin' }), NETWORK_TIMEOUT_MS)
    .then((response) => {
      if (response.ok) {
        const copy = response.clone()
        void caches.open(CACHE).then((cache) => cache.put(PAGE, copy))
        return response
      }
      // 404/5xx gibi geçici sunucu hatalarında çalışan kopya varsa onu göster
      return caches.match(PAGE).then((cached) => cached ?? response)
    })
    .catch(() => caches.match(PAGE).then((cached) => cached ?? Response.error()))
}

/** Simge ve manifest gibi nadiren değişen dosyalar: önce önbellek. */
function cacheFirst(request: Request): Promise<Response> {
  return caches.match(request, { ignoreSearch: true }).then(
    (hit) => hit ?? fetch(request).catch(() => Response.error()),
  )
}

sw.addEventListener('install', (event) => {
  const e = event as ExtendableEvent
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([...ASSETS]))
      .then(() => sw.skipWaiting()),
  )
})

sw.addEventListener('activate', (event) => {
  const e = event as ExtendableEvent
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => sw.clients.claim()),
  )
})

sw.addEventListener('fetch', (event) => {
  const e = event as FetchEvent
  if (e.request.method !== 'GET') return
  e.respondWith(e.request.mode === 'navigate' ? networkFirstPage(e.request) : cacheFirst(e.request))
})
