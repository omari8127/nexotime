import { MapPin, MapPinOff } from 'lucide-react'
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
import { MethodBadge } from '@/components/shared/badges'
import { PunchPhoto } from '@/components/attendance/PunchPhoto'
import { PunchTypeTag } from '@/components/attendance/PunchPill'
import { mapsUrl, type PunchLogRow } from '@/lib/punchLog'
import { formatShortDate, formatTime12 } from '@/lib/utils'

/** "Registro de checadas": one line per movement, with where it was made and the photo taken. */
export function PunchLogTable({
  rows,
  branchName,
}: {
  rows: PunchLogRow[]
  branchName: (id: string) => string
}) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Empleado</TableHead>
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Foto</TableHead>
            <TableHead>Ubicación</TableHead>
            <TableHead className="hidden lg:table-cell">Medio</TableHead>
            <TableHead className="hidden xl:table-cell">Sucursal</TableHead>
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
                <PunchTypeTag type={punch.type} solid />
              </TableCell>
              <TableCell>
                <PunchPhoto record={record} punch={punch} employee={employee} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {punch.location ? (
                  <a
                    href={mapsUrl(punch.location)}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir en Google Maps"
                    className="group inline-flex items-center gap-2 text-xs tabular-nums text-muted-foreground hover:text-foreground"
                  >
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-semibold text-primary-foreground transition-transform group-hover:scale-105">
                      <MapPin className="h-3.5 w-3.5" />
                      Mapa
                    </span>
                    <span className="hidden sm:inline">
                      {punch.location.lat.toFixed(5)}, {punch.location.lng.toFixed(5)}
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
                <MethodBadge method={punch.method} />
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
