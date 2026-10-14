/**
 * What this device is for. A tablet that works as the reloj checador stays signed in with an
 * administrator's account (it needs one to read the staff and save the checadas), so opening the app on
 * it must not land in the panel: anyone standing there would be the administrator. A device marked as a
 * "kiosk" always goes to the clock, and the panel opens only with the exit code, for a limited time.
 *
 * It is a property of the DEVICE (this browser), not of the account or the company.
 */
export type DeviceUse = 'kiosk' | 'panel'

const USE_KEY = 'nexotime.deviceUse'
const UNLOCK_KEY = 'nexotime.panelUnlockedAt'
/** The panel stays open this long after the last touch, then the kiosk takes the screen back. */
export const PANEL_UNLOCK_MS = 15 * 60_000

export function getDeviceUse(): DeviceUse | null {
  try {
    const v = localStorage.getItem(USE_KEY)
    return v === 'kiosk' || v === 'panel' ? v : null
  } catch {
    return null
  }
}

export function setDeviceUse(use: DeviceUse | null) {
  try {
    if (use) localStorage.setItem(USE_KEY, use)
    else localStorage.removeItem(USE_KEY)
  } catch {
    /* private mode: it just will not be remembered */
  }
  if (use !== 'kiosk') unlockPanel()
}

/** Panel unlocked with the exit code and touched within the last PANEL_UNLOCK_MS. */
export function isPanelUnlocked(now = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(UNLOCK_KEY))
    return Number.isFinite(at) && at > 0 && now - at < PANEL_UNLOCK_MS
  } catch {
    return false
  }
}

export function unlockPanel(now = Date.now()) {
  try {
    sessionStorage.setItem(UNLOCK_KEY, String(now))
  } catch {
    /* no session storage: the panel simply stays locked on a kiosk */
  }
}

/** Anyone using the panel keeps it open; called on touches and navigation. */
export const touchPanel = unlockPanel

export function lockPanel() {
  try {
    sessionStorage.removeItem(UNLOCK_KEY)
  } catch {
    /* ignore */
  }
}

/** Where this device must be right now: the clock, or anywhere the person's role allows. */
export function mustStayAtClock(use: DeviceUse | null, unlocked: boolean): boolean {
  return use === 'kiosk' && !unlocked
}
