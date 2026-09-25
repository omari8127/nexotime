/**
 * Employee credentials: the QR and the barcode printed on each badge.
 *
 * Values are random (not derived from the employee number) so a code cannot be
 * guessed or fabricated by someone who only knows a colleague number. They are
 * stored on `Employee.identifications[].value`, so a lost badge can be revoked
 * by regenerating its codes.
 */
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import type { Employee } from '@/types'

const QR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to survive hand-typing

export type CredentialKind = 'qr' | 'barcode'

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

/** "NXT1-K7Q2M9XR4WPD" — the prefix lets the clock reject foreign QR codes at a glance. */
export function generateQrValue(): string {
  const token = Array.from(randomBytes(12), (b) => QR_ALPHABET[b % QR_ALPHABET.length]).join('')
  return `NXT1-${token}`
}

/** 10 random digits, unique among `taken` (Code 128 packs digit pairs compactly). */
export function generateBarcodeValue(taken: Iterable<string> = []): string {
  const used = new Set(taken)
  for (let attempt = 0; attempt < 50; attempt++) {
    const digits = Array.from(randomBytes(10), (b) => String(b % 10)).join('')
    if (digits[0] !== '0' && !used.has(digits)) return digits
  }
  return String(Date.now()).slice(-10)
}

export function credentialValue(employee: Employee, method: CredentialKind): string | undefined {
  return employee.identifications.find((i) => i.method === method)?.value
}

/** Every barcode already assigned in the company, to keep new ones unique. */
export function takenBarcodes(employees: Employee[]): string[] {
  return employees.map((e) => credentialValue(e, 'barcode')).filter((v): v is string => !!v)
}

export type CodeMatch =
  | { ok: true; employee: Employee; method: CredentialKind }
  | { ok: false; reason: 'unknown' | 'disabled' | 'inactive' }

/** Resolve a scanned / typed code to an employee. */
export function findEmployeeByCode(employees: Employee[], raw: string): CodeMatch {
  const code = raw.trim()
  if (!code) return { ok: false, reason: 'unknown' }
  for (const employee of employees) {
    for (const method of ['qr', 'barcode'] as const) {
      const id = employee.identifications.find((i) => i.method === method)
      if (!id?.value || id.value !== code) continue
      if (!id.enabled) return { ok: false, reason: 'disabled' }
      if (employee.status !== 'active') return { ok: false, reason: 'inactive' }
      return { ok: true, employee, method }
    }
  }
  return { ok: false, reason: 'unknown' }
}

export const CODE_ERROR_TEXT: Record<'unknown' | 'disabled' | 'inactive', string> = {
  unknown: 'Código no reconocido. Verifica que sea una credencial vigente de esta empresa.',
  disabled: 'Este método de registro está desactivado para el empleado.',
  inactive: 'El empleado está inactivo y no puede registrar asistencia.',
}

/** Real, scannable QR as an SVG string. */
export function qrSvg(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  })
}

/** Real Code 128 barcode as an SVG string. */
export function barcodeSvg(value: string, opts: { height?: number; displayValue?: boolean } = {}): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, value, {
    format: 'CODE128',
    height: opts.height ?? 44,
    width: 2,
    margin: 14, // quiet zone: scanners need blank space on both sides of the bars
    displayValue: opts.displayValue ?? true,
    fontSize: 12,
    textMargin: 2,
    background: '#ffffff',
    lineColor: '#0f172a',
  })
  return svg.outerHTML
}
