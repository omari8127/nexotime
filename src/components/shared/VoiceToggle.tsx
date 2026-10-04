import { Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useVoice, type VoiceScope } from '@/lib/speech'

/** "Voz activada / desactivada" switch for spoken instructions; hidden when the browser can't speak. */
export function VoiceToggle({ scope, compact = false }: { scope: VoiceScope; compact?: boolean }) {
  const { enabled, supported, toggle } = useVoice(scope, { stopOnUnmount: false })
  if (!supported) return null
  const label = enabled ? 'Voz activada' : 'Voz desactivada'
  return (
    <Button
      type="button"
      variant="secondary"
      size={compact ? 'lg' : 'sm'}
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={`${label}. Toca para ${enabled ? 'apagarla' : 'encenderla'}`}
      className={compact ? 'shrink-0 px-4' : undefined}
    >
      {enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      {compact ? null : label}
    </Button>
  )
}
