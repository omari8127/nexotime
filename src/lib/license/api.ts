import { LICENSE_API_URL } from './config'

/** Everything the customer might read is plain language; technical detail stays in the console. */
export const FRIENDLY: Record<string, string> = {
  invalid_code: 'El código no es válido. Revisa que esté completo y que el nombre de la empresa sea el mismo con el que se registró.',
  pending: 'Tu licencia todavía está pendiente de autorización. Contacta a tu proveedor.',
  suspended: 'Tu licencia está suspendida. Contacta a tu proveedor para reactivarla.',
  expired: 'Tu licencia venció. Solicita la renovación a tu proveedor.',
  cancelled: 'Esta licencia fue cancelada. Contacta a tu proveedor.',
  device_limit: 'Esta licencia ya está vinculada a otro dispositivo. Contacte al administrador para autorizar este equipo.',
  device_unauthorized: 'Esta licencia ya está vinculada a otro dispositivo. Contacte al administrador para autorizar este equipo.',
  invalid_token: 'La activación de este equipo ya no es válida. Vuelve a activar el producto.',
  rate_limited: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  network: 'Sin conexión a Internet. Revisa la conexión de este equipo e inténtalo de nuevo.',
  server_error: 'Error temporal del servidor. Inténtalo de nuevo en unos minutos.',
  bad_request: 'Revisa los datos e inténtalo de nuevo.',
}

export class LicenseApiError extends Error {
  code: string
  status: number
  constructor(code: string, status = 0) {
    super(FRIENDLY[code] ?? FRIENDLY.server_error)
    this.code = code
    this.status = status
  }
  get network() {
    return this.code === 'network'
  }
  /** The server said, definitively, that this device may not use the license. */
  get revoked() {
    return this.code === 'device_unauthorized' || this.code === 'invalid_token'
  }
}

export interface ActivateRequest {
  code: string
  companyName: string
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string
  envHash: string
}
export interface ValidateRequest {
  licenseId: string
  deviceId: string
  token: string
  appVersion: string
  envHash: string
}
export interface LicenseResponse {
  ok: true
  token: string
}

async function post<T>(path: string, body: unknown, timeoutMs = 12_000): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${LICENSE_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    })
  } catch {
    throw new LicenseApiError('network')
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => null)) as { code?: string } | null
  if (!res.ok || !data) {
    if (res.status >= 500 || !data) throw new LicenseApiError('server_error', res.status)
    throw new LicenseApiError(data.code ?? 'server_error', res.status)
  }
  return data as T
}

/** Same contract for every platform (Windows PWA today, Android later). */
export const licenseApi = {
  activate: (r: ActivateRequest) => post<LicenseResponse>('/v1/activate', r),
  validate: (r: ValidateRequest) => post<LicenseResponse>('/v1/validate', r),
}
