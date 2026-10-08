/**
 * RF-018: reglas de la pestaña "Perfil" y "Correo y contraseña" de Ajustes.
 *
 * - Qué dato edita cada rol (§A): el alumno, nombres, apellidos y teléfono de WhatsApp; el
 *   entrenador, además, su nombre comercial; el superadmin, ninguno. El documento y la fecha de
 *   nacimiento del alumno se muestran pero no se editan (RN-01).
 * - Solo viajan los datos editables que cambiaron (el PATCH es estricto en el API).
 * - Validación con los mismos límites del contrato compartido, con mensajes por campo.
 */
import {
  MENSAJE_CORREO_EN_USO,
  MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO,
  Rol,
  type ActualizarMiPerfilDTO,
  type MiPerfilDTO,
} from '@guachafit/shared';
import { ApiError, ErrorDeConexion } from './api-client';
import { esMensajeAmigable } from './mensajes-error';

export interface FormularioPerfil {
  nombres: string;
  apellidos: string;
  telefono: string;
  nombreComercial: string;
}

export type CampoPerfil = keyof FormularioPerfil;

export type ErroresPerfil = Partial<Record<CampoPerfil, string>>;

/** RF-018 RN-03: aviso que se muestra ANTES de pedir el cambio de correo. */
export const AVISO_CAMBIO_CORREO =
  'Te enviaremos un correo de confirmación a la dirección nueva para comprobar que existe. Hasta que lo confirmes, seguirás entrando con tu correo actual.';

/** RF-018 RN-01: el documento y la fecha de nacimiento del alumno solo los cambia su entrenador. */
export const TEXTO_IDENTIDAD_SOLO_LECTURA = 'Si necesitas corregirlos, pídeselo a tu entrenador.';

const CAMPOS_POR_ROL: Record<string, readonly CampoPerfil[]> = {
  [Rol.ALUMNO]: ['nombres', 'apellidos', 'telefono'],
  [Rol.ENTRENADOR]: ['nombres', 'apellidos', 'telefono', 'nombreComercial'],
};

export function camposEditablesPerfil(rol: Rol | string | null | undefined): CampoPerfil[] {
  return rol ? [...(CAMPOS_POR_ROL[rol] ?? [])] : [];
}

export function formularioDesdePerfil(perfil: MiPerfilDTO): FormularioPerfil {
  if (perfil.alumno) {
    return {
      nombres: perfil.alumno.nombres,
      apellidos: perfil.alumno.apellidos,
      telefono: perfil.alumno.telefonoWhatsapp,
      nombreComercial: '',
    };
  }
  if (perfil.entrenador) {
    return {
      nombres: perfil.entrenador.nombres,
      apellidos: perfil.entrenador.apellidos,
      telefono: perfil.entrenador.telefonoContacto,
      nombreComercial: perfil.entrenador.nombreComercial ?? '',
    };
  }
  return { nombres: '', apellidos: '', telefono: '', nombreComercial: '' };
}

/** Datos editables del rol que cambiaron, recortados; nombre comercial vacío → `null`. */
export function cambiosPerfil(
  inicial: FormularioPerfil,
  actual: FormularioPerfil,
  rol: Rol | string | null | undefined
): ActualizarMiPerfilDTO {
  const cambios: ActualizarMiPerfilDTO = {};
  for (const campo of camposEditablesPerfil(rol)) {
    const valor = actual[campo].trim();
    if (valor === inicial[campo].trim()) continue;
    if (campo === 'nombreComercial') {
      cambios.nombreComercial = valor === '' ? null : valor;
    } else {
      cambios[campo] = valor;
    }
  }
  return cambios;
}

function fueraDeRango(valor: string, minimo: number, maximo: number): boolean {
  return valor.length < minimo || valor.length > maximo;
}

/** Errores por campo (vacío = válido), solo sobre los datos editables del rol. */
export function validarFormularioPerfil(
  formulario: FormularioPerfil,
  rol: Rol | string | null | undefined
): ErroresPerfil {
  const errores: ErroresPerfil = {};
  for (const campo of camposEditablesPerfil(rol)) {
    const valor = formulario[campo].trim();
    if ((campo === 'nombres' || campo === 'apellidos') && fueraDeRango(valor, 2, 100)) {
      errores[campo] = 'Escribe entre 2 y 100 caracteres.';
    } else if (campo === 'telefono' && fueraDeRango(valor, 8, 30)) {
      errores.telefono = 'Escribe un teléfono de 8 a 30 caracteres.';
    } else if (campo === 'nombreComercial' && valor.length > 150) {
      errores.nombreComercial = 'Escribe hasta 150 caracteres.';
    }
  }
  return errores;
}

export interface FormularioPassword {
  actual: string;
  nueva: string;
  confirmacion: string;
}

export type ErroresPassword = Partial<Record<keyof FormularioPassword, string>>;

/** RF-018 RN-08: misma política que la recuperación (8 a 100 caracteres). */
export function validarCambioPassword(formulario: FormularioPassword): ErroresPassword {
  const errores: ErroresPassword = {};
  if (formulario.actual === '') {
    errores.actual = 'Escribe tu contraseña actual.';
  }
  if (formulario.nueva.length < 8) {
    errores.nueva = 'La contraseña nueva debe tener al menos 8 caracteres.';
  } else if (formulario.nueva.length > 100) {
    errores.nueva = 'La contraseña nueva puede tener hasta 100 caracteres.';
  }
  if (formulario.confirmacion !== formulario.nueva) {
    errores.confirmacion = 'Las contraseñas no coinciden.';
  }
  return errores;
}

export type EstadoErrorConfirmacionCorreo = 'invalido' | 'en-uso' | 'sin-conexion' | 'error';

/** Lectura del error al confirmar el cambio de correo desde el enlace (RF-018 RN-05, §6). */
export function estadoConfirmacionCorreo(error: unknown): EstadoErrorConfirmacionCorreo {
  if (error instanceof ApiError) {
    if (error.status === 404) return 'invalido';
    if (error.status === 409) return 'en-uso';
  }
  if (error instanceof ErrorDeConexion) return 'sin-conexion';
  return 'error';
}

export function mensajeConfirmacionCorreo(estado: EstadoErrorConfirmacionCorreo): string {
  switch (estado) {
    case 'invalido':
      return MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO;
    case 'en-uso':
      return MENSAJE_CORREO_EN_USO;
    case 'sin-conexion':
      return 'No hay conexión a internet. Revisa tu red y vuelve a abrir el enlace.';
    case 'error':
      return 'No pudimos confirmar tu correo. Inténtalo de nuevo en unos minutos.';
  }
}

/** Mensaje de un guardado de Ajustes que falló sin conexión (no se encola: RF-018 §6). */
export const MENSAJE_AJUSTES_SIN_CONEXION =
  'No hay conexión a internet: no se guardó nada. Revisa tu red e inténtalo de nuevo.';

/**
 * Mensaje claro de un error al guardar en Ajustes: sin conexión, el aviso honesto; si el error
 * trae un mensaje pensado para el usuario, ese; si no, `porDefecto` (nunca texto técnico).
 */
export function mensajeErrorAjustes(error: unknown, porDefecto: string): string {
  if (error instanceof ErrorDeConexion) return MENSAJE_AJUSTES_SIN_CONEXION;
  const mensaje = error instanceof Error ? error.message : null;
  return esMensajeAmigable(mensaje) ? mensaje.trim() : porDefecto;
}
