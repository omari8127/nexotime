import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVoice, type VoiceScope } from '@/lib/speech'
import { cn } from '@/lib/utils'

/** "Voz activada / desactivada" switch for spoken instructions; hidden when the browser can't speak.
 *  `pill`: the small rounded look of the kiosk's camera tools. */
export function VoiceToggle({ scope, compact = false, pill = false }: { scope: VoiceScope; compact?: boolean; pill?: boolean }) {
  const { enabled, supported, toggle } = useVoice(scope, { stopOnUnmount: false })
  if (!supported) return null
  const label = enabled ? 'Voz activada' : 'Voz desactivada'
  const aria = `${label}. Toca para ${enabled ? 'apagarla' : 'encenderla'}`
  const Icon = enabled ? Volume2 : VolumeX
  if (pill) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        aria-label={aria}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-95',
          enabled
            ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    )
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size={compact ? 'lg' : 'sm'}
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={aria}
      className={compact ? 'shrink-0 px-4' : undefined}
    >
      <Icon className="h-4 w-4" />
      {compact ? null : label}
    </Button>
  )
}
