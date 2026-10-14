import type { Employee } from '@/types'

/**
 * A full face registration takes this many samples (one per pose the registration asks for: front,
 * smile, one side, the other side, front again). They are stored with the employee and travel to
 * every reloj checador, which is why a face is still recognised when the Internet is down.
 */
export const FACE_SAMPLE_TARGET = 5

export function faceSampleCount(employee: Pick<Employee, 'identifications'>): number {
  return employee.identifications.find((i) => i.method === 'face')?.descriptors?.length ?? 0
}
