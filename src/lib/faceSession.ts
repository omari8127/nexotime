import {
  descriptorDistance, isConfidentMatch, meanDescriptor, nearestFace,
  type FaceCandidate, type FaceMatch, type Tuning,
} from './face'

/** Independent frames must agree BEFORE smoothing; never average different people. */
export class FaceSession {
  private frames: number[][] = []
  private id = ''
  private lastAt = 0
  private policy = ''

  reset() {
    this.frames = []
    this.id = ''
    this.lastAt = 0
    this.policy = ''
  }

  push(candidates: FaceCandidate[], descriptor: number[], tuning: Tuning, now = Date.now()): {
    match: FaceMatch | null; accepted: FaceMatch | null; progress: number; required: number
  } {
    const required = Math.max(3, tuning.streak)
    const policy = JSON.stringify(tuning)
    if (policy !== this.policy || now - this.lastAt > 6000) this.reset()
    this.policy = policy
    const match = nearestFace(candidates, descriptor)
    if (!isConfidentMatch(match, tuning)) {
      this.reset()
      return { match, accepted: null, progress: 0, required }
    }
    const previous = this.frames.at(-1)
    if (match.employee.id !== this.id || (previous && descriptorDistance(previous, descriptor) > 0.35)) {
      this.frames = []
    }
    this.id = match.employee.id
    this.lastAt = now
    this.frames = [...this.frames, descriptor].slice(-required)
    const smoothed = nearestFace(candidates, meanDescriptor(this.frames))
    const accepted = this.frames.length >= required && isConfidentMatch(smoothed, tuning) &&
      smoothed.employee.id === this.id ? smoothed : null
    return { match, accepted, progress: this.frames.length, required }
  }
}
