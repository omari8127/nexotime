import { useCallback, useEffect } from 'react'
import { create } from 'zustand'

/**
 * Spoken instructions (the browser's own speech synthesis — nothing is sent anywhere).
 * For people who find it hard to read the screen and hold still at the same time.
 *
 * The preference is per device: on for face enrollment (someone is guiding a person through it),
 * off for the reloj checador until the administrator turns it on, since that one is a shared,
 * sometimes noisy place.
 */
export type VoiceScope = 'enroll' | 'kiosk'

const DEFAULTS: Record<VoiceScope, boolean> = { enroll: true, kiosk: false }
const keyOf = (scope: VoiceScope) => `nexotime.voice.${scope}`

function load(scope: VoiceScope): boolean {
  try {
    const v = localStorage.getItem(keyOf(scope))
    return v == null ? DEFAULTS[scope] : v === 'on'
  } catch {
    return DEFAULTS[scope]
  }
}

interface VoiceState extends Record<VoiceScope, boolean> {
  set: (scope: VoiceScope, on: boolean) => void
}

export const useVoiceStore = create<VoiceState>((set) => ({
  enroll: load('enroll'),
  kiosk: load('kiosk'),
  set: (scope, on) => {
    try {
      localStorage.setItem(keyOf(scope), on ? 'on' : 'off')
    } catch {
      /* private mode: the choice just won't be remembered */
    }
    set({ [scope]: on } as Pick<VoiceState, VoiceScope>)
  },
}))

export const voiceSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

/** Mexican Spanish if the device has it, else any Spanish voice, else the browser default. */
function spanishVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => /^es[-_]MX/i.test(v.lang)) ??
    voices.find((v) => /^es[-_](US|419)/i.test(v.lang)) ??
    voices.find((v) => /^es/i.test(v.lang)) ??
    null
  )
}

const lastSaid = new Map<string, number>()
let busyUntil = 0

export interface SpeakOptions {
  /** Don't say the same sentence again within this time (hints repeat while a frame stays wrong). */
  repeatAfterMs?: number
  /** Step titles and results interrupt whatever is being said; plain hints wait for it to finish. */
  important?: boolean
}

export function speak(text: string, { repeatAfterMs = 8000, important = false }: SpeakOptions = {}) {
  if (!voiceSupported || !text) return
  const now = Date.now()
  if (!important && now < busyUntil) return
  if (now - (lastSaid.get(text) ?? 0) < repeatAfterMs) return
  lastSaid.set(text, now)
  const u = new SpeechSynthesisUtterance(text)
  const voice = spanishVoice()
  u.lang = voice?.lang ?? 'es-MX'
  if (voice) u.voice = voice
  u.rate = 0.92
  // Rough length of the sentence, so a hint doesn't cut off the one before it.
  busyUntil = now + Math.max(1200, text.length * 70)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (voiceSupported) window.speechSynthesis.cancel()
  busyUntil = 0
}

/** A short, soft two-note chime (a sample was captured). Silent if audio is not available. */
export function chime() {
  try {
    const Ctx = window.AudioContext
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.11)
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.11 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.11)
      osc.stop(now + i * 0.11 + 0.22)
    })
    window.setTimeout(() => void ctx.close(), 600)
  } catch {
    /* no audio: the visual flash is still there */
  }
}

export function useVoice(scope: VoiceScope, { stopOnUnmount = true } = {}) {
  const enabled = useVoiceStore((s) => s[scope])
  const setOn = useVoiceStore((s) => s.set)

  const say = useCallback(
    (text: string, options?: SpeakOptions) => {
      if (useVoiceStore.getState()[scope]) speak(text, options)
    },
    [scope],
  )
  const beep = useCallback(() => {
    if (useVoiceStore.getState()[scope]) chime()
  }, [scope])
  const toggle = useCallback(() => {
    const next = !useVoiceStore.getState()[scope]
    setOn(scope, next)
    if (next) speak('Voz activada', { important: true, repeatAfterMs: 0 })
    else stopSpeaking()
  }, [scope, setOn])

  // Never keep talking after the screen that was talking is gone.
  useEffect(() => (stopOnUnmount ? stopSpeaking : undefined), [stopOnUnmount])

  return { enabled, supported: voiceSupported, say, beep, toggle }
}
