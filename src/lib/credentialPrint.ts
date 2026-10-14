import type { Employee } from '@/types'
import { barcodeSvg, credentialValue, qrSvg } from '@/lib/credentials'

const esc = (t: string) =>
  t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

/** The labelled lines under the QR, in the order they are printed: RFC first, then the employee ID. */
export function credentialFacts(employee: Employee): Array<{ label: string; value: string }> {
  return [
    ...(employee.rfc ? [{ label: 'RFC', value: employee.rfc }] : []),
    { label: 'ID', value: employee.employeeNumber },
  ]
}

/**
 * One badge, upright, in CR80 size (54 × 85.6 mm, the standard PVC card): the QR large on top —
 * it is what the reloj checador reads — then the RFC and the employee ID.
 */
export async function credentialCardHtml(employee: Employee, companyName: string): Promise<string> {
  const qr = credentialValue(employee, 'qr')
  const bar = credentialValue(employee, 'barcode')
  const qrHtml = qr ? await qrSvg(qr) : ''
  const barHtml = bar ? barcodeSvg(bar, { height: 26 }) : ''
  const facts = credentialFacts(employee)
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`)
    .join('')
  return `<section class="card">
  <p class="company">${esc(companyName)}</p>
  <div class="qr">${qrHtml}</div>
  <dl class="facts">${facts}</dl>
  <p class="name">${esc(employee.fullName)}</p>
  ${barHtml ? `<div class="bar">${barHtml}</div>` : ''}
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
  .sheet { display: grid; grid-template-columns: repeat(3, 54mm); gap: 6mm; justify-content: center }
  .card { width: 54mm; height: 85.6mm; border: 0.3mm solid #94a3b8; border-radius: 3mm; padding: 4mm 4mm 3mm;
          display: flex; flex-direction: column; align-items: center; text-align: center;
          break-inside: avoid; overflow: hidden }
  .company { margin: 0; width: 100%; font-size: 7pt; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
             color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .qr { margin-top: 2mm; width: 42mm; height: 42mm } .qr svg { display: block; width: 42mm; height: 42mm }
  .facts { margin: 2mm 0 0; width: 100% }
  .facts div + div { margin-top: 1mm }
  .facts dt { font-size: 6pt; font-weight: 700; letter-spacing: .12em; color: #64748b; line-height: 1.2 }
  .facts dd { margin: 0; font-size: 12pt; font-weight: 700; letter-spacing: .03em; line-height: 1.15;
              font-variant-numeric: tabular-nums; white-space: nowrap }
  .name { margin: 1.6mm 0 0; width: 100%; font-size: 7.5pt; color: #475569; line-height: 1.2;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .bar { margin-top: auto; width: 100% } .bar svg { display: block; width: 100%; height: auto; max-height: 9mm }
  @media screen { body { padding: 16px; background: #f1f5f9 } .card { background: #fff } }
</style></head><body><main class="sheet">${cards}</main>
<script>window.onload = function () { setTimeout(function () { window.print() }, 300) }<\/script></body></html>`)
  win.document.close()
  return 'ok'
}
