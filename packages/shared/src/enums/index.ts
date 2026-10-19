// =============================================================================
// ENUMS DE DOMINIO Y CONTRATOS COMPARTIDOS - GUACHAFIT
// Fuente de verdad: 03_Dominio/ y 05_Arquitectura/02_Esquema_Base_de_Datos_PostgreSQL.md
// =============================================================================

export enum Rol {
  SUPERADMIN = 'superadmin',
  ENTRENADOR = 'entrenador',
  ALUMNO = 'alumno',
}

export enum EstadoUsuario {
  ACTIVO = 'activo',
  INACTIVO = 'inactivo',
  BLOQUEADO = 'bloqueado',
}

export enum EstadoLicencia {
  ACTIVA = 'activa',
  SUSPENDIDA_SUPERADMIN = 'suspendida_superadmin',
}

export enum TipoDocumento {
  V = 'V_',
  E = 'E_',
  PASAPORTE = 'PASAPORTE',
}

export enum EstadoAlumno {
  ACTIVO = 'activo',
  INACTIVO_PAUSADO = 'inactivo_pausado',
  SUSPENDIDO_PAGO = 'suspendido_pago',
}

export enum Modalidad {
  PRESENCIAL = 'presencial',
  REMOTO = 'remoto',
}

export enum EstadoSesion {
  PLANIFICADA = 'planificada',
  EN_PROGRESO = 'en_progreso',
  COMPLETADA = 'completada',
  OMITIDA = 'omitida',
}

/**
 * RF-001 Escenario 5: decisión explícita del alumno al cerrar una sesión sin series completadas.
 * COMPLETADA se rechaza si no hay series; DESCANSADA/INCOMPLETA marcan la sesión como OMITIDA.
 */
export enum TipoCierreSesion {
  COMPLETADA = 'COMPLETADA',
  DESCANSADA = 'DESCANSADA',
  INCOMPLETA = 'INCOMPLETA',
}

/**
 * Motivo persistido cuando una sesión se cierra como OMITIDA (RF-001 Escenario 5).
 */
export enum MotivoOmision {
  DESCANSO = 'DESCANSO',
  INCOMPLETO = 'INCOMPLETO',
}

export enum SemaforoNutricional {
  CUMPLIDO = 'cumplido',
  PARCIAL = 'parcial',
  NO_CUMPLIDO = 'no_cumplido',
}

/**
 * RF-002 §6: estado DERIVADO del calendario nutricional de un día.
 *
 * Los tres primeros valores replican `SemaforoNutricional` (el estado PERSISTIDO del check-in);
 * `NO_REPORTADO` nunca se persiste: se calcula cuando el día ya cerró (pasadas las 23:59 locales)
 * y el alumno no registró el semáforo. El día no penaliza la racha de entrenamiento.
 */
export enum EstadoDiaNutricional {
  CUMPLIDO = 'cumplido',
  PARCIAL = 'parcial',
  NO_CUMPLIDO = 'no_cumplido',
  NO_REPORTADO = 'no_reportado',
}

export enum TipoComida {
  DESAYUNO = 'desayuno',
  ALMUERZO = 'almuerzo',
  CENA = 'cena',
  SNACK = 'snack',
}

export enum OrigenAntropometria {
  PRESENCIAL_VERIFICADO = 'presencial_verificado',
  REMOTO_AUTOREPORTE = 'remoto_autoreporte',
}

export enum EstadoMedicion {
  PENDIENTE_APROBACION = 'pendiente_aprobacion',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
}

export enum AnguloFoto {
  FRONTAL = 'frontal',
  LATERAL = 'lateral',
  POSTERIOR = 'posterior',
}

export enum PeriodoEvolucion {
  UN_MES = '1M',
  TRES_MESES = '3M',
  SEIS_MESES = '6M',
  UN_ANIO = '1A',
  TODO = 'todo',
}

/**
 * RF-003 RN-01 (precondición 2): periodicidad configurable del check-in antropométrico por alumno.
 *
 * El entrenador la fija en la ficha del alumno; el calendario se ancla en una fecha de inicio y el
 * recordatorio de las 06:00 locales se dispara en cada fecha programada (ver
 * `antropometria-periodicidad.util.ts` del API).
 */
export enum PeriodicidadAntropometria {
  SEMANAL = 'semanal',
  QUINCENAL = 'quincenal',
  MENSUAL = 'mensual',
}

export enum ModuloUpload {
  ANTROPOMETRIA = 'antropometria',
  COMIDAS = 'comidas',
  COMPROBANTES = 'comprobantes',
  /** RF-002 RN-01: PDFs de recursos educativos del coach (una clave por alumno). */
  NUTRICION_RECURSOS = 'nutricion-recursos',
}

export enum EstadoCuota {
  EMITIDA = 'emitida',
  ABONADA_PARCIAL = 'abonada_parcial',
  /**
   * RF-008 §4.A: faltan entre 5 y 1 días para `fecha_corte_utc` y la cuota no está saldada.
   * El barrido diario (WU-H) es el único productor real de este estado en producción.
   */
  POR_VENCER = 'por_vencer',
  AL_DIA = 'al_dia',
  PENDIENTE_REVISION = 'pendiente_revision',
  VENCIDA = 'vencida',
  ANULADA = 'anulada',
}

export enum Moneda {
  USD = 'USD',
  VES = 'VES',
}

export enum MetodoPago {
  PAGO_MOVIL = 'pago_movil',
  TRANSFERENCIA_BANCARIA = 'transferencia_bancaria',
  EFECTIVO_USD = 'efectivo_usd',
  EFECTIVO_VES = 'efectivo_ves',
  ZELLE = 'zelle',
  BINANCE_USDT = 'binance_usdt',
  OTRO = 'otro',
}

export enum EstadoConciliacion {
  PENDIENTE = 'pendiente',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
  /** RF-007: pago aprobado por error que el entrenador revirtió (queda en el historial). */
  REVERTIDO = 'revertido',
}

export enum PlataformaDispositivo {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

export enum TemaUi {
  SYSTEM = 'system',
  DARK = 'dark',
  LIGHT = 'light',
}

export { TemaUi as TemaUI };

export enum SemaforoAdherencia {
  VERDE = 'verde',
  AMARILLO = 'amarillo',
  ROJO = 'rojo',
}

/**
 * RF-017 RN-01: nivel objetivo de una plantilla de rutina reutilizable
 * del banco del entrenador.
 */
export enum NivelObjetivoPlantilla {
  PRINCIPIANTE = 'principiante',
  INTERMEDIO = 'intermedio',
  AVANZADO = 'avanzado',
}

/**
 * RF-017 RN-03: sobrescritura guiada al asignar una plantilla a la rutina de un alumno.
 * REEMPLAZAR sustituye la rutina activa; FUSIONAR anexa los días a los bloques existentes.
 */
export enum ModoAsignacionPlantilla {
  REEMPLAZAR = 'REEMPLAZAR',
  FUSIONAR = 'FUSIONAR',
}

/**
 * Lote Mis alumnos (2026-10-19): orden del directorio de alumnos del entrenador, aplicado en SQL
 * antes de la paginación. `ALTA_RECIENTE` es el default y conserva el orden histórico.
 */
export enum OrdenDirectorioAlumnos {
  ALTA_RECIENTE = 'alta_reciente',
  NOMBRE = 'nombre',
  SIN_ENTRENAR = 'sin_entrenar',
  MAYOR_RACHA = 'mayor_racha',
}
