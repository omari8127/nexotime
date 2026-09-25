import { describe, expect, it } from 'vitest'
import { buildXlsx, toCSV, type WorkbookPayload } from '@/services/exportService'

const payload = (rows: WorkbookPayload['rows']): WorkbookPayload => ({
  sheetName: 'Asistencia',
  generatedAt: '2026-09-25',
  meta: {},
  columns: [
    { key: 'name', header: 'Nombre' },
    { key: 'hours', header: 'Horas' },
  ],
  rows,
})

describe('exportación', () => {
  it('CSV: neutraliza celdas que una hoja de cálculo ejecutaría como fórmula', () => {
    const csv = toCSV(payload([{ name: '=HYPERLINK("http://x")', hours: 8 }, { name: '+52 55', hours: 1 }, { name: '@SUM(A1)', hours: 2 }, { name: '-1+1', hours: 3 }]))
    const lines = csv.split('\r\n')
    expect(lines[1].startsWith("\"'=")).toBe(true)
    expect(lines[2].startsWith("'+52")).toBe(true)
    expect(lines[3].startsWith("'@SUM")).toBe(true)
    expect(lines[4].startsWith("'-1")).toBe(true)
  })
  it('CSV: escapa comillas, comas y saltos de línea', () => {
    const csv = toCSV(payload([{ name: 'López, "Ana"\nB', hours: 7.5 }]))
    expect(csv.split('\r\n')[1]).toBe('"López, ""Ana""\nB",7.5')
  })
  it('Excel: genera un archivo .xlsx (contenedor zip) no vacío', () => {
    const bytes = buildXlsx(payload([{ name: 'Ana', hours: 8 }]))
    expect(bytes.length).toBeGreaterThan(200)
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK')
    expect(new TextDecoder('latin1').decode(bytes)).toContain('xl/worksheets/sheet1.xml')
  })
})
