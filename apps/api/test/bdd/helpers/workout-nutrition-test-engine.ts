import {
  EstadoSesion,
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

// =============================================================================
// MODELOS DE ESTADO EN MEMORIA (INVARIANTE DE DOMINIO - MÓDULO 3)
// =============================================================================

export interface SerieRegistroState {
  id: string;
  ejercicioSesionId: string;
  numeroSerie: number;
  repsObjetivo: number;
  repsLogradas: number | null;
  pesoKg: string | null;
  rpe: string | null;
  completada: boolean;
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
  porcentajeCumplimiento: string; // Decimal string con 2 decimales (ej. "80.00")
  notasAlumno?: string | null;
  ejercicios: EjercicioSesionState[];
  cumpleReglaRacha?: boolean;
}

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
      serie.timestampCompletadaUtc = serieInput.timestampCompletadaUtc ?? new Date().toISOString();
    }

    return sesion;
  }

  /**
   * Finalización de sesión y evaluación de regla de racha (RN-02).
   * Calcula porcentajeCumplimiento = (series completadas / series totales * 100).
   * Si >= 70% -> cumpleReglaRacha = true e incrementa racha en +1.
   * Si < 70%  -> cumpleReglaRacha = false y racha no se incrementa.
   */
  finalizarSesion(
    sesion: SesionEntrenamientoState,
    input: FinalizarSesionDTO,
    rachaActual: number
  ): {
    sesion: SesionEntrenamientoState;
    cumpleReglaRacha: boolean;
    nuevaRacha: number;
    duracionMinutos: number | null;
  } {
    const validado = FinalizarSesionSchema.parse(input);

    if (sesion.estado !== EstadoSesion.EN_PROGRESO) {
      throw new Error(
        `Operación denegada: No se puede finalizar una sesión que no esté 'en_progreso'. Estado actual: '${sesion.estado}'.`
      );
    }

    // Calcular volumen de series prescritas vs completadas
    let totalSeries = 0;
    let seriesCompletadas = 0;

    for (const ej of sesion.ejercicios) {
      for (const s of ej.series) {
        totalSeries++;
        if (s.completada) {
          seriesCompletadas++;
        }
      }
    }

    const porcentajeNumero = totalSeries > 0 ? (seriesCompletadas / totalSeries) * 100 : 0;
    const porcentajeCumplimientoStr = porcentajeNumero.toFixed(2);

    const cumpleReglaRacha = porcentajeNumero >= 70.0;
    const nuevaRacha = cumpleReglaRacha ? rachaActual + 1 : rachaActual;

    const fechaFinUtc = validado.fechaFinUtc ?? new Date().toISOString();
    if (!fechaFinUtc.endsWith('Z')) {
      throw new Error(`El timestamp de finalización '${fechaFinUtc}' debe terminar en 'Z' (UTC).`);
    }

    sesion.estado = EstadoSesion.COMPLETADA;
    sesion.fechaFinUtc = fechaFinUtc;
    sesion.porcentajeCumplimiento = porcentajeCumplimientoStr;
    sesion.cumpleReglaRacha = cumpleReglaRacha;
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
      nuevaRacha,
      duracionMinutos,
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
    if (sesionesPrescritas <= 0) {
      return {
        porcentajeCumplimientoSemanal: '0.00',
        semaforoAdherencia: SemaforoAdherencia.ROJO,
        nivelRiesgo: 'ALTO',
      };
    }

    const porcentaje = (sesionesCompletadas / sesionesPrescritas) * 100;
    const porcentajeStr = porcentaje.toFixed(2);

    // Regla RN-03: Inactividad > 4 días consecutivos fuerza automáticamente a ROJO
    if (diasInactivo > 4 || porcentaje < 50.0) {
      return {
        porcentajeCumplimientoSemanal: porcentajeStr,
        semaforoAdherencia: SemaforoAdherencia.ROJO,
        nivelRiesgo: 'ALTO',
      };
    }

    if (porcentaje >= 80.0) {
      return {
        porcentajeCumplimientoSemanal: porcentajeStr,
        semaforoAdherencia: SemaforoAdherencia.VERDE,
        nivelRiesgo: 'BAJO',
      };
    }

    // 50% <= porcentaje < 80%
    return {
      porcentajeCumplimientoSemanal: porcentajeStr,
      semaforoAdherencia: SemaforoAdherencia.AMARILLO,
      nivelRiesgo: 'MEDIO',
    };
  }
}

// =============================================================================
// MOTOR DE DOMINIO: CHECK-INS NUTRICIONALES (RF-002)
// =============================================================================

export interface MetasNutricionalesCoach {
  caloriasObjetivo: number;
  proteinaGramosObjetivo: number;
  aguaLitrosObjetivo?: string;
}

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

    // Comparación contra metas del coach si se configuraron (RF-002 Escenario 3: margen ±10%)
    let dentroMargenTolerancia: boolean | undefined = undefined;
    let desviacionCaloriasPct: number | undefined = undefined;
    let desviacionProteinasPct: number | undefined = undefined;

    if (
      metasCoach &&
      checkinState.caloriasReportadas !== null &&
      checkinState.proteinaGramosReportada !== null
    ) {
      const calReport = checkinState.caloriasReportadas;
      const calMeta = metasCoach.caloriasObjetivo;
      desviacionCaloriasPct = Math.round(((calReport - calMeta) / calMeta) * 10000) / 100;

      const protReport = checkinState.proteinaGramosReportada;
      const protMeta = metasCoach.proteinaGramosObjetivo;
      desviacionProteinasPct = Math.round(((protReport - protMeta) / protMeta) * 10000) / 100;

      const calEnMargen = Math.abs(desviacionCaloriasPct) <= 10.0;
      const protEnMargen = Math.abs(desviacionProteinasPct) <= 10.0;

      dentroMargenTolerancia = calEnMargen && protEnMargen;
    }

    return {
      checkin: checkinState,
      dentroMargenTolerancia,
      desviacionCaloriasPct,
      desviacionProteinasPct,
    };
  }

  obtenerCheckinPorFecha(alumnoId: string, fecha: string): CheckinNutricionalState | undefined {
    return this.checkinsPorAlumnoYFecha.get(this.buildKey(alumnoId, fecha));
  }

  limpiar(): void {
    this.checkinsPorAlumnoYFecha.clear();
  }
}
