import { Building2, CalendarClock, Camera, Fingerprint, Hash, MapPin, MapPinOff, Tag, UserRound } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/misc'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { METHOD_META } from '@/components/shared/badges'
import { PunchPhoto } from '@/components/attendance/PunchPhoto'
import { PunchTypeTag } from '@/components/attendance/PunchPill'
import type { PunchLogRow } from '@/lib/punchLog'
import {
  ROUGH_FIX_METERS,
  distanceMeters,
  formatDistance,
  googleMapsUrl,
  locationSource,
  type LatLng,
} from '@/lib/geo'
import { cn, formatShortDate, formatTime12 } from '@/lib/utils'
import type { CaptureMethod, PunchLocation } from '@/types'

/** How the movement was made, each with its own colour (rostro violet, QR blue, PIN amber…). */
const METHOD_TONE: Record<CaptureMethod, string> = {
  face: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  qr: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
  barcode: 'bg-slate-500/12 text-slate-700 dark:text-slate-300',
  employee_number: 'bg-amber-400/20 text-amber-800 dark:text-amber-200',
  pin: 'bg-amber-400/20 text-amber-800 dark:text-amber-200',
  manual: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  app: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
}

/** Under the coordinates: where the position came from, how exact it is and how far from the branch. */
function LocationNote({ location, branch }: { location: PunchLocation; branch?: LatLng }) {
  if (locationSource(location) === 'branch') {
    return <span className="block text-[11px] text-muted-foreground/80">Punto fijo de la sucursal</span>
  }
  const rough = (location.accuracy ?? 0) > ROUGH_FIX_METERS
  // From the phone the distance was measured (and judged) when it was made; otherwise measured now.
  const away = location.distance ?? (branch ? distanceMeters(location, branch) : null)
  // Far only counts when the fix is good enough to say so.
  const far = location.outside || (away != null && away > Math.max(300, (location.accuracy ?? 0) * 2))
  return (
    <span className={cn('block text-[11px]', far ? 'font-semibold text-rose-600 dark:text-rose-400' : rough ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>
      {location.outside ? (
        <span className="mr-1 inline-flex rounded bg-rose-600 px-1 py-px text-[10px] font-bold uppercase tracking-wide text-white">Fuera de zona</span>
      ) : null}
      GPS{location.accuracy != null ? ` ±${formatDistance(location.accuracy)}` : ''}
      {rough ? ' (aproximada)' : ''}
      {away != null ? ` · a ${formatDistance(away)} de la sucursal` : ''}
    </span>
  )
}

function Head({ icon: Icon, children, className }: { icon: typeof Hash; children: string; className?: string }) {
  return (
    <TableHead className={className}>
      <span className="inline-flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {children}
      </span>
    </TableHead>
  )
}

/** "Registro de checadas": one line per movement, with where it was made and the photo taken. */
export function PunchLogTable({
  rows,
  branchName,
  branchPoint,
  reloadKey,
}: {
  rows: PunchLogRow[]
  branchName: (id: string) => string
  /** The branch's fixed point, to tell how far from it a movement was made. */
  branchPoint: (id: string) => LatLng | undefined
  reloadKey?: number
}) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <Head icon={Hash}>ID</Head>
            <Head icon={UserRound}>Empleado</Head>
            <Head icon={CalendarClock}>Fecha y hora</Head>
            <Head icon={Camera}>Foto</Head>
            <Head icon={Tag}>Tipo</Head>
            <Head icon={MapPin}>Ubicación</Head>
            <Head icon={Fingerprint} className="hidden lg:table-cell">Medio</Head>
            <Head icon={Building2} className="hidden xl:table-cell">Sucursal</Head>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ key, record, employee, punch }) => (
            <TableRow key={key}>
              <TableCell className="whitespace-nowrap text-sm font-semibold tabular-nums">
                {employee.employeeNumber}
              </TableCell>
              <TableCell>
                <div className="flex min-w-[170px] items-center gap-3">
                  <Avatar name={employee.fullName} size="sm" />
                  <p className="truncate text-sm font-medium">{employee.fullName}</p>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm tabular-nums">
                <span className="font-semibold">{formatTime12(punch.time)}</span>
                <span className="text-muted-foreground"> · {formatShortDate(record.date)}</span>
                {punch.edited ? <span className="ml-1.5 text-xs text-warning">ajuste manual</span> : null}
              </TableCell>
              <TableCell>
                <PunchPhoto record={record} punch={punch} employee={employee} reloadKey={reloadKey} />
              </TableCell>
              <TableCell>
                <PunchTypeTag type={punch.type} solid />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {punch.location ? (
                  <a
                    href={googleMapsUrl(punch.location)}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir en Google Maps"
                    className="group inline-flex items-center gap-2 text-xs tabular-nums text-muted-foreground hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground transition-transform group-hover:scale-105">
                      <MapPin className="h-3.5 w-3.5" />
                      Mapa
                    </span>
                    <span className="hidden leading-tight sm:inline">
                      {punch.location.lat.toFixed(5)}, {punch.location.lng.toFixed(5)}
                      <LocationNote location={punch.location} branch={branchPoint(record.branchId)} />
                    </span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
                    <MapPinOff className="h-3.5 w-3.5" />
                    Sin ubicación
                  </span>
                )}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap lg:table-cell">
                {(() => {
                  const method = punch.edited ? 'manual' : punch.method
                  const meta = METHOD_META[method]
                  return (
                    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', METHOD_TONE[method])}>
                      <meta.Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </span>
                  )
                })()}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                {branchName(record.branchId)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
