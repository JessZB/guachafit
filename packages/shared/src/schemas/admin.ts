import { z } from 'zod';
import { EstadoLicencia } from '../enums';

/**
 * RF-010 RN-01 (WU Admin): página por defecto y techo duro del listado de entrenadores del panel
 * maestro (`GET /auth/entrenadores`). Mismo envelope paginado que el resto de listados del repo.
 */
export const LIMITE_ENTRENADORES_ADMIN_POR_DEFECTO = 25;
export const LIMITE_ENTRENADORES_ADMIN_MAXIMO = 100;

/** RF-010 RN-01: paginación estándar del listado de entrenadores del Superadmin. */
export const ListarEntrenadoresAdminQuerySchema = z.object({
  limit: z
    .coerce
    .number()
    .int('El límite debe ser un número entero')
    .min(1, 'El límite debe ser al menos 1')
    .max(
      LIMITE_ENTRENADORES_ADMIN_MAXIMO,
      `El límite no puede exceder ${LIMITE_ENTRENADORES_ADMIN_MAXIMO}`
    )
    .optional()
    .default(LIMITE_ENTRENADORES_ADMIN_POR_DEFECTO),
  offset: z
    .coerce
    .number()
    .int('La posición de inicio debe ser un número entero')
    .min(0, 'La posición de inicio no puede ser negativa')
    .optional()
    .default(0),
});

/**
 * RF-010 RN-01 / §6: habilitar o deshabilitar la CUENTA de un entrenador.
 * Idempotente: repetir el mismo estado no escribe y devuelve `cambioAplicado: false`.
 */
export const CambiarEstadoEntrenadorSchema = z.object({
  activo: z.boolean({
    required_error: 'Indica si la cuenta queda activa o inactiva.',
    invalid_type_error: 'El estado de la cuenta debe ser activa o inactiva.',
  }),
});

/** RF-010 RN-01: activar o suspender la LICENCIA de un entrenador (idempotente). */
export const CambiarLicenciaEntrenadorSchema = z.object({
  estadoLicencia: z.nativeEnum(EstadoLicencia, {
    errorMap: () => ({ message: 'La licencia debe quedar activa o suspendida.' }),
  }),
});
