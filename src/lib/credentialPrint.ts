import type { Employee } from '@/types'
import { barcodeSvg, credentialValue, qrSvg } from '@/lib/credentials'

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** One badge in CR80 format (85.6 × 54 mm), the standard PVC card size. */
export async function credentialCardHtml(employee: Employee, companyName: string): Promise<string> {
  const qr = credentialValue(employee, 'qr')
  const bar = credentialValue(employee, 'barcode')
  const qrHtml = qr ? await qrSvg(qr) : ''
  const barHtml = bar ? barcodeSvg(bar, { height: 34 }) : ''
  return `<section class="card">
  <div class="left">
    <p class="company">${esc(companyName)}</p>
    <p class="name">${esc(employee.fullName)}</p>
    <p class="meta">${esc(employee.employeeNumber)} · ${esc(employee.position)}</p>
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
<title>Credenciales · ${esc(companyName)}</title>
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
  .name { margin: 2.5mm 0 0; font-size: 11pt; font-weight: 700; line-height: 1.15 }
  .meta { margin: 1mm 0 0; font-size: 8pt; color: #475569 }
  .bar { margin-top: auto } .bar svg { width: 100%; height: auto; max-height: 15mm }
  .qr { width: 30mm; display: flex; align-items: center } .qr svg { width: 30mm; height: 30mm }
  @media screen { body { padding: 16px; background: #f1f5f9 } .card { background: #fff } }
</style></head><body><main class="sheet">${cards}</main>
<script>window.onload = function () { setTimeout(function () { window.print() }, 300) }<\/script></body></html>`)
  win.document.close()
  return 'ok'
}
