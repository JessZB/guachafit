import { z } from 'zod';
import {
  LoginUsuarioSchema,
  RefreshTokenSchema,
  CrearEntrenadorSchema,
  EstablecerPasswordConTokenSchema,
  SolicitarRecuperacionPasswordSchema,
  RestablecerPasswordSchema,
  ActualizarMiPerfilSchema,
  CambiarPasswordSchema,
  SolicitarCambioCorreoSchema,
  ConfirmarCambioCorreoSchema,
} from '../schemas';
import {
  Rol,
  TipoDocumento,
  Modalidad,
  PeriodicidadAntropometria,
} from '../enums';

// Tipos inferidos de DTOs - IAM & Onboarding
export type LoginUsuarioDTO = z.infer<typeof LoginUsuarioSchema>;
export type RefreshTokenDTO = z.infer<typeof RefreshTokenSchema>;
export type CrearEntrenadorDTO = z.infer<typeof CrearEntrenadorSchema>;
export type EstablecerPasswordConTokenDTO = z.infer<typeof EstablecerPasswordConTokenSchema>;
export type SolicitarRecuperacionPasswordDTO = z.infer<typeof SolicitarRecuperacionPasswordSchema>;
export type RestablecerPasswordDTO = z.infer<typeof RestablecerPasswordSchema>;
export type ActualizarMiPerfilDTO = z.infer<typeof ActualizarMiPerfilSchema>;
export type CambiarPasswordDTO = z.infer<typeof CambiarPasswordSchema>;
export type SolicitarCambioCorreoDTO = z.infer<typeof SolicitarCambioCorreoSchema>;
export type ConfirmarCambioCorreoDTO = z.infer<typeof ConfirmarCambioCorreoSchema>;

/**
 * RF-018: perfil propio de cualquier rol (`GET /usuarios/me/perfil`). El alumno trae su ficha
 * (documento y fecha de nacimiento solo de lectura); el entrenador, la suya; el superadmin no tiene
 * ficha. Nunca incluye contraseñas ni hashes de tokens.
 */
export interface MiPerfilDTO {
  id: string;
  email: string;
  rol: Rol;
  /** Correo nuevo esperando confirmación (RF-018 RN-05) o `null`. */
  correoPendiente: string | null;
  correoPendienteExpiraUtc: string | null;
  alumno: {
    nombres: string;
    apellidos: string;
    telefonoWhatsapp: string;
    tipoDocumento: TipoDocumento;
    numeroDocumento: string;
    fechaNacimiento: string;
    zonaHoraria: string;
  } | null;
  entrenador: {
    nombres: string;
    apellidos: string;
    nombreComercial: string | null;
    telefonoContacto: string;
  } | null;
}

/** RF-018 RN-04/RN-05: respuesta de `POST /usuarios/me/correo`. */
export interface SolicitudCambioCorreoDTO {
  mensaje: string;
  correoPendiente: string;
  expiraUtc: string;
  /** `true` solo si el correo de confirmación quedó realmente en camino. */
  correoEnviado: boolean;
  /** Solo fuera de producción y si el correo no salió (pruebas sin proveedor). */
  enlaceConfirmacion?: string;
}

// Token Claims JWT
export interface JwtPayload {
  sub: string;
  email: string;
  rol: Rol;
  entrenadorId?: string;
  iat?: number;
  exp?: number;
}

// Respuestas tipadas de IAM y Usuarios
export interface AuthUserDTO {
  id: string;
  email: string;
  rol: Rol;
  entrenadorId?: string;
  /**
   * RF-003 RN-03/RN-04 (WU RF-003a): modalidad del perfil del alumno para que la web pueda poner
   * el formulario antropométrico en solo lectura sin una petición extra. Es `null` para los roles
   * sin perfil de alumno (entrenador/superadmin).
   */
  modalidad?: Modalidad | null;
  /**
   * RF-003 RN-01/RN-04 (WU RF-003b): calendario antropométrico del alumno para que la web pueda
   * mostrar su ventana de check-in (`GET /auth/me` lo re-resuelve del perfil, igual que la
   * modalidad). `null` = sin calendario; también `null` para roles sin perfil de alumno.
   */
  periodicidadAntropometria?: PeriodicidadAntropometria | null;
  /** Ancla (YYYY-MM-DD, día local del alumno) del calendario de periodicidad antropométrica. */
  antropometriaInicio?: string | null;
  /**
   * LOTE API-N2: zona horaria (IANA) del perfil del alumno, la que decide la ventana y el plazo del
   * reporte nutricional. `GET /auth/me` la re-resuelve del perfil; `null` para roles sin perfil de
   * alumno.
   */
  zonaHoraria?: string | null;
}

export interface AuthTokensResponseDTO {
  mensaje: string;
  accessToken: string;
  refreshToken?: string;
  usuario: AuthUserDTO;
}
