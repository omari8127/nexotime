import { describe, expect, it } from 'vitest'
import { friendlyAuthError, passwordProblem, recoveryLinkFailed } from '@/lib/passwordReset'

describe('contraseña nueva', () => {
  it('pide 8 caracteres y que las dos coincidan', () => {
    expect(passwordProblem('corta', 'corta')).toMatch(/8 caracteres/)
    expect(passwordProblem('        ', '        ')).toMatch(/espacios/)
    expect(passwordProblem('Tienda-Segura-26', 'Tienda-Segura-27')).toMatch(/no coinciden/)
    expect(passwordProblem('Tienda-Segura-26', 'Tienda-Segura-26')).toBeNull()
  })
})

describe('enlace de recuperación', () => {
  it('detecta un enlace vencido o ya usado', () => {
    expect(recoveryLinkFailed('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toBe(true)
    expect(recoveryLinkFailed('?error=access_denied')).toBe(true)
    expect(recoveryLinkFailed('#access_token=abc&type=recovery')).toBe(false)
    expect(recoveryLinkFailed('')).toBe(false)
  })
})

describe('mensajes de error en español', () => {
  it('traduce los de Supabase que sí aparecen', () => {
    expect(friendlyAuthError('For security purposes, you can only request this after 52 seconds.')).toMatch(/Espera un minuto/)
    expect(friendlyAuthError('New password should be different from the old password.')).toMatch(/distinta/)
    expect(friendlyAuthError('Auth session missing!')).toMatch(/enlace venció/)
    expect(friendlyAuthError('TypeError: Failed to fetch')).toMatch(/Sin conexión/)
  })
  it('lo que no conoce lo deja tal cual', () => {
    expect(friendlyAuthError('algo raro')).toBe('algo raro')
  })
})
