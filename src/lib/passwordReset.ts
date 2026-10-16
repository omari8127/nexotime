/** Why a proposed new password is not acceptable (null when it is). Same minimum as the sign-up form. */
export function passwordProblem(password: string, again: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  if (/^\s+$/.test(password)) return 'La contraseña no puede ser solo espacios.'
  if (password !== again) return 'Las dos contraseñas no coinciden.'
  return null
}

/** Supabase's English error texts, in words a business owner understands. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('security purposes') || m.includes('rate limit') || m.includes('too many')) {
    return 'Ya se pidió un correo hace un momento. Espera un minuto e inténtalo otra vez.'
  }
  if (m.includes('same password') || m.includes('different from the old')) {
    return 'Elige una contraseña distinta a la anterior.'
  }
  if (m.includes('weak') || m.includes('at least')) return 'Esa contraseña es muy débil. Usa 8 caracteres o más, con letras y números.'
  if (m.includes('session') || m.includes('not authenticated') || m.includes('expired') || m.includes('invalid')) {
    return 'El enlace venció o ya se usó. Pide uno nuevo.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sin conexión. Revisa tu Internet e inténtalo otra vez.'
  return message
}

/** The recovery link comes back as `#error=access_denied&error_code=otp_expired…` (or `?error=…`) when it is no good. */
export function recoveryLinkFailed(urlPart: string): boolean {
  return /(^|[#&?])error(_code|_description)?=/.test(urlPart)
}
