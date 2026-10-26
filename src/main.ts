import { decodeShare, encodeBackup } from './codec.ts'
import { contactText, linkMessage } from './contact-text.ts'
import { HIDEABLE_FIELDS, forCard } from './card.ts'
import { installDragSort } from './drag.ts'
import { accountText, isValidIban, normalizeIban } from './iban.ts'
import { moveItem } from './order.ts'
import { availableLinks, placeFromClipboard } from './links.ts'
import { locationRow, orderRows, renderSheet } from './sheets.ts'
import { clearPending, loadPending, loadState, savePending, saveState } from './store.ts'
import type { AppState, BankAccount, CardMode, LinkKey, Location, Profile, WifiNetwork, WifiSecurity } from './types.ts'
import { initialUi, SWIPE_TABS, type Sheet, type Tab, type UiState } from './ui-state.ts'
import { emptyLocation, newId } from './validate.ts'
import { buildVCard, fullName } from './vcard.ts'
import { parseVCards } from './vcard-import.ts'
import {
  renderBank,
  renderCard,
  renderMore,
  renderPeople,
  renderTabbar,
  renderWifi,
  resolveLink,
} from './views.ts'

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
    case 'bank':
      return renderBank(app)
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

/** Kart, Wi-Fi ve Banka sayfaları kaydırmasız olmalı: QR (varsa), ekran yüksekliğine sığana kadar küçülür. */
function fitLayout(): void {
  const scroller = must('app')
  const fixedTab = SWIPE_TABS.includes(ui.tab)
  document.body.classList.toggle('fixed-tab', fixedTab)
  const frame = view.querySelector<HTMLElement>('.qr-frame')
  if (!fixedTab) return
  if (frame === null) {
    if (scroller.scrollHeight > scroller.clientHeight + 1) document.body.classList.remove('fixed-tab')
    return
  }
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
  const shared = forCard(p)
  const file = new File([buildVCard(shared, detail)], `${fileSafe(name)}.vcf`, { type: 'text/vcard' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  await shareText({ text: contactText(shared, detail) })
}

/** Sağa sola kaydırınca bir sonraki/önceki kayda geçer (kişi, Wi-Fi ağı ya da banka hesabı). */
function go(delta: 1 | -1): void {
  const lists: Readonly<Record<string, { list: readonly { readonly id: string }[]; activeId: string | null }>> = {
    card: { list: app.profiles, activeId: app.activeProfileId },
    wifi: { list: app.networks, activeId: app.activeNetworkId },
    bank: { list: app.accounts, activeId: app.activeAccountId },
  }
  const entry = lists[ui.tab]
  if (entry === undefined || entry.list.length < 2) return
  const current = Math.max(0, entry.list.findIndex((item) => item.id === entry.activeId))
  const target = entry.list[current + delta]
  if (target === undefined) return
  const key = ui.tab === 'card' ? 'activeProfileId' : ui.tab === 'wifi' ? 'activeNetworkId' : 'activeAccountId'
  setApp({ ...app, [key]: target.id })
  ui = { ...ui, reveal: false }
  render(false, delta === 1 ? 'next' : 'prev')
}

let touchStart: { x: number; y: number } | null = null

function swipeAllowed(target: EventTarget | null): boolean {
  if (ui.sheet !== null || !SWIPE_TABS.includes(ui.tab)) return false
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

function readLocations(fd: FormData, keepEmpty: boolean): readonly Location[] {
  const ids = fd.getAll('locId').map(String)
  const labels = fd.getAll('locLabel').map(String)
  const sharedIds = new Set(fd.getAll('locShare').map(String))
  return fd
    .getAll('locPlace')
    .map((place, i) => {
      const id = ids[i] || newId()
      return { id, label: (labels[i] ?? '').trim(), place: String(place).trim(), shared: sharedIds.has(id) }
    })
    .filter((loc) => keepEmpty || loc.place !== '')
}

/** İşaretli kutular karta girer. İşaretsizler gizli alan olur. */
function readHiddenFields(fd: FormData): Profile['hiddenFields'] {
  const shared = new Set(fd.getAll('share').map(String))
  return HIDEABLE_FIELDS.map((f) => f.key).filter((key) => !shared.has(key))
}

/** Formdaki değerlerden Profile üretir. `keepEmpty`: yarım kalan taslakta boş konum satırları da korunur. */
function profileFromForm(fd: FormData, keepEmpty: boolean): Profile {
  return {
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
    locations: readLocations(fd, keepEmpty),
    hiddenFields: readHiddenFields(fd),
    linkedin: text(fd, 'linkedin'),
    x: text(fd, 'x'),
  }
}

function saveProfile(fd: FormData): void {
  const profile = profileFromForm(fd, false)
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

function showFormError(form: HTMLFormElement, message: string): void {
  const error = form.querySelector<HTMLElement>('[data-error]')
  if (error === null) {
    toast(message)
    return
  }
  error.textContent = message
  error.hidden = false
}

function saveAccount(form: HTMLFormElement, fd: FormData): void {
  const iban = normalizeIban(text(fd, 'iban'))
  if (iban === '') {
    showFormError(form, 'IBAN gir.')
    return
  }
  if (!isValidIban(iban)) {
    showFormError(form, 'IBAN geçersiz görünüyor. Harf ve rakamları kontrol et (TR ile başlayan IBAN 26 karakterdir).')
    return
  }
  const account: BankAccount = {
    id: text(fd, 'id'),
    label: text(fd, 'label'),
    holder: text(fd, 'holder'),
    bank: text(fd, 'bank'),
    iban,
    note: text(fd, 'note'),
  }
  setApp({ ...app, accounts: upsert(app.accounts, account), activeAccountId: account.id })
  closeSheet()
  setUi({ tab: 'bank' }, { animate: true })
  toast('Kaydedildi')
}

function removeAccount(id: string): void {
  if (!window.confirm('Bu hesap silinsin mi?')) return
  const accounts = app.accounts.filter((a) => a.id !== id)
  setApp({ ...app, accounts, activeAccountId: accounts[0]?.id ?? null })
  closeSheet()
  render(false)
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

const PENDING_MAX_AGE_MS = 12 * 60 * 60 * 1000

/** Haritalara geçmeden önce formu taslak olarak saklar, iOS uygulamayı bellekten atsa bile dönüşte geri gelir. */
function savePendingForm(): void {
  const form = document.querySelector<HTMLFormElement>('form[data-form="profile"]')
  const sheet = ui.sheet
  if (form === null || sheet === null || sheet.kind !== 'profile') return
  savePending({ profile: profileFromForm(new FormData(form), true), owner: sheet.owner, savedAt: Date.now() })
}

function placeInput(el: HTMLElement): HTMLInputElement | null {
  return el.closest('[data-loc-row]')?.querySelector<HTMLInputElement>('[name="locPlace"]') ?? null
}

async function mapPaste(el: HTMLElement): Promise<void> {
  const input = placeInput(el)
  if (input === null) return
  try {
    const place = placeFromClipboard(await navigator.clipboard.readText())
    if (place === '') {
      toast('Panoda link ya da adres yok')
      return
    }
    input.value = place
    toast('Yapıştırıldı')
  } catch {
    toast('Panodan okunamadı. Alana basılı tutup Yapıştır\'ı seç')
  }
}

function geolocationMessage(error: GeolocationPositionError): string {
  return error.code === error.PERMISSION_DENIED
    ? 'Konum izni verilmedi. Ayarlar, Gizlilik, Konum Servisleri bölümünden izin ver'
    : 'Konum alınamadı. Açık havada ya da internet varken tekrar dene'
}

function mapHere(el: HTMLElement): void {
  const input = placeInput(el)
  if (input === null) return
  if (!('geolocation' in navigator)) {
    toast('Bu cihaz konum almayı desteklemiyor')
    return
  }
  el.classList.add('busy')
  toast('Konum alınıyor…')
  navigator.geolocation.getCurrentPosition(
    (position) => {
      el.classList.remove('busy')
      const coords = `${position.coords.latitude.toFixed(6)},${position.coords.longitude.toFixed(6)}`
      input.value = `https://www.google.com/maps/search/?api=1&query=${coords}`
      toast('Bulunduğun konum eklendi')
    },
    (error) => {
      el.classList.remove('busy')
      toast(geolocationMessage(error))
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
  )
}

function closeSheet(): void {
  clearPending()
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
      openSheet({ kind: 'order', list: 'networks' })
      break
    case 'sort-bank':
      openSheet({ kind: 'order', list: 'accounts' })
      break
    case 'new-account':
      openSheet({ kind: 'account', id: null })
      break
    case 'edit-account':
      openSheet({ kind: 'account', id: id ?? null })
      break
    case 'delete-account':
      if (id !== undefined) removeAccount(id)
      break
    case 'share-account': {
      const account = app.accounts.find((a) => a.id === id)
      if (account !== undefined) void shareText({ text: accountText(account) })
      break
    }
    case 'add-location': {
      const list = document.querySelector<HTMLElement>('[data-loc-list]')
      if (list === null) break
      list.insertAdjacentHTML('beforeend', locationRow(emptyLocation()))
      const rows = list.querySelectorAll<HTMLInputElement>('[name="locLabel"]')
      rows[rows.length - 1]?.focus()
      break
    }
    case 'remove-location':
      el.closest('[data-loc-row]')?.remove()
      break
    case 'map-open':
      savePendingForm()
      break
    case 'map-paste':
      void mapPaste(el)
      break
    case 'map-here':
      mapHere(el)
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
    const done = el?.dataset.copyToast ?? 'Link kopyalandı'
    holdTimer = window.setTimeout(() => {
      void copyText(value).then((ok) => toast(ok ? done : 'Kopyalanamadı'))
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

/** Sürükleme bitince yeni sırayı ilgili listeye yazar. Kart, Wi-Fi ve Banka ekranları aynı diziyi kullanır. */
installDragSort(
  () => must('app'),
  (list, from, target) => {
    if (list.dataset.order === 'networks') {
      setApp({ ...app, networks: moveItem(app.networks, from, target) })
      list.innerHTML = orderRows(app, 'networks')
    } else if (list.dataset.order === 'accounts') {
      setApp({ ...app, accounts: moveItem(app.accounts, from, target) })
      list.innerHTML = orderRows(app, 'accounts')
    } else {
      setApp({ ...app, profiles: moveItem(app.profiles, from, target) })
    }
    render(false)
  },
)

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
      openSheet({ kind: 'profile', id: null, owner: app.profiles.length === 0, draft: first, imported: true })
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
    case 'account':
      saveAccount(form, fd)
      break
    case 'import':
      importCode(form, fd)
      break
  }
})

render(true)

const pendingForm = loadPending(PENDING_MAX_AGE_MS)
if (pendingForm !== null) {
  openSheet({ kind: 'profile', id: pendingForm.profile.id, owner: pendingForm.owner, draft: pendingForm.profile })
  toast('Yarım kalan form geri yüklendi')
}

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
