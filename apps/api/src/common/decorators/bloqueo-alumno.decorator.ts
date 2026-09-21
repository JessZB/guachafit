import { SetMetadata } from '@nestjs/common';
import { EstadoAlumno } from '@guachafit/shared';

/**
 * Clave de metadata donde `@BloquearAlumnoEn(...)` declara los estados de activación que dejan
 * un endpoint inaccesible para el rol Alumno.
 */
export const ESTADOS_BLOQUEADOS_ALUMNO_KEY = 'estadosBloqueadosAlumno';

/**
 * RF-012: marca un endpoint como OPERATIVO para el alumno y declara qué estados de activación lo
 * bloquean con `403 ALUMNO_BLOQUEADO`.
 *
 * El estado archivado (`perfiles_alumno.deleted_at_utc` sellado) bloquea SIEMPRE, sin importar
 * esta lista: una baja lógica no tiene acceso operativo (RF-012 §4.B, RN-01/RN-02).
 *
 * Sólo aplica al rol Alumno: el coach que consulta el mismo endpoint no se ve afectado
 * (el guard deja pasar a cualquier rol distinto de Alumno).
 */
export const BloquearAlumnoEn = (...estados: EstadoAlumno[]) =>
  SetMetadata(ESTADOS_BLOQUEADOS_ALUMNO_KEY, estados);
