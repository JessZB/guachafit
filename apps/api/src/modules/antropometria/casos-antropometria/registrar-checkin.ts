import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { parsearContrato } from '../../../common/errores/parsear-contrato';
import { MENSAJE_ALUMNO_NO_ENCONTRADO, MENSAJE_SIN_ACCESO_ALUMNO } from '../../../common/mensajes-acceso';
import {
  controlesAntropometricos,
  fotosAntropometria,
  perfilesAlumno,
  usuarios,
} from '@guachafit/database';
import { eq } from '@guachafit/database';
import {
  Rol,
  Modalidad,
  OrigenAntropometria,
  EstadoMedicion,
  MENSAJE_FOTO_ANTROPOMETRIA_INVALIDA,
} from '@guachafit/shared';
import { CheckinAntropometricoSchema } from '@guachafit/shared';
import type {
  CheckinAntropometricoDTO,
  ControlAntropometricoDetalleDTO,
} from '@guachafit/shared';
import {
  construirMensajeFueraDeVentana,
  evaluarVentanaCheckinAntropometrico,
} from '../antropometria-periodicidad.util';
import { CheckinAntropometricoRecibidoEvent } from '../../notificaciones/events/eventos-notificacion';
import type { CallerAntropometria, ContextoAntropometria } from './contexto-antropometria';
import {
  contextoRlsDeCaller,
  esClaveFotoDelAlumno,
  resolverAliasPerimetros,
} from './antropometria-reglas';
import {
  TIPO_EVENTO_CHECKIN_RECIBIDO,
  LINK_COLA_ANTROPOMETRIA_COACH,
} from './antropometria-constantes';
import { obtenerControlPorIdInterno } from './hidratar-control';

// Re-exported so the facade keeps its public contract from a single place.
export { TIPO_EVENTO_CHECKIN_RECIBIDO, LINK_COLA_ANTROPOMETRIA_COACH };

/**
 * Registers an antropometric evaluation applying hybrid RBAC (ADR-001, RF-003):
 * - On-site (by Coach): verified on-site origin, approved state, immediate fechaAprobacionUtc.
 * - Remote (by Student): self-reported origin, pending-approval state, null fechaAprobacionUtc.
 * - On-site (by Student): 403 Forbidden (read-only).
 * - Remote (by Student) OUTSIDE the RN-04/§6 window: 400 with the real window detail.
 *
 * WU RF-003a: the window is evaluated ONLY for the student self-report and ONLY when
 * the coach already configured periodicity + anchor (without a calendar there is no
 * window and the previous behavior is kept). The timezone is the user's
 * (`usuarios.timezone`).
 */
export async function registrarCheckin(
  ctx: ContextoAntropometria,
  caller: CallerAntropometria,
  dto: CheckinAntropometricoDTO,
  customId?: string
): Promise<ControlAntropometricoDetalleDTO> {
  const validado = parsearContrato(CheckinAntropometricoSchema, dto);

  // RBAC primero: un alumno solo registra sus propias métricas (y su contexto RLS es self).
  if (caller.rol === Rol.ALUMNO && caller.id !== validado.alumnoId) {
    throw new ForbiddenException('No puedes registrar medidas para otro alumno.');
  }

  // RNF-001: cada foto debe ser un objeto de la bóveda de antropometría de ESTE alumno, con la
  // estructura que emite el presign. Sin esto, una clave ajena guardada en el control permitiría
  // leer la foto de otro alumno con la URL firmada de lectura.
  const fotoInvalida = (validado.fotos ?? []).some(
    (foto) => !esClaveFotoDelAlumno(foto.storageKey, validado.alumnoId)
  );
  if (fotoInvalida) {
    throw new BadRequestException(MENSAJE_FOTO_ANTROPOMETRIA_INVALIDA);
  }

  // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; lectura con el contexto del actor.
  const [alumno] = await ctx.withTenant(contextoRlsDeCaller(caller), (tx) =>
    tx
      .select()
      .from(perfilesAlumno)
      .where(eq(perfilesAlumno.usuarioId, validado.alumnoId))
      .limit(1)
  );

  if (!alumno) {
    throw new NotFoundException(MENSAJE_ALUMNO_NO_ENCONTRADO);
  }

  // Zona IANA del alumno para el día local del calendario (RN-01/RN-04). Es una consulta
  // independiente del perfil para no acoplar la hidratación al join.
  const [usuarioAlumno] = await ctx.db
    .select()
    .from(usuarios)
    .where(eq(usuarios.id, validado.alumnoId))
    .limit(1);

  let origen: OrigenAntropometria;
  let estado: EstadoMedicion;
  let registradoPor: string;
  let fechaAprobacionUtc: Date | null = null;
  const now = new Date();

  if (caller.rol === Rol.ALUMNO) {
    if (alumno.modalidad === Modalidad.PRESENCIAL) {
      throw new ForbiddenException(
        'Los alumnos en modalidad presencial no registran sus propias medidas: las toma tu entrenador y quedan verificadas.'
      );
    }

    // RN-04/§6: escritura remota habilitada SOLO dentro de la ventana activa del calendario.
    const ventana = evaluarVentanaCheckinAntropometrico({
      periodicidad: alumno.periodicidadAntropometria,
      antropometriaInicio: alumno.antropometriaInicio,
      timezone: usuarioAlumno?.timezone,
      ahora: now,
    });
    if (!ventana.permitido) {
      throw new BadRequestException(construirMensajeFueraDeVentana(ventana));
    }

    origen = OrigenAntropometria.REMOTO_AUTOREPORTE;
    estado = EstadoMedicion.PENDIENTE_APROBACION;
    registradoPor = caller.id;
    fechaAprobacionUtc = null;
  } else if (caller.rol === Rol.ENTRENADOR) {
    const coachId = caller.entrenadorId || caller.id;
    if (alumno.entrenadorId !== coachId) {
      throw new ForbiddenException(MENSAJE_SIN_ACCESO_ALUMNO);
    }
    origen = OrigenAntropometria.PRESENCIAL_VERIFICADO;
    estado = EstadoMedicion.APROBADO;
    registradoPor = caller.id;
    fechaAprobacionUtc = now;
  } else {
    throw new ForbiddenException('Rol no autorizado para registrar evaluaciones antropométricas.');
  }

  // RF-003 RN-02 (WU RF-003a): alias legados. `brazoCm` = brazo RELAJADO y `musloCm` = muslo
  // MEDIO; el payload nuevo tiene precedencia y el legado sigue funcionando (nunca ambos vacíos).
  const perimetro = validado.perimetros;
  const { brazoRelajadoCm, musloMedioCm } = resolverAliasPerimetros(perimetro);

  const controlId = await ctx.db.transaction(async (tx) => {
    const valuesToInsert: any = {
      alumnoId: validado.alumnoId,
      fechaEvaluacion: validado.fechaEvaluacion,
      pesoKg: validado.pesoKg,
      alturaCm: validado.alturaCm ?? null,
      porcentajeGrasa: validado.porcentajeGrasa ?? null,
      cuelloCm: perimetro?.cuelloCm ?? null,
      pechoCm: perimetro?.pechoCm ?? null,
      cinturaCm: perimetro?.cinturaCm ?? null,
      caderaCm: perimetro?.caderaCm ?? null,
      // Alias legados (compatibilidad de datos previos al RF-003a).
      brazoCm: brazoRelajadoCm,
      musloCm: musloMedioCm,
      // Modelo completo del RN-02.
      brazoRelajadoCm,
      brazoContraidoCm: perimetro?.brazoContraidoCm ?? null,
      musloMedioCm,
      pliegueTricepsMm: validado.pliegues?.tricepsMm ?? null,
      pliegueSubescapularMm: validado.pliegues?.subescapularMm ?? null,
      pliegueSuprailiacoMm: validado.pliegues?.suprailiacoMm ?? null,
      pliegueAbdominalMm: validado.pliegues?.abdominalMm ?? null,
      modalidad: alumno.modalidad,
      origen,
      registradoPor,
      estado,
      observacionesCoach: validado.observacionesCoach ?? null,
      motivoRechazo: null,
      fechaAprobacionUtc,
      createdAtUtc: now,
      updatedAtUtc: now,
    };

    if (customId) {
      valuesToInsert.id = customId;
    }

    const [inserted] = await tx
      .insert(controlesAntropometricos)
      .values(valuesToInsert)
      .returning();

    if (validado.fotos && validado.fotos.length > 0) {
      for (const f of validado.fotos) {
        await tx.insert(fotosAntropometria).values({
          controlId: inserted.id,
          angulo: f.angulo,
          storageKey: f.storageKey,
          createdAtUtc: now,
        });
      }
    }

    return inserted.id;
  });

  // RF-003 Escenario 2 (WU "RF-003 · cierre"): el autoreporte remoto queda `pendiente_aprobacion`
  // y el coach debe enterarse para revisarlo. Fire-and-forget (patrón de los emisores existentes:
  // `void emitAsync(...).catch(...)`): un fallo del bus no revierte un check-in ya persistido.
  // El registro presencial del coach NO emite: no hay nada que aprobar.
  if (origen === OrigenAntropometria.REMOTO_AUTOREPORTE) {
    const nombreAlumno = `${alumno.nombres} ${alumno.apellidos}`.trim();
    void ctx.eventEmitter
      .emitAsync(
        CheckinAntropometricoRecibidoEvent.NOMBRE,
        new CheckinAntropometricoRecibidoEvent({
          tipoEvento: TIPO_EVENTO_CHECKIN_RECIBIDO,
          destinatarioUserId: alumno.entrenadorId,
          entrenadorId: alumno.entrenadorId,
          categoria: 'ANTROPOMETRIA',
          titulo: 'Nuevo check-in pendiente de validación',
          cuerpo: `${nombreAlumno} envió su check-in antropométrico; revísalo.`,
          linkAccion: LINK_COLA_ANTROPOMETRIA_COACH,
          // RNF-004 §3: referencia determinista del control (jobId de push/email sin duplicados).
          referenciaId: `checkin_antropometrico_${controlId}`,
          datosAdicionales: {
            controlId,
            alumnoId: alumno.usuarioId,
            fechaEvaluacion: validado.fechaEvaluacion,
          },
          esCriticoSeguridad: false,
        })
      )
      .catch((error) =>
        ctx.logger.warn(
          `No se pudo avisar al coach del check-in remoto ${controlId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
  }

  return obtenerControlPorIdInterno(ctx, controlId);
}
