import assert from 'node:assert/strict'
import { test } from 'node:test'
import jsQR from 'jsqr'
import { decodeShare, encodeBackup, encodeProfile } from './codec.ts'
import { contactText, linkMessage } from './contact-text.ts'
import { accountText, formatIban, isValidIban, normalizeIban } from './iban.ts'
import { availableLinks, e164, linkedinUrl, locationLabel, placeFromClipboard, whatsappUrl, xUrl } from './links.ts'
import { moveItem } from './order.ts'
import { makeQr } from './qr.ts'
import { buildVCard } from './vcard.ts'
import { emptyNetwork, emptyProfile, sanitizeProfile, sanitizeProfileDraft, sanitizeState } from './validate.ts'
import { buildWifi } from './wifi.ts'

const sample = {
  ...emptyProfile(true),
  firstName: 'Ayşe',
  lastName: 'Yılmaz',
  company: 'Örnek; Teknoloji, A.Ş.',
  title: 'Mühendis',
  phone: '0532 123 45 67',
  email: 'ayse@example.com',
  website: 'ornek.com.tr',
  address: 'İstanbul\nTürkiye',
  linkedin: 'ayseyilmaz',
  x: '@ayseyilmaz',
}

test('telefon numarası uluslararası biçime çevrilir', () => {
  assert.equal(e164('0532 123 45 67'), '+905321234567')
  assert.equal(e164('532 123 45 67'), '+905321234567')
  assert.equal(e164('+49 170 1234567'), '+491701234567')
  assert.equal(e164('00905321234567'), '+905321234567')
  assert.equal(e164(''), '')
  assert.equal(whatsappUrl('0532 123 45 67'), 'https://wa.me/905321234567')
})

test('LinkedIn ve X kullanıcı adları linke dönüşür', () => {
  assert.equal(linkedinUrl('ayseyilmaz'), 'https://www.linkedin.com/in/ayseyilmaz')
  assert.equal(linkedinUrl('linkedin.com/in/ayseyilmaz'), 'https://linkedin.com/in/ayseyilmaz')
  assert.equal(linkedinUrl('https://www.linkedin.com/in/ayseyilmaz'), 'https://www.linkedin.com/in/ayseyilmaz')
  assert.equal(
    linkedinUrl('https://www.linkedin.com/in/ayse-yilmaz-12345678?utm_source=share_via&utm_content=profile&utm_medium=member_ios'),
    'https://www.linkedin.com/in/ayse-yilmaz-12345678',
  )
  assert.equal(linkedinUrl('linkedin.com/in/ali/?trk=x#a'), 'https://linkedin.com/in/ali/')
  assert.equal(xUrl('https://x.com/ayseyilmaz?s=21&t=abc'), 'https://x.com/ayseyilmaz')
  assert.equal(xUrl('@ayseyilmaz'), 'https://x.com/ayseyilmaz')
  assert.equal(xUrl('twitter.com/ayseyilmaz'), 'https://twitter.com/ayseyilmaz')
})

test('vCard tam modda tüm alanları ve kaçışları içerir', () => {
  const card = buildVCard(sample, 'full')
  assert.match(card, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/)
  assert.match(card, /N:Yılmaz;Ayşe;;;/)
  assert.match(card, /ORG:Örnek\\; Teknoloji\\, A\.Ş\./)
  assert.match(card, /TEL;TYPE=CELL,VOICE:\+905321234567/)
  assert.match(card, /URL:https:\/\/ornek\.com\.tr/)
  assert.match(card, /ADR;TYPE=WORK:;;İstanbul\\nTürkiye;;;;/)
  assert.match(card, /item1\.URL:https:\/\/www\.linkedin\.com\/in\/ayseyilmaz\r\nitem1\.X-ABLabel:LinkedIn/)
  assert.match(card, /X-ABLabel:WhatsApp/)
  assert.match(card, /END:VCARD$/)
})

test('vCard kısa modda adres, unvan ve linkleri atar', () => {
  const card = buildVCard(sample, 'short')
  assert.doesNotMatch(card, /ADR|TITLE|URL|X-ABLabel/)
  assert.match(card, /EMAIL;TYPE=INTERNET:ayse@example\.com/)
})

test('kişi mesajı okunabilir, Türkçe ve sadece dolu alanları içerir', () => {
  const text = contactText(sample)
  assert.match(text, /^Ayşe Yılmaz\nMühendis · Örnek; Teknoloji, A\.Ş\.\n\nTelefon: \+90 532 123 45 67\n/)
  assert.match(text, /E-posta: ayse@example\.com/)
  assert.match(text, /Adres: İstanbul, Türkiye/)
  assert.match(text, /LinkedIn: https:\/\/www\.linkedin\.com\/in\/ayseyilmaz/)
  assert.match(text, /WhatsApp: https:\/\/wa\.me\/905321234567/)
  assert.doesNotMatch(text, /KQR1|BEGIN:VCARD/)
  const minimal = contactText({ ...emptyProfile(false), firstName: 'Ali', phone: '+49 170 1234567' })
  assert.equal(minimal, 'Ali\n\nTelefon: +491701234567\nWhatsApp: https://wa.me/491701234567')
})

test('kısa kişi mesajı QR kısa kartıyla aynı alanları içerir', () => {
  const short = contactText(sample, 'short')
  assert.equal(short, 'Ayşe Yılmaz\nÖrnek; Teknoloji, A.Ş.\n\nTelefon: +90 532 123 45 67\nE-posta: ayse@example.com')
  assert.doesNotMatch(short, /Mühendis|Web:|Adres|LinkedIn|WhatsApp|X:/)
})

const withLocations = {
  ...sample,
  locations: [
    { id: 'ev', label: 'Ev', place: 'https://maps.app.goo.gl/abc' },
    { id: 'is', label: 'İş', place: 'Örnek Mah. No 5, İstanbul' },
  ],
}

test('birden fazla konum: etiketler, harita linki ve düz adres linke çevrilir', () => {
  const locs = availableLinks(withLocations).filter((l) => l.key.startsWith('loc:'))
  assert.deepEqual(locs.map((l) => l.key), ['loc:ev', 'loc:is'])
  assert.deepEqual(locs.map((l) => l.label), ['Ev konumu', 'İş konumu'])
  assert.equal(locs[0]?.url, 'https://maps.app.goo.gl/abc')
  assert.equal(locs[1]?.url, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Örnek Mah. No 5, İstanbul')}`)
  assert.equal(locationLabel(''), 'Konum')
  assert.equal(locationLabel('Konum 2'), 'Konum 2')
  assert.equal(locationLabel('Şube'), 'Şube konumu')
})

test('panodan konum: yer adı içeren metinde yalnızca link, düz adreste adres alınır', () => {
  assert.equal(placeFromClipboard('Kafe Örnek\nhttps://maps.app.goo.gl/AbC123 '), 'https://maps.app.goo.gl/AbC123')
  assert.equal(placeFromClipboard('https://maps.apple.com/?ll=41.0,29.0&q=Ev'), 'https://maps.apple.com/?ll=41.0,29.0&q=Ev')
  assert.equal(placeFromClipboard('  Örnek Mah. No 3, İstanbul \n'), 'Örnek Mah. No 3, İstanbul')
  assert.equal(placeFromClipboard('   '), '')
  assert.equal(placeFromClipboard('x'.repeat(500)).length, 300)
})

test('yarım kalan form taslağı boş konum satırlarını korur, normal temizleme atar', () => {
  const raw = { firstName: 'Ali', locations: [{ id: 'a', label: 'İş', place: '' }, { id: 'b', label: 'Ev', place: 'https://maps.app.goo.gl/x' }] }
  assert.equal(sanitizeProfileDraft(raw)?.locations.length, 2)
  assert.equal(sanitizeProfile(raw)?.locations.length, 1)
})

test('tek link mesajı kişiyi ve seçilen konumu içerir', () => {
  const link = availableLinks(withLocations).find((l) => l.key === 'loc:ev')
  assert.ok(link !== undefined)
  assert.equal(linkMessage(withLocations, link), 'Ayşe Yılmaz · Ev konumu\nhttps://maps.app.goo.gl/abc')
})

test('tam kart: konumlar mesajda ve vCard etiketli URL satırlarında yer alır', () => {
  const text = contactText(withLocations)
  assert.match(text, /Ev konumu: https:\/\/maps\.app\.goo\.gl\/abc/)
  assert.match(text, /İş konumu: https:\/\/www\.google\.com\/maps\/search/)
  const card = buildVCard(withLocations, 'full')
  assert.match(card, /item\d+\.X-ABLabel:Ev konumu/)
  assert.match(card, /item\d+\.X-ABLabel:İş konumu/)
  assert.doesNotMatch(buildVCard(withLocations, 'short'), /konumu/)
})

test('eski mapsUrl alanı ilk konuma taşınır, yeni sürüm bilgileri korunur', () => {
  const migrated = sanitizeProfile({ firstName: 'Ali', mapsUrl: 'https://maps.app.goo.gl/old' })
  assert.equal(migrated?.locations.length, 1)
  assert.equal(migrated?.locations[0]?.place, 'https://maps.app.goo.gl/old')
  const kept = sanitizeProfile({ firstName: 'Ali', mapsUrl: 'x', locations: [{ id: 'a', label: 'İş', place: 'https://maps.app.goo.gl/new' }] })
  assert.equal(kept?.locations.length, 1)
  assert.equal(kept?.locations[0]?.label, 'İş')
  const dropped = sanitizeProfile({ firstName: 'Ali', locations: [{ id: 'a', label: 'Boş', place: '   ' }] })
  assert.equal(dropped?.locations.length, 0)
})

const VALID_TR_IBAN = 'TR330006100519786457841326'

test('IBAN: biçimlendirme, mod-97 doğrulama ve Türk IBAN uzunluğu', () => {
  assert.equal(normalizeIban(' tr33 0006-1005 1978 6457 8413 26 '), VALID_TR_IBAN)
  assert.equal(formatIban(VALID_TR_IBAN), 'TR33 0006 1005 1978 6457 8413 26')
  assert.equal(isValidIban(VALID_TR_IBAN), true)
  assert.equal(isValidIban('TR33 0006 1005 1978 6457 8413 26'), true)
  assert.equal(isValidIban('DE89 3704 0044 0532 0130 00'), true)
  assert.equal(isValidIban('TR330006100519786457841327'), false)
  assert.equal(isValidIban('TR3300061005197864578413'), false)
  assert.equal(isValidIban('1234'), false)
  assert.equal(isValidIban(''), false)
})

test('hesap mesajı yalnızca dolu alanları içerir, IBAN gruplu yazılır', () => {
  const account = { id: 'a', label: 'Şahsi TL', holder: 'Ayşe Yılmaz', bank: 'Örnek Banka', iban: VALID_TR_IBAN, note: 'Açıklamaya adını yaz' }
  assert.equal(
    accountText(account),
    'Hesap sahibi: Ayşe Yılmaz\nBanka: Örnek Banka\nIBAN: TR33 0006 1005 1978 6457 8413 26\nAçıklama: Açıklamaya adını yaz',
  )
  assert.equal(accountText({ ...account, holder: '', bank: '', note: '' }), 'IBAN: TR33 0006 1005 1978 6457 8413 26')
})

test('hesaplar yedek koduna girer, boş IBAN\'lı kayıt atılır', () => {
  const state = sanitizeState({
    profiles: [sample],
    accounts: [
      { id: 'a', label: 'TL', holder: 'Ayşe', bank: 'B', iban: 'tr33 0006 1005 1978 6457 8413 26', note: '' },
      { id: 'b', label: 'Boş', iban: '  ' },
    ],
    activeAccountId: 'a',
  })
  assert.equal(state.accounts.length, 1)
  assert.equal(state.accounts[0]?.iban, VALID_TR_IBAN)
  const back = decodeShare(encodeBackup(state))
  assert.ok(back && back.kind === 'backup')
  assert.equal(back.state.accounts[0]?.iban, VALID_TR_IBAN)
  assert.equal(back.state.activeAccountId, 'a')
})

test('moveItem öğeyi taşır, sınırları korur, girdiyi değiştirmez', () => {
  const list = ['a', 'b', 'c', 'd'] as const
  assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveItem(list, 1, 99), ['a', 'c', 'd', 'b'])
  assert.deepEqual(moveItem(list, 2, -5), ['c', 'a', 'b', 'd'])
  assert.equal(moveItem(list, 1, 1), list)
  assert.equal(moveItem(list, 9, 0), list)
  assert.deepEqual([...list], ['a', 'b', 'c', 'd'])
})

test('boş profil için vCard üretilmez', () => {
  assert.equal(buildVCard(emptyProfile(true), 'full'), '')
})

test('WhatsApp kullanıcı adı linki doluysa telefon yerine o kullanılır', () => {
  const wa = (p: typeof sample) => availableLinks(p).find((l) => l.key === 'whatsapp')?.url
  assert.equal(wa(sample), 'https://wa.me/905321234567')
  assert.equal(wa({ ...sample, whatsappLink: 'https://wa.me/message/ABC123' }), 'https://wa.me/message/ABC123')
  assert.equal(wa({ ...sample, whatsappLink: 'wa.me/message/ABC123' }), 'https://wa.me/message/ABC123')
  assert.equal(wa({ ...sample, whatsappLink: '@Ayse_Yilmaz' }), 'https://wa.me/905321234567')
  assert.equal(wa({ ...sample, whatsappFromPhone: false, whatsappLink: '@Ayse_Yilmaz' }), undefined)
  assert.equal(wa({ ...sample, whatsappFromPhone: false, whatsappLink: 'https://wa.me/message/ABC123' }), 'https://wa.me/message/ABC123')
})

test('availableLinks yalnızca dolu alanları döndürür', () => {
  assert.deepEqual(availableLinks(emptyProfile(true)), [])
  const keys = availableLinks(sample).map((l) => l.key)
  assert.deepEqual(keys, ['linkedin', 'x', 'whatsapp', 'website'])
})

test('Wi-Fi QR metni özel karakterleri kaçırır', () => {
  const net = { ...emptyNetwork(), ssid: 'Ev;Ağı', password: 'a:b"c,d\\e', security: 'WPA' as const }
  assert.equal(buildWifi(net), 'WIFI:T:WPA;S:Ev\\;Ağı;P:a\\:b\\"c\\,d\\\\e;;')
  assert.equal(buildWifi({ ...net, security: 'nopass', hidden: true }), 'WIFI:T:nopass;S:Ev\\;Ağı;H:true;;')
  assert.equal(buildWifi(emptyNetwork()), '')
})

test('profil kodu gidiş dönüşte bilgiyi korur, sahiplik bayrağını düşürür', () => {
  const message = `Kartım: ${encodeProfile(sample)} bu kadar`
  const decoded = decodeShare(message)
  assert.ok(decoded && decoded.kind === 'profile')
  assert.equal(decoded.profile.lastName, 'Yılmaz')
  assert.equal(decoded.profile.isOwner, false)
  assert.notEqual(decoded.profile.id, sample.id)
})

test('yedek kodu durumu geri getirir', () => {
  const state = sanitizeState({ profiles: [sample], networks: [], activeProfileId: sample.id })
  const decoded = decodeShare(encodeBackup(state))
  assert.ok(decoded && decoded.kind === 'backup')
  assert.equal(decoded.state.profiles.length, 1)
  assert.equal(decoded.state.activeProfileId, sample.id)
})

test('bozuk veya yabancı metin kod olarak kabul edilmez', () => {
  assert.equal(decodeShare('merhaba'), null)
  assert.equal(decodeShare('KQR1:!!!'), null)
  assert.equal(decodeShare('KQR1:YWJj'), null)
})

function decodeSvg(svg: string): string | null {
  const total = Number(/viewBox="0 0 (\d+) /.exec(svg)?.[1])
  const scale = 6
  const px = total * scale
  const data = new Uint8ClampedArray(px * px * 4).fill(255)
  for (const m of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const i = ((Number(m[2]) * scale + dy) * px + Number(m[1]) * scale + dx) * 4
        data[i] = data[i + 1] = data[i + 2] = 0
      }
    }
  }
  return jsQR(data, px, px)?.data ?? null
}

test('üretilen QR tarandığında vCard ve Wi-Fi metni birebir döner (Türkçe dahil)', () => {
  const card = buildVCard(sample, 'full')
  const qr = makeQr(card)
  assert.ok(qr !== null)
  assert.equal(decodeSvg(qr.svg), card)
  const short = makeQr(buildVCard(sample, 'short'))
  assert.ok(short !== null)
  assert.equal(decodeSvg(short.svg), buildVCard(sample, 'short'))
  const wifi = buildWifi({ ...emptyNetwork(), ssid: 'Çay Ağı', password: 'şifre;ğüİ' })
  const wifiQr = makeQr(wifi)
  assert.ok(wifiQr !== null)
  assert.equal(decodeSvg(wifiQr.svg), wifi)
})

test('QR üretimi Türkçe karakterle çalışır ve çok uzun metni reddeder', () => {
  const qr = makeQr(buildVCard(sample, 'full'))
  assert.ok(qr !== null)
  assert.ok(qr.version >= 1 && qr.version <= 40)
  assert.match(qr.svg, /^<svg/)
  assert.equal(makeQr('x'.repeat(4000)), null)
  assert.equal(makeQr(''), null)
})
