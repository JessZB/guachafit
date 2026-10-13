import { z } from 'zod';
import {
  FotoComidaInputSchema,
  CheckinNutricionalSchema,
  MetasNutricionalesSchema,
  RecursoNutricionalSchema,
  FiltroCheckinsNutricionalesSchema,
} from '../schemas';
import {
  TipoComida,
  SemaforoNutricional,
} from '../enums';

// Tipos inferidos de DTOs - Nutrición (Módulo 3)
export type FotoComidaInputDTO = z.infer<typeof FotoComidaInputSchema>;
export type CheckinNutricionalDTO = z.infer<typeof CheckinNutricionalSchema>;
export type MetasNutricionalesDTO = z.infer<typeof MetasNutricionalesSchema>;
export type RecursoNutricionalDTO = z.infer<typeof RecursoNutricionalSchema>;

/**
 * RF-002 RN-01: recurso educativo ya resuelto para lectura. `url` es la URL externa tal cual o
 * la URL firmada de la bóveda (presigned GET, TTL del proyecto) del archivo subido; queda `null`
 * si la firma falla o no hay bóveda configurada (degradación honesta, nunca un enlace fabricado).
 * `storageKey` solo está presente cuando el recurso es un archivo subido.
 */
export interface RecursoNutricionalDetalleDTO {
  titulo: string;
  url: string | null;
  storageKey: string | null;
}
export type FiltroCheckinsNutricionalesDTO = z.infer<typeof FiltroCheckinsNutricionalesSchema>;

export interface FotoComidaDetalleDTO {
  id: string;
  checkinId: string;
  tipoComida: TipoComida;
  storageKey: string;
  fotoUrl?: string | null;
  createdAtUtc: string;
}

export interface CheckinNutricionalDetalleDTO {
  id: string;
  alumnoId: string;
  fecha: string; // Formato YYYY-MM-DD
  semaforo: SemaforoNutricional;
  caloriasReportadas?: number | null;
  proteinaGramosReportada?: number | null;
  aguaLitros?: string | null; // Decimal string con hasta 2 decimales
  notasAlumno?: string | null;
  fotosPlatos: FotoComidaDetalleDTO[];
  alumnoNombre?: string;
  /**
   * LOTE API-N2: instante en que el alumno guardó el reporte en su teléfono (o la hora del servidor
   * si no la informó). `null` en reportes anteriores a este dato.
   */
  capturadoEnUtc?: string | null;
  /**
   * LOTE API-N2: copia de las metas del alumno vigentes al registrar el reporte. `null` si no tenía
   * metas o si el reporte es anterior a este dato (entonces se comparan las metas actuales).
   */
  metasVigentes?: MetasVigentesCheckinDTO | null;
  /** LOTE API-N2: zona horaria del perfil con la que se interpretan la fecha y la ventana. */
  zonaHoraria?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * LOTE API-N2: metas copiadas en cada reporte diario (las del alumno al registrar). `null` en un
 * objetivo = no estaba configurado.
 */
export interface MetasVigentesCheckinDTO {
  caloriasObjetivo: number | null;
  proteinaGramosObjetivo: number | null;
  carbohidratosGramosObjetivo: number | null;
  grasasGramosObjetivo: number | null;
  aguaLitrosObjetivo: string | null;
}

/**
 * RF-002 RN-01: metas nutricionales del coach para un alumno tal como las expone la API.
 * `null` en un objetivo significa "no configurado" (nunca 0 fabricado).
 */
export interface MetasNutricionalesDetalleDTO {
  id: string;
  alumnoId: string;
  caloriasObjetivo: number | null;
  proteinaGramosObjetivo: number | null;
  carbohidratosGramosObjetivo: number | null;
  grasasGramosObjetivo: number | null;
  aguaLitrosObjetivo: string | null;
  recursos: RecursoNutricionalDetalleDTO[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

/**
 * RF-002 Escenario 3: comparación de los totales reportados contra las metas del coach (±10%).
 * Si el alumno no tiene metas, o no reportó el total de una dimensión, esa dimensión no se
 * evalúa y el resultado queda sin marcar (campos `undefined`): "sin evaluar", nunca un falso OK.
 */
export interface ToleranciaNutricionalDTO {
  dentroMargenTolerancia?: boolean;
  desviacionCaloriasPct?: number;
  desviacionProteinasPct?: number;
}
