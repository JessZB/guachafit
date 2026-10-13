import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from '@guachafit/database';
import { rutinas, sesionesEntrenamiento } from '@guachafit/database';
import { EstadoSesion } from '@guachafit/shared';
import type {
  BloqueDiaRutinaDTO,
  EntrenarBloqueHoyDTO,
  IniciarSesionDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { calcularRangoSemanaIso, obtenerDiaSugeridoBloque } from '../../../common/adherencia.util';
import type { ContextoEntrenamiento } from './contexto';
import { hidratarSesion } from './hidratar-sesion';
import { instanciarSesionDesdeBloque } from './instanciar-sesion-desde-bloque';

// ---------------------------------------------------------------------------
// ENTRENAR BLOQUE HOY (ACCIÓN EXPLÍCITA RN-04)
// (Movido sin cambios desde `EntrenamientoService.ejecutarEntrenarBloqueHoy`.
// El inicio anidado sigue pasando por el método público `iniciarSesion` de la
// fachada —incluida su idempotencia— vía `deps.iniciarSesion`, igual que antes
// vía `this.iniciarSesion`.)
// ---------------------------------------------------------------------------

export interface DependenciasEntrenarBloqueHoy {
  iniciarSesion: (
    sesionId: string,
    alumnoId: string,
    input: IniciarSesionDTO
  ) => Promise<SesionEntrenamientoDetalleDTO>;
}

export async function ejecutarEntrenarBloqueHoy(
  ctx: ContextoEntrenamiento,
  deps: DependenciasEntrenarBloqueHoy,
  alumnoId: string,
  bloqueId: string,
  input: EntrenarBloqueHoyDTO = {}
): Promise<SesionEntrenamientoDetalleDTO> {
  const { db, withTenant } = ctx;
  if (!bloqueId || !bloqueId.trim()) {
    throw new BadRequestException('Elige qué día quieres entrenar.');
  }

  const tz = input.timezoneCliente || 'America/Caracas';
  let hoyStr: string;
  try {
    hoyStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    hoyStr = new Date().toISOString().split('T')[0];
  }

  const { isoDay } = calcularRangoSemanaIso(hoyStr);

  // Tenancy: la rutina se busca SIEMPRE por el usuario autenticado.
  // RNF-003/ADR-009: la lectura corre con el GUC del alumno (política self_select).
  const [rutinaActiva] = await withTenant({ usuarioId: alumnoId }, async (tx) =>
    tx
      .select()
      .from(rutinas)
      .where(
        and(
          eq(rutinas.alumnoId, alumnoId),
          eq(rutinas.activa, true)
        )
      )
      .orderBy(desc(rutinas.createdAtUtc))
      .limit(1)
  );

  if (!rutinaActiva || !Array.isArray(rutinaActiva.bloques) || rutinaActiva.bloques.length === 0) {
    throw new NotFoundException('No tienes una rutina activa asignada.');
  }

  const bloques = rutinaActiva.bloques as BloqueDiaRutinaDTO[];
  const bloqueTarget = bloques.find((b) => b.diaId === bloqueId);
  if (!bloqueTarget) {
    throw new NotFoundException('Este día ya no está en tu rutina. Actualiza la pantalla.');
  }
  if (!bloqueTarget.ejercicios || bloqueTarget.ejercicios.length === 0) {
    throw new BadRequestException('El bloque seleccionado no tiene ejercicios prescritos.');
  }

  const sesionesHoy = await db
    .select()
    .from(sesionesEntrenamiento)
    .where(
      and(
        eq(sesionesEntrenamiento.alumnoId, alumnoId),
        eq(sesionesEntrenamiento.fechaProgramada, hoyStr)
      )
    )
    .orderBy(desc(sesionesEntrenamiento.createdAtUtc));

  // Un entrenamiento en progreso de OTRO bloque bloquea el cambio (evita dos sesiones activas).
  const enProgresoOtro = sesionesHoy.find(
    (s) => s.estado === EstadoSesion.EN_PROGRESO && s.bloqueId !== bloqueId
  );
  if (enProgresoOtro) {
    throw new ConflictException(
      'Tienes un entrenamiento en progreso. Finalízalo antes de entrenar otro bloque hoy.'
    );
  }

  // Reutiliza una sesión viva (planificada o en progreso) del mismo bloque; nunca la recrea.
  const sesionViva = sesionesHoy.find(
    (s) =>
      s.bloqueId === bloqueId &&
      (s.estado === EstadoSesion.PLANIFICADA || s.estado === EstadoSesion.EN_PROGRESO)
  );

  if (sesionViva) {
    if (input.iniciarInmediato && sesionViva.estado === EstadoSesion.PLANIFICADA) {
      return deps.iniciarSesion(sesionViva.id, alumnoId, { timezoneCliente: tz });
    }
    // RNF-003/ADR-011 (etapa 3): contexto self del alumno para el perfil (RLS).
    return hidratarSesion(ctx, sesionViva, { usuarioId: sesionViva.alumnoId });
  }

  // Sin sesión viva: crear una nueva (repetición de COMPLETADA/OMITIDA o primer acceso del bloque).
  const bloquePrescritoParaHoy = bloques.find(
    (b, idx) => obtenerDiaSugeridoBloque(b, idx) === isoDay
  );
  const creada = await instanciarSesionDesdeBloque(
    ctx,
    alumnoId,
    rutinaActiva.id,
    rutinaActiva.entrenadorId,
    bloqueTarget,
    hoyStr,
    tz,
    !bloquePrescritoParaHoy
  );
  if (!creada) {
    throw new BadRequestException('No se pudo instanciar la sesión del bloque seleccionado.');
  }

  if (input.iniciarInmediato) {
    return deps.iniciarSesion(creada.id, alumnoId, { timezoneCliente: tz });
  }
  return creada;
}
