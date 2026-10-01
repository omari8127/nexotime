/**
 * Conexión de la empresa con su propio Google Drive (ver supabase/README.md
 * § Integraciones para el trabajo programado que sube el respaldo diario).
 * El intercambio del código por un token vive en una Edge Function porque
 * necesita el "client secret" de Google, que nunca debe llegar al navegador.
 */
import { supabase } from '@/lib/supabaseClient'

const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email']

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

export function googleDriveCallbackUrl(): string {
  return `${window.location.origin}/integraciones/google/callback`
}

/** A dónde mandar al administrador para que autorice el acceso. */
export function buildGoogleAuthUrl(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) throw new Error('Falta configurar VITE_GOOGLE_CLIENT_ID.')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleDriveCallbackUrl(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export interface GoogleDriveStatus {
  connected: boolean
  connectedEmail: string | null
  lastExportAt: string | null
  lastExportStatus: 'ok' | 'error' | null
  lastExportError: string | null
}

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  const { data, error } = await client().rpc('get_google_drive_status')
  if (error) throw new Error(error.message)
  const row = data?.[0]
  return {
    connected: row?.connected ?? false,
    connectedEmail: row?.connected_email ?? null,
    lastExportAt: row?.last_export_at ?? null,
    lastExportStatus: row?.last_export_status ?? null,
    lastExportError: row?.last_export_error ?? null,
  }
}

export async function exchangeGoogleDriveCode(code: string): Promise<{ email: string }> {
  const { data, error } = await client().functions.invoke('google-drive-oauth-exchange', {
    body: { code, redirectUri: googleDriveCallbackUrl() },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return { email: data.email as string }
}

export async function disconnectGoogleDrive(): Promise<void> {
  const { error } = await client().rpc('disconnect_google_drive')
  if (error) throw new Error(error.message)
}
