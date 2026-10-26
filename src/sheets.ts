import { HIDEABLE_FIELDS } from './card.ts'
import { formatIban } from './iban.ts'
import { icons } from './icons.ts'
import { makeQr } from './qr.ts'
import type { AppState, BankAccount, Location, Profile, WifiNetwork } from './types.ts'
import { escapeHtml as h, type Sheet } from './ui-state.ts'
import { emptyAccount, emptyNetwork, emptyProfile } from './validate.ts'

function field(label: string, name: string, value: string, attrs = ''): string {
  return `<label class="field"><span>${h(label)}</span><input name="${name}" value="${h(value)}" autocomplete="off" autocorrect="off" ${attrs}></label>`
}

function shell(title: string, body: string): string {
  return `<div class="sheet-back" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${h(title)}">
      <header class="sheet-head"><h2 class="display">${h(title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Kapat">${icons.close}</button></header>
      ${body}
    </div>`
}

function vcfImport(imported: boolean): string {
  return `<label class="btn ghost file-btn"><span>Rehberden ekle (.vcf)</span>
      <input type="file" data-vcf accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory" multiple aria-label="Rehberden ekle"></label>
    <p class="field-note file-note">${
      imported
        ? 'Rehberden aktarıldı. Kontrol edip Kaydet\'e bas.'
        : 'iPhone Rehber\'de kişiyi aç, Kişiyi Paylaş, Dosyalara Kaydet. Sonra buradan o dosyayı seç.'
    }</p>`
}

/** Konum satırı: başlık (İş, Ev…) ve harita linki ya da adres. Forma dinamik eklenir/silinir. */
export function locationRow(loc: Location): string {
  return `<div class="loc-row" data-loc-row>
    <input type="hidden" name="locId" value="${h(loc.id)}">
    <div class="loc-fields">
      <input name="locLabel" value="${h(loc.label)}" placeholder="Başlık (İş, Ev…)" autocomplete="off" autocapitalize="words" aria-label="Konum başlığı">
      <input name="locPlace" value="${h(loc.place)}" placeholder="Harita linki ya da adres" inputmode="url" autocomplete="off" autocapitalize="none" aria-label="Konum linki ya da adresi">
      <div class="loc-tools">
        <a class="btn ghost small" href="https://www.google.com/maps" target="_blank" rel="noopener" data-act="map-open">Haritada seç</a>
        <button type="button" class="btn ghost small" data-act="map-paste">Yapıştır</button>
        <button type="button" class="btn ghost small" data-act="map-here">Konumum</button>
      </div>
      <label class="check loc-share"><input type="checkbox" name="locShare" value="${h(loc.id)}" ${loc.shared ? 'checked' : ''}><span>Tam kartta paylaş</span></label>
    </div>
    <button type="button" class="icon-btn" data-act="remove-location" aria-label="Konumu sil">${icons.close}</button>
  </div>`
}

function locationsSection(p: Profile): string {
  return `<div class="loc-section">
    <p class="loc-title">Konumlar</p>
    <div class="loc-list" data-loc-list>${p.locations.map(locationRow).join('')}</div>
    <button type="button" class="btn ghost small" data-act="add-location">${icons.plus}<span>Konum ekle</span></button>
    <p class="field-note loc-note">Haritada seç: Google Maps açılır, yeri bulup Paylaş, Kopyala de, buraya dönüp Yapıştır'a bas. Konumum: bulunduğun yerin linkini alır. Düz adres de yazabilirsin. Her konum için ayrı QR verilebilir.</p>
  </div>`
}

/** Hangi alanların Tam kart / Kısa QR'a ve "Kişiyi gönder"e gireceği. İşaretli olan paylaşılır. */
function shareSection(p: Profile): string {
  const hidden = new Set<string>(p.hiddenFields)
  const boxes = HIDEABLE_FIELDS.map(
    (f) =>
      `<label class="check"><input type="checkbox" name="share" value="${f.key}" ${hidden.has(f.key) ? '' : 'checked'}><span>${h(f.label)}</span></label>`,
  ).join('')
  return `<div class="share-section">
    <p class="loc-title">Tam kartta paylaşılacaklar</p>
    <div class="share-grid">${boxes}</div>
    <p class="field-note">İşaretsiz olanlar Tam kart ve Kısa QR'a, bir de Kişiyi gönder'e girmez. Tek link modunda yine seçilebilir. Telefonu çıkarırsan telefondan üretilen WhatsApp linki de çıkar. Konumlar için her satırdaki kutuyu kullan.</p>
  </div>`
}

function profileForm(p: Profile, isNew: boolean, imported: boolean): string {
  const title = isNew ? (p.isOwner ? 'Kartını oluştur' : 'Arkadaş ekle') : 'Bilgileri düzenle'
  return shell(
    title,
    `${isNew ? vcfImport(imported) : ''}<form class="form" data-form="profile" novalidate>
      <input type="hidden" name="id" value="${h(p.id)}">
      <input type="hidden" name="isOwner" value="${p.isOwner}">
      <div class="two">
        ${field('Ad', 'firstName', p.firstName, 'autocapitalize="words" enterkeyhint="next"')}
        ${field('Soyad', 'lastName', p.lastName, 'autocapitalize="words" enterkeyhint="next"')}
      </div>
      ${field('Firma', 'company', p.company, 'autocapitalize="words"')}
      ${field('Pozisyon', 'title', p.title, 'autocapitalize="words"')}
      ${field('Cep telefonu', 'phone', p.phone, 'type="tel" inputmode="tel" placeholder="0532 000 00 00"')}
      <label class="check"><input type="checkbox" name="whatsappFromPhone" ${p.whatsappFromPhone ? 'checked' : ''}><span>Bu numara WhatsApp'ta da var</span></label>
      ${field('WhatsApp kullanıcı adı linki', 'whatsappLink', p.whatsappLink, 'inputmode="url" autocapitalize="none" placeholder="Doluysa telefon yerine bu kullanılır"')}
      <p class="field-note">WhatsApp'ta kullanıcı adın için oluşturduğun linki yapıştır. Düz @ad yazarsan link olmadığı için kullanılmaz.</p>
      ${field('E-posta', 'email', p.email, 'type="email" inputmode="email" autocapitalize="none" placeholder="ad@firma.com"')}
      ${field('Web sitesi', 'website', p.website, 'inputmode="url" autocapitalize="none" placeholder="firma.com"')}
      <label class="field"><span>Firma adresi</span><textarea name="address" rows="2" autocomplete="off">${h(p.address)}</textarea></label>
      ${locationsSection(p)}
      ${field('LinkedIn', 'linkedin', p.linkedin, 'autocapitalize="none" placeholder="kullanıcı adı veya link"')}
      ${field('X', 'x', p.x, 'autocapitalize="none" placeholder="@kullanıcı"')}
      ${shareSection(p)}
      <div class="form-actions">
        <button type="submit" class="btn primary">Kaydet</button>
        ${isNew ? '' : `<button type="button" class="btn danger" data-act="delete-profile" data-id="${h(p.id)}">Sil</button>`}
      </div>
    </form>`,
  )
}

function wifiForm(n: WifiNetwork, isNew: boolean): string {
  const opt = (value: string, label: string): string =>
    `<option value="${value}"${n.security === value ? ' selected' : ''}>${label}</option>`
  return shell(
    isNew ? 'Ağ ekle' : 'Ağı düzenle',
    `<form class="form" data-form="wifi" novalidate>
      <input type="hidden" name="id" value="${h(n.id)}">
      ${field('Başlık', 'label', n.label, 'placeholder="Ev, Ofis…" autocapitalize="words"')}
      ${field('Ağ adı (SSID)', 'ssid', n.ssid, 'autocapitalize="none"')}
      ${field('Şifre', 'password', n.password, 'autocapitalize="none" spellcheck="false"')}
      <label class="field"><span>Güvenlik</span><select name="security">${opt('WPA', 'WPA / WPA2 / WPA3')}${opt('WEP', 'WEP')}${opt('nopass', 'Şifresiz')}</select></label>
      <label class="check"><input type="checkbox" name="hidden" ${n.hidden ? 'checked' : ''}><span>Gizli ağ</span></label>
      <div class="form-actions">
        <button type="submit" class="btn primary">Kaydet</button>
        ${isNew ? '' : `<button type="button" class="btn danger" data-act="delete-wifi" data-id="${h(n.id)}">Sil</button>`}
      </div>
    </form>`,
  )
}

function accountForm(a: BankAccount, isNew: boolean): string {
  return shell(
    isNew ? 'Hesap ekle' : 'Hesabı düzenle',
    `<form class="form" data-form="account" novalidate>
      <input type="hidden" name="id" value="${h(a.id)}">
      ${field('Başlık', 'label', a.label, 'placeholder="Şahsi TL, Firma USD…" autocapitalize="words"')}
      ${field('Hesap sahibi', 'holder', a.holder, 'autocapitalize="words" placeholder="Ad Soyad ya da firma unvanı"')}
      ${field('Banka', 'bank', a.bank, 'autocapitalize="words"')}
      ${field('IBAN', 'iban', a.iban === '' ? '' : formatIban(a.iban), 'autocapitalize="characters" spellcheck="false" placeholder="TR00 0000 0000 0000 0000 0000 00"')}
      <label class="field"><span>Açıklama (isteğe bağlı)</span><textarea name="note" rows="2" autocomplete="off" placeholder="Örn. Açıklamaya adını yaz">${h(a.note)}</textarea></label>
      <p class="form-error" data-error hidden></p>
      <div class="form-actions">
        <button type="submit" class="btn primary">Kaydet</button>
        ${isNew ? '' : `<button type="button" class="btn danger" data-act="delete-account" data-id="${h(a.id)}">Sil</button>`}
      </div>
    </form>`,
  )
}

type OrderList = 'networks' | 'accounts'

/** Sürüklenebilir satırlar. Sıra, ilgili ekrandaki kaydırma sırasıdır (app.networks / app.accounts dizisi). */
export function orderRows(app: AppState, list: OrderList): string {
  const row = (id: string, icon: string, title: string, sub: string): string => `<li class="person" data-id="${h(id)}">
        <div class="person-main">
          <span class="avatar">${icon}</span>
          <span class="person-text"><b>${h(title)}</b><small>${h(sub)}</small></span>
        </div>
        <span class="grip" data-grip role="button" aria-label="Sıralamak için sürükle">${icons.grip}</span>
      </li>`
  if (list === 'networks') {
    return app.networks.map((n) => row(n.id, icons.wifi, n.label || n.ssid, n.ssid)).join('')
  }
  return app.accounts
    .map((a) => {
      const last4 = a.iban.slice(-4)
      return row(a.id, icons.bank, a.label.trim() || a.bank.trim() || 'Banka hesabı', `${a.bank.trim() === '' ? 'IBAN' : a.bank.trim()} · …${last4}`)
    })
    .join('')
}

function orderSheet(app: AppState, list: OrderList): string {
  const title = list === 'networks' ? 'Ağları sırala' : 'Hesapları sırala'
  const where = list === 'networks' ? 'Wi-Fi' : 'Banka'
  return shell(
    title,
    `<p class="sheet-note">Tutamaçtan sürükleyerek sırala. ${where} ekranındaki kaydırma sırası da aynı olur.</p>
    <ul class="people" data-order="${list}">${orderRows(app, list)}</ul>
    <button class="btn primary block" data-act="close-sheet">Tamam</button>`,
  )
}

function importSheet(): string {
  return shell(
    'Kod yapıştır',
    `<form class="form" data-form="import" novalidate>
      <p class="sheet-note">Arkadaşının gönderdiği kart kodunu ya da kendi yedek kodunu yapıştır. Mesajın tamamını yapıştırabilirsin.</p>
      <label class="field"><span>Kod</span><textarea name="code" rows="5" placeholder="KQR1:…" autocapitalize="none" spellcheck="false"></textarea></label>
      <p class="form-error" data-error hidden></p>
      <div class="form-actions"><button type="submit" class="btn primary">Ekle</button></div>
    </form>`,
  )
}

function appQrSheet(url: string): string {
  const qr = makeQr(url)
  return shell(
    'Uygulama linki',
    `<div class="appqr"><div class="qr-frame small">${qr === null ? '' : qr.svg}</div>
      <p class="sheet-note">Arkadaşın kamerasını tutunca uygulamanın adresi açılır.</p>
      <p class="url" data-copy="${h(url)}">${h(url)}</p>
      <p class="hint copy-hint">Kopyalamak için linke basılı tut.</p></div>`,
  )
}

export function renderSheet(sheet: Sheet, app: AppState, appUrl: string): string {
  if (sheet === null) return ''
  switch (sheet.kind) {
    case 'profile': {
      const found = app.profiles.find((p) => p.id === sheet.id)
      const draft = sheet.draft === undefined ? undefined : { ...sheet.draft, isOwner: found?.isOwner ?? sheet.owner }
      return profileForm(draft ?? found ?? emptyProfile(sheet.owner), found === undefined, sheet.imported === true)
    }
    case 'wifi': {
      const found = app.networks.find((n) => n.id === sheet.id)
      return wifiForm(found ?? emptyNetwork(), found === undefined)
    }
    case 'account': {
      const found = app.accounts.find((a) => a.id === sheet.id)
      return accountForm(found ?? emptyAccount(), found === undefined)
    }
    case 'order':
      return orderSheet(app, sheet.list)
    case 'import':
      return importSheet()
    case 'appqr':
      return appQrSheet(appUrl)
  }
}
