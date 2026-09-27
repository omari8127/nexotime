/**
 * Zonas horarias de México, según la reforma de 2022 (DOF): seis zonas con
 * comportamiento realmente distinto (offset y horario de verano). Se muestran
 * solo las de México por ahora; si se vende fuera del país, ampliar esta lista.
 */
export const DEFAULT_TIMEZONE = 'America/Mexico_City'

export const MX_TIMEZONES: Array<{ value: string; label: string }> = [
  { value: 'America/Mexico_City', label: 'Centro — CDMX y la mayoría del país (UTC−6)' },
  { value: 'America/Chihuahua', label: 'Pacífico — Chihuahua, Sinaloa, Nayarit, Sonora, BCS (UTC−7)' },
  { value: 'America/Cancun', label: 'Sureste — Quintana Roo (UTC−5)' },
  { value: 'America/Tijuana', label: 'Baja California — con horario de verano (UTC−8/−7)' },
  { value: 'America/Matamoros', label: 'Frontera — Tamaulipas, Coahuila, Nuevo León, frontera (UTC−6/−5, con horario de verano)' },
  { value: 'America/Ojinaga', label: 'Frontera — Chihuahua, frontera (UTC−7/−6, con horario de verano)' },
]
