import { useDataStore } from '@/store/dataStore'
import { getToday } from '@/lib/today'

/** The ISO date ("YYYY-MM-DD") the rest of the app should treat as "today". */
export function useToday(): string {
  const mode = useDataStore((s) => s.mode)
  return getToday(mode)
}
