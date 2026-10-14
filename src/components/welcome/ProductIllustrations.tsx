import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, MapPin, MapPinCheck, MapPinX, ScanFace, ShieldCheck } from 'lucide-react'
import { PUNCH_STYLE } from '@/lib/punchStyle'
import { cn } from '@/lib/utils'
import type { PunchType } from '@/types'

/*
 * Pictures of the real product for the landing page, drawn with the same pieces and colours as the
 * app (no photos to download, crisp at any size). Decorative: each one carries a text label for
 * screen readers and nothing inside is interactive.
 */

/* ---------------------------------------------------------------- frames */

/**
 * Draws its content at a fixed design size and scales it to the width it gets, like a picture: the
 * mock screens keep their exact proportions on a phone and on a wide monitor.
 */
export function Scaled({ width, height, className, children }: { width: number; height: number; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])
  return (
    <div ref={box} className={cn('relative', className)} style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

export function TabletFrame({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('rounded-[1.75rem] bg-slate-900 p-3 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/10', className)}
    >
      <div className="relative h-full overflow-hidden rounded-[1.1rem] bg-white" aria-hidden>
        {children}
      </div>
    </div>
  )
}

export function PhoneFrame({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('rounded-[2.4rem] bg-slate-900 p-2.5 shadow-[0_30px_60px_-18px_rgba(15,23,42,0.4)] ring-1 ring-slate-900/10', className)}
    >
      <div className="relative h-full overflow-hidden rounded-[1.95rem] bg-white" aria-hidden>
        <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-slate-900" />
        {children}
      </div>
    </div>
  )
}

export function BrowserFrame({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('overflow-hidden rounded-2xl bg-white shadow-[0_30px_60px_-24px_rgba(15,23,42,0.3)] ring-1 ring-slate-200', className)}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-4 py-2.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 h-5 flex-1 rounded-md bg-white ring-1 ring-slate-200" />
      </div>
      <div aria-hidden>{children}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- small pieces */

/** A head-and-shoulders portrait, standing in for the verification photo. */
export function Portrait({ className, tone = 'warm' }: { className?: string; tone?: 'warm' | 'cool' }) {
  const bg = tone === 'warm' ? ['#fde68a', '#fca5a5'] : ['#bae6fd', '#c7d2fe']
  return (
    <svg viewBox="0 0 120 120" className={className} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`pg-${tone}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={bg[0]} />
          <stop offset="1" stopColor={bg[1]} />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#pg-${tone})`} />
      <path d="M18 120c4-26 22-38 42-38s38 12 42 38z" fill={tone === 'warm' ? '#1e3a8a' : '#334155'} />
      <circle cx="60" cy="52" r="22" fill={tone === 'warm' ? '#c08457' : '#e0ac69'} />
      <path d="M37 50c0-16 10-25 23-25s24 8 24 22c-8-6-18-9-28-8-8 1-14 5-19 11z" fill="#1f2937" />
    </svg>
  )
}

/** A city block seen from above, with the punch's pin: the "mini map" of the app, drawn. */
export function StreetMap({ className, pin = 'inside' }: { className?: string; pin?: 'inside' | 'outside' }) {
  return (
    <svg viewBox="0 0 200 140" className={className} preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="140" fill="#eef2ec" />
      <path d="M0 96 200 60" stroke="#fff" strokeWidth="12" />
      <path d="M58 0 82 140" stroke="#fff" strokeWidth="9" />
      <path d="M140 0 128 140" stroke="#fff" strokeWidth="7" />
      <path d="M0 30 200 18" stroke="#fde68a" strokeWidth="6" />
      <rect x="92" y="78" width="28" height="22" rx="3" fill="#bbf7d0" />
      <rect x="10" y="44" width="38" height="30" rx="3" fill="#e2e8f0" />
      <rect x="150" y="80" width="40" height="44" rx="3" fill="#e2e8f0" />
      <rect x="92" y="34" width="30" height="20" rx="3" fill="#e2e8f0" />
      {pin === 'inside' ? (
        <>
          <circle cx="104" cy="72" r="26" fill="#38bdf8" fillOpacity="0.15" stroke="#0ea5e9" strokeOpacity="0.5" />
          <path d="M104 74c-7-8-11-13-11-18a11 11 0 0 1 22 0c0 5-4 10-11 18z" fill="#e11d48" stroke="#fff" strokeWidth="2" />
          <circle cx="104" cy="56" r="4" fill="#fff" />
        </>
      ) : (
        <>
          <circle cx="104" cy="72" r="26" fill="none" stroke="#0f172a" strokeDasharray="4 4" strokeOpacity="0.45" />
          <path d="M176 44c-6-7-9-11-9-15a9 9 0 0 1 18 0c0 4-3 8-9 15z" fill="#e11d48" stroke="#fff" strokeWidth="2" />
          <circle cx="176" cy="29" r="3.2" fill="#fff" />
        </>
      )}
    </svg>
  )
}

function PunchButton({ type, state }: { type: PunchType; state: 'next' | 'done' | 'later' }) {
  const s = PUNCH_STYLE[type]
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-center',
        state === 'next' ? s.solid : state === 'done' ? s.soft : 'border border-dashed border-slate-200 text-slate-400',
      )}
    >
      <s.Icon className="h-4 w-4" />
      <span className="text-[10px] font-semibold leading-tight">{s.label}</span>
    </div>
  )
}

/* ---------------------------------------------------------------- screens */

/** The reloj checador right after someone clocked in: time, person, photo and where. */
export function KioskSuccessScreen({ time }: { time: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="bg-gradient-to-b from-emerald-50 to-white px-6 pb-4 pt-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 ring-8 ring-emerald-100">
          <Check className="h-6 w-6" strokeWidth={3} />
        </span>
        <p className="mt-3 text-[11px] font-semibold text-emerald-700">Entrada registrada</p>
        <p className="font-display text-4xl font-bold tabular-nums tracking-tight text-slate-900">{time}</p>
      </div>
      <div className="flex-1 space-y-2.5 px-5 pb-5">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-[11px] font-bold text-sky-700">MG</span>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-slate-900">María González Torres</p>
            <p className="text-[10px] text-slate-500">EMP-002, cajera</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <Portrait className="h-28 w-full" />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <StreetMap className="h-28 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** The face being recognised at the reloj: oval guide, green status and the confirmation bar. */
export function FaceScanScreen() {
  return (
    <div className="grid h-full grid-cols-[1.25fr_1fr] items-center gap-5 bg-white p-4">
      <div className="relative h-full overflow-hidden rounded-xl bg-slate-200">
        <Portrait className="absolute inset-0 h-full w-full" tone="cool" />
        <svg viewBox="0 0 133 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" overflow="visible">
          <defs>
            <mask id="oval-cut" maskUnits="userSpaceOnUse" x="-200" y="-200" width="533" height="500">
              <rect x="-200" y="-200" width="533" height="500" fill="white" />
              <ellipse cx="66.5" cy="48" rx="27" ry="36" fill="black" />
            </mask>
          </defs>
          <rect x="-200" y="-200" width="533" height="500" fill="rgba(255,255,255,0.82)" mask="url(#oval-cut)" />
          <ellipse cx="66.5" cy="48" rx="27" ry="36" fill="none" stroke="#10b981" strokeWidth="1.6" />
        </svg>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] text-white">✓</span>
          <span className="h-0.5 w-4 rounded bg-emerald-400" />
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[9px] text-white">2</span>
          <span className="text-slate-700">Mira al frente</span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
              <ScanFace className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[13px] font-bold text-emerald-950">Mantente quieto…</p>
              <p className="text-[10px] text-slate-600">Te estamos reconociendo.</p>
            </div>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full w-[70%] rounded-full bg-emerald-500" />
          </div>
        </div>
        <p className="flex items-center gap-1 text-[10px] text-slate-500">
          <ShieldCheck className="h-3 w-3 text-emerald-600" />
          Se reconoce en el equipo, sin guardar fotos del rostro.
        </p>
      </div>
    </div>
  )
}

/** The employee portal on a phone, inside or outside the branch's allowed zone. */
export function PhonePortalScreen({ zone }: { zone: 'inside' | 'outside' }) {
  const inside = zone === 'inside'
  return (
    <div className="h-full bg-slate-50 pt-9">
      <div className="px-4">
        <p className="text-[11px] font-semibold text-slate-900">Hola, María</p>
        <p className="text-[9px] text-slate-500">Sucursal Centro</p>
      </div>
      <div className="mx-3 mt-3 rounded-2xl bg-white px-3 py-3.5 text-center shadow-sm ring-1 ring-slate-200">
        <p className="font-display text-3xl font-bold tabular-nums text-slate-900">{inside ? '8:57' : '9:12'}</p>
        <p className="text-[9px] text-slate-500">jueves 10 de septiembre</p>
        <span
          className={cn(
            'mt-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-semibold',
            inside ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
          )}
        >
          {inside ? <MapPinCheck className="h-2.5 w-2.5" /> : <MapPinX className="h-2.5 w-2.5" />}
          {inside ? 'En tu zona, a 40 m de tu sucursal' : 'Fuera de tu zona, a 3.0 km'}
        </span>
      </div>
      {inside ? null : (
        <div className="mx-3 mt-2 overflow-hidden rounded-xl border border-rose-200 bg-rose-50">
          <StreetMap className="h-20 w-full" pin="outside" />
          <p className="px-2.5 py-2 text-[9px] leading-snug text-rose-900">
            Para checar desde el celular debes estar a menos de 150 m de tu sucursal.
          </p>
        </div>
      )}
      <div className={cn('mx-3 mt-2 grid grid-cols-2 gap-1.5', !inside && 'opacity-50 grayscale')}>
        <PunchButton type="entry" state={inside ? 'next' : 'later'} />
        <PunchButton type="lunch_out" state="later" />
        <PunchButton type="lunch_in" state="later" />
        <PunchButton type="exit" state="later" />
      </div>
      {inside ? (
        <div className="mx-3 mt-2 overflow-hidden rounded-xl ring-1 ring-slate-200">
          <StreetMap className="h-24 w-full" />
        </div>
      ) : null}
    </div>
  )
}

const LOG_ROWS: Array<{ name: string; initials: string; time: string; type: PunchType; where: string; outside?: boolean; tone: 'warm' | 'cool' }> = [
  { name: 'María González', initials: 'MG', time: '8:57 a.m.', type: 'entry', where: 'a 40 m de la sucursal', tone: 'warm' },
  { name: 'Luis Ramírez', initials: 'LR', time: '9:02 a.m.', type: 'entry', where: 'Tablet de la sucursal', tone: 'cool' },
  { name: 'Ana López', initials: 'AL', time: '2:01 p.m.', type: 'lunch_out', where: 'a 25 m de la sucursal', tone: 'warm' },
  { name: 'Jorge Reyes', initials: 'JR', time: '6:05 p.m.', type: 'exit', where: 'a 2.4 km', outside: true, tone: 'cool' },
]

/** The administrator's "Registro de checadas": colour tabs, photo, movement and where it was made. */
export function PanelLogScreen() {
  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ['entry', 'Entradas', 18],
            ['exit', 'Salidas', 15],
            ['lunch_out', 'Comidas', 11],
          ] as const
        ).map(([type, label, n], i) => {
          const s = PUNCH_STYLE[type]
          return (
            <span
              key={type}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold',
                i === 0 ? cn(s.solid, 'shadow-sm') : s.soft,
              )}
            >
              <s.Icon className="h-3 w-3" />
              {label}
              <span className="rounded-full bg-black/10 px-1.5 text-[10px] tabular-nums">{n}</span>
            </span>
          )
        })}
        <span className="ml-auto rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white">Cargar</span>
      </div>
      <div className="mt-3 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {LOG_ROWS.map((r) => {
          const s = PUNCH_STYLE[r.type]
          return (
            <div key={r.name} className="grid grid-cols-[minmax(0,1.3fr)_auto_auto_minmax(0,1.6fr)] items-center gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">
                  {r.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-900">{r.name}</p>
                  <p className="text-[10px] tabular-nums text-slate-500">{r.time}</p>
                </div>
              </div>
              <Portrait className="h-8 w-8 rounded-md" tone={r.tone} />
              <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', s.solid)}>
                <s.Icon className="h-3 w-3" />
                {s.short}
              </span>
              <p className={cn('flex min-w-0 items-center gap-1 text-[10px]', r.outside ? 'font-semibold text-rose-600' : 'text-emerald-700')}>
                <MapPin className="h-3 w-3 shrink-0" />
                {r.outside ? <span className="shrink-0 rounded bg-rose-600 px-1 text-[9px] font-bold text-white">Fuera de zona</span> : null}
                <span className="truncate">{r.where}</span>
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
