import { describe, expect, it } from 'vitest'
import { buildWorkbook } from '@/services/exportService'
import { parseCSV, readXlsxRows, rowsToRecords } from '@/lib/spreadsheet'

describe('parseCSV', () => {
  it('separa campos y filas', () => {
    expect(parseCSV('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('respeta comillas, comas y saltos de línea dentro de un campo', () => {
    expect(parseCSV('nombre,nota\n"López, Ana","Dice ""hola""\ny adiós"')).toEqual([
      ['nombre', 'nota'],
      ['López, Ana', 'Dice "hola"\ny adiós'],
    ])
  })
  it('ignora el BOM inicial y las líneas totalmente vacías', () => {
    expect(parseCSV('﻿a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('lector de .xlsx (contenedor propio, sin compresión)', () => {
  it('vuelve a leer exactamente lo que nuestro propio escritor produjo', async () => {
    const bytes = buildWorkbook([
      { sheetName: 'Datos', columns: [{ key: 'a', header: 'Nombre' }, { key: 'b', header: 'Edad' }], rows: [{ a: 'Ana Ruíz', b: 30 }, { a: 'José', b: 45 }], generatedAt: '', meta: {} },
    ])
    const file = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const rows = await readXlsxRows(file)
    expect(rows).toEqual([
      ['Nombre', 'Edad'],
      ['Ana Ruíz', '30'],
      ['José', '45'],
    ])
  })

  it('lee la primera hoja cuando el archivo tiene varias', async () => {
    const bytes = buildWorkbook([
      { sheetName: 'Empleados', columns: [{ key: 'n', header: 'Nombre' }], rows: [{ n: 'Ana' }], generatedAt: '', meta: {} },
      { sheetName: 'Instrucciones', columns: [{ key: 'c', header: 'Campo' }], rows: [{ c: 'Nota' }], generatedAt: '', meta: {} },
    ])
    const file = new Blob([bytes as unknown as BlobPart])
    const rows = await readXlsxRows(file)
    expect(rows[0]).toEqual(['Nombre'])
    expect(rows[1]).toEqual(['Ana'])
  })

  it('rechaza un archivo que no es un zip válido, con un mensaje entendible', async () => {
    const file = new Blob(['esto no es un excel'])
    await expect(readXlsxRows(file)).rejects.toThrow(/no parece un archivo/i)
  })
})

describe('lector de .xlsx real (cadenas compartidas + DEFLATE, como guarda Excel/Sheets)', () => {
  async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
    const cs = new CompressionStream('deflate-raw')
    const writer = cs.writable.getWriter()
    void writer.write(Uint8Array.from(data))
    void writer.close()
    return new Uint8Array(await new Response(cs.readable).arrayBuffer())
  }

  /** A tiny hand-built zip using DEFLATE + shared strings, mimicking a real Excel export. */
  async function buildRealisticXlsx(): Promise<Uint8Array> {
    const enc = new TextEncoder()
    const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2"><si><t>Nombre</t></si><si><t>María José</t></si></sst>`
    const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>`
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>`
    const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`

    const files = [
      { name: 'xl/workbook.xml', content: workbook },
      { name: 'xl/_rels/workbook.xml.rels', content: rels },
      { name: 'xl/sharedStrings.xml', content: sharedStrings },
      { name: 'xl/worksheets/sheet1.xml', content: sheet },
    ]

    const CRC_TABLE = (() => {
      const t = new Uint32Array(256)
      for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        t[n] = c >>> 0
      }
      return t
    })()
    const crc32 = (data: Uint8Array) => {
      let crc = 0xffffffff
      for (const b of data) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)
      return (crc ^ 0xffffffff) >>> 0
    }

    const chunks: Uint8Array[] = []
    const central: Uint8Array[] = []
    let offset = 0
    for (const f of files) {
      const name = enc.encode(f.name)
      const raw = enc.encode(f.content)
      const compressed = await deflateRaw(raw)
      const crc = crc32(raw)

      const local = new DataView(new ArrayBuffer(30))
      local.setUint32(0, 0x04034b50, true)
      local.setUint16(6, 0x0800, true)
      local.setUint16(8, 8, true) // method = deflate
      local.setUint32(14, crc, true)
      local.setUint32(18, compressed.length, true)
      local.setUint32(22, raw.length, true)
      local.setUint16(26, name.length, true)
      chunks.push(new Uint8Array(local.buffer), name, compressed)

      const entry = new DataView(new ArrayBuffer(46))
      entry.setUint32(0, 0x02014b50, true)
      entry.setUint16(8, 0x0800, true)
      entry.setUint16(10, 8, true)
      entry.setUint32(16, crc, true)
      entry.setUint32(20, compressed.length, true)
      entry.setUint32(24, raw.length, true)
      entry.setUint16(28, name.length, true)
      entry.setUint32(42, offset, true)
      central.push(new Uint8Array(entry.buffer), name)
      offset += 30 + name.length + compressed.length
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

  it('descomprime DEFLATE y resuelve las cadenas compartidas', async () => {
    const bytes = await buildRealisticXlsx()
    const file = new Blob([bytes as unknown as BlobPart])
    const rows = await readXlsxRows(file)
    expect(rows).toEqual([['Nombre'], ['María José', '42']])
  })
})

describe('rowsToRecords', () => {
  it('usa la primera fila como encabezados y descarta filas vacías', () => {
    const { headers, records } = rowsToRecords([
      ['Nombre', 'Edad'],
      ['Ana', '30'],
      ['', ''],
      ['Beto', '20'],
    ])
    expect(headers).toEqual(['Nombre', 'Edad'])
    expect(records).toEqual([
      { Nombre: 'Ana', Edad: '30' },
      { Nombre: 'Beto', Edad: '20' },
    ])
  })
})
