import { icons } from './icons.ts'
import { availableLinks } from './links.ts'
import { makeQr, type QrResult } from './qr.ts'
import type { AppState, CardMode, LinkEntry, LinkKey, Profile, WifiNetwork } from './types.ts'
import { escapeHtml as h, initials, type Tab, type UiState } from './ui-state.ts'
import { buildVCard, fullName } from './vcard.ts'
import { buildWifi } from './wifi.ts'

const DENSITY_TEXT: Readonly<Record<QrResult['tier'], string>> = {
  1: 'Çok rahat okunur',
  2: 'Rahat okunur',
  3: 'Okunur, telefonu yaklaştır',
  4: 'Sık kod, kısa moda geçmeyi dene',
  5: 'Çok sık, kısa moda geç',
}

export function activeProfile(app: AppState): Profile | null {
  return app.profiles.find((p) => p.id === app.activeProfileId) ?? app.profiles[0] ?? null
}

export function activeNetwork(app: AppState): WifiNetwork | null {
  return app.networks.find((n) => n.id === app.activeNetworkId) ?? app.networks[0] ?? null
}

export function resolveLink(links: readonly LinkEntry[], wanted: LinkKey): LinkEntry | null {
  return links.find((l) => l.key === wanted) ?? links[0] ?? null
}

export function cardPayload(p: Profile, mode: CardMode, wanted: LinkKey): string {
  if (mode === 'link') return resolveLink(availableLinks(p), wanted)?.url ?? ''
  return buildVCard(p, mode)
}

function density(qr: QrResult | null, hasData: boolean): string {
  if (!hasData) return '<p class="dens-text">QR için bilgi ekle</p>'
  if (qr === null) return '<p class="dens-text warn">Çok uzun, kısa moda geç</p>'
  const pips = [1, 2, 3, 4, 5]
    .map((n) => `<i class="pip${n <= qr.tier ? ' on t' + qr.tier : ''}"></i>`)
    .join('')
  return `<div class="dens"><span class="pips" aria-hidden="true">${pips}</span><span class="dens-text">${DENSITY_TEXT[qr.tier]}</span></div>`
}

function empty(title: string, body: string, action: string, label: string): string {
  return `<div class="empty rise" style="--d:1"><h2 class="display">${h(title)}</h2><p>${h(body)}</p><button class="btn primary" data-act="${action}">${h(label)}</button></div>`
}

function dots(count: number, index: number): string {
  if (count < 2) return ''
  const items = Array.from({ length: count }, (_, i) => `<i class="dot${i === index ? ' on' : ''}"></i>`).join('')
  return `<div class="dots" role="img" aria-label="${index + 1} / ${count}">${items}</div>`
}

function modeSwitch(mode: CardMode, linkKey: LinkKey, links: readonly LinkEntry[]): string {
  const modes: readonly { readonly mode: CardMode; readonly label: string }[] = [
    { mode: 'full', label: 'Tam kart' },
    { mode: 'short', label: 'Kısa' },
    ...(links.length > 0 ? [{ mode: 'link' as const, label: 'Tek link' }] : []),
  ]
  const seg = modes
    .map((m) => `<button class="seg-btn${mode === m.mode ? ' on' : ''}" data-act="mode" data-mode="${m.mode}" aria-pressed="${mode === m.mode}">${m.label}</button>`)
    .join('')
  const picked = resolveLink(links, linkKey)
  const linkRow =
    mode === 'link'
      ? `<div class="chips small">${links
          .map((l) => `<button class="chip${picked?.key === l.key ? ' on' : ''}" data-act="link" data-key="${l.key}">${h(l.label)}</button>`)
          .join('')}</div>`
      : ''
  return `<div class="seg" style="grid-template-columns:repeat(${modes.length},1fr)" role="group" aria-label="QR içeriği">${seg}</div>${linkRow}`
}

export function renderCard(app: AppState, ui: UiState): string {
  const p = activeProfile(app)
  if (p === null) {
    return empty('Kartını ekle', 'Kendi kartını ve arkadaşlarının kartlarını Kişiler sekmesinden ekle.', 'go-people', 'Kişiler\'e git')
  }
  const links = availableLinks(p)
  const mode: CardMode = ui.mode === 'link' && links.length === 0 ? 'full' : ui.mode
  const payload = cardPayload(p, mode, ui.linkKey)
  const qr = makeQr(payload)
  const name = fullName(p) || 'Adsız'
  const role = [p.title, p.company].filter((s) => s.trim() !== '').join(' · ')
  const index = app.profiles.findIndex((x) => x.id === p.id)
  const picked = mode === 'link' ? resolveLink(links, ui.linkKey) : null
  const shareLabel = picked === null ? 'Kişiyi gönder' : `${picked.label} linkini gönder`
  return `
    ${dots(app.profiles.length, index)}
    <article class="ticket rise" style="--d:1">
      <header class="ticket-head">
        <p class="eyebrow">${p.isOwner ? 'KİŞİSEL KART' : 'KAYITLI KART'}</p>
        <h1 class="display name">${h(name)}</h1>
        ${role === '' ? '' : `<p class="role">${h(role)}</p>`}
      </header>
      <div class="qr-frame">${qr === null ? '<div class="qr-empty"></div>' : qr.svg}</div>
      <footer class="ticket-foot">${density(qr, payload !== '')}</footer>
    </article>
    <div class="rise" style="--d:2">${modeSwitch(mode, ui.linkKey, links)}</div>
    <div class="row-actions rise" style="--d:3">
      <button class="btn ghost" data-act="share-contact" data-id="${h(p.id)}">${icons.share}<span>${h(shareLabel)}</span></button>
    </div>
    <p class="footnote rise" style="--d:4">${app.profiles.length > 1 ? 'Kişiler arasında geçmek için sağa ya da sola kaydır. ' : ''}Okutmadan önce ekran parlaklığını artır.</p>`
}

export function renderWifi(app: AppState, ui: UiState): string {
  const n = activeNetwork(app)
  if (n === null) {
    return empty('Misafirlerin için Wi-Fi', 'Ağ bilgisini bir kez kaydet. Misafir kamerayı tutunca şifre yazmadan bağlanır.', 'new-wifi', 'Ağ ekle')
  }
  const qr = makeQr(buildWifi(n))
  const index = app.networks.findIndex((x) => x.id === n.id)
  const secret = n.security === 'nopass' ? 'Şifresiz ağ' : ui.reveal ? h(n.password) : '••••••••••'
  return `
    ${dots(app.networks.length, index)}
    <article class="ticket rise" style="--d:1">
      <header class="ticket-head">
        <p class="eyebrow">WI-FI · ${n.security === 'nopass' ? 'AÇIK AĞ' : n.security}</p>
        <h1 class="display name">${h(n.label || n.ssid)}</h1>
        <p class="role">Ağ adı: ${h(n.ssid)}</p>
      </header>
      <div class="qr-frame">${qr === null ? '<div class="qr-empty"></div>' : qr.svg}</div>
      <footer class="ticket-foot"><p class="dens-text">Kamerayı tutunca ağa bağlanma önerisi çıkar</p></footer>
    </article>
    <div class="secret rise" style="--d:2">
      <span class="secret-label">Şifre</span>
      <span class="secret-value">${secret}</span>
      ${n.security === 'nopass' ? '' : `<button class="icon-btn" data-act="reveal" aria-label="${ui.reveal ? 'Şifreyi gizle' : 'Şifreyi göster'}">${ui.reveal ? icons.eyeOff : icons.eye}</button>`}
    </div>
    <div class="row-actions rise" style="--d:3">
      <button class="btn ghost" data-act="edit-wifi" data-id="${h(n.id)}">Düzenle</button>
      <button class="btn ghost" data-act="new-wifi">${icons.plus}<span>Ağ ekle</span></button>
      ${app.networks.length > 1 ? '<button class="btn ghost" data-act="sort-wifi"><span>Sırala</span></button>' : ''}
    </div>
    ${app.networks.length > 1 ? '<p class="footnote rise" style="--d:4">Ağlar arasında geçmek için sağa ya da sola kaydır.</p>' : ''}`
}

/** Kişiler listesi: sıra, Kart ekranındaki kaydırma sırasıyla birebir aynıdır (app.profiles dizisi). */
export function renderPeople(app: AppState): string {
  const rows = app.profiles
    .map((p) => {
      const name = fullName(p) || p.company || 'Adsız'
      const sub = [p.title, p.company].filter((s) => s.trim() !== '').join(' · ')
      return `<li class="person" data-id="${h(p.id)}">
        <button class="person-main" data-act="open-profile" data-id="${h(p.id)}">
          <span class="avatar${p.isOwner ? ' owner' : ''}">${h(initials(p.firstName, p.lastName, name))}</span>
          <span class="person-text"><b>${h(name)}</b>${sub === '' ? '' : `<small>${h(sub)}</small>`}</span>
          ${p.isOwner ? '<span class="badge">Ben</span>' : ''}
        </button>
        <button class="btn ghost small" data-act="edit-profile" data-id="${h(p.id)}">Düzenle</button>
        ${app.profiles.length > 1 ? `<span class="grip" data-grip role="button" aria-label="Sıralamak için sürükle">${icons.grip}</span>` : ''}
      </li>`
    })
    .join('')
  const hint =
    app.profiles.length > 1
      ? 'Sırayı sağdaki tutamaçtan sürükleyerek değiştir. Kart ekranındaki kaydırma sırası da aynı olur.'
      : "Kendin ve arkadaşların. Birine dokun, QR'ı hemen göster."
  return `
    <header class="page-head rise" style="--d:1"><h1 class="display">Kişiler</h1><p>${hint}</p></header>
    <ul class="people rise" style="--d:2">${rows}</ul>
    <div class="row-actions rise" style="--d:3">
      <button class="btn primary" data-act="new-friend">${icons.plus}<span>${app.profiles.length === 0 ? 'Kartını ekle' : 'Kişi ekle'}</span></button>
      <button class="btn ghost" data-act="open-import">Kod yapıştır</button>
    </div>`
}

function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function renderMore(): string {
  const local = window.location.protocol === 'file:' || /^(localhost|127\.|\[::1\])/.test(window.location.hostname)
  return `
    <header class="page-head rise" style="--d:1"><h1 class="display">Paylaş ve yedekle</h1><p>Uygulamayı arkadaşlarına ver, bilgilerini koru.</p></header>
    <section class="panel rise" style="--d:2">
      <h2>Uygulamayı paylaş</h2>
      <p>WhatsApp'tan link olarak gider. Arkadaşın açıp ana ekrana ekler, sonra internetsiz çalışır. Kişisel bilgilerin linkle gitmez.</p>
      ${local ? '<p class="note">Bu adres yalnızca bu cihazda çalışıyor. Paylaşmak için uygulamanın bir adrese konması gerekir.</p>' : ''}
      <div class="row-actions flush stack">
        <button class="btn primary" data-act="share-app">${icons.share}<span>Linki gönder</span></button>
        <button class="btn ghost" data-act="app-qr">Link QR'ı</button>
      </div>
    </section>
    <section class="panel rise" style="--d:3">
      <h2>Yedek</h2>
      <p>Telefon bellek temizlerse bilgiler silinebilir. Yedek kodunu kendine WhatsApp'tan gönder, gerekince yapıştır.</p>
      <div class="row-actions flush stack">
        <button class="btn ghost" data-act="share-backup">Yedek kodu gönder</button>
        <button class="btn ghost" data-act="open-import">Kod yapıştır</button>
      </div>
    </section>
    <section class="panel rise" style="--d:4">
      <h2>Ana ekrana ekle</h2>
      ${
        isStandalone()
          ? '<p class="ok">Kurulu. Uygulama internetsiz çalışır.</p>'
          : '<ol class="steps"><li>Safari\'de alttaki paylaş düğmesine dokun.</li><li>“Ana Ekrana Ekle”yi seç.</li><li>Bundan sonra ana ekrandaki simgeden aç.</li></ol>'
      }
    </section>`
}

const TABS: readonly { readonly tab: Tab; readonly label: string; readonly icon: string }[] = [
  { tab: 'card', label: 'Kart', icon: icons.card },
  { tab: 'wifi', label: 'Wi-Fi', icon: icons.wifi },
  { tab: 'people', label: 'Kişiler', icon: icons.people },
  { tab: 'more', label: 'Paylaş', icon: icons.more },
]

export function renderTabbar(current: Tab): string {
  return TABS.map(
    (t) =>
      `<button class="tab${t.tab === current ? ' on' : ''}" data-act="tab" data-tab="${t.tab}" aria-current="${t.tab === current ? 'page' : 'false'}">${t.icon}<span>${t.label}</span></button>`,
  ).join('')
}
