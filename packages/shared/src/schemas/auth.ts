import { z } from 'zod';
import { TASA_STRING_REGEX } from './comunes';

/**
 * WU-E (RF-011 RN-06): formato compartido del `coach_code` de captación.
 * Se usa al crear entrenadores y al resolver códigos públicos de deep link.
 */
export const COACH_CODE_REGEX = /^[A-Za-z0-9_-]{4,15}$/;

// =============================================================================
// IAM & ONBOARDING SCHEMAS
// =============================================================================
export const LoginUsuarioSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  /**
   * ADR-025 (ZH-1): zona IANA del dispositivo para la precarga única del alumno. Cualquier texto
   * se acepta aquí; el servidor decide si es una zona válida y, si no, la ignora sin bloquear.
   */
  zonaDispositivo: z.string().optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

export const CrearEntrenadorSchema = z.object({
  nombres: z.string().min(2).max(100),
  apellidos: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100).optional(),
  nombreComercial: z.string().min(2).max(150).optional(),
  coachCode: z.string().min(4).max(15).regex(/^[A-Za-z0-9_-]+$/, 'El código del entrenador solo puede tener letras, números y guiones'),
  capacidadMaxima: z.number().int().min(1).default(50),
  tasaCambioGlobal: z.string().regex(TASA_STRING_REGEX).default('65.0000'),
  telefonoContacto: z.string().min(8).max(30),
});

export const EstablecerPasswordConTokenSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(8).max(100),
  /** ADR-025 (ZH-1): igual que en el inicio de sesión; el servidor valida y puede ignorarla. */
  zonaDispositivo: z.string().optional(),
});

/**
 * Solicitud pública de recuperación de contraseña (`POST /auth/recuperar-password`).
 * La respuesta es siempre la misma, exista o no el correo.
 */
export const SolicitarRecuperacionPasswordSchema = z.object({
  email: z.string().email(),
});

/**
 * Nueva contraseña con el enlace de recuperación (`POST /auth/restablecer-password`).
 * Misma política de contraseña que la activación de la cuenta (reutiliza su contrato).
 */
export const RestablecerPasswordSchema = EstablecerPasswordConTokenSchema;

// =============================================================================
// RF-018 "Mi perfil": autogestión de la cuenta
// =============================================================================

export const MENSAJE_DATO_NO_EDITABLE = 'Ese dato no se puede cambiar desde tu perfil.';
export const MENSAJE_PASSWORD_ACTUAL_INCORRECTA = 'Tu contraseña actual no es correcta.';
export const MENSAJE_PASSWORD_NUEVA_IGUAL = 'La contraseña nueva debe ser distinta de la actual.';
export const MENSAJE_CORREO_EN_USO = 'Ese correo ya está en uso.';
export const MENSAJE_CORREO_IGUAL_AL_ACTUAL = 'Ese ya es tu correo de acceso.';
export const MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO =
  'El enlace no es válido o venció. Pide uno nuevo desde Ajustes.';
export const MENSAJE_PASSWORD_CAMBIADA = 'Tu contraseña se cambió.';
export const MENSAJE_CAMBIO_CORREO_CANCELADO = 'Cancelaste el cambio de correo.';
export const MENSAJE_CUENTA_NO_ENCONTRADA = 'No encontramos tu cuenta.';
export const MENSAJE_FICHA_NO_ENCONTRADA =
  'No encontramos tus datos de perfil. Pide a tu entrenador que los revise.';
/** RF-018 RN-03/RN-05: respuesta a la solicitud de cambio de correo. */
export function mensajeCambioCorreoSolicitado(correoNuevo: string, correoEnviado: boolean): string {
  return correoEnviado
    ? `Te enviamos un correo de confirmación a ${correoNuevo}. Hasta que lo confirmes, sigues entrando con tu correo actual.`
    : 'Guardamos tu pedido, pero no pudimos enviar el correo de confirmación. Inténtalo de nuevo en unos minutos.';
}
export function mensajeCorreoConfirmado(correoNuevo: string): string {
  return `Tu correo de acceso ahora es ${correoNuevo}.`;
}

/**
 * RF-018 RN-02: datos que el usuario puede editar de su propio perfil. Estricto: el documento, la
 * fecha de nacimiento, el correo o cualquier id no viajan por aquí. Qué campo admite cada rol lo
 * decide el servicio (400 `MENSAJE_DATO_NO_EDITABLE`).
 */
export const ActualizarMiPerfilSchema = z
  .object({
    nombres: z.string().min(2).max(100).optional(),
    apellidos: z.string().min(2).max(100).optional(),
    telefono: z.string().min(8).max(30).optional(),
    nombreComercial: z.string().max(150).nullable().optional(),
  })
  .strict()
  .refine((datos) => Object.keys(datos).length > 0, {
    message: 'Indica al menos un dato para actualizar.',
  });

/** RF-018 RN-08: la contraseña nueva sigue la misma política que la recuperación. */
export const CambiarPasswordSchema = z.object({
  passwordActual: z.string().min(1),
  passwordNueva: RestablecerPasswordSchema.shape.password,
});

/** RF-018 RN-04: el correo nuevo se compara y se guarda normalizado. */
export const SolicitarCambioCorreoSchema = z.object({
  correoNuevo: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email()),
  passwordActual: z.string().min(1),
});

/** RF-018 RN-05: canje público del enlace enviado al correo nuevo. */
export const ConfirmarCambioCorreoSchema = z.object({
  token: z.string().min(1).max(128),
});
