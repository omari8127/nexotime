// NEXOTIME · Edge Function: google-drive-oauth-exchange
//
// El navegador nunca ve el "client secret" de Google (es un secreto real).
// Esta función recibe el código de autorización que Google regresó al panel,
// lo intercambia por un refresh_token usando el secreto (que solo vive aquí,
// como variable de entorno de la función), y guarda ese token en Supabase
// ligado a la empresa de quien hizo la conexión.
//
// Cómo desplegar esta función: ver "Integraciones" en supabase/README.md.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Falta la sesión del usuario.' }, 401)

  const { code, redirectUri } = (await req.json().catch(() => ({}))) as {
    code?: string
    redirectUri?: string
  }
  if (!code || !redirectUri) return json({ error: 'Falta el código de Google o la URL de retorno.' }, 400)

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return json({ error: 'El servidor todavía no tiene configuradas las credenciales de Google.' }, 500)
  }

  // Quién está llamando: un cliente aparte con el JWT del usuario (no la
  // service_role), solo para confirmar sesión y leer su company_id vía RLS.
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Sesión inválida o expirada.' }, 401)

  const { data: companyId, error: companyError } = await userClient.rpc('current_company_id')
  if (companyError || !companyId) return json({ error: 'No se encontró la empresa de este usuario.' }, 400)

  const { data: roleData } = await userClient.rpc('current_role')
  if (roleData !== 'owner' && roleData !== 'admin') {
    return json({ error: 'Solo el propietario o un administrador pueden conectar Google Drive.' }, 403)
  }

  // Intercambia el código por tokens.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenJson = await tokenRes.json()
  if (!tokenRes.ok) {
    return json({ error: tokenJson.error_description ?? 'Google rechazó la conexión.' }, 400)
  }
  const { access_token, refresh_token, expires_in } = tokenJson as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }
  if (!refresh_token) {
    // Pasa cuando el usuario ya había autorizado antes y Google no repite el
    // refresh_token. Hay que pedirle que revoque el acceso previo en
    // https://myaccount.google.com/permissions y lo intente de nuevo.
    return json(
      {
        error:
          'Google no entregó un token de acceso permanente. Si ya habías conectado esta cuenta antes, revócala en myaccount.google.com/permissions e inténtalo de nuevo.',
      },
      400,
    )
  }

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const profileJson = await profileRes.json().catch(() => ({}))
  const connectedEmail = (profileJson as { email?: string }).email ?? 'cuenta de Google'

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { error: upsertError } = await admin.from('integrations_google_drive').upsert(
    {
      company_id: companyId,
      connected_email: connectedEmail,
      refresh_token,
      access_token,
      access_token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  )
  if (upsertError) return json({ error: upsertError.message }, 500)

  return json({ ok: true, email: connectedEmail })
})
