import {
  descriptorDistance, isConfidentMatch, meanDescriptor, nearestFace, verifyClaimed,
  type ClaimVerdict, type FaceCandidate, type FaceMatch, type Tuning,
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

export interface ClaimEvidence {
  verdict: ClaimVerdict
  /** Agreeing readings so far / needed. */
  progress: number
  required: number
  /** Enough independent readings agree that this is the claimed person. */
  accepted: boolean
}

/**
 * Verification of a claimed identity (number + PIN → face): the same frames-must-agree rule as
 * {@link FaceSession}, but 1:1 — the question is "is this X?", not "who is this?".
 */
export class ClaimSession {
  private frames: number[][] = []
  private lastAt = 0
  private readonly candidates: FaceCandidate[]
  private readonly employeeId: string

  constructor(candidates: FaceCandidate[], employeeId: string) {
    this.candidates = candidates
    this.employeeId = employeeId
  }

  reset() {
    this.frames = []
    this.lastAt = 0
  }

  push(descriptor: number[], tuning: Tuning, now = Date.now()): ClaimEvidence {
    const required = Math.max(3, tuning.streak)
    if (now - this.lastAt > 6000) this.reset()
    const verdict = verifyClaimed(this.candidates, this.employeeId, descriptor, tuning)
    if (verdict.kind !== 'match') {
      this.reset()
      return { verdict, progress: 0, required, accepted: false }
    }
    const previous = this.frames.at(-1)
    if (previous && descriptorDistance(previous, descriptor) > 0.35) this.frames = []
    this.lastAt = now
    this.frames = [...this.frames, descriptor].slice(-required)
    const smoothed = verifyClaimed(this.candidates, this.employeeId, meanDescriptor(this.frames), tuning)
    return {
      verdict,
      progress: this.frames.length,
      required,
      accepted: this.frames.length >= required && smoothed.kind === 'match',
    }
  }
}
