import { ForbiddenException } from '@nestjs/common';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import {
  and,
  asc,
  count,
  desc,
  gte,
  lte,
  controlesAntropometricos,
  perfilesAlumno,
} from '@guachafit/database';
import { eq } from '@guachafit/database';
import { Rol, EstadoMedicion } from '@guachafit/shared';
import { FiltroEvolucionAntropometricaSchema } from '@guachafit/shared';
import { LIMITE_CONTROLES_EVOLUCION_POR_DEFECTO } from '@guachafit/shared';
import type {
  ControlAntropometricoDetalleDTO,
  EvolucionCorporalDTO,
  FiltroEvolucionAntropometricaDTO,
} from '@guachafit/shared';
import type { CallerAntropometria, ContextoAntropometria } from './contexto-antropometria';
import { hidratarControl } from './hidratar-control';

/**
 * Consulta el historial de evolución corporal multieje (RF-004).
 * Invariante ADR-001: Filtra estrictamente las evaluaciones en estado Aprobado.
 * Genera URLs firmadas GET con TTL de 15 min para cada foto.
 *
 * WU24b: `controlesTotal` es el COUNT real SIEMPRE presente y `totalEvaluaciones` conserva
 * ese mismo total (antes era `evaluaciones.length`; sin paginar el valor es idéntico).
 * `controlesLimit`/`controlesOffset` son OPT-IN: sin ellos la serie viene COMPLETA (contrato
 * de los charts del alumno) y con ellos el slice se resuelve con LIMIT/OFFSET en SQL.
 * Orden: `fechaEvaluacion` ascendente (cronológico actual) con desempate estable por
 * `createdAtUtc` e `id` para que `controlesOffset` no repita ni salte filas.
 */
export async function obtenerEvolucion(
  ctx: ContextoAntropometria,
  alumnoId: string,
  filtro?: FiltroEvolucionAntropometricaDTO,
  caller?: CallerAntropometria
): Promise<EvolucionCorporalDTO> {
  if (filtro) {
    parsearContrato(FiltroEvolucionAntropometricaSchema, filtro);
  }

  if (caller) {
    if (caller.rol === Rol.ALUMNO && caller.id !== alumnoId) {
      throw new ForbiddenException('Solo puedes ver tu propia evolución.');
    }
    if (caller.rol === Rol.ENTRENADOR) {
      const coachId = caller.entrenadorId || caller.id;
      // RNF-003/ADR-011 (etapa 3): lectura del perfil con el GUC del coach (RLS).
      const [perfil] = await ctx.withTenant({ entrenadorId: coachId }, (tx) =>
        tx
          .select()
          .from(perfilesAlumno)
          .where(eq(perfilesAlumno.usuarioId, alumnoId))
          .limit(1)
      );

      if (!perfil || perfil.entrenadorId !== coachId) {
        throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
      }
    }
  }

  const conditions = [
    eq(controlesAntropometricos.alumnoId, alumnoId),
    eq(controlesAntropometricos.estado, EstadoMedicion.APROBADO),
  ];

  if (filtro?.desde) {
    conditions.push(gte(controlesAntropometricos.fechaEvaluacion, filtro.desde));
  }
  if (filtro?.hasta) {
    conditions.push(lte(controlesAntropometricos.fechaEvaluacion, filtro.hasta));
  }
  if (filtro?.periodo && filtro.periodo !== 'todo' && !filtro.desde) {
    const now = new Date();
    let meses = 1;
    if (filtro.periodo === '3M') meses = 3;
    else if (filtro.periodo === '6M') meses = 6;
    else if (filtro.periodo === '1A') meses = 12;
    const fechaDesde = new Date(now.setMonth(now.getMonth() - meses)).toISOString().split('T')[0];
    conditions.push(gte(controlesAntropometricos.fechaEvaluacion, fechaDesde));
  }

  const whereEvolucion = and(...conditions);

  // WU24b: COUNT real en SQL para el total del envelope (independiente del slice).
  const [filaTotal] = await ctx.db
    .select({ total: count() })
    .from(controlesAntropometricos)
    .where(whereEvolucion);
  const totalControles = Number(filaTotal?.total ?? 0);

  // WU24b: paginación OPT-IN; sin parámetros la serie completa sigue siendo el default.
  const paginando = filtro?.controlesLimit !== undefined || filtro?.controlesOffset !== undefined;
  const controlesLimit = paginando
    ? filtro?.controlesLimit ?? LIMITE_CONTROLES_EVOLUCION_POR_DEFECTO
    : undefined;
  const controlesOffset = paginando ? filtro?.controlesOffset ?? 0 : 0;

  const queryEvolucion = ctx.db
    .select()
    .from(controlesAntropometricos)
    .where(whereEvolucion)
    .orderBy(
      asc(controlesAntropometricos.fechaEvaluacion),
      // WU24b: desempate estable para que `controlesOffset` no repita ni salte filas.
      asc(controlesAntropometricos.createdAtUtc),
      asc(controlesAntropometricos.id)
    );

  const rows = await (controlesLimit !== undefined
    ? queryEvolucion.limit(controlesLimit).offset(controlesOffset)
    : queryEvolucion);

  const evaluaciones: ControlAntropometricoDetalleDTO[] = await Promise.all(
    rows.map((row) => hidratarControl(ctx, row))
  );

  let cambioNetoPesoKg: string | null = null;
  let cambioNetoGrasaPorcentaje: string | null = null;

  // WU24b: los cambios netos se calculan sobre la SERIE COMPLETA (no la página) con dos
  // consultas ligeras de primera/última evaluación; así el valor no depende del slice.
  if (totalControles >= 1) {
    const [primera] = await ctx.db
      .select({
        pesoKg: controlesAntropometricos.pesoKg,
        porcentajeGrasa: controlesAntropometricos.porcentajeGrasa,
      })
      .from(controlesAntropometricos)
      .where(whereEvolucion)
      .orderBy(
        asc(controlesAntropometricos.fechaEvaluacion),
        asc(controlesAntropometricos.createdAtUtc),
        asc(controlesAntropometricos.id)
      )
      .limit(1);

    if (totalControles === 1) {
      cambioNetoPesoKg = '0.00';
      if (primera && primera.porcentajeGrasa !== null && primera.porcentajeGrasa !== undefined) {
        cambioNetoGrasaPorcentaje = '0.00';
      }
    } else {
      const [ultima] = await ctx.db
        .select({
          pesoKg: controlesAntropometricos.pesoKg,
          porcentajeGrasa: controlesAntropometricos.porcentajeGrasa,
        })
        .from(controlesAntropometricos)
        .where(whereEvolucion)
        .orderBy(
          desc(controlesAntropometricos.fechaEvaluacion),
          desc(controlesAntropometricos.createdAtUtc),
          desc(controlesAntropometricos.id)
        )
        .limit(1);

      if (primera && ultima) {
        cambioNetoPesoKg = (Number(ultima.pesoKg) - Number(primera.pesoKg)).toFixed(2);

        if (
          primera.porcentajeGrasa !== null &&
          primera.porcentajeGrasa !== undefined &&
          ultima.porcentajeGrasa !== null &&
          ultima.porcentajeGrasa !== undefined
        ) {
          cambioNetoGrasaPorcentaje = (
            Number(ultima.porcentajeGrasa) - Number(primera.porcentajeGrasa)
          ).toFixed(2);
        }
      }
    }
  }

  return {
    alumnoId,
    totalEvaluaciones: totalControles,
    controlesTotal: totalControles,
    evaluaciones,
    cambioNetoPesoKg,
    cambioNetoGrasaPorcentaje,
    rangoSeleccionado: filtro?.periodo ?? 'todo',
  };
}
