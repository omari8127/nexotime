/**
 * What the employee portal keeps on the phone:
 *  - the session key, only for this browser tab (closing it means entering number + PIN again);
 *  - the company code and the employee number, so only the PIN has to be typed next time.
 * The PIN is never stored.
 */
const TOKEN_KEY = 'nexotime.portal.session'
const DEVICE_KEY = 'nexotime.portal.device'

export interface RememberedAccess {
  code: string
  number: string
}

export function readPortalToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function savePortalToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* private mode: the session simply lasts until the page is closed */
  }
}

export function readRememberedAccess(): RememberedAccess {
  try {
    const raw = JSON.parse(localStorage.getItem(DEVICE_KEY) ?? '{}') as Partial<RememberedAccess>
    return { code: typeof raw.code === 'string' ? raw.code : '', number: typeof raw.number === 'string' ? raw.number : '' }
  } catch {
    return { code: '', number: '' }
  }
}

export function rememberAccess(access: RememberedAccess) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(access))
  } catch {
    /* ignore */
  }
}
