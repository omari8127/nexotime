import { useState } from 'react'

const PRESETS = [40, 42, 44, 45, 46, 48]
const MIN_HOURS = 1
const MAX_HOURS = 96

/**
 * Selector de horas semanales: opciones rápidas + un campo libre al final
 * para empresas con una jornada distinta (más o menos horas).
 */
export function WeeklyHoursPicker({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (hours: number) => void
  disabled?: boolean
}) {
  const isCustomValue = !PRESETS.includes(value)
  // Texto que el usuario está escribiendo; vacío mientras se use un preset.
  const [draft, setDraft] = useState<string | null>(null)
  const customText = draft ?? (isCustomValue ? String(value) : '')

  const handleCustom = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, '')
    setDraft(cleaned)
    const n = Number(cleaned)
    if (cleaned !== '' && Number.isFinite(n) && n >= MIN_HOURS && n <= MAX_HOURS) onChange(n)
  }

  const invalidDraft =
    draft !== null && draft !== '' && !(Number(draft) >= MIN_HOURS && Number(draft) <= MAX_HOURS)

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((h) => (
          <button
            key={h}
            type="button"
            disabled={disabled}
            onClick={() => {
              setDraft(null)
              onChange(h)
            }}
            className={`rounded-md border px-3 py-1.5 text-sm tabular-nums transition-colors disabled:opacity-50 ${
              value === h
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-secondary'
            }`}
          >
            {h} h
          </button>
        ))}
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={customText}
            onChange={(e) => handleCustom(e.target.value)}
            onBlur={() => setDraft(null)}
            placeholder="Otra"
            aria-label="Horas semanales personalizadas"
            className={`h-9 w-24 rounded-md border bg-background px-3 pr-7 text-sm tabular-nums outline-none transition-colors placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${
              invalidDraft
                ? 'border-destructive'
                : isCustomValue
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border'
            }`}
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            h
          </span>
        </div>
      </div>
      {invalidDraft ? (
        <p className="text-xs text-destructive">
          Escribe un valor entre {MIN_HOURS} y {MAX_HOURS} horas.
        </p>
      ) : null}
    </div>
  )
}
