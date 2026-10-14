import { ejerciciosCatalogo, ejerciciosSesion, seriesRegistro, sesionesEntrenamiento } from '@guachafit/database';
import { EstadoSesion, extraerPesoKgDeTexto } from '@guachafit/shared';
import type { BloqueDiaRutinaDTO, SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import { resolverEjercicioDelCatalogo } from '../catalogo-ejercicios';
import type { ContextoEntrenamiento } from './contexto-entrenamiento';
import { hidratarSesion } from './hidratar-sesion';
import { normalizarRpePrescrito, resumirPrescripcionParaAlumno } from './reglas-racha';

// ---------------------------------------------------------------------------
// INSTANCIACIÓN DE SESIÓN DESDE BLOQUE DE RUTINA
// (Movido sin cambios desde `EntrenamientoService.instanciarSesionDesdeBloque`.)
// ---------------------------------------------------------------------------

/**
 * Helper atómico para crear e hidratar una sesión a partir de un bloque de rutina.
 */
export async function instanciarSesionDesdeBloque(
  ctx: ContextoEntrenamiento,
  alumnoId: string,
  rutinaId: string,
  entrenadorId: string,
  bloque: BloqueDiaRutinaDTO,
  fechaProgramada: string,
  timezoneCliente: string,
  esDiaDescansoOriginal: boolean
): Promise<SesionEntrenamientoDetalleDTO | null> {
  const { db } = ctx;
  if (!bloque.ejercicios || bloque.ejercicios.length === 0) {
    return null;
  }

  const nuevaSesionId = crypto.randomUUID();
  const ahora = new Date();

  const [nuevaSesion] = await db
    .insert(sesionesEntrenamiento)
    .values({
      id: nuevaSesionId,
      alumnoId,
      rutinaId,
      bloqueId: bloque.diaId,
      esDiaDescansoOriginal,
      fechaProgramada,
      timezoneCliente,
      estado: EstadoSesion.PLANIFICADA,
      porcentajeCumplimiento: '0.00',
      volumenTotalKg: '0.00',
      createdAtUtc: ahora,
      updatedAtUtc: ahora,
    })
    .returning();

  for (let i = 0; i < bloque.ejercicios.length; i++) {
    const ej = bloque.ejercicios[i];
    // El ejercicio se resuelve SOLO en el catálogo visible para el coach de la
    // rutina (global o propio). Un id o un nombre que apunte al ejercicio privado de otro coach
    // no se enlaza: se usa (o se crea) uno del propio coach con ese nombre.
    let ejercicioCatalogoId = (
      await resolverEjercicioDelCatalogo(db, entrenadorId, ej.ejercicioId, ej.nombre)
    )?.id;
    if (!ejercicioCatalogoId && ej.ejercicioId) {
      ejercicioCatalogoId = (
        await resolverEjercicioDelCatalogo(db, entrenadorId, undefined, ej.nombre)
      )?.id;
    }

    if (!ejercicioCatalogoId) {
      const [creado] = await db
        .insert(ejerciciosCatalogo)
        .values({
          id: crypto.randomUUID(),
          entrenadorId,
          nombre: ej.nombre,
          grupoMuscular: 'GENERAL',
          activo: true,
          createdAtUtc: ahora,
        })
        .returning();
      ejercicioCatalogoId = creado.id;
    }

    const ejSesionId = crypto.randomUUID();
    await db.insert(ejerciciosSesion).values({
      id: ejSesionId,
      sesionId: nuevaSesionId,
      ejercicioId: ejercicioCatalogoId,
      orden: i + 1,
      notasCoach: resumirPrescripcionParaAlumno(bloque.titulo, ej),
      notasTecnicas: ej.notas?.trim() || null,
      rpePrescrito: normalizarRpePrescrito(ej.rpe),
      descansoPrescritoSegundos: ej.descansoSegundos || 90,
    });

    const numSeries = Math.max(1, ej.series || 3);
    const repsMatch = (ej.reps || '10').match(/\d+/);
    const targetReps = repsMatch ? parseInt(repsMatch[0], 10) : 10;
    // Prescripción cualitativa (ej. "Moderado"): NO materializar 0.00.
    // Se persiste null en peso_prescrito_kg y el texto se conserva en notasCoach.
    // Mismo número que valida el contrato (primer número, con coma o punto decimal).
    const pesoKg = extraerPesoKgDeTexto(ej.peso || '');
    const targetPesoPrescrito = pesoKg !== null ? pesoKg.toFixed(2) : null;
    const targetRpe = normalizarRpePrescrito(ej.rpe);

    for (let s = 1; s <= numSeries; s++) {
      await db.insert(seriesRegistro).values({
        id: crypto.randomUUID(),
        ejercicioSesionId: ejSesionId,
        numeroSerie: s,
        repsObjetivo: targetReps,
        repsLogradas: null,
        // `pesoKg` es el peso real (se registra al sincronizar); lo prescrito va aparte.
        pesoKg: null,
        pesoPrescritoKg: targetPesoPrescrito,
        rpe: targetRpe,
        completada: false,
      });
    }
  }

  // RNF-003/ADR-011 (etapa 3): contexto self del alumno para el perfil (RLS).
  return hidratarSesion(ctx, nuevaSesion, { usuarioId: nuevaSesion.alumnoId });
}
