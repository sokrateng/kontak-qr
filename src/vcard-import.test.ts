import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildVCard } from './vcard.ts'
import { parseVCards } from './vcard-import.ts'
import { emptyProfile } from './validate.ts'

const IOS_CARD = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'PRODID:-//Apple Inc.//iPhone OS 14.8//EN',
  'N:XYZ;Ahmet;;;',
  'FN:Ahmet XYZ',
  'ORG:Orman Ürünleri;Satış;',
  'TITLE:Satış Müdürü',
  'EMAIL;type=INTERNET;type=HOME:ev@example.com',
  'EMAIL;type=INTERNET;type=WORK;type=pref:ahmet@firma.com',
  'TEL;type=WORK;type=VOICE:+90 212 000 00 00',
  'TEL;type=CELL;type=VOICE;type=pref:+90 532 111 22 33',
  'ADR;type=WORK;type=pref:;;Maslak Cad. No\\: 1;İstanbul;;34000;Türkiye',
  'item1.URL;type=pref:https\\://www.linkedin.com/in/ahmetxyz?utm_source=x',
  'item1.X-ABLabel:LinkedIn',
  'item2.URL:https\\://firma.com',
  'item2.X-ABLabel:_$!<HomePage>!$_',
  'item3.URL:http\\://twitter.com/ahmetx',
  'X-SOCIALPROFILE;type=twitter;x-user=ahmetx:http\\://twitter.com/ahmetx',
  'NOTE:Notlar burada',
  'PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS',
  ' Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIy',
  'END:VCARD',
].join('\r\n')

test('iOS Rehber kartı: ad, firma, öncelikli telefon ve e-posta, adres, linkler', () => {
  const profiles = parseVCards(IOS_CARD)
  assert.equal(profiles.length, 1)
  const p = profiles[0]
  assert.ok(p !== undefined)
  assert.equal(p.firstName, 'Ahmet')
  assert.equal(p.lastName, 'XYZ')
  assert.equal(p.company, 'Orman Ürünleri')
  assert.equal(p.title, 'Satış Müdürü')
  assert.equal(p.phone, '+90 532 111 22 33')
  assert.equal(p.email, 'ahmet@firma.com')
  assert.equal(p.address, 'Maslak Cad. No: 1, İstanbul, 34000, Türkiye')
  assert.equal(p.linkedin, 'https://www.linkedin.com/in/ahmetxyz?utm_source=x')
  assert.equal(p.website, 'https://firma.com')
  assert.equal(p.x, 'http://twitter.com/ahmetx')
  assert.equal(p.isOwner, false)
})

test('katlanmış satırlar birleşir, FN yedeği ve LF satır sonu çalışır', () => {
  const card = 'BEGIN:VCARD\nVERSION:3.0\nFN:Ayşe Nur\n Kaya\nTEL:0533 555 11 22\nEND:VCARD\n'
  const p = parseVCards(card)[0]
  assert.ok(p !== undefined)
  assert.equal(p.firstName, 'Ayşe')
  assert.equal(p.lastName, 'NurKaya')
  assert.equal(p.phone, '0533 555 11 22')
})

test('vCard 2.1 quoted-printable Türkçe karakterleri çözer', () => {
  const card = [
    'BEGIN:VCARD',
    'VERSION:2.1',
    'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=87elik;=C5=9Eule;;;',
    'TEL;CELL:+905321112233',
    'EMAIL:sule@example.com',
    'END:VCARD',
  ].join('\r\n')
  const p = parseVCards(card)[0]
  assert.ok(p !== undefined)
  assert.equal(p.firstName, 'Şule')
  assert.equal(p.lastName, 'Çelik')
  assert.equal(p.phone, '+905321112233')
})

test('birden fazla kart ve adsız kartlar', () => {
  const two = IOS_CARD + '\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nN:Veli;Ali;;;\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nTEL:123\r\nEND:VCARD'
  const profiles = parseVCards(two)
  assert.deepEqual(profiles.map((p) => p.firstName), ['Ahmet', 'Ali'])
  assert.notEqual(profiles[0]?.id, profiles[1]?.id)
  assert.deepEqual(parseVCards('merhaba'), [])
})

test('WhatsApp ve konum linkleri doğru alana düşer, numara linki yok sayılır', () => {
  const card = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Test;Kişi;;;',
    'URL:https\\://wa.me/905321112233',
    'URL:https\\://wa.me/message/ABC123',
    'URL:https\\://maps.app.goo.gl/xyz',
    'END:VCARD',
  ].join('\r\n')
  const p = parseVCards(card)[0]
  assert.ok(p !== undefined)
  assert.equal(p.whatsappLink, 'https://wa.me/message/ABC123')
  assert.equal(p.mapsUrl, 'https://maps.app.goo.gl/xyz')
  assert.equal(p.website, '')
})

test('uygulamanın kendi vCard çıktısı geri okunabilir (gidiş dönüş)', () => {
  const original = {
    ...emptyProfile(false),
    firstName: 'Ayşe',
    lastName: 'Yılmaz',
    company: 'Örnek; Teknoloji, A.Ş.',
    title: 'Mühendis',
    phone: '0532 123 45 67',
    email: 'ayse@example.com',
    website: 'ornek.com.tr',
    address: 'İstanbul',
    linkedin: 'ayseyilmaz',
  }
  const back = parseVCards(buildVCard(original, 'full'))[0]
  assert.ok(back !== undefined)
  assert.equal(back.firstName, 'Ayşe')
  assert.equal(back.lastName, 'Yılmaz')
  assert.equal(back.company, 'Örnek; Teknoloji, A.Ş.')
  assert.equal(back.title, 'Mühendis')
  assert.equal(back.phone, '+905321234567')
  assert.equal(back.email, 'ayse@example.com')
  assert.equal(back.website, 'https://ornek.com.tr')
  assert.equal(back.address, 'İstanbul')
  assert.equal(back.linkedin, 'https://www.linkedin.com/in/ayseyilmaz')
})
