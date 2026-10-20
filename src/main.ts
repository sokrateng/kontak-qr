import { decodeShare, encodeBackup } from './codec.ts'
import { contactText, linkMessage } from './contact-text.ts'
import { moveItem } from './order.ts'
import { availableLinks } from './links.ts'
import { networkOrderRows, renderSheet } from './sheets.ts'
import { loadState, saveState } from './store.ts'
import type { AppState, CardMode, LinkKey, Profile, WifiNetwork, WifiSecurity } from './types.ts'
import { initialUi, type Sheet, type Tab, type UiState } from './ui-state.ts'
import { buildVCard, fullName } from './vcard.ts'
import { parseVCards } from './vcard-import.ts'
import { renderCard, renderMore, renderPeople, renderTabbar, renderWifi, resolveLink } from './views.ts'

let app: AppState = loadState()
let ui: UiState = initialUi
let toastTimer = 0

const view = must('view')
const tabbar = must('tabbar')
const sheetHost = must('sheet-host')
const toastEl = must('toast')

function must(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (el === null) throw new Error(`#${id} bulunamadı`)
  return el
}

function appUrl(): string {
  return window.location.href.split('#')[0]?.split('?')[0] ?? ''
}

function appShareMessage(): string {
  return `Kontak QR: QR ile kartvizit ve Wi-Fi paylaşımı. iPhone'da Safari'de aç, Ana Ekrana Ekle.\n${appUrl()}`
}

function toast(message: string): void {
  toastEl.textContent = message
  toastEl.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2400)
}

function renderBody(): string {
  switch (ui.tab) {
    case 'card':
      return renderCard(app, ui)
    case 'wifi':
      return renderWifi(app, ui)
    case 'people':
      return renderPeople(app)
    case 'more':
      return renderMore()
  }
}

const MIN_NAME_SIZE = 18

function fitNames(): void {
  view.querySelectorAll<HTMLElement>('.name').forEach((el) => {
    el.style.fontSize = ''
    el.style.whiteSpace = 'nowrap'
    let size = parseFloat(window.getComputedStyle(el).fontSize)
    while (el.scrollWidth > el.clientWidth && size > MIN_NAME_SIZE) {
      size -= 1
      el.style.fontSize = `${size}px`
    }
    if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = ''
  })
}

const MIN_QR_SIZE = 150
const MAX_QR_SIZE = 340

/** Kart ve Wi-Fi sayfaları kaydırmasız olmalı: QR, ekran yüksekliğine sığana kadar küçülür. */
function fitLayout(): void {
  const scroller = must('app')
  const fixedTab = ui.tab === 'card' || ui.tab === 'wifi'
  document.body.classList.toggle('fixed-tab', fixedTab)
  const frame = view.querySelector<HTMLElement>('.qr-frame')
  if (!fixedTab || frame === null) return
  let size = Math.min(MAX_QR_SIZE, frame.offsetWidth)
  frame.style.maxWidth = `${size}px`
  while (scroller.scrollHeight > scroller.clientHeight + 1 && size > MIN_QR_SIZE) {
    size -= 6
    frame.style.maxWidth = `${size}px`
  }
  if (scroller.scrollHeight > scroller.clientHeight + 1) document.body.classList.remove('fixed-tab')
}

function fitAll(): void {
  fitNames()
  fitLayout()
}

function render(animate: boolean, swap: 'next' | 'prev' | null = null): void {
  view.className = swap !== null ? `view still swap-${swap}` : animate ? 'view' : 'view still'
  view.innerHTML = renderBody()
  tabbar.innerHTML = renderTabbar(ui.tab)
  fitAll()
}

function renderSheetHost(): void {
  sheetHost.innerHTML = renderSheet(ui.sheet, app, appUrl())
  document.body.classList.toggle('locked', ui.sheet !== null)
}

function setUi(next: Partial<UiState>, opts: { animate?: boolean; sheet?: boolean } = {}): void {
  ui = { ...ui, ...next }
  render(opts.animate === true)
  if (opts.sheet === true) renderSheetHost()
}

function setApp(next: AppState): void {
  app = next
  if (!saveState(app)) toast('Kaydedilemedi, tarayıcı depolamayı engelliyor')
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  }
}

async function shareText(data: { text?: string; url?: string; title?: string }): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data)
      return
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  const copied = await copyText(data.text ?? data.url ?? '')
  toast(copied ? 'Paylaşım menüsü açılmadı, metin panoya kopyalandı' : 'Paylaşılamadı')
}

function fileSafe(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'kisi'
}

/** Ekranda seçili olanı gönderir: Tek link, Kısa ya da Tam kart. */
async function shareContact(p: Profile): Promise<void> {
  const links = availableLinks(p)
  const mode: CardMode = ui.mode === 'link' && links.length === 0 ? 'full' : ui.mode
  const name = fullName(p) || p.company
  if (mode === 'link') {
    const link = resolveLink(links, ui.linkKey)
    if (link !== null) await shareText({ text: linkMessage(p, link) })
    return
  }
  const detail = mode === 'short' ? 'short' : 'full'
  const file = new File([buildVCard(p, detail)], `${fileSafe(name)}.vcf`, { type: 'text/vcard' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  await shareText({ text: contactText(p, detail) })
}

function go(delta: 1 | -1): void {
  const list = ui.tab === 'card' ? app.profiles : app.networks
  const currentId = ui.tab === 'card' ? app.activeProfileId : app.activeNetworkId
  if (list.length < 2) return
  const current = Math.max(0, list.findIndex((item) => item.id === currentId))
  const next = current + delta
  const target = list[next]
  if (target === undefined) return
  setApp(ui.tab === 'card' ? { ...app, activeProfileId: target.id } : { ...app, activeNetworkId: target.id })
  ui = { ...ui, reveal: false }
  render(false, delta === 1 ? 'next' : 'prev')
}

let touchStart: { x: number; y: number } | null = null

function swipeAllowed(target: EventTarget | null): boolean {
  if (ui.sheet !== null || (ui.tab !== 'card' && ui.tab !== 'wifi')) return false
  return !(target instanceof Element && target.closest('.chips, input, textarea, select') !== null)
}

function text(fd: FormData, name: string): string {
  const value = fd.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function upsert<T extends { readonly id: string }>(list: readonly T[], item: T): readonly T[] {
  return list.some((entry) => entry.id === item.id)
    ? list.map((entry) => (entry.id === item.id ? item : entry))
    : [...list, item]
}

function saveProfile(fd: FormData): void {
  const profile: Profile = {
    id: text(fd, 'id'),
    isOwner: text(fd, 'isOwner') === 'true',
    firstName: text(fd, 'firstName'),
    lastName: text(fd, 'lastName'),
    company: text(fd, 'company'),
    title: text(fd, 'title'),
    phone: text(fd, 'phone'),
    whatsappFromPhone: fd.get('whatsappFromPhone') !== null,
    whatsappLink: text(fd, 'whatsappLink'),
    email: text(fd, 'email'),
    website: text(fd, 'website'),
    address: text(fd, 'address'),
    mapsUrl: text(fd, 'mapsUrl'),
    linkedin: text(fd, 'linkedin'),
    x: text(fd, 'x'),
  }
  if (fullName(profile) === '' && profile.company === '') {
    toast('Ad ya da firma gir')
    return
  }
  setApp({ ...app, profiles: upsert(app.profiles, profile), activeProfileId: profile.id })
  closeSheet()
  setUi({ tab: 'card' }, { animate: true })
  toast('Kaydedildi')
}

function saveWifi(fd: FormData): void {
  const security = text(fd, 'security')
  const network: WifiNetwork = {
    id: text(fd, 'id'),
    label: text(fd, 'label'),
    ssid: text(fd, 'ssid'),
    password: fd.get('password') === null ? '' : String(fd.get('password')),
    security: (security === 'WEP' || security === 'nopass' ? security : 'WPA') as WifiSecurity,
    hidden: fd.get('hidden') !== null,
  }
  if (network.ssid === '') {
    toast('Ağ adını gir')
    return
  }
  setApp({ ...app, networks: upsert(app.networks, network), activeNetworkId: network.id })
  closeSheet()
  setUi({ tab: 'wifi', reveal: false }, { animate: true })
  toast('Kaydedildi')
}

function importCode(form: HTMLFormElement, fd: FormData): void {
  const payload = decodeShare(text(fd, 'code'))
  if (payload === null) {
    const error = form.querySelector<HTMLElement>('[data-error]')
    if (error !== null) {
      error.textContent = 'Bu metinde geçerli bir kod bulunamadı.'
      error.hidden = false
    }
    return
  }
  if (payload.kind === 'profile') {
    setApp({ ...app, profiles: [...app.profiles, payload.profile], activeProfileId: payload.profile.id })
    toast(`${fullName(payload.profile) || 'Kart'} eklendi`)
  } else {
    if (!window.confirm('Mevcut bilgilerin yerine yedek geri yüklensin mi?')) return
    setApp(payload.state)
    toast('Yedek geri yüklendi')
  }
  closeSheet()
  setUi({ tab: 'card' }, { animate: true })
}

function openSheet(sheet: Sheet): void {
  setUi({ sheet }, { sheet: true })
}

let reloadPending = false

/** Yeni sürüm hazır: form açıksa bekler, değilse sayfayı yeniler. */
function reloadWhenIdle(): void {
  if (ui.sheet === null) {
    window.setTimeout(() => window.location.reload(), 900)
    return
  }
  reloadPending = true
}

function closeSheet(): void {
  ui = { ...ui, sheet: null }
  renderSheetHost()
  if (reloadPending) {
    reloadPending = false
    reloadWhenIdle()
  }
}

function removeProfile(id: string): void {
  if (!window.confirm('Bu kişi silinsin mi?')) return
  const profiles = app.profiles.filter((p) => p.id !== id)
  setApp({ ...app, profiles, activeProfileId: profiles[0]?.id ?? null })
  closeSheet()
  render(false)
}

function removeWifi(id: string): void {
  if (!window.confirm('Bu ağ silinsin mi?')) return
  const networks = app.networks.filter((n) => n.id !== id)
  setApp({ ...app, networks, activeNetworkId: networks[0]?.id ?? null })
  closeSheet()
  render(false)
}

function profileById(id: string | undefined): Profile | undefined {
  return app.profiles.find((p) => p.id === id)
}

function onAction(act: string, el: HTMLElement): void {
  const id = el.dataset.id
  switch (act) {
    case 'tab':
      window.scrollTo(0, 0)
      setUi({ tab: (el.dataset.tab as Tab | undefined) ?? 'card', reveal: false }, { animate: true })
      break
    case 'go-people':
      setUi({ tab: 'people' }, { animate: true })
      break
    case 'open-profile':
      if (id !== undefined) {
        setApp({ ...app, activeProfileId: id })
        window.scrollTo(0, 0)
        setUi({ tab: 'card' }, { animate: true })
      }
      break
    case 'mode':
      setUi({ mode: (el.dataset.mode as CardMode | undefined) ?? 'full' })
      break
    case 'link':
      setUi({ linkKey: (el.dataset.key as LinkKey | undefined) ?? 'linkedin' })
      break
    case 'new-owner':
      openSheet({ kind: 'profile', id: null, owner: true })
      break
    case 'new-friend':
      openSheet({ kind: 'profile', id: null, owner: app.profiles.length === 0 })
      break
    case 'edit-profile':
      openSheet({ kind: 'profile', id: id ?? null, owner: false })
      break
    case 'delete-profile':
      if (id !== undefined) removeProfile(id)
      break
    case 'share-contact': {
      const profile = profileById(id)
      if (profile !== undefined) void shareContact(profile)
      break
    }
    case 'reveal':
      setUi({ reveal: !ui.reveal })
      break
    case 'new-wifi':
      openSheet({ kind: 'wifi', id: null })
      break
    case 'edit-wifi':
      openSheet({ kind: 'wifi', id: id ?? null })
      break
    case 'delete-wifi':
      if (id !== undefined) removeWifi(id)
      break
    case 'share-app':
      void shareText({ text: appShareMessage() })
      break
    case 'sort-wifi':
      openSheet({ kind: 'order-networks' })
      break
    case 'app-qr':
      openSheet({ kind: 'appqr' })
      break
    case 'share-backup':
      void shareText({ text: `Kontak QR yedeği:\n${encodeBackup(app)}` })
      break
    case 'open-import':
      openSheet({ kind: 'import' })
      break
    case 'close-sheet':
      closeSheet()
      break
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-act]') : null
  if (target === null) return
  const act = target.dataset.act
  if (act !== undefined) onAction(act, target)
})

document.addEventListener(
  'touchstart',
  (event) => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined
    touchStart = touch !== undefined && swipeAllowed(event.target) ? { x: touch.clientX, y: touch.clientY } : null
  },
  { passive: true },
)

document.addEventListener(
  'touchend',
  (event) => {
    const start = touchStart
    touchStart = null
    const touch = event.changedTouches[0]
    if (start === null || touch === undefined) return
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    go(dx < 0 ? 1 : -1)
  },
  { passive: true },
)

const HOLD_MS = 500
let holdTimer = 0

function cancelHold(): void {
  window.clearTimeout(holdTimer)
}

document.addEventListener(
  'pointerdown',
  (event) => {
    cancelHold()
    const el = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-copy]') : null
    const value = el?.dataset.copy
    if (value === undefined) return
    holdTimer = window.setTimeout(() => {
      void copyText(value).then((ok) => toast(ok ? 'Link kopyalandı' : 'Kopyalanamadı'))
    }, HOLD_MS)
  },
  { passive: true },
)
;['pointerup', 'pointercancel', 'pointerleave', 'touchmove'].forEach((type) => {
  document.addEventListener(type, cancelHold, { passive: true })
})
document.addEventListener('contextmenu', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-copy]') !== null) event.preventDefault()
})

interface DragState {
  readonly pointerId: number
  readonly scroller: HTMLElement
  readonly list: HTMLElement
  readonly items: readonly HTMLElement[]
  readonly from: number
  readonly startY: number
  readonly startScroll: number
  readonly height: number
  target: number
}

let drag: DragState | null = null
const EDGE_TOP = 80
const EDGE_BOTTOM = 130

function endDrag(): void {
  if (drag === null) return
  drag.items.forEach((el) => {
    el.style.transform = ''
    el.classList.remove('dragging')
  })
  drag.list.classList.remove('drag-active')
  drag = null
}

/** Kişiler listesinde tutamaçla sürükleyerek sıralama. Sıra app.profiles dizisine yazılır, Kart ekranı aynı diziyi kullanır. */
document.addEventListener('pointerdown', (event) => {
  const grip = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-grip]') : null
  const row = grip?.closest<HTMLElement>('.person')
  const list = row?.parentElement
  if (grip === null || grip === undefined || row === null || row === undefined || list === null || list === undefined || drag !== null) return
  const items = Array.from(list.children).filter((c): c is HTMLElement => c instanceof HTMLElement)
  const from = items.indexOf(row)
  if (from < 0) return
  grip.setPointerCapture(event.pointerId)
  const scroller = grip.closest<HTMLElement>('.sheet') ?? must('app')
  drag = {
    pointerId: event.pointerId,
    scroller,
    list,
    items,
    from,
    startY: event.clientY,
    startScroll: scroller.scrollTop,
    height: row.offsetHeight,
    target: from,
  }
  row.classList.add('dragging')
  list.classList.add('drag-active')
})

document.addEventListener('pointermove', (event) => {
  const state = drag
  if (state === null || event.pointerId !== state.pointerId) return
  const scroller = state.scroller
  if (event.clientY < EDGE_TOP) scroller.scrollTop -= 12
  else if (event.clientY > window.innerHeight - EDGE_BOTTOM) scroller.scrollTop += 12
  const dy = event.clientY - state.startY + (scroller.scrollTop - state.startScroll)
  const dragged = state.items[state.from]
  if (dragged === undefined) return
  dragged.style.transform = `translateY(${dy}px)`
  const center = dragged.offsetTop + dragged.offsetHeight / 2 + dy
  const target = state.items.filter((el, i) => i !== state.from && el.offsetTop + el.offsetHeight / 2 < center).length
  state.target = target
  state.items.forEach((el, i) => {
    if (i === state.from) return
    const shiftUp = state.from < target && i > state.from && i <= target
    const shiftDown = target < state.from && i >= target && i < state.from
    el.style.transform = shiftUp ? `translateY(${-state.height}px)` : shiftDown ? `translateY(${state.height}px)` : ''
  })
  event.preventDefault()
})

function finishDrag(commit: boolean): void {
  const state = drag
  if (state === null) return
  const from = state.from
  const target = state.target
  const list = state.list
  endDrag()
  if (!commit || target === from) return
  if (list.dataset.order === 'networks') {
    setApp({ ...app, networks: moveItem(app.networks, from, target) })
    list.innerHTML = networkOrderRows(app)
  } else {
    setApp({ ...app, profiles: moveItem(app.profiles, from, target) })
  }
  render(false)
}

document.addEventListener('pointerup', (event) => {
  if (drag !== null && event.pointerId === drag.pointerId) finishDrag(true)
})
document.addEventListener('pointercancel', (event) => {
  if (drag !== null && event.pointerId === drag.pointerId) finishDrag(false)
})

function readText(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/** Rehberden dışa aktarılmış .vcf dosyalarından kişi ekler. Tek kişi forma dolar, birden fazlası doğrudan eklenir. */
async function importVcf(input: HTMLInputElement): Promise<void> {
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  try {
    const texts = await Promise.all(files.map(readText))
    const found = texts.flatMap((content) => parseVCards(content))
    const first = found[0]
    if (first === undefined) {
      toast('Dosyada kişi bulunamadı')
      return
    }
    if (found.length === 1) {
      openSheet({ kind: 'profile', id: null, owner: app.profiles.length === 0, draft: first })
      return
    }
    setApp({ ...app, profiles: [...app.profiles, ...found], activeProfileId: first.id })
    closeSheet()
    setUi({ tab: 'people' }, { animate: true })
    toast(`${found.length} kişi eklendi`)
  } catch {
    toast('Dosya okunamadı')
  }
}

document.addEventListener('change', (event) => {
  const target = event.target
  if (target instanceof HTMLInputElement && target.dataset.vcf !== undefined) void importVcf(target)
})

document.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement)) return
  event.preventDefault()
  const fd = new FormData(form)
  switch (form.dataset.form) {
    case 'profile':
      saveProfile(fd)
      break
    case 'wifi':
      saveWifi(fd)
      break
    case 'import':
      importCode(form, fd)
      break
  }
})

render(true)
window.addEventListener('resize', fitAll)
if (document.fonts !== undefined) void document.fonts.ready.then(fitAll)

document.addEventListener(
  'touchmove',
  (event) => {
    const insideChips = event.target instanceof Element && event.target.closest('.chips') !== null
    if (document.body.classList.contains('fixed-tab') && ui.sheet === null && !insideChips) event.preventDefault()
  },
  { passive: false },
)

if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  const worker = navigator.serviceWorker
  let hadController = worker.controller !== null
  worker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    toast('Yeni sürüm yüklendi')
    reloadWhenIdle()
  })
  window.addEventListener('load', () => {
    worker
      .register('./sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        void registration.update()
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update()
        })
      })
      .catch(() => undefined)
  })
}
