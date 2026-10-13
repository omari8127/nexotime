import type { Employee } from '@/types'
import { barcodeSvg, credentialValue, qrSvg } from '@/lib/credentials'

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** The labelled lines of a badge, shared by the on-screen preview and the printed card. */
export function credentialFacts(employee: Employee): Array<{ label: string; value: string }> {
  return [
    { label: 'ID', value: employee.employeeNumber },
    ...(employee.rfc ? [{ label: 'RFC', value: employee.rfc }] : []),
  ]
}

/** One badge in CR80 format (85.6 × 54 mm), the standard PVC card size. */
export async function credentialCardHtml(employee: Employee, companyName: string): Promise<string> {
  const qr = credentialValue(employee, 'qr')
  const bar = credentialValue(employee, 'barcode')
  const qrHtml = qr ? await qrSvg(qr) : ''
  const barHtml = bar ? barcodeSvg(bar, { height: 34 }) : ''
  const facts = credentialFacts(employee)
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
    .join('')
  return `<section class="card">
  <div class="left">
    <p class="company">${esc(companyName)}</p>
    <p class="name">${esc(employee.fullName)}</p>
    <p class="meta">${esc(employee.position)}</p>
    <dl class="facts">${facts}</dl>
    <div class="bar">${barHtml}</div>
  </div>
  <div class="qr">${qrHtml}</div>
</section>`
}

/** Opens a print-ready sheet (several badges per page) in a new window. */
export async function printCredentials(
  employees: Employee[],
  companyName: string,
): Promise<'ok' | 'blocked' | 'empty'> {
  const printable = employees.filter((e) => credentialValue(e, 'qr') || credentialValue(e, 'barcode'))
  if (printable.length === 0) return 'empty'
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return 'blocked'
  const cards = (await Promise.all(printable.map((e) => credentialCardHtml(e, companyName)))).join('\n')
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Gafetes · ${esc(companyName)}</title>
<style>
  @page { size: A4; margin: 10mm }
  * { box-sizing: border-box }
  body { margin: 0; font-family: Inter, Arial, sans-serif; color: #0f172a; background: #fff }
  .sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 6mm; justify-content: center }
  .card { width: 85.6mm; height: 54mm; border: 0.3mm solid #94a3b8; border-radius: 3mm; padding: 4mm;
          display: flex; gap: 3mm; break-inside: avoid; overflow: hidden }
  .left { flex: 1; min-width: 0; display: flex; flex-direction: column }
  .company { margin: 0; font-size: 7pt; letter-spacing: .08em; text-transform: uppercase; color: #64748b;
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .name { margin: 2mm 0 0; font-size: 11pt; font-weight: 700; line-height: 1.15 }
  .meta { margin: 0.8mm 0 0; font-size: 8pt; color: #475569;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .facts { margin: 1.8mm 0 0 } .facts div { display: flex; gap: 1.5mm; align-items: baseline; line-height: 1.3 }
  .facts dt { width: 7mm; font-size: 6.5pt; font-weight: 700; letter-spacing: .06em; color: #64748b }
  .facts dd { margin: 0; font-size: 9pt; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .02em }
  .bar { margin-top: auto } .bar svg { display: block; width: 100%; height: auto; max-height: 12mm }
  .qr { width: 30mm; display: flex; align-items: center } .qr svg { width: 30mm; height: 30mm }
  @media screen { body { padding: 16px; background: #f1f5f9 } .card { background: #fff } }
</style></head><body><main class="sheet">${cards}</main>
<script>window.onload = function () { setTimeout(function () { window.print() }, 300) }<\/script></body></html>`)
  win.document.close()
  return 'ok'
}
