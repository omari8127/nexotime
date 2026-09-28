/**
 * Export service.
 *
 *  - CSV: UTF-8 with BOM (opens correctly in Excel with accents), and cells
 *    that start with = + - @ are neutralised so a malicious employee name can't
 *    run as a spreadsheet formula.
 *  - Excel: a real `.xlsx` workbook (Office Open XML in a zip container),
 *    generated in the browser with no external dependency. Supports several
 *    sheets in one file, a bold header row with auto-filter and a frozen pane,
 *    and light zebra striping on the data rows for readability.
 */

import { toast } from '@/components/ui/toast'
import { hasFeatureNow } from '@/lib/license/features'

function notAllowed() {
  toast.error('Exportación no incluida', 'Tu plan no incluye exportar a Excel o CSV. Contacta a tu proveedor.')
}

export interface SheetColumn {
  key: string
  header: string
  width?: number
}

export interface WorkbookPayload {
  sheetName: string
  columns: SheetColumn[]
  rows: Array<Record<string, string | number>>
  generatedAt: string
  meta: Record<string, string>
}

/** Prefix cells a spreadsheet would interpret as a formula. */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

function escapeCSV(value: string | number): string {
  const raw = value ?? ''
  const s = typeof raw === 'number' ? String(raw) : neutralize(String(raw))
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCSV(payload: WorkbookPayload): string {
  const header = payload.columns.map((c) => escapeCSV(c.header)).join(',')
  const lines = payload.rows.map((row) =>
    payload.columns.map((c) => escapeCSV(row[c.key])).join(','),
  )
  return [header, ...lines].join('\r\n')
}

function triggerDownload(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadCSV(payload: WorkbookPayload, filename: string) {
  if (!hasFeatureNow('export')) return notAllowed()
  triggerDownload('﻿' + toCSV(payload), `${filename}.csv`, 'text/csv;charset=utf-8')
}

/* -------------------------------------------------------------------------- */
/*  .xlsx writer                                                               */
/* -------------------------------------------------------------------------- */

const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Minimal zip (STORE method — no compression) is all an .xlsx needs to write. */
function zip(files: Array<{ name: string; content: string }>): Uint8Array {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // UTF-8 names
    local.setUint16(8, 0, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    chunks.push(new Uint8Array(local.buffer), name, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)

    offset += 30 + name.length + data.length
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0))
  let pos = 0
  for (const c of all) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // strip characters that are illegal in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function columnRef(index: number): string {
  let n = index
  let ref = ''
  do {
    ref = String.fromCharCode(65 + (n % 26)) + ref
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return ref
}

function sheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Hoja'
  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) candidate = `${base.slice(0, 28)} ${n++}`
  used.add(candidate.toLowerCase())
  return candidate
}

// Style indices into cellXfs below — kept in one place so the sheet builder and
// styles.xml stay in sync.
const STYLE = { header: 1, zebra: 2 } as const

function buildSheetXml(payload: WorkbookPayload): string {
  const cell = (ref: string, value: string | number | undefined, style: number) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${value}</v></c>`
    }
    const text = neutralize(String(value ?? ''))
    return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`
  }

  const headerRow = `<row r="1">${payload.columns
    .map((c, i) => cell(`${columnRef(i)}1`, c.header, STYLE.header))
    .join('')}</row>`
  const bodyRows = payload.rows
    .map((row, r) => {
      const style = r % 2 === 1 ? STYLE.zebra : 0
      return `<row r="${r + 2}">${payload.columns
        .map((c, i) => cell(`${columnRef(i)}${r + 2}`, row[c.key], style))
        .join('')}</row>`
    })
    .join('')
  const cols = payload.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join('')
  const lastCol = columnRef(Math.max(0, payload.columns.length - 1))
  const lastRow = payload.rows.length + 1
  const dim = `${columnRef(0)}1:${lastCol}${lastRow}`

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${headerRow}${bodyRows}</sheetData><autoFilter ref="${dim}"/></worksheet>`
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2554EB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>`

/** One sheet, for a single report — kept for the existing call sites. */
export function buildXlsx(payload: WorkbookPayload): Uint8Array {
  return buildWorkbook([payload])
}

/** Several sheets in one .xlsx file — used for the full, multi-tab attendance report. */
export function buildWorkbook(sheets: WorkbookPayload[]): Uint8Array {
  const used = new Set<string>()
  const names = sheets.map((s) => sheetName(s.sheetName, used))

  const sheetTags = names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  const sheetRels = names
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('')
  const stylesRelId = `rId${names.length + 1}`
  const overrides = names
    .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join('')

  return zip([
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', content: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: buildSheetXml(s) })),
  ])
}

export function downloadExcel(payload: WorkbookPayload, filename: string) {
  if (!hasFeatureNow('export')) return notAllowed()
  triggerDownload(
    buildXlsx(payload) as unknown as BlobPart,
    `${filename}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
}

/** Several sheets in one downloaded .xlsx — the "reporte completo" and import templates use this. */
export function downloadWorkbook(sheets: WorkbookPayload[], filename: string) {
  if (!hasFeatureNow('export')) return notAllowed()
  triggerDownload(
    buildWorkbook(sheets) as unknown as BlobPart,
    `${filename}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
}

export function buildWorkbookPayload(
  sheetName: string,
  columns: SheetColumn[],
  rows: Array<Record<string, string | number>>,
  meta: Record<string, string> = {},
): WorkbookPayload {
  return {
    sheetName,
    columns,
    rows,
    generatedAt: new Date().toISOString(),
    meta,
  }
}
