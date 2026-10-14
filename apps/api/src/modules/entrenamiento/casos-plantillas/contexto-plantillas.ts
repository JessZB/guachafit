import type { Logger } from '@nestjs/common';
import type { Database, WithTenantFn } from '@guachafit/database';

/**
 * Contexto de dependencias explícito de los casos de uso de plantillas (P2).
 * La fachada `PlantillasService` lo construye en su constructor; ningún caso de uso se
 * registra como provider de Nest.
 */
export interface ContextoPlantillas {
  db: Database;
  withTenant: WithTenantFn;
  logger: Logger;
}

// =============================================================================
// TIPOS INTERNOS DE FILA (Drizzle infiere las columnas; estos alias mantienen
// la firma de los helpers legible sin acoplar a los tests).
// =============================================================================
export interface PlantillaRow {
  id: string;
  entrenadorId: string;
  nombre: string;
  nivelObjetivo: string;
  bloques: unknown;
  activa: boolean;
  createdAtUtc: Date;
  updatedAtUtc: Date;
}

export interface PerfilAlumnoRow {
  id: string;
  usuarioId: string;
  entrenadorId: string;
}

export interface RutinaRow {
  id: string;
  alumnoId: string;
  entrenadorId: string;
  nombre: string;
  bloques: unknown;
  activa: boolean;
}
