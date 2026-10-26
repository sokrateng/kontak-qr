import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from './browser.mjs'
import { encodeBackup, encodeProfile } from '../src/codec.ts'
import { emptyProfile } from '../src/validate.ts'

const url = process.argv[2] ?? 'http://localhost:3000'

const browser = await puppeteer.launch({ headless: true })
const errors = []
const results = []
const step = async (name, fn) => {
  await fn()
  results.push(`OK  ${name}`)
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('dialog', (d) => d.accept())
  await page.goto(url, { waitUntil: 'networkidle0' })

  const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel)
  const text = (sel) => page.$eval(sel, (el) => el.textContent)
  const fill = async (name, value) => {
    await page.$eval(`[name="${name}"]`, (el, v) => { el.value = v }, value)
  }

  await step('boş durumda karşılama görünür', async () => {
    assert.match(await text('.empty h2'), /Kartını ekle/)
  })

  await step('kart formu: ad girmeden kaydetme reddedilir', async () => {
    await click('[data-act="go-people"]')
    await click('[data-act="new-friend"]')
    await click('form[data-form="profile"] button[type="submit"]')
    assert.match(await text('#toast'), /Ad ya da firma/)
  })

  await step('kart kaydedilir, QR ve isim görünür', async () => {
    await fill('firstName', 'Şule')
    await fill('lastName', 'Öztürk')
    await fill('company', 'Örnek')
    await fill('phone', '0532 111 22 33')
    await fill('linkedin', 'suleo')
    await click('form[data-form="profile"] button[type="submit"]')
    assert.equal(await text('.name'), 'Şule Öztürk')
    assert.ok(await page.$('.qr-frame svg'))
  })

  await step('kart sekmesinde kişi çipleri ve düzenle düğmesi yok', async () => {
    assert.equal(await page.$('#view .chips'), null)
    assert.equal(await page.$('#view [data-act="edit-profile"]'), null)
    assert.equal(await page.$('#view [data-act="new-friend"]'), null)
  })

  await step('tek link modunda LinkedIn seçeneği çıkar', async () => {
    await click('[data-act="mode"][data-mode="link"]')
    assert.ok((await text('.chips.small')).includes('LinkedIn'))
  })

  await step('Wi-Fi ağı eklenir ve şifre göster/gizle çalışır', async () => {
    await click('[data-act="tab"][data-tab="wifi"]')
    await click('[data-act="new-wifi"]')
    await fill('label', 'Ev')
    await fill('ssid', 'EvAgi')
    await fill('password', 'gizli-sifre')
    await click('form[data-form="wifi"] button[type="submit"]')
    assert.match(await text('.secret-value'), /•+/)
    await click('[data-act="reveal"]')
    assert.equal(await text('.secret-value'), 'gizli-sifre')
  })

  await step('veriler sayfa yenilenince korunur', async () => {
    await page.reload({ waitUntil: 'networkidle0' })
    assert.equal(await text('.name'), 'Şule Öztürk')
  })

  await step('arkadaş kodu yapıştırılınca kişi eklenir', async () => {
    const friend = { ...emptyProfile(false), firstName: 'Ahmet', lastName: 'Yılmaz', company: 'Orman', email: 'a@b.com' }
    await click('[data-act="tab"][data-tab="people"]')
    await click('[data-act="open-import"]')
    await fill('code', `Selam, kartım: ${encodeProfile(friend)}`)
    await click('form[data-form="import"] button[type="submit"]')
    assert.equal(await text('.name'), 'Ahmet Yılmaz')
  })

  await step('linki olmayan kişide Tek link seçeneği gizlenir, kaydırınca kişi değişir', async () => {
    const segLabels = () => page.$$eval('.seg-btn', (els) => els.map((e) => e.textContent))
    assert.deepEqual(await segLabels(), ['Tam kart', 'Kısa'])
    const swipe = (dx) => page.evaluate((d) => {
      const fire = (type, x) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 })
        document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }))
      }
      fire('touchstart', 200)
      fire('touchend', 200 + d)
    }, dx)
    await swipe(120)
    assert.equal(await text('.name'), 'Şule Öztürk')
    assert.deepEqual(await segLabels(), ['Tam kart', 'Kısa', 'Tek link'])
    await swipe(-120)
    assert.equal(await text('.name'), 'Ahmet Yılmaz')
    await swipe(-120)
    assert.equal(await text('.name'), 'Ahmet Yılmaz')
  })

  await step('Kişiyi gönder okunabilir kişi metni paylaşır', async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })
      Object.defineProperty(navigator, 'share', { value: async (d) => { window.__shared = d }, configurable: true })
    })
    await click('[data-act="share-contact"]')
    const shared = await page.evaluate(() => window.__shared)
    assert.ok(shared.text.startsWith('Ahmet Yılmaz\nOrman\n'))
    assert.ok(shared.text.includes('E-posta: a@b.com'))
    assert.doesNotMatch(shared.text, /KQR1/)
  })

  await step('gönderme ekrandaki moda uyar: Tek link, Kısa, Tam kart', async () => {
    const swipe = (dx) => page.evaluate((d) => {
      const fire = (type, x) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 })
        document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }))
      }
      fire('touchstart', 200)
      fire('touchend', 200 + d)
    }, dx)
    const send = async () => {
      await page.evaluate(() => { window.__shared = null })
      await click('[data-act="share-contact"]')
      return page.evaluate(() => window.__shared)
    }
    await swipe(120)
    assert.equal(await text('.name'), 'Şule Öztürk')
    await click('[data-act="mode"][data-mode="link"]')
    await click('[data-act="link"][data-key="linkedin"]')
    assert.equal((await text('[data-act="share-contact"]')).trim(), 'LinkedIn linkini gönder')
    const link = await send()
    assert.equal(link.text, 'Şule Öztürk · LinkedIn\nhttps://www.linkedin.com/in/suleo')
    await click('[data-act="mode"][data-mode="short"]')
    assert.equal((await text('[data-act="share-contact"]')).trim(), 'Kişiyi gönder')
    const short = await send()
    assert.ok(short.text.includes('Telefon: +90 532 111 22 33'))
    assert.ok(!short.text.includes('LinkedIn'))
    await click('[data-act="mode"][data-mode="full"]')
    const full = await send()
    assert.ok(full.text.includes('LinkedIn: https://www.linkedin.com/in/suleo'))
    assert.ok(full.text.includes('Telefon: +90 532 111 22 33'))
  })

  await step('birden fazla konum: ekle, sil, Tek link QR ve gönderme', async () => {
    const sendNow = async () => {
      await page.evaluate(() => { window.__shared = null })
      await click('[data-act="share-contact"]')
      return page.evaluate(() => window.__shared)
    }
    await click('[data-act="tab"][data-tab="people"]')
    await click('.person [data-act="edit-profile"]')
    await new Promise((r) => setTimeout(r, 700))
    for (const [label, place] of [['Ev', 'https://maps.app.goo.gl/ev123'], ['İş', 'Örnek Mah. No 5, İstanbul'], ['Silinecek', 'https://maps.app.goo.gl/sil']]) {
      await click('[data-act="add-location"]')
      await page.evaluate((l, p) => {
        const labels = document.querySelectorAll('[name="locLabel"]')
        const places = document.querySelectorAll('[name="locPlace"]')
        labels[labels.length - 1].value = l
        places[places.length - 1].value = p
      }, label, place)
    }
    assert.equal((await page.$$('[data-loc-row]')).length, 3)
    await page.evaluate(() => document.querySelectorAll('[data-act="remove-location"]')[2].click())
    assert.equal((await page.$$('[data-loc-row]')).length, 2)
    await click('form[data-form="profile"] button[type="submit"]')
    assert.equal(await text('.name'), 'Şule Öztürk')
    await click('[data-act="mode"][data-mode="link"]')
    const chips = await page.$$eval('.chips.small .chip', (els) => els.map((e) => e.textContent))
    assert.ok(chips.includes('Ev konumu') && chips.includes('İş konumu'))
    assert.ok(!chips.includes('Silinecek konumu'))
    await page.evaluate(() => [...document.querySelectorAll('.chips.small .chip')].find((e) => e.textContent === 'Ev konumu').click())
    assert.equal((await text('[data-act="share-contact"]')).trim(), 'Ev konumu linkini gönder')
    assert.equal((await sendNow()).text, 'Şule Öztürk · Ev konumu\nhttps://maps.app.goo.gl/ev123')
    await page.evaluate(() => [...document.querySelectorAll('.chips.small .chip')].find((e) => e.textContent === 'İş konumu').click())
    const work = (await sendNow()).text
    assert.ok(work.includes('İş konumu\nhttps://www.google.com/maps/search/?api=1&query='))
    await click('[data-act="mode"][data-mode="full"]')
    const full = (await sendNow()).text
    assert.ok(full.includes('Ev konumu: https://maps.app.goo.gl/ev123'))
    assert.ok(full.includes('İş konumu: https://www.google.com/maps/search/'))
  })

  await step('banka hesapları: IBAN doğrulama, ekleme, kopyalama, gönderme, kaydırma, sıralama', async () => {
    const IBAN1 = 'TR33 0006 1005 1978 6457 8413 26'
    const IBAN2 = 'DE89 3704 0044 0532 0130 00'
    const addAccount = async (label, holder, bank, iban) => {
      await click('[data-act="new-account"]')
      await new Promise((r) => setTimeout(r, 500))
      await fill('label', label)
      await fill('holder', holder)
      await fill('bank', bank)
      await fill('iban', iban)
      await click('form[data-form="account"] button[type="submit"]')
    }
    await page.evaluate(() => {
      window.__copied = null
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t } }, configurable: true })
    })
    await click('[data-act="tab"][data-tab="bank"]')
    assert.match(await text('.empty h2'), /Banka bilgilerin/)
    await click('[data-act="new-account"]')
    await new Promise((r) => setTimeout(r, 500))
    await fill('iban', 'TR33 0006 1005 1978 6457 8413 27')
    await click('form[data-form="account"] button[type="submit"]')
    assert.match(await text('[data-error]'), /IBAN geçersiz/)
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kontak-qr:v1')).accounts?.length ?? 0), 0)
    await click('.sheet-back')
    await addAccount('Şahsi TL', 'Şule Öztürk', 'Örnek Banka', IBAN1)
    await addAccount('Avro', 'Şule Öztürk', 'Başka Banka', IBAN2)
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kontak-qr:v1')).accounts.map((a) => a.iban).join(',')), 'TR330006100519786457841326,DE89370400440532013000')
    // Aktif hesap son eklenen (Avro), IBAN gruplu iki satırda
    assert.equal(await text('.name'), 'Avro')
    assert.deepEqual(await page.$$eval('.iban span', (els) => els.map((e) => e.textContent)), ['DE89 3704 0044 0532', '0130 00'])
    await page.evaluate(() => { window.__shared = null })
    await click('[data-act="share-account"]')
    assert.equal(await page.evaluate(() => window.__shared.text), 'Hesap sahibi: Şule Öztürk\nBanka: Başka Banka\nIBAN: DE89 3704 0044 0532 0130 00')
    await click('[data-act="copy-iban"]')
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(await page.evaluate(() => window.__copied), 'DE89370400440532013000')
    assert.match(await text('#toast'), /IBAN kopyalandı/)
    // sağa sola kaydırma
    const swipe = (dx) => page.evaluate((d) => {
      const fire = (type, x) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 })
        document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }))
      }
      fire('touchstart', 200); fire('touchend', 200 + d)
    }, dx)
    await swipe(120)
    assert.equal(await text('.name'), 'Şahsi TL')
    assert.equal(await page.$$eval('.dot', (els) => els.findIndex((e) => e.classList.contains('on'))), 0)
    // basılı tutma ile IBAN kopyalama
    await page.evaluate(() => { window.__copied = null })
    const box = await (await page.$('.iban-box')).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await new Promise((r) => setTimeout(r, 750))
    await page.mouse.up()
    assert.equal(await page.evaluate(() => window.__copied), 'TR330006100519786457841326')
    // sıralama: Şahsi TL'yi sona taşı
    await click('[data-act="sort-bank"]')
    await new Promise((r) => setTimeout(r, 800))
    const grips = await page.$$('.sheet .person .grip')
    assert.equal(grips.length, 2)
    const first = await grips[0].boundingBox()
    const last = await grips[1].boundingBox()
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(first.x + first.width / 2, first.y + ((last.y + last.height + 8 - first.y) * i) / 12)
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 300))
    assert.deepEqual(await page.$$eval('.sheet .person .person-text b', (els) => els.map((e) => e.textContent)), ['Avro', 'Şahsi TL'])
    await click('.sheet [data-act="close-sheet"]')
    await new Promise((r) => setTimeout(r, 300))
    // hesabı sil
    await click('[data-act="edit-account"]')
    await new Promise((r) => setTimeout(r, 500))
    await click('[data-act="delete-account"]')
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kontak-qr:v1')).accounts.length), 1)
  })

  await step('geçersiz kod hata gösterir', async () => {
    await click('[data-act="tab"][data-tab="people"]')
    await click('[data-act="open-import"]')
    await fill('code', 'merhaba')
    await click('form[data-form="import"] button[type="submit"]')
    assert.match(await text('[data-error]'), /geçerli bir kod/)
    await click('.sheet-back')
  })

  await step('yedek kodu tüm veriyi geri yükler', async () => {
    const owner = { ...emptyProfile(true), firstName: 'Yedek', lastName: 'Kişi' }
    const state = { version: 1, profiles: [owner], networks: [], activeProfileId: owner.id, activeNetworkId: null }
    await click('[data-act="tab"][data-tab="more"]')
    await click('[data-act="open-import"]')
    await fill('code', encodeBackup(state))
    await click('form[data-form="import"] button[type="submit"]')
    assert.equal(await text('.name'), 'Yedek Kişi')
  })

  await step('kişi silinir', async () => {
    await click('[data-act="tab"][data-tab="people"]')
    await click('[data-act="edit-profile"]')
    await click('[data-act="delete-profile"]')
    await click('[data-act="tab"][data-tab="card"]')
    assert.match(await text('.empty h2'), /Kartını ekle/)
  })

  await step('.vcf ile rehberden ekleme: tek kişi forma dolar, birden fazlası doğrudan eklenir', async () => {
    const ios = [
      'BEGIN:VCARD', 'VERSION:3.0', 'N:XYZ;Ahmet;;;', 'FN:Ahmet XYZ', 'ORG:Orman Ürünleri;', 'TITLE:Satış Müdürü',
      'EMAIL;type=INTERNET;type=WORK;type=pref:ahmet@firma.com', 'TEL;type=CELL;type=VOICE;type=pref:+90 532 111 22 33',
      'item1.URL;type=pref:https\\://www.linkedin.com/in/ahmetxyz?utm_source=x', 'END:VCARD',
    ].join('\r\n')
    const second = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Kaya;Zeynep;;;\r\nEND:VCARD\r\n'
    const one = join(tmpdir(), 'ahmet.vcf')
    const two = join(tmpdir(), 'iki-kisi.vcf')
    const junk = join(tmpdir(), 'bos.vcf')
    writeFileSync(one, ios)
    writeFileSync(two, ios + '\r\n' + second)
    writeFileSync(junk, 'bu bir vcf degil')
    const value = (name) => page.$eval(`[name="${name}"]`, (el) => el.value)

    await click('[data-act="tab"][data-tab="people"]')
    await click('[data-act="new-friend"]')
    await new Promise((r) => setTimeout(r, 700))
    await (await page.$('input[data-vcf]')).uploadFile(junk)
    await new Promise((r) => setTimeout(r, 400))
    assert.match(await text('#toast'), /Dosyada kişi bulunamadı/)

    await (await page.$('input[data-vcf]')).uploadFile(one)
    await page.waitForSelector('[name="firstName"]')
    await new Promise((r) => setTimeout(r, 400))
    assert.equal(await value('firstName'), 'Ahmet')
    assert.equal(await value('lastName'), 'XYZ')
    assert.equal(await value('company'), 'Orman Ürünleri')
    assert.equal(await value('phone'), '+90 532 111 22 33')
    assert.equal(await value('linkedin'), 'https://www.linkedin.com/in/ahmetxyz?utm_source=x')
    assert.match(await text('.file-note'), /Rehberden aktarıldı/)
    await click('form[data-form="profile"] button[type="submit"]')
    assert.equal(await text('.name'), 'Ahmet XYZ')

    await click('[data-act="tab"][data-tab="people"]')
    await click('[data-act="new-friend"]')
    await new Promise((r) => setTimeout(r, 700))
    await (await page.$('input[data-vcf]')).uploadFile(two)
    await new Promise((r) => setTimeout(r, 500))
    assert.match(await text('#toast'), /2 kişi eklendi/)
    assert.equal((await page.$$('.person')).length, 3)
  })

  await step('Kişiler listesinde sürükleyerek sıralama: sıra kalıcı, Kart kaydırma sırası aynı', async () => {
    const names = () => page.$$eval('.person .person-text b', (els) => els.map((e) => e.textContent))
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('kontak-qr:v1')).profiles.map((p) => `${p.firstName} ${p.lastName}`))
    await click('[data-act="tab"][data-tab="people"]')
    await new Promise((r) => setTimeout(r, 700))
    assert.deepEqual(await names(), ['Ahmet XYZ', 'Ahmet XYZ', 'Zeynep Kaya'])
    const grips = await page.$$('.person .grip')
    assert.equal(grips.length, 3)
    const last = await grips[2].boundingBox()
    const first = await grips[0].boundingBox()
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2)
    await page.mouse.down()
    const steps = 12
    const endY = first.y - 8
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(last.x + last.width / 2, last.y + ((endY - last.y) * i) / steps)
    }
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 300))
    assert.deepEqual(await names(), ['Zeynep Kaya', 'Ahmet XYZ', 'Ahmet XYZ'])
    assert.deepEqual(await stored(), ['Zeynep Kaya', 'Ahmet XYZ', 'Ahmet XYZ'])
    await page.reload({ waitUntil: 'networkidle0' })
    await click('[data-act="tab"][data-tab="people"]')
    assert.deepEqual(await names(), ['Zeynep Kaya', 'Ahmet XYZ', 'Ahmet XYZ'])
    // Kart ekranı aynı sırayı kullanır: Zeynep'e dokun -> ilk nokta aktif
    await click('.person [data-act="open-profile"]')
    assert.equal(await text('.name'), 'Zeynep Kaya')
    assert.equal(await page.$$eval('.dot', (els) => els.findIndex((e) => e.classList.contains('on'))), 0)
    // sağa kaydır (sonraki): Ahmet, sıra 1
    await page.evaluate(() => {
      const fire = (type, x) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 })
        document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }))
      }
      fire('touchstart', 300); fire('touchend', 100)
    })
    assert.equal(await text('.name'), 'Ahmet XYZ')
    assert.equal(await page.$$eval('.dot', (els) => els.findIndex((e) => e.classList.contains('on'))), 1)
  })

  await step('Wi-Fi ağlarını sürükleyerek sıralama: sıra kalıcı, Wi-Fi kaydırma sırası aynı', async () => {
    const storedNets = () => page.evaluate(() => JSON.parse(localStorage.getItem('kontak-qr:v1')).networks.map((n) => n.label))
    const rowNames = () => page.$$eval('.sheet .person .person-text b', (els) => els.map((e) => e.textContent))
    await click('[data-act="tab"][data-tab="wifi"]')
    assert.equal(await page.$('[data-act="sort-wifi"]'), null)
    for (const [label, ssid] of [['Ev', 'EvAgi'], ['Ofis', 'OfisAgi'], ['Yazlık', 'YazlikAgi']]) {
      await click('[data-act="new-wifi"]')
      await fill('label', label)
      await fill('ssid', ssid)
      await fill('password', 'sifre-' + label)
      await click('form[data-form="wifi"] button[type="submit"]')
    }
    assert.deepEqual(await storedNets(), ['Ev', 'Ofis', 'Yazlık'])
    await click('[data-act="sort-wifi"]')
    await new Promise((r) => setTimeout(r, 800))
    assert.deepEqual(await rowNames(), ['Ev', 'Ofis', 'Yazlık'])
    const grips = await page.$$('.sheet .person .grip')
    assert.equal(grips.length, 3)
    const last = await grips[2].boundingBox()
    const first = await grips[0].boundingBox()
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(last.x + last.width / 2, last.y + ((first.y - 8 - last.y) * i) / 12)
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 300))
    assert.deepEqual(await rowNames(), ['Yazlık', 'Ev', 'Ofis'])
    assert.deepEqual(await storedNets(), ['Yazlık', 'Ev', 'Ofis'])
    await click('.sheet [data-act="close-sheet"]')
    await new Promise((r) => setTimeout(r, 300))
    await page.reload({ waitUntil: 'networkidle0' })
    await click('[data-act="tab"][data-tab="wifi"]')
    assert.deepEqual(await storedNets(), ['Yazlık', 'Ev', 'Ofis'])
    // aktif ağ en son eklenen (Yazlık) -> sırada ilk: ilk nokta aktif
    assert.equal(await text('.name'), 'Yazlık')
    assert.equal(await page.$$eval('.dot', (els) => els.findIndex((e) => e.classList.contains('on'))), 0)
    await page.evaluate(() => {
      const fire = (type, x) => {
        const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 300 })
        document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }))
      }
      fire('touchstart', 300); fire('touchend', 100)
    })
    assert.equal(await text('.name'), 'Ev')
  })

  await step('uygulama linkine basılı tutunca link kopyalanır, kısa dokunuşta kopyalanmaz', async () => {
    await page.evaluate(() => {
      window.__copied = null
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t } }, configurable: true })
    })
    await click('[data-act="tab"][data-tab="more"]')
    await click('[data-act="app-qr"]')
    await new Promise((r) => setTimeout(r, 800))
    const box = await (await page.$('.url')).boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await new Promise((r) => setTimeout(r, 150))
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 500))
    assert.equal(await page.evaluate(() => window.__copied), null)
    await page.mouse.down()
    await new Promise((r) => setTimeout(r, 750))
    await page.mouse.up()
    const copied = await page.evaluate(() => window.__copied)
    assert.ok(typeof copied === 'string' && copied.startsWith('http'))
    assert.match(await text('#toast'), /Link kopyalandı/)
    await click('.sheet-back')
  })

  if (url.startsWith('http')) {
    await step('service worker kurulur ve çevrimdışı açılır', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready)
      await page.reload({ waitUntil: 'networkidle0' })
      await page.setOfflineMode(true)
      await page.reload({ waitUntil: 'domcontentloaded' })
      assert.equal(await text('.name'), 'Ahmet XYZ')
      await page.setOfflineMode(false)
    })
  }
} catch (error) {
  console.log(results.join('\n'))
  console.log('BAŞARISIZ:', error)
  process.exitCode = 1
} finally {
  await browser.close()
}

console.log(results.join('\n'))
if (errors.length > 0) {
  console.log('Sayfa hataları:', errors)
  process.exitCode = 1
}
