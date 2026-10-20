import { icons } from './icons.ts'
import { makeQr } from './qr.ts'
import type { AppState, Profile, WifiNetwork } from './types.ts'
import { escapeHtml as h, type Sheet } from './ui-state.ts'
import { emptyNetwork, emptyProfile } from './validate.ts'

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
      ${field('Google konum linki', 'mapsUrl', p.mapsUrl, 'inputmode="url" autocapitalize="none" placeholder="Haritalar uygulamasından kopyala"')}
      ${field('LinkedIn', 'linkedin', p.linkedin, 'autocapitalize="none" placeholder="kullanıcı adı veya link"')}
      ${field('X', 'x', p.x, 'autocapitalize="none" placeholder="@kullanıcı"')}
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

/** Sürüklenebilir ağ satırları. Sıra, Wi-Fi ekranındaki kaydırma sırasıdır (app.networks dizisi). */
export function networkOrderRows(app: AppState): string {
  return app.networks
    .map(
      (n) => `<li class="person" data-id="${h(n.id)}">
        <div class="person-main">
          <span class="avatar">${icons.wifi}</span>
          <span class="person-text"><b>${h(n.label || n.ssid)}</b><small>${h(n.ssid)}</small></span>
        </div>
        <span class="grip" data-grip role="button" aria-label="Sıralamak için sürükle">${icons.grip}</span>
      </li>`,
    )
    .join('')
}

function orderNetworksSheet(app: AppState): string {
  return shell(
    'Ağları sırala',
    `<p class="sheet-note">Tutamaçtan sürükleyerek sırala. Wi-Fi ekranındaki kaydırma sırası da aynı olur.</p>
    <ul class="people" data-order="networks">${networkOrderRows(app)}</ul>
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
      const draft = sheet.draft === undefined ? undefined : { ...sheet.draft, isOwner: sheet.owner }
      return profileForm(found ?? draft ?? emptyProfile(sheet.owner), found === undefined, draft !== undefined)
    }
    case 'wifi': {
      const found = app.networks.find((n) => n.id === sheet.id)
      return wifiForm(found ?? emptyNetwork(), found === undefined)
    }
    case 'order-networks':
      return orderNetworksSheet(app)
    case 'import':
      return importSheet()
    case 'appqr':
      return appQrSheet(appUrl)
  }
}
