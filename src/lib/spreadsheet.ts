/**
 * Reads .csv and .xlsx files entirely in the browser, no dependency — the
 * counterpart to the hand-rolled .xlsx writer in exportService.ts. A real
 * .xlsx is a zip of XML parts; Excel/Sheets/LibreOffice always DEFLATE-compress
 * it, so this reads the zip's central directory itself and decompresses with
 * the browser's built-in CompressionStream API (no inflate library needed).
 */

/* -------------------------------------------------------------------------- */
/*  CSV                                                                        */
/* -------------------------------------------------------------------------- */

/** RFC4180-ish: quoted fields, doubled quotes, CRLF or LF. Tolerates a leading BOM. */
export function parseCSV(text: string): string[][] {
  const s = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\r') {
      /* the \n right after it ends the row */
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

/* -------------------------------------------------------------------------- */
/*  Minimal zip reader                                                         */
/* -------------------------------------------------------------------------- */

interface ZipEntry {
  method: number
  localOffset: number
  compressedSize: number
}

class XlsxFormatError extends Error {}

function viewOf(buf: Uint8Array) {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}

/** Scans backward for the End Of Central Directory record (there may be a short comment after it). */
function readZipIndex(buf: Uint8Array): Map<string, ZipEntry> {
  const dv = viewOf(buf)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66_000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new XlsxFormatError('No parece un archivo .xlsx válido.')
  const total = dv.getUint16(eocd + 10, true)
  const cdOffset = dv.getUint32(eocd + 16, true)

  const map = new Map<string, ZipEntry>()
  const decoder = new TextDecoder('utf-8')
  let p = cdOffset
  for (let i = 0; i < total; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new XlsxFormatError('El archivo .xlsx está dañado.')
    const method = dv.getUint16(p + 10, true)
    const compressedSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOffset = dv.getUint32(p + 42, true)
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen))
    map.set(name, { method, localOffset, compressedSize })
    p += 46 + nameLen + extraLen + commentLen
  }
  return map
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  // A subarray view can be backed by a SharedArrayBuffer type-wise; copy so it's a plain ArrayBuffer.
  void writer.write(Uint8Array.from(data))
  void writer.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

async function readZipEntry(buf: Uint8Array, index: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const entry = index.get(name)
  if (!entry) return null
  const dv = viewOf(buf)
  const p = entry.localOffset
  if (dv.getUint32(p, true) !== 0x04034b50) throw new XlsxFormatError('El archivo .xlsx está dañado.')
  const nameLen = dv.getUint16(p + 26, true)
  const extraLen = dv.getUint16(p + 28, true)
  const dataStart = p + 30 + nameLen + extraLen
  const compressed = buf.subarray(dataStart, dataStart + entry.compressedSize)
  const bytes = entry.method === 0 ? compressed : entry.method === 8 ? await inflateRaw(compressed) : null
  if (!bytes) throw new XlsxFormatError('El archivo .xlsx usa una compresión no compatible.')
  return new TextDecoder('utf-8').decode(bytes)
}

/* -------------------------------------------------------------------------- */
/*  Minimal OOXML parsing (regex-based: the schema we read is narrow)          */
/* -------------------------------------------------------------------------- */

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g
  let m: RegExpExecArray | null
  while ((m = siRe.exec(xml))) {
    if (m[1] === undefined) {
      out.push('')
      continue
    }
    let text = ''
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(m[1]))) text += tm[1] ? unescapeXml(tm[1]) : ''
    out.push(text)
  }
  return out
}

function colLetterToIndex(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64)
  return n - 1
}

function parseWorksheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml))) {
    const values: Record<number, string> = {}
    let maxCol = -1
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1]
      const inner = cm[2]
      const ref = /r="([A-Za-z]+)\d+"/.exec(attrs)
      if (!ref) continue
      const col = colLetterToIndex(ref[1])
      maxCol = Math.max(maxCol, col)
      if (inner === undefined) {
        values[col] = ''
        continue
      }
      const type = /\bt="([a-zA-Z]+)"/.exec(attrs)?.[1]
      if (type === 's') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)
        values[col] = v ? (shared[Number(v[1])] ?? '') : ''
      } else if (type === 'inlineStr') {
        const t = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner)
        values[col] = t ? unescapeXml(t[1]) : ''
      } else if (type === 'b') {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)
        values[col] = v?.[1] === '1' ? 'TRUE' : 'FALSE'
      } else {
        // 'str' (formula result), 'n' or absent (number) — raw text is what we want either way.
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)
        values[col] = v ? unescapeXml(v[1]) : ''
      }
    }
    const row: string[] = []
    for (let i = 0; i <= maxCol; i++) row.push(values[i] ?? '')
    rows.push(row)
  }
  return rows
}

/** The workbook may have reordered/renamed its internal sheetN.xml — resolve the first tab properly. */
async function resolveFirstSheetPath(buf: Uint8Array, index: Map<string, ZipEntry>): Promise<string> {
  const wb = await readZipEntry(buf, index, 'xl/workbook.xml')
  if (wb) {
    const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1]
    const rels = rid ? await readZipEntry(buf, index, 'xl/_rels/workbook.xml.rels') : null
    if (rels && rid) {
      const re = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`)
      const target = re.exec(rels)?.[1]
      if (target) return `xl/${target.replace(/^\.?\/*/, '')}`
    }
  }
  return 'xl/worksheets/sheet1.xml'
}

/** Reads the first sheet of an .xlsx file as a grid of strings (numbers and dates come through as their raw text/serial). */
export async function readXlsxRows(file: File | Blob): Promise<string[][]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const index = readZipIndex(buf)
  const sheetPath = await resolveFirstSheetPath(buf, index)
  const sheetXml = await readZipEntry(buf, index, sheetPath)
  if (!sheetXml) throw new XlsxFormatError('No se encontró contenido en el archivo .xlsx.')
  const sharedXml = await readZipEntry(buf, index, 'xl/sharedStrings.xml')
  const shared = sharedXml ? parseSharedStrings(sharedXml) : []
  return parseWorksheet(sheetXml, shared)
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                */
/* -------------------------------------------------------------------------- */

/** Reads a .csv or .xlsx file (whichever it is) into a grid of strings. */
export async function readSpreadsheetRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase()
  try {
    if (name.endsWith('.xlsx')) return await readXlsxRows(file)
    if (name.endsWith('.csv') || file.type === 'text/csv') return parseCSV(await file.text())
    if (name.endsWith('.xls')) {
      throw new Error('El formato .xls (Excel 97-2003) no es compatible. Guarda el archivo como .xlsx o .csv.')
    }
    // Unknown extension: sniff the zip signature ("PK") before falling back to CSV.
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer())
    if (head[0] === 0x50 && head[1] === 0x4b) return await readXlsxRows(file)
    return parseCSV(await file.text())
  } catch (e) {
    if (e instanceof XlsxFormatError) throw new Error(`${e.message} Vuelve a descargar la plantilla y evita convertir el archivo con otro programa.`)
    throw e
  }
}

/** First row = headers. Blank rows are dropped. Values are trimmed. */
export function rowsToRecords(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  if (rows.length === 0) return { headers: [], records: [] }
  const headers = rows[0].map((h) => h.trim())
  const records = rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { headers, records }
}
