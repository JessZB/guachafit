import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import { controlesAntropometricos, perfilesAlumno } from '@guachafit/database';
import { eq } from '@guachafit/database';
import { EstadoMedicion } from '@guachafit/shared';
import { ConciliarAntropometriaSchema } from '@guachafit/shared';
import type {
  ConciliarAntropometriaDTO,
  ControlAntropometricoDetalleDTO,
} from '@guachafit/shared';
import type { ContextoAntropometria } from './contexto-antropometria';
import { MENSAJE_CONTROL_NO_ENCONTRADO } from './antropometria-reglas';
import { obtenerControlPorIdInterno } from './hidratar-control';

/**
 * Conciliación de check-in remoto por el entrenador (aprobación o rechazo con motivo obligatorio).
 */
export async function conciliarControl(
  ctx: ContextoAntropometria,
  coachId: string,
  controlId: string,
  dto: ConciliarAntropometriaDTO
): Promise<ControlAntropometricoDetalleDTO> {
  const validado = parsearContrato(ConciliarAntropometriaSchema, dto);

  const [control] = await ctx.db
    .select()
    .from(controlesAntropometricos)
    .where(eq(controlesAntropometricos.id, controlId))
    .limit(1);

  if (!control) {
    throw new NotFoundException(MENSAJE_CONTROL_NO_ENCONTRADO);
  }

  // RNF-003/ADR-011 (etapa 3): lectura del perfil con el GUC del coach (RLS).
  const [alumno] = await ctx.withTenant({ entrenadorId: coachId }, (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, control.alumnoId))
      .limit(1)
  );

  if (!alumno || alumno.entrenadorId !== coachId) {
    throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
  }

  const now = new Date();
  let nuevoEstado: EstadoMedicion;
  let fechaAprobacionUtc: Date | null = null;
  let motivoRechazo: string | null = null;

  if (validado.accion === 'aprobar') {
    nuevoEstado = EstadoMedicion.APROBADO;
    fechaAprobacionUtc = now;
    motivoRechazo = null;
  } else if (validado.accion === 'rechazar') {
    if (!validado.motivoRechazo || validado.motivoRechazo.trim().length === 0) {
      throw new BadRequestException('El motivo de rechazo es obligatorio al rechazar una evaluación antropométrica.');
    }
    nuevoEstado = EstadoMedicion.RECHAZADO;
    fechaAprobacionUtc = null;
    motivoRechazo = validado.motivoRechazo;
  } else {
    throw new BadRequestException('Acción no reconocida.');
  }

  await ctx.db
    .update(controlesAntropometricos)
    .set({
      estado: nuevoEstado,
      fechaAprobacionUtc,
      motivoRechazo,
      observacionesCoach:
        validado.observacionesCoach !== undefined ? validado.observacionesCoach : control.observacionesCoach,
      updatedAtUtc: now,
    })
    .where(eq(controlesAntropometricos.id, controlId));

  return obtenerControlPorIdInterno(ctx, controlId);
}
