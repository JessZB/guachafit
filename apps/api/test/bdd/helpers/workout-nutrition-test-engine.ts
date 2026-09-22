import {
  EstadoSesion,
  MotivoOmision,
  TipoCierreSesion,
  SemaforoNutricional,
  TipoComida,
  SemaforoAdherencia,
  IniciarSesionSchema,
  IniciarSesionDTO,
  RegistrarSerieSchema,
  RegistrarSerieDTO,
  SincronizarSeriesBatchSchema,
  SincronizarSeriesBatchDTO,
  FinalizarSesionSchema,
  FinalizarSesionDTO,
  CheckinNutricionalSchema,
  CheckinNutricionalDTO,
  FotoComidaInputSchema,
  FotoComidaInputDTO,
  DECIMAL_STRING_REGEX,
} from '@guachafit/shared';
// D9: la lógica pura de RN-02/RN-03 NO se duplica en el test engine. Se importa y
// re-exporta desde el código real de producción para eliminar el riesgo de deriva:
// si la semántica cambia en src, estos tests fallan en lugar de enmascararlo.
import {
  evaluarCumplimientoRachaPorVolumen,
  actualizarRacha,
  calcularRachaEfectiva,
  type RachaEstado,
  type EvaluacionRacha,
} from '../../../src/modules/entrenamiento/entrenamiento.service';
import {
  evaluarAdherenciaSemanal,
  obtenerFechaLocalYyyyMmDd,
  fechaAnteriorYyyyMmDd,
} from '../../../src/common/adherencia.util';
// RF-002 (WU RF-002a): la tolerancia ±10% y la ventana horaria NO se re-implementan aquí; el
// engine importa y re-exporta el código real de producción (mismo criterio D9 que RN-02/RN-03
// de entrenamiento): si la semántica cambia en src, estos tests fallan en lugar de enmascararlo.
import {
  contarDiasNoReportados,
  enumerarFechasCalendario,
  evaluarToleranciaNutricional,
  evaluarVentanaCheckinNutricional,
  resolverTimezoneNutricion,
  sumarDiasCalendario,
  type MetasNutricionalesCoach,
  type ResultadoVentanaCheckinNutricional,
} from '../../../src/modules/nutricion/nutricion.service';

export {
  evaluarCumplimientoRachaPorVolumen,
  actualizarRacha,
  calcularRachaEfectiva,
  obtenerFechaLocalYyyyMmDd,
  fechaAnteriorYyyyMmDd,
  evaluarToleranciaNutricional,
  evaluarVentanaCheckinNutricional,
  resolverTimezoneNutricion,
  sumarDiasCalendario,
  enumerarFechasCalendario,
  contarDiasNoReportados,
};
export type { RachaEstado, EvaluacionRacha, MetasNutricionalesCoach, ResultadoVentanaCheckinNutricional };

// =============================================================================
// MODELOS DE ESTADO EN MEMORIA (INVARIANTE DE DOMINIO - MÓDULO 3)
// =============================================================================

export interface SerieRegistroState {
  id: string;
  ejercicioSesionId: string;
  numeroSerie: number;
  repsObjetivo: number;
  repsLogradas: number | null;
  /** Peso real levantado. */
  pesoKg: string | null;
  /** Peso prescrito por el coach (null si la prescripción es cualitativa o a peso corporal). */
  pesoPrescritoKg?: string | null;
  rpe: string | null;
  completada: boolean;
  /** WU17: marca real de inicio de la serie (ISO 8601 UTC); null/ausente si el alumno no la marcó. */
  timestampInicioUtc?: string | null;
  timestampCompletadaUtc: string | null;
}

export interface EjercicioSesionState {
  id: string;
  sesionId: string;
  ejercicioId: string;
  orden: number;
  notasCoach?: string | null;
  series: SerieRegistroState[];
}

export interface SesionEntrenamientoState {
  id: string;
  alumnoId: string;
  rutinaId?: string | null;
  fechaProgramada: string; // YYYY-MM-DD
  fechaInicioUtc: string | null; // ISO 8601 UTC ('Z')
  fechaFinUtc: string | null; // ISO 8601 UTC ('Z')
  timezoneCliente: string;
  estado: EstadoSesion;
  motivoOmision?: MotivoOmision | null;
  porcentajeCumplimiento: string; // Decimal string con 2 decimales (ej. "80.00")
  notasAlumno?: string | null;
  ejercicios: EjercicioSesionState[];
  cumpleReglaRacha?: boolean;
  rachaDias?: number;
  rachaUltimaFecha?: string | null;
}

// =============================================================================
// NOTA (D9): `evaluarCumplimientoRachaPorVolumen`, `actualizarRacha`,
// `calcularRachaEfectiva`, `obtenerFechaLocalYyyyMmDd` y `fechaAnteriorYyyyMmDd`
// se re-exportan arriba directamente desde `src/` — el engine no las reimplementa.
// =============================================================================

export interface FotoComidaState {
  id: string;
  checkinId: string;
  tipoComida: TipoComida;
  storageKey: string;
  createdAtUtc: string;
}

export interface CheckinNutricionalState {
  id: string;
  alumnoId: string;
  fecha: string; // YYYY-MM-DD
  semaforo: SemaforoNutricional;
  caloriasReportadas?: number | null;
  proteinaGramosReportada?: number | null;
  aguaLitros?: string | null;
  notasAlumno?: string | null;
  fotosPlatos: FotoComidaState[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

// =============================================================================
// MOTOR DE DOMINIO: SESIONES DE ENTRENAMIENTO & MONITOR SEMANAL (RF-001)
// =============================================================================

export class WorkoutTestEngine {
  /**
   * Consulta pasiva de rutina (RN-04): solo lectura.
   * La sesión permanece en 'planificada' y no se altera ningún timestamp.
   */
  consultarSesion(sesion: SesionEntrenamientoState): SesionEntrenamientoState {
    if (sesion.estado !== EstadoSesion.PLANIFICADA) {
      // Si ya estaba en otro estado, no lo altera, pero se certifica que la lectura no muta
      return { ...sesion };
    }
    return { ...sesion };
  }

  /**
   * Acción explícita 'Comenzar Entrenamiento' (RN-04, RN-05, ADR-002).
   * Transiciona a 'en_progreso', captura fechaInicioUtc en formato ISO 8601 UTC ('Z')
   * y almacena timezoneCliente.
   */
  iniciarSesion(sesion: SesionEntrenamientoState, input: IniciarSesionDTO): SesionEntrenamientoState {
    const validado = IniciarSesionSchema.parse(input);

    if (sesion.estado !== EstadoSesion.PLANIFICADA) {
      throw new Error(
        `Transición inválida: No se puede iniciar una sesión en estado '${sesion.estado}'. Solo se permite desde 'planificada'.`
      );
    }

    const fechaInicioUtc = validado.fechaInicioUtc ?? new Date().toISOString();

    // Verificación estricta de formato ISO 8601 UTC (ADR-002)
    if (!fechaInicioUtc.endsWith('Z')) {
      throw new Error(`El timestamp de inicio '${fechaInicioUtc}' debe estar en UTC estricto (terminar en 'Z').`);
    }

    sesion.estado = EstadoSesion.EN_PROGRESO;
    sesion.fechaInicioUtc = fechaInicioUtc;
    sesion.timezoneCliente = validado.timezoneCliente;

    return sesion;
  }

  /**
   * Registro de series y sincronización por lotes (RN-01, Batch Sync).
   * Valida repsLogradas, pesoKg (formato decimal 2 dígitos), rpe opcional, completada y timestamp.
   */
  sincronizarSeries(
    sesion: SesionEntrenamientoState,
    input: SincronizarSeriesBatchDTO
  ): SesionEntrenamientoState {
    const validado = SincronizarSeriesBatchSchema.parse(input);

    if (sesion.estado !== EstadoSesion.EN_PROGRESO) {
      throw new Error(
        `Operación denegada: Solo se pueden registrar series en sesiones con estado 'en_progreso'. Estado actual: '${sesion.estado}'.`
      );
    }

    // Mapa plano de series para búsqueda O(1)
    const seriesMap = new Map<string, SerieRegistroState>();
    for (const ej of sesion.ejercicios) {
      for (const s of ej.series) {
        seriesMap.set(s.id, s);
      }
    }

    for (const serieInput of validado.series) {
      const serie = seriesMap.get(serieInput.serieId);
      if (!serie) {
        throw new Error(`Serie con ID '${serieInput.serieId}' no pertenece a esta sesión de entrenamiento.`);
      }

      // Validar formato decimal de pesoKg
      if (!DECIMAL_STRING_REGEX.test(serieInput.pesoKg)) {
        throw new Error(
          `Formato de peso inválido: '${serieInput.pesoKg}'. Debe ser un string decimal con hasta 2 decimales.`
        );
      }

      serie.repsLogradas = serieInput.repsLogradas;
      serie.pesoKg = serieInput.pesoKg;
      serie.rpe = serieInput.rpe ?? null;
      serie.completada = serieInput.completada;
      // WU17: mismo contrato que el servicio real: solo se escribe si el cliente lo envía
      // (se conserva lo persistido en re-syncs que no traen la marca) y nunca se inventa.
      if (serieInput.timestampInicioUtc) {
        serie.timestampInicioUtc = serieInput.timestampInicioUtc;
      }
      serie.timestampCompletadaUtc = serieInput.timestampCompletadaUtc ?? new Date().toISOString();
    }

    return sesion;
  }

  /**
   * Finalización de sesión y evaluación de regla de racha (RN-02) por VOLUMEN.
   * `porcentajeCumplimiento` sigue siendo (series completadas / series totales * 100).
   * Si >= 70% del volumen/partes → cumpleReglaRacha = true y la racha se actualiza según
   * la fecha local (mismo día no duplica; ayer +1; gap reinicia a 1).
   * Cierre vacío (Escenario 5): exige `tipoCierre`; DESCANSADA/INCOMPLETA → OMITIDA sin racha.
   */
  finalizarSesion(
    sesion: SesionEntrenamientoState,
    input: FinalizarSesionDTO,
    racha: RachaEstado = { rachaDias: 0, rachaUltimaFecha: null }
  ): {
    sesion: SesionEntrenamientoState;
    cumpleReglaRacha: boolean;
    cumpleRacha: boolean;
    nuevaRacha: number;
    rachaDias: number;
    rachaUltimaFecha: string | null;
    duracionMinutos: number | null;
    motivoOmision: MotivoOmision | null;
  } {
    const validado = FinalizarSesionSchema.parse(input);

    if (sesion.estado !== EstadoSesion.EN_PROGRESO) {
      throw new Error(
        `Operación denegada: No se puede finalizar una sesión que no esté 'en_progreso'. Estado actual: '${sesion.estado}'.`
      );
    }

    // Calcular series totales, completadas y volumen
    const allSeries: SerieRegistroState[] = [];
    let seriesCompletadas = 0;

    for (const ej of sesion.ejercicios) {
      for (const s of ej.series) {
        allSeries.push(s);
        if (s.completada) seriesCompletadas++;
      }
    }

    const totalSeries = allSeries.length;
    const porcentajeNumero = totalSeries > 0 ? (seriesCompletadas / totalSeries) * 100 : 0;
    const porcentajeCumplimientoStr = porcentajeNumero.toFixed(2);

    // RF-001 Escenario 5: cierre vacío exige decisión explícita del alumno.
    if (seriesCompletadas === 0) {
      if (!validado.tipoCierre) {
        throw new Error(
          'La sesión no registra series completadas. Indica si el día fue descansado o incompleto.'
        );
      }
      if (validado.tipoCierre === TipoCierreSesion.COMPLETADA) {
        throw new Error(
          'No se puede cerrar como COMPLETADA una sesión sin series completadas. Indica si el día fue descansado o incompleto.'
        );
      }
    }

    const esOmision =
      validado.tipoCierre === TipoCierreSesion.DESCANSADA ||
      validado.tipoCierre === TipoCierreSesion.INCOMPLETA;
    const motivoOmision: MotivoOmision | null = esOmision
      ? validado.tipoCierre === TipoCierreSesion.DESCANSADA
        ? MotivoOmision.DESCANSO
        : MotivoOmision.INCOMPLETO
      : null;

    const fechaFinUtc = validado.fechaFinUtc ?? new Date().toISOString();
    if (!fechaFinUtc.endsWith('Z')) {
      throw new Error(`El timestamp de finalización '${fechaFinUtc}' debe terminar en 'Z' (UTC).`);
    }

    const evaluacion = evaluarCumplimientoRachaPorVolumen(allSeries);
    const cumpleReglaRacha = !esOmision && evaluacion.cumple;

    const fechaLocal = obtenerFechaLocalYyyyMmDd(fechaFinUtc, sesion.timezoneCliente);
    const rachaActualizada = actualizarRacha(racha, fechaLocal, cumpleReglaRacha);
    const nuevaRacha = calcularRachaEfectiva(
      rachaActualizada.rachaDias,
      rachaActualizada.rachaUltimaFecha,
      fechaLocal
    );

    sesion.estado = esOmision ? EstadoSesion.OMITIDA : EstadoSesion.COMPLETADA;
    sesion.motivoOmision = motivoOmision;
    sesion.fechaFinUtc = fechaFinUtc;
    sesion.porcentajeCumplimiento = porcentajeCumplimientoStr;
    sesion.cumpleReglaRacha = cumpleReglaRacha;
    sesion.rachaDias = rachaActualizada.rachaDias;
    sesion.rachaUltimaFecha = rachaActualizada.rachaUltimaFecha;
    if (validado.notasAlumno !== undefined) {
      sesion.notasAlumno = validado.notasAlumno;
    }

    // Calcular duración en minutos
    let duracionMinutos: number | null = null;
    if (sesion.fechaInicioUtc && sesion.fechaFinUtc) {
      const inicioMs = new Date(sesion.fechaInicioUtc).getTime();
      const finMs = new Date(sesion.fechaFinUtc).getTime();
      duracionMinutos = Math.max(0, Math.round((finMs - inicioMs) / (1000 * 60)));
    }

    return {
      sesion,
      cumpleReglaRacha,
      cumpleRacha: cumpleReglaRacha,
      nuevaRacha,
      rachaDias: rachaActualizada.rachaDias,
      rachaUltimaFecha: rachaActualizada.rachaUltimaFecha,
      duracionMinutos,
      motivoOmision,
    };
  }

  /**
   * Monitor de Adherencia Semanal del Coach (RN-03).
   * Evaluación de sesiones ejecutadas vs planificadas:
   * - Verde: >= 80% de sesiones completadas e inactividad <= 4 días.
   * - Amarillo: 50% - 79% de sesiones completadas e inactividad <= 4 días.
   * - Rojo: < 50% de sesiones completadas O inactividad > 4 días consecutivos.
   */
  evaluarAdherenciaSemanal(
    sesionesPrescritas: number,
    sesionesCompletadas: number,
    diasInactivo: number
  ): {
    porcentajeCumplimientoSemanal: string;
    semaforoAdherencia: SemaforoAdherencia;
    nivelRiesgo: 'ALTO' | 'MEDIO' | 'BAJO';
  } {
    // D9: delega en la función real compartida (adherencia.util.ts), sin duplicar umbrales.
    return evaluarAdherenciaSemanal(sesionesPrescritas, sesionesCompletadas, diasInactivo);
  }
}

// =============================================================================
// MOTOR DE DOMINIO: CHECK-INS NUTRICIONALES (RF-002)
// =============================================================================

export class NutricionTestEngine {
  // Almacén en memoria simulando índice único `uq_checkin_nutricional_diario(alumno_id, fecha)`
  private checkinsPorAlumnoYFecha = new Map<string, CheckinNutricionalState>();

  private buildKey(alumnoId: string, fecha: string): string {
    return `${alumnoId}:${fecha}`;
  }

  /**
   * Registra un check-in nutricional diario garantizando unicidad diaria,
   * validación de semáforo 1-Tap, hasta 4 fotos y totales opcionales con tolerancia (±10%).
   */
  registrarCheckin(
    alumnoId: string,
    input: CheckinNutricionalDTO,
    metasCoach?: MetasNutricionalesCoach
  ): {
    checkin: CheckinNutricionalState;
    dentroMargenTolerancia?: boolean;
    desviacionCaloriasPct?: number;
    desviacionProteinasPct?: number;
  } {
    // Validar contrato con Zod
    const payloadConAlumno = { ...input, alumnoId };
    const validado = CheckinNutricionalSchema.parse(payloadConAlumno);

    const key = this.buildKey(alumnoId, validado.fecha);

    // Unicidad diaria (RF-002, DDL constraint `uq_checkin_nutricional_diario`)
    if (this.checkinsPorAlumnoYFecha.has(key)) {
      throw new Error(
        `Violación de unicidad: Ya existe un check-in nutricional registrado para el alumno '${alumnoId}' en la fecha '${validado.fecha}'.`
      );
    }

    // Validar regla de máximo 4 fotos (RN-03)
    if (validado.fotosPlatos && validado.fotosPlatos.length > 4) {
      throw new Error('Regla RN-03 violada: No se permiten más de 4 fotografías de platos por día.');
    }

    const checkinId = `checkin-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();

    const fotos: FotoComidaState[] = (validado.fotosPlatos || []).map((f, idx) => ({
      id: `foto-${checkinId}-${idx + 1}`,
      checkinId,
      tipoComida: f.tipoComida,
      storageKey: f.storageKey,
      createdAtUtc: nowIso,
    }));

    const checkinState: CheckinNutricionalState = {
      id: checkinId,
      alumnoId,
      fecha: validado.fecha,
      semaforo: validado.semaforo,
      caloriasReportadas: validado.caloriasReportadas ?? null,
      proteinaGramosReportada: validado.proteinaGramosReportada ?? null,
      aguaLitros: validado.aguaLitros ?? null,
      notasAlumno: validado.notasAlumno ?? null,
      fotosPlatos: fotos,
      createdAtUtc: nowIso,
      updatedAtUtc: nowIso,
    };

    this.checkinsPorAlumnoYFecha.set(key, checkinState);

    // RF-002 Escenario 3: comparación contra las metas reales (margen ±10%) con la MISMA función
    // pura de producción; sin metas o sin totales no se evalúa (campos `undefined`).
    const tolerancia = evaluarToleranciaNutricional(
      checkinState.caloriasReportadas,
      checkinState.proteinaGramosReportada,
      metasCoach
    );

    return {
      checkin: checkinState,
      dentroMargenTolerancia: tolerancia.dentroMargenTolerancia,
      desviacionCaloriasPct: tolerancia.desviacionCaloriasPct,
      desviacionProteinasPct: tolerancia.desviacionProteinasPct,
    };
  }

  obtenerCheckinPorFecha(alumnoId: string, fecha: string): CheckinNutricionalState | undefined {
    return this.checkinsPorAlumnoYFecha.get(this.buildKey(alumnoId, fecha));
  }

  limpiar(): void {
    this.checkinsPorAlumnoYFecha.clear();
  }
}
