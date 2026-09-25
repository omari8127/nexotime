import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const CUSTOM = '__custom__'

/** A dropdown of suggested values with an "Otro…" escape hatch, so each
 *  company can use its own puestos / departamentos. */
export function SelectWithCustom({
  value,
  onChange,
  options,
  placeholder = 'Escribe el valor',
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}) {
  const known = options.includes(value)
  const [custom, setCustom] = useState(!known && value !== '')
  const showInput = custom || (!known && value !== '')

  return (
    <div className="space-y-2">
      <Select
        value={showInput ? CUSTOM : value}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true)
            onChange('')
          } else {
            setCustom(false)
            onChange(v)
          }
        }}
        options={[
          ...options.map((o) => ({ value: o, label: o })),
          { value: CUSTOM, label: 'Otro…' },
        ]}
      />
      {showInput ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus />
      ) : null}
    </div>
  )
}
