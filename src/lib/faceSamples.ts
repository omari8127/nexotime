import { faceSampleState } from '@/lib/face'
import type { Employee } from '@/types'

/**
 * A full face registration takes this many samples (one per pose the registration asks for: front,
 * smile, one side, the other side, front again). They are stored with the employee and travel to
 * every reloj checador, which is why a face is still recognised when the Internet is down.
 */
export const FACE_SAMPLE_TARGET = 5

/** Usable samples of the current face engine (older samples need a new registration and do not count). */
export function faceSampleCount(employee: Pick<Employee, 'identifications'>): number {
  return faceSampleState(employee).usable
}

/** Has face samples, but only from the previous engine: needs to register again. */
export function faceNeedsReenroll(employee: Pick<Employee, 'identifications'>): boolean {
  return faceSampleState(employee).outdated
}
