import { ConflictException } from '@nestjs/common';
import {
  CODIGO_CHECKIN_YA_REGISTRADO,
  MENSAJE_CHECKIN_YA_REGISTRADO,
} from '@guachafit/shared';
import { esViolacionUnicidad } from '../../../common/violacion-unicidad.util';

/** Índice único de la unicidad diaria del reporte nutricional (DDL `checkins_nutricionales`). */
export const INDICE_UNICO_CHECKIN_DIARIO = 'uq_checkin_nutricional_diario';

/**
 * LOTE API-N1: `true` si el error de la base de datos es la violación del índice único del reporte
 * diario (Postgres 23505). Delega en el detector común (`common/violacion-unicidad.util.ts`).
 */
export function esViolacionUnicidadCheckinDiario(error: unknown): boolean {
  return esViolacionUnicidad(error, INDICE_UNICO_CHECKIN_DIARIO);
}

/** 409 del reporte ya registrado: mismo texto y código estable para ambos caminos (LOTE API-N1). */
export function conflictoCheckinYaRegistrado(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    code: CODIGO_CHECKIN_YA_REGISTRADO,
    message: MENSAJE_CHECKIN_YA_REGISTRADO,
  });
}
