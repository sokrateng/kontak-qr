import type { BankAccount } from './types.ts'

export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase()
}

/** 4'lü gruplar: TR33 0006 1005 1978 6457 8413 26 */
export function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim()
}

/** ISO 13616 mod-97 doğrulaması. Türk IBAN'ı için ayrıca 26 karakter ister. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false
  if (iban.startsWith('TR') && iban.length !== 26) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const value = char >= 'A' ? String(char.charCodeAt(0) - 55) : char
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** "Bilgileri gönder" mesajı: yalnızca dolu alanlar, IBAN okunabilir gruplarla. */
export function accountText(a: BankAccount): string {
  const lines: (string | null)[] = [
    a.holder.trim() === '' ? null : `Hesap sahibi: ${a.holder.trim()}`,
    a.bank.trim() === '' ? null : `Banka: ${a.bank.trim()}`,
    `IBAN: ${formatIban(a.iban)}`,
    a.note.trim() === '' ? null : `Açıklama: ${a.note.trim()}`,
  ]
  return lines.filter((line): line is string => line !== null).join('\n')
}
