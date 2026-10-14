import { AnimatePresence, motion } from 'framer-motion'
import {
  CameraOff,
  CircleCheck,
  LoaderCircle,
  RotateCw,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  SwitchCamera,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { VoiceToggle } from '@/components/shared/VoiceToggle'
import { cn } from '@/lib/utils'

/** What the person must understand at a glance, each with its own colour and icon. */
export type FaceTone = 'ready' | 'wait' | 'scan' | 'progress' | 'warn' | 'error' | 'rejected' | 'ok'

const TONE: Record<FaceTone, { Icon: LucideIcon; box: string; card: string; title: string; bar: string; spin?: boolean }> = {
  ready: { Icon: Timer, box: 'bg-sky-500 text-white shadow-sky-500/30', card: 'border-sky-200 bg-sky-50/70', title: 'text-sky-950', bar: 'bg-sky-500' },
  wait: { Icon: LoaderCircle, box: 'bg-indigo-500 text-white shadow-indigo-500/30', card: 'border-indigo-200 bg-indigo-50/60', title: 'text-indigo-950', bar: 'bg-indigo-500', spin: true },
  scan: { Icon: ScanFace, box: 'bg-indigo-600 text-white shadow-indigo-600/30', card: 'border-indigo-200 bg-indigo-50/60', title: 'text-indigo-950', bar: 'bg-indigo-500' },
  progress: { Icon: ScanFace, box: 'bg-emerald-500 text-white shadow-emerald-500/30', card: 'border-emerald-200 bg-emerald-50/70', title: 'text-emerald-950', bar: 'bg-emerald-500' },
  warn: { Icon: TriangleAlert, box: 'bg-amber-400 text-amber-950 shadow-amber-500/30', card: 'border-amber-200 bg-amber-50/70', title: 'text-amber-950', bar: 'bg-amber-400' },
  error: { Icon: CameraOff, box: 'bg-rose-500 text-white shadow-rose-500/30', card: 'border-rose-200 bg-rose-50/70', title: 'text-rose-950', bar: 'bg-rose-500' },
  rejected: { Icon: ShieldAlert, box: 'bg-rose-500 text-white shadow-rose-500/30', card: 'border-rose-200 bg-rose-50/70', title: 'text-rose-950', bar: 'bg-rose-500' },
  ok: { Icon: CircleCheck, box: 'bg-emerald-500 text-white shadow-emerald-500/30', card: 'border-emerald-200 bg-emerald-50/70', title: 'text-emerald-950', bar: 'bg-emerald-500' },
}

/**
 * The one big message beside the camera: a coloured icon, a short instruction and, while the face is
 * being confirmed, how far along it is. It replaces several lines of grey text that were easy to miss.
 */
export function FaceStatus({
  tone,
  eyebrow,
  title,
  detail,
  progress,
}: {
  tone: FaceTone
  eyebrow?: string
  title: string
  detail?: string
  /** 0–1: shown as a bar (the readings that confirm the face, or the countdown). */
  progress?: number
}) {
  const look = TONE[tone]
  const Icon = look.Icon
  return (
    <div className={cn('w-full rounded-2xl border px-4 py-4 text-left transition-colors duration-300', look.card)} role="status">
      {eyebrow ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{eyebrow}</p> : null}
      <div className="flex items-center gap-3.5">
        <motion.span
          key={tone}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 18 }}
          className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg', look.box)}
        >
          <Icon className={cn('h-7 w-7', look.spin && 'animate-spin')} strokeWidth={2.2} />
        </motion.span>
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className={cn('text-xl font-bold leading-snug tracking-tight', look.title)}
            >
              {title}
            </motion.p>
          </AnimatePresence>
          {detail ? <p className="mt-0.5 text-sm leading-snug text-slate-600">{detail}</p> : null}
        </div>
      </div>
      {progress != null ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/5">
          <motion.div
            className={cn('h-full rounded-full', look.bar)}
            initial={false}
            animate={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      ) : null}
    </div>
  )
}

/** "Acomódate → Mira al frente → ¡Listo!": where the person is in the process. */
export function FaceSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Acomódate', 'Mira al frente', '¡Listo!']
  return (
    <ol className="flex w-full items-center gap-1.5">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <li key={label} className={cn('flex items-center gap-1.5', n < steps.length && 'flex-1')}>
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                done ? 'bg-emerald-500 text-white' : current ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : 'bg-slate-100 text-slate-400',
              )}
            >
              {done ? '✓' : n}
            </span>
            <span className={cn('whitespace-nowrap text-xs font-medium', current ? 'text-slate-900' : 'text-slate-400')}>{label}</span>
            {n < steps.length ? <span className={cn('h-0.5 min-w-2 flex-1 rounded-full', done ? 'bg-emerald-400' : 'bg-slate-200')} /> : null}
          </li>
        )
      })}
    </ol>
  )
}

/** Small, quiet camera tools: only needed when the picture is wrong, so they never compete with the main buttons. */
export function CameraTools({
  facingMode,
  onSwitch,
  onRotate,
  rotation,
}: {
  facingMode?: 'user' | 'environment'
  onSwitch: () => void
  onRotate: () => void
  rotation: number
}) {
  const tool =
    'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 active:scale-95'
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2 landscape:justify-start">
      <button type="button" className={tool} onClick={onSwitch}>
        <SwitchCamera className="h-3.5 w-3.5" />
        {facingMode ? `Cámara ${facingMode === 'user' ? 'trasera' : 'frontal'}` : 'Cambiar cámara'}
      </button>
      <button type="button" className={tool} onClick={onRotate} title="Si la imagen se ve de lado o de cabeza">
        <RotateCw className="h-3.5 w-3.5" />
        Girar imagen{rotation ? ` (${rotation}°)` : ''}
      </button>
      <VoiceToggle scope="kiosk" pill />
    </div>
  )
}

/** The privacy line under the camera. */
export function FacePrivacyNote({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-1.5 text-left text-xs leading-snug text-slate-500">
      <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />
      {children}
    </p>
  )
}
