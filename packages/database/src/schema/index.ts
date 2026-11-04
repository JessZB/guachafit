import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  pgEnum,
  jsonb,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  Rol,
  EstadoUsuario,
  EstadoLicencia,
  TipoDocumento,
  EstadoAlumno,
  Modalidad,
  EstadoSesion,
  MotivoOmision,
  SemaforoNutricional,
  TipoComida,
  OrigenAntropometria,
  EstadoMedicion,
  AnguloFoto,
  EstadoCuota,
  Moneda,
  MetodoPago,
  EstadoConciliacion,
  PlataformaDispositivo,
  TemaUi,
  BloqueDiaRutinaDTO,
  NivelObjetivoPlantilla,
  RecursoNutricionalDTO,
  MetasVigentesCheckinDTO,
  PeriodicidadAntropometria,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';

// =============================================================================
// ENUMS POSTGRESQL
// =============================================================================
export const rolEnum = pgEnum('enum_rol', [Rol.SUPERADMIN, Rol.ENTRENADOR, Rol.ALUMNO]);
export const estadoUsuarioEnum = pgEnum('enum_estado_usuario', [
  EstadoUsuario.ACTIVO,
  EstadoUsuario.INACTIVO,
  EstadoUsuario.BLOQUEADO,
]);
export const estadoLicenciaEnum = pgEnum('enum_estado_licencia', [
  EstadoLicencia.ACTIVA,
  EstadoLicencia.SUSPENDIDA_SUPERADMIN,
]);
export const tipoDocumentoEnum = pgEnum('enum_tipo_documento', [
  TipoDocumento.V,
  TipoDocumento.E,
  TipoDocumento.PASAPORTE,
]);
export const estadoAlumnoEnum = pgEnum('enum_estado_alumno', [
  EstadoAlumno.ACTIVO,
  EstadoAlumno.INACTIVO_PAUSADO,
  EstadoAlumno.SUSPENDIDO_PAGO,
]);
export const modalidadEnum = pgEnum('enum_modalidad', [Modalidad.PRESENCIAL, Modalidad.REMOTO]);
export const plataformaDispositivoEnum = pgEnum('enum_plataforma_dispositivo', [
  PlataformaDispositivo.IOS,
  PlataformaDispositivo.ANDROID,
  PlataformaDispositivo.WEB,
]);
export const estadoSesionEnum = pgEnum('enum_estado_sesion', [
  EstadoSesion.PLANIFICADA,
  EstadoSesion.EN_PROGRESO,
  EstadoSesion.COMPLETADA,
  EstadoSesion.OMITIDA,
]);
export const motivoOmisionEnum = pgEnum('enum_motivo_omision', [
  MotivoOmision.DESCANSO,
  MotivoOmision.INCOMPLETO,
]);
export const semaforoNutricionalEnum = pgEnum('enum_semaforo_nutricional', [
  SemaforoNutricional.CUMPLIDO,
  SemaforoNutricional.PARCIAL,
  SemaforoNutricional.NO_CUMPLIDO,
]);
export const tipoComidaEnum = pgEnum('enum_tipo_comida', [
  TipoComida.DESAYUNO,
  TipoComida.ALMUERZO,
  TipoComida.CENA,
  TipoComida.SNACK,
]);
export const origenAntropometriaEnum = pgEnum('enum_origen_antropometria', [
  OrigenAntropometria.PRESENCIAL_VERIFICADO,
  OrigenAntropometria.REMOTO_AUTOREPORTE,
]);
export const estadoMedicionEnum = pgEnum('enum_estado_medicion', [
  EstadoMedicion.PENDIENTE_APROBACION,
  EstadoMedicion.APROBADO,
  EstadoMedicion.RECHAZADO,
]);
export const anguloFotoEnum = pgEnum('enum_angulo_foto', [
  AnguloFoto.FRONTAL,
  AnguloFoto.LATERAL,
  AnguloFoto.POSTERIOR,
]);
/** RF-003 RN-01 (precondición 2): periodicidad configurable del check-in antropométrico. */
export const periodicidadAntropometriaEnum = pgEnum('enum_periodicidad_antropometria', [
  PeriodicidadAntropometria.SEMANAL,
  PeriodicidadAntropometria.QUINCENAL,
  PeriodicidadAntropometria.MENSUAL,
]);
export const estadoCuotaEnum = pgEnum('enum_estado_cuota', [
  EstadoCuota.EMITIDA,
  EstadoCuota.ABONADA_PARCIAL,
  EstadoCuota.POR_VENCER,
  EstadoCuota.AL_DIA,
  EstadoCuota.PENDIENTE_REVISION,
  EstadoCuota.VENCIDA,
  EstadoCuota.ANULADA,
]);
export const monedaEnum = pgEnum('enum_moneda', [Moneda.USD, Moneda.VES]);
export const metodoPagoEnum = pgEnum('enum_metodo_pago', [
  MetodoPago.PAGO_MOVIL,
  MetodoPago.TRANSFERENCIA_BANCARIA,
  MetodoPago.EFECTIVO_USD,
  MetodoPago.EFECTIVO_VES,
  MetodoPago.ZELLE,
  MetodoPago.BINANCE_USDT,
  MetodoPago.OTRO,
]);
export const estadoConciliacionEnum = pgEnum('enum_estado_conciliacion', [
  EstadoConciliacion.PENDIENTE,
  EstadoConciliacion.APROBADO,
  EstadoConciliacion.RECHAZADO,
  EstadoConciliacion.REVERTIDO,
]);
/** RF-017 RN-01: nivel objetivo de una plantilla de rutina del banco del coach. */
export const nivelObjetivoPlantillaEnum = pgEnum('enum_nivel_objetivo_plantilla', [
  NivelObjetivoPlantilla.PRINCIPIANTE,
  NivelObjetivoPlantilla.INTERMEDIO,
  NivelObjetivoPlantilla.AVANZADO,
]);

// =============================================================================
// TABLA: usuarios (IAM)
// =============================================================================
export const usuarios = pgTable('usuarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  rol: rolEnum('rol').notNull(),
  estado: estadoUsuarioEnum('estado').default(EstadoUsuario.ACTIVO).notNull(),
  tokenInvitacionHash: varchar('token_invitacion_hash', { length: 64 }),
  tokenInvitacionExpira: timestamp('token_invitacion_expira', { withTimezone: true }),
  // Recuperación de contraseña: solo se guarda el hash SHA-256 del token de un solo uso (vence en
  // 1 hora), así una filtración de la BD no da enlaces válidos. Un único token vigente: pedir uno
  // nuevo lo reemplaza, salvo que el vigente tenga menos de 15 minutos (no se rota).
  tokenRecuperacionHash: varchar('token_recuperacion_hash', { length: 64 }),
  tokenRecuperacionExpira: timestamp('token_recuperacion_expira', { withTimezone: true }),
  // Instante del último restablecimiento de contraseña. El refresh rechaza los tokens
  // emitidos antes (cierra las sesiones abiertas en su siguiente renovación).
  passwordCambiadaEn: timestamp('password_cambiada_en', { withTimezone: true }),
  // RF-018 RN-05: cambio de correo pendiente de confirmar. Solo se guarda el hash SHA-256 del
  // enlace de un solo uso (vence en 24 horas); hasta confirmarlo se sigue entrando con `email`.
  correoPendiente: varchar('correo_pendiente', { length: 255 }),
  tokenCambioCorreoHash: varchar('token_cambio_correo_hash', { length: 64 }),
  tokenCambioCorreoExpira: timestamp('token_cambio_correo_expira', { withTimezone: true }),
  ultimoAccesoUtc: timestamp('ultimo_acceso_utc', { withTimezone: true }),
  timezone: varchar('timezone', { length: 64 }).default('America/Caracas').notNull(),
  temaUi: varchar('tema_ui', { length: 10 }).default('system').notNull(),
  activo: boolean('activo').default(true).notNull(),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// TABLA: perfiles_entrenador (Tenant Owner)
// =============================================================================
export const perfilesEntrenador = pgTable('perfiles_entrenador', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' })
    .unique(),
  nombres: varchar('nombres', { length: 100 }).notNull(),
  apellidos: varchar('apellidos', { length: 100 }).notNull(),
  nombreComercial: varchar('nombre_comercial', { length: 150 }),
  coachCode: varchar('coach_code', { length: 15 }).notNull().unique(),
  capacidadMaxima: integer('capacidad_maxima').default(50).notNull(),
  tasaCambioGlobal: numeric('tasa_cambio_global', { precision: 12, scale: 4 })
    .default('65.0000')
    .notNull(),
  telefonoContacto: varchar('telefono_contacto', { length: 30 }).notNull(),
  estadoLicencia: estadoLicenciaEnum('estado_licencia').default(EstadoLicencia.ACTIVA).notNull(),
  /**
   * D17: interruptor de captación por enlace. `false` = el enlace deja de admitir registros nuevos
   * (la web y la API responden como si el código no existiera). No afecta al alta manual.
   */
  captacionActiva: boolean('captacion_activa').default(true).notNull(),
  /**
   * D17: instante de la última rotación del `coach_code`. `null` = nunca rotado. Delimita el
   * contador de registros del enlace vigente (`registrosPorEnlace`).
   */
  enlaceRotadoEnUtc: timestamp('enlace_rotado_en_utc', { withTimezone: true }),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// TABLA: perfiles_alumno (Ficha Deportiva/Médica con RLS)
// =============================================================================
export const perfilesAlumno = pgTable(
  'perfiles_alumno',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' })
      .unique(),
    entrenadorId: uuid('entrenador_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    tipoDocumento: tipoDocumentoEnum('tipo_documento').default(TipoDocumento.V).notNull(),
    numeroDocumento: varchar('numero_documento', { length: 30 }).notNull(),
    nombres: varchar('nombres', { length: 100 }).notNull(),
    apellidos: varchar('apellidos', { length: 100 }).notNull(),
    fechaNacimiento: date('fecha_nacimiento').notNull(),
    telefonoWhatsapp: varchar('telefono_whatsapp', { length: 30 }).notNull(),
    fichaSaludPrivada: text('ficha_salud_privada'),
    estadoActivacion: estadoAlumnoEnum('estado_activacion')
      .default(EstadoAlumno.ACTIVO)
      .notNull(),
    modalidad: modalidadEnum('modalidad').default(Modalidad.PRESENCIAL).notNull(),
    /**
     * RF-003 RN-01 (WU RF-003a): periodicidad configurable del check-in antropométrico del alumno.
     * NULL = sin calendario (no hay fechas programadas ni recordatorio de las 06:00).
     */
    periodicidadAntropometria: periodicidadAntropometriaEnum('periodicidad_antropometria'),
    /** Ancla (YYYY-MM-DD, día local del alumno) del calendario de periodicidad antropométrica. */
    antropometriaInicio: date('antropometria_inicio'),
    tasaFijadaOverride: numeric('tasa_fijada_override', { precision: 12, scale: 4 }),
    /** RF-001 RN-02: racha de días consecutivos con cumplimiento >= 70% del volumen prescrito. */
    rachaDias: integer('racha_dias').default(0).notNull(),
    /** Última fecha local (YYYY-MM-DD) en la que se incrementó la racha. */
    rachaUltimaFecha: date('racha_ultima_fecha'),
    /**
     * LOTE API-N2 (RF-002): zona horaria IANA del alumno. Decide la ventana del reporte nutricional
     * (18:00–23:59) y el plazo de recepción (12:00 del día siguiente). La app valida el valor.
     */
    zonaHoraria: varchar('zona_horaria', { length: 64 })
      .default(ZONA_HORARIA_ALUMNO_POR_DEFECTO)
      .notNull(),
    /**
     * ADR-025 (ZH-1): `true` cuando la zona del perfil ya es una decisión (precarga única del
     * dispositivo en el primer acceso, o cambio explícito del alumno/entrenador). Los alumnos
     * existentes nacen en `true` por la migración; solo los nuevos arrancan en `false`.
     */
    zonaHorariaDefinida: boolean('zona_horaria_definida').default(false).notNull(),
    /**
     * M5-L1 (RF-005 / RF-008): suscripción del alumno. Las cuotas se emiten solas a partir de ella.
     * - `plan_suscrito_id`: plan asignado (NULL = sin plan, no se emiten cuotas).
     * - `ciclo_ancla`: día local de inicio; fija el día de vencimiento de cada ciclo.
     * - `proximo_corte`: vencimiento (día local) de la próxima cuota a emitir.
     */
    planSuscritoId: uuid('plan_suscrito_id').references(() => planesMembresia.id, {
      onDelete: 'restrict',
    }),
    cicloAncla: date('ciclo_ancla'),
    proximoCorte: date('proximo_corte'),
    /**
     * RF-006 RN-05: saldo a favor del alumno (USD). Recibe el excedente de un pago aprobado o
     * cobrado por encima de la deuda y se descuenta solo al emitirse la próxima cuota. La
     * restricción `ck_perfiles_alumno_saldo_a_favor_no_negativo` (>= 0) está en la migración 0019.
     */
    saldoAFavorUsd: numeric('saldo_a_favor_usd', { precision: 14, scale: 2 })
      .default('0.00')
      .notNull(),
    /**
     * D17: cómo nació el perfil. `manual` = alta por el entrenador; `enlace` = autorregistro por el
     * enlace de captación. El CHECK `ck_perfiles_alumno_origen_registro` vive en la migración 0025.
     */
    origenRegistro: varchar('origen_registro', { length: 16 }).default('manual').notNull(),
    deletedAtUtc: timestamp('deleted_at_utc', { withTimezone: true }),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    docUnique: uniqueIndex('uq_alumno_documento_entrenador').on(
      table.tipoDocumento,
      table.numeroDocumento,
      table.entrenadorId
    ),
    activosIndex: index('idx_alumnos_activos').on(table.entrenadorId, table.estadoActivacion),
  })
);

// =============================================================================
// TABLA: preferencias_notificacion
// =============================================================================
/**
 * RF-015 (N2a): matriz de preferencias por rol y canal. Una fila por usuario con la matriz COMPLETA
 * (los 16 booleanos); el rol (`usuarios.rol`) decide qué mitad gobierna cada usuario y el
 * despachador enruta cada evento por la fila de su categoría.
 *
 * Defaults: replican `PREFERENCIAS_NOTIFICACION_POR_DEFECTO` de `@guachafit/shared` (RF-015 §A/§B).
 * RN-01: `notify_seguridad_email` es obligatorio; el CHECK lo blinda también a nivel de base de datos.
 */
export const preferenciasNotificacion = pgTable(
  'preferencias_notificacion',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' })
      .unique(),
    // §A Alumno / Cliente
    notifyPaymentsPush: boolean('notify_payments_push').default(true).notNull(),
    notifyPaymentsEmail: boolean('notify_payments_email').default(true).notNull(),
    notifyWorkoutsPush: boolean('notify_workouts_push').default(true).notNull(),
    notifyWorkoutsEmail: boolean('notify_workouts_email').default(false).notNull(),
    notifyCheckinsPush: boolean('notify_checkins_push').default(true).notNull(),
    notifyCheckinsEmail: boolean('notify_checkins_email').default(false).notNull(),
    // §A Seguridad de Cuenta (RN-01: el Email no puede desactivarse)
    notifySeguridadPush: boolean('notify_seguridad_push').default(false).notNull(),
    notifySeguridadEmail: boolean('notify_seguridad_email').default(true).notNull(),
    // §B Entrenador
    notifyCobranzasPush: boolean('notify_cobranzas_push').default(true).notNull(),
    notifyCobranzasEmail: boolean('notify_cobranzas_email').default(true).notNull(),
    notifyNuevosRegistrosPush: boolean('notify_nuevos_registros_push').default(true).notNull(),
    notifyNuevosRegistrosEmail: boolean('notify_nuevos_registros_email').default(true).notNull(),
    notifyReportesProgresoPush: boolean('notify_reportes_progreso_push').default(true).notNull(),
    notifyReportesProgresoEmail: boolean('notify_reportes_progreso_email').default(false).notNull(),
    digestWeeklyPush: boolean('digest_weekly_push').default(false).notNull(),
    digestWeeklyEmail: boolean('digest_weekly_email').default(true).notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    /** RN-01 (RF-015 §A): el correo de seguridad es inviolable, también a nivel de BD. */
    seguridadEmailObligatorio: check(
      'preferencias_notificacion_seguridad_email_obligatorio',
      sql`${table.notifySeguridadEmail}`
    ),
  })
);

// =============================================================================
// TABLA: dispositivos_usuario
// =============================================================================
export const dispositivosUsuario = pgTable('dispositivos_usuario', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  deviceToken: varchar('device_token', { length: 255 }).notNull().unique(),
  platform: plataformaDispositivoEnum('platform').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// TABLA: notificaciones_in_app
// =============================================================================
export const notificacionesInApp = pgTable('notificaciones_in_app', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  titulo: varchar('titulo', { length: 100 }).notNull(),
  cuerpo: text('cuerpo').notNull(),
  tipoEvento: varchar('tipo_evento', { length: 50 }).notNull(),
  leida: boolean('leida').default(false).notNull(),
  linkAccion: varchar('link_accion', { length: 255 }),
  /**
   * RF-003 §6 / RNF-004 §3: referencia de origen del evento (`referenciaId` del payload).
   * Permite a los barridos idempotentes pre-chequear su propio aviso (p. ej. la expiración de la
   * ventana antropométrica deduplica por `alumno + fecha programada`). No se expone en la API.
   */
  referenciaId: varchar('referencia_id', { length: 255 }),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// TABLA: auditoria_accesos_denegados (RF-003 Escenario 3)
// =============================================================================
/**
 * RF-003 Escenario 3: log mínimo de intentos de mutación no autorizados.
 *
 * Lo escriben los guards (`RolesGuard` y `AlumnoHabilitadoGuard`) de forma best-effort cuando
 * deniegan una petición: un fallo al auditar NUNCA cambia la respuesta 403. Solo guarda metadatos
 * mínimos de la petición — sin payloads, cuerpos ni PII adicional.
 */
export const auditoriaAccesosDenegados = pgTable('auditoria_accesos_denegados', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Usuario autenticado que intentó la operación; `null` si la petición era anónima. */
  usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
  rol: varchar('rol', { length: 30 }),
  ruta: varchar('ruta', { length: 255 }).notNull(),
  metodo: varchar('metodo', { length: 10 }).notNull(),
  motivo: varchar('motivo', { length: 100 }).notNull(),
  fechaUtc: timestamp('fecha_utc', { withTimezone: true }).defaultNow().notNull(),
});

// =============================================================================
// TABLAS: entrenamiento & ejercicios
// =============================================================================
export const ejerciciosCatalogo = pgTable('ejercicios_catalogo', {
  id: uuid('id').defaultRandom().primaryKey(),
  entrenadorId: uuid('entrenador_id').references(() => usuarios.id, { onDelete: 'cascade' }),
  nombre: varchar('nombre', { length: 120 }).notNull(),
  grupoMuscular: varchar('grupo_muscular', { length: 60 }).notNull(),
  patronMovimiento: varchar('patron_movimiento', { length: 60 }),
  videoUrl: text('video_url'),
  activo: boolean('activo').default(true).notNull(),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * RF-017: banco de plantillas de rutina reutilizables del entrenador.
 * Replica el patrón de `rutinas`: bloques de días/ejercicios en JSONB tipado con
 * `BloqueDiaRutinaDTO` para que la asignación sea una copia profunda fiel.
 */
export const plantillasRutina = pgTable(
  'plantillas_rutina',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entrenadorId: uuid('entrenador_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    nombre: varchar('nombre', { length: 120 }).notNull(),
    nivelObjetivo: nivelObjetivoPlantillaEnum('nivel_objetivo').notNull(),
    bloques: jsonb('bloques').$type<BloqueDiaRutinaDTO[]>().notNull(),
    activa: boolean('activa').default(true).notNull(),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    entrenadorActivaIndex: index('idx_plantillas_entrenador_activa').on(
      table.entrenadorId,
      table.activa
    ),
  })
);

export const rutinas = pgTable('rutinas', {
  id: uuid('id').defaultRandom().primaryKey(),
  alumnoId: uuid('alumno_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  entrenadorId: uuid('entrenador_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  nombre: varchar('nombre', { length: 120 }).default('Planificación Semanal').notNull(),
  bloques: jsonb('bloques').$type<BloqueDiaRutinaDTO[]>().notNull(),
  activa: boolean('activa').default(true).notNull(),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

export const sesionesEntrenamiento = pgTable('sesiones_entrenamiento', {
  id: uuid('id').defaultRandom().primaryKey(),
  alumnoId: uuid('alumno_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  rutinaId: uuid('rutina_id'),
  fechaProgramada: date('fecha_programada').notNull(),
  fechaInicioUtc: timestamp('fecha_inicio_utc', { withTimezone: true }),
  fechaFinUtc: timestamp('fecha_fin_utc', { withTimezone: true }),
  timezoneCliente: varchar('timezone_cliente', { length: 64 }).default('America/Caracas').notNull(),
  estado: estadoSesionEnum('estado').default(EstadoSesion.PLANIFICADA).notNull(),
  /** Motivo cuando la sesión se cierra como OMITIDA (RF-001 Escenario 5). */
  motivoOmision: motivoOmisionEnum('motivo_omision'),
  porcentajeCumplimiento: numeric('porcentaje_cumplimiento', { precision: 5, scale: 2 })
    .default('0.00')
    .notNull(),
  volumenTotalKg: numeric('volumen_total_kg', { precision: 8, scale: 2 })
    .default('0.00')
    .notNull(),
  bloqueId: varchar('bloque_id', { length: 64 }),
  esDiaDescansoOriginal: boolean('es_dia_descanso_original').default(false).notNull(),
  notasAlumno: text('notas_alumno'),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    /** Lote Mis alumnos: último entrenamiento completado por alumno (subconsulta del directorio). */
    alumnoEstadoFinIndex: index('idx_sesiones_alumno_estado_fin').on(
      table.alumnoId,
      table.estado,
      table.fechaFinUtc
    ),
  })
);

export const ejerciciosSesion = pgTable('ejercicios_sesion', {
  id: uuid('id').defaultRandom().primaryKey(),
  sesionId: uuid('sesion_id')
    .notNull()
    .references(() => sesionesEntrenamiento.id, { onDelete: 'cascade' }),
  ejercicioId: uuid('ejercicio_id')
    .notNull()
    .references(() => ejerciciosCatalogo.id, { onDelete: 'restrict' }),
  orden: integer('orden').default(1).notNull(),
  notasCoach: text('notas_coach'),
  /** RF-017 RN-01: indicaciones técnicas del coach para el ejercicio. */
  notasTecnicas: text('notas_tecnicas'),
  /** Esfuerzo prescrito (1-10). `series_registro.rpe` guarda el real del alumno. */
  rpePrescrito: numeric('rpe_prescrito', { precision: 3, scale: 1 }),
  descansoPrescritoSegundos: integer('descanso_prescrito_segundos').default(90).notNull(),
});

export const seriesRegistro = pgTable('series_registro', {
  id: uuid('id').defaultRandom().primaryKey(),
  ejercicioSesionId: uuid('ejercicio_sesion_id')
    .notNull()
    .references(() => ejerciciosSesion.id, { onDelete: 'cascade' }),
  numeroSerie: integer('numero_serie').notNull(),
  repsObjetivo: integer('reps_objetivo').notNull(),
  repsLogradas: integer('reps_logradas'),
  /** Peso real levantado (se sobrescribe al sincronizar). */
  pesoKg: numeric('peso_kg', { precision: 6, scale: 2 }),
  /** Peso prescrito por el coach (null si la prescripción es cualitativa o al peso corporal). */
  pesoPrescritoKg: numeric('peso_prescrito_kg', { precision: 6, scale: 2 }),
  rpe: numeric('rpe', { precision: 3, scale: 1 }),
  descansoSegundos: integer('descanso_segundos'),
  completada: boolean('completada').default(false).notNull(),
  /**
   * WU17: marca real de INICIO de la serie (cuando el alumno interactúa con ella o pulsa
   * "Iniciar serie"). `descanso_segundos` sigue siendo el valor del temporizador (objetivo);
   * el descanso real se deriva: inicio(serie N+1) - completada(serie N). Nullable: sin marca
   * no se inventa medición.
   */
  timestampInicioUtc: timestamp('timestamp_inicio_utc', { withTimezone: true }),
  timestampCompletadaUtc: timestamp('timestamp_completada_utc', { withTimezone: true }),
});

// =============================================================================
// TABLAS: nutricion
// =============================================================================
export const checkinsNutricionales = pgTable(
  'checkins_nutricionales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    alumnoId: uuid('alumno_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    fecha: date('fecha').notNull(),
    semaforo: semaforoNutricionalEnum('semaforo').notNull(),
    caloriasReportadas: integer('calorias_reportadas'),
    proteinaGramosReportada: integer('proteina_gramos_reportada'),
    aguaLitros: numeric('agua_litros', { precision: 4, scale: 2 }),
    notasAlumno: varchar('notas_alumno', { length: 280 }),
    /**
     * LOTE API-N2: instante en que el alumno guardó el reporte en su teléfono (captura offline
     * tardía) o la hora del servidor si no la informó. NULL en reportes anteriores.
     */
    capturadoEnUtc: timestamp('capturado_en_utc', { withTimezone: true }),
    /** LOTE API-N2: copia de las metas vigentes al registrar. NULL sin metas o en reportes anteriores. */
    metasVigentes: jsonb('metas_vigentes').$type<MetasVigentesCheckinDTO>(),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueDiario: uniqueIndex('uq_checkin_nutricional_diario').on(table.alumnoId, table.fecha),
  })
);

export const fotosComida = pgTable('fotos_comida', {
  id: uuid('id').defaultRandom().primaryKey(),
  checkinId: uuid('checkin_id')
    .notNull()
    .references(() => checkinsNutricionales.id, { onDelete: 'cascade' }),
  tipoComida: tipoComidaEnum('tipo_comida').notNull(),
  storageKey: varchar('storage_key', { length: 255 }).notNull(),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * RF-002 RN-01: metas nutricionales que el coach fija para UN alumno (una fila por alumno).
 *
 * - Los objetivos son opcionales ("no configurado" = NULL, nunca 0 fabricado). El coach puede
 *   fijar solo calorías, solo macros, o una pauta general con recursos educativos.
 * - `recursos` persiste los enlaces educativos del coach (PDFs de listas de compras / distribución
 *   de comidas) tipados con el contrato compartido.
 * - Decisión de asociación (RF §3 Precondición 1: "los objetivos nutricionales del cliente"):
 *   por ALUMNO, no por plan de membresía; el plan es comercial y el RF no lo menciona.
 */
export const metasNutricionales = pgTable(
  'metas_nutricionales',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    alumnoId: uuid('alumno_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    caloriasObjetivo: integer('calorias_objetivo'),
    proteinaGramosObjetivo: integer('proteina_gramos_objetivo'),
    carbohidratosGramosObjetivo: integer('carbohidratos_gramos_objetivo'),
    grasasGramosObjetivo: integer('grasas_gramos_objetivo'),
    aguaLitrosObjetivo: numeric('agua_litros_objetivo', { precision: 4, scale: 2 }),
    recursos: jsonb('recursos').$type<RecursoNutricionalDTO[]>().default([]).notNull(),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueAlumno: uniqueIndex('uq_meta_nutricional_alumno').on(table.alumnoId),
  })
);

// =============================================================================
// TABLAS: antropometria
// =============================================================================
export const controlesAntropometricos = pgTable('controles_antropometricos', {
  id: uuid('id').defaultRandom().primaryKey(),
  alumnoId: uuid('alumno_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  fechaEvaluacion: date('fecha_evaluacion').notNull(),
  pesoKg: numeric('peso_kg', { precision: 5, scale: 2 }).notNull(),
  alturaCm: numeric('altura_cm', { precision: 5, scale: 2 }),
  porcentajeGrasa: numeric('porcentaje_grasa', { precision: 4, scale: 2 }),
  cuelloCm: numeric('cuello_cm', { precision: 5, scale: 2 }),
  pechoCm: numeric('pecho_cm', { precision: 5, scale: 2 }),
  cinturaCm: numeric('cintura_cm', { precision: 5, scale: 2 }),
  caderaCm: numeric('cadera_cm', { precision: 5, scale: 2 }),
  /** Alias legado del brazo relajado (WU previos al RF-003a); se conserva por compatibilidad. */
  brazoCm: numeric('brazo_cm', { precision: 5, scale: 2 }),
  /** Alias legado del muslo medio (WU previos al RF-003a); se conserva por compatibilidad. */
  musloCm: numeric('muslo_cm', { precision: 5, scale: 2 }),
  /** RF-003 RN-02 (WU RF-003a): perímetros completos del modelo de medidas. */
  brazoRelajadoCm: numeric('brazo_relajado_cm', { precision: 5, scale: 2 }),
  brazoContraidoCm: numeric('brazo_contraido_cm', { precision: 5, scale: 2 }),
  musloMedioCm: numeric('muslo_medio_cm', { precision: 5, scale: 2 }),
  /** RF-003 RN-02 (WU RF-003a): pliegues cutáneos en milímetros. */
  pliegueTricepsMm: numeric('pliegue_triceps_mm', { precision: 5, scale: 2 }),
  pliegueSubescapularMm: numeric('pliegue_subescapular_mm', { precision: 5, scale: 2 }),
  pliegueSuprailiacoMm: numeric('pliegue_suprailiaco_mm', { precision: 5, scale: 2 }),
  pliegueAbdominalMm: numeric('pliegue_abdominal_mm', { precision: 5, scale: 2 }),
  modalidad: modalidadEnum('modalidad').notNull(),
  origen: origenAntropometriaEnum('origen').notNull(),
  registradoPor: uuid('registrado_por')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'restrict' }),
  estado: estadoMedicionEnum('estado').default(EstadoMedicion.PENDIENTE_APROBACION).notNull(),
  observacionesCoach: text('observaciones_coach'),
  motivoRechazo: text('motivo_rechazo'),
  fechaAprobacionUtc: timestamp('fecha_aprobacion_utc', { withTimezone: true }),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

export const fotosAntropometria = pgTable(
  'fotos_antropometria',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    controlId: uuid('control_id')
      .notNull()
      .references(() => controlesAntropometricos.id, { onDelete: 'cascade' }),
    angulo: anguloFotoEnum('angulo').notNull(),
    storageKey: varchar('storage_key', { length: 255 }).notNull(),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueAngulo: uniqueIndex('uq_control_angulo').on(table.controlId, table.angulo),
  })
);

// =============================================================================
// TABLAS: finanzas & ledger
// =============================================================================
export const planesMembresia = pgTable('planes_membresia', {
  id: uuid('id').defaultRandom().primaryKey(),
  entrenadorId: uuid('entrenador_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'restrict' }),
  nombre: varchar('nombre', { length: 60 }).notNull(),
  descripcion: text('descripcion'),
  beneficios: jsonb('beneficios').default([]).notNull(),
  precioBaseUsd: numeric('precio_base_usd', { precision: 14, scale: 2 }).notNull(),
  duracionMeses: integer('duracion_meses').default(1).notNull(),
  activo: boolean('activo').default(true).notNull(),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

export const overridesClientePlan = pgTable(
  'overrides_cliente_plan',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => planesMembresia.id, { onDelete: 'cascade' }),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    precioAcordadoUsd: numeric('precio_acordado_usd', { precision: 14, scale: 2 }),
    tasaFijadaOverride: numeric('tasa_fijada_override', { precision: 12, scale: 4 }),
    beneficiosPersonalizados: jsonb('beneficios_personalizados'),
    motivoOverride: text('motivo_override'),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueOverride: uniqueIndex('uq_override_plan_cliente').on(table.planId, table.clienteId),
  })
);

export const cuotasMembresia = pgTable(
  'cuotas_membresia',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    entrenadorId: uuid('entrenador_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => planesMembresia.id, { onDelete: 'restrict' }),
    periodo: varchar('periodo', { length: 7 }).notNull(),
    montoTotalUsd: numeric('monto_total_usd', { precision: 14, scale: 2 }).notNull(),
    montoAbonadoUsd: numeric('monto_abonado_usd', { precision: 14, scale: 2 })
      .default('0.00')
      .notNull(),
    saldoPendienteUsd: numeric('saldo_pendiente_usd', { precision: 14, scale: 2 }).notNull(),
    /** RF-006 RN-05: parte de `monto_abonado_usd` que salió del saldo a favor al emitirse. */
    saldoAFavorAplicadoUsd: numeric('saldo_a_favor_aplicado_usd', { precision: 14, scale: 2 })
      .default('0.00')
      .notNull(),
    fechaEmisionUtc: timestamp('fecha_emision_utc', { withTimezone: true }).notNull(),
    fechaCorteUtc: timestamp('fecha_corte_utc', { withTimezone: true }).notNull(),
    estado: estadoCuotaEnum('estado').default(EstadoCuota.EMITIDA).notNull(),
    notas: text('notas'),
    /** RF-008: anulación (terminal) por el entrenador dueño, con motivo obligatorio. */
    motivoAnulacion: text('motivo_anulacion'),
    fechaAnulacionUtc: timestamp('fecha_anulacion_utc', { withTimezone: true }),
    anuladaPor: uuid('anulada_por').references(() => usuarios.id, { onDelete: 'restrict' }),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // RF-008: una sola cuota VIGENTE por alumno, plan y periodo. Las anuladas no ocupan el periodo:
    // anular, quitar el plan y reasignarlo con el mismo plan debe poder emitir la cuota corregida.
    uniqueCuota: uniqueIndex('uq_cuota_cliente_plan_periodo')
      .on(table.clienteId, table.planId, table.periodo)
      .where(sql`${table.estado} <> 'anulada'`),
  })
);

export const transaccionesPago = pgTable(
  'transacciones_pago',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cuotaId: uuid('cuota_id')
      .notNull()
      .references(() => cuotasMembresia.id, { onDelete: 'restrict' }),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    entrenadorId: uuid('entrenador_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    registradoPor: uuid('registrado_por')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    montoOriginal: numeric('monto_original', { precision: 14, scale: 2 }).notNull(),
    monedaOriginal: monedaEnum('moneda_original').notNull(),
    tasaCambioFijada: numeric('tasa_cambio_fijada', { precision: 12, scale: 4 }).notNull(),
    montoEquivalenteUsd: numeric('monto_equivalente_usd', { precision: 14, scale: 2 }).notNull(),
    /**
     * RF-006 RN-05: parte del pago aprobado que excedió el saldo de la cuota y pasó al saldo a
     * favor del alumno (`monto_equivalente_usd` sigue siendo todo el dinero recibido).
     */
    excedenteUsd: numeric('excedente_usd', { precision: 14, scale: 2 }).default('0.00').notNull(),
    metodoPago: metodoPagoEnum('metodo_pago').notNull(),
    referenciaBancaria: varchar('referencia_bancaria', { length: 64 }),
    fechaOperacion: date('fecha_operacion').notNull(),
    comprobanteStorageKey: varchar('comprobante_storage_key', { length: 255 }),
    estadoConciliacion: estadoConciliacionEnum('estado_conciliacion')
      .default(EstadoConciliacion.PENDIENTE)
      .notNull(),
    motivoRechazo: text('motivo_rechazo'),
    /** RF-007: reversión de un pago aprobado por error (motivo obligatorio y fecha). */
    motivoReversion: text('motivo_reversion'),
    fechaReversionUtc: timestamp('fecha_reversion_utc', { withTimezone: true }),
    fechaReporteUtc: timestamp('fecha_reporte_utc', { withTimezone: true }).defaultNow().notNull(),
    fechaConciliacionUtc: timestamp('fecha_conciliacion_utc', { withTimezone: true }),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // M5-L1 (RF-007 / RNF-002): una referencia bancaria no se repite DENTRO de la cartera de un
    // entrenador. El efectivo no lleva referencia y un pago rechazado puede reenviarse.
    referenciaEntrenadorIndex: uniqueIndex('uq_transaccion_referencia_entrenador')
      .on(table.entrenadorId, table.metodoPago, table.referenciaBancaria, table.fechaOperacion)
      .where(
        // RF-007: solo un pago pendiente o aprobado ocupa su referencia; uno rechazado o revertido
        // la libera (se puede reenviar). Se nombran en positivo valores que ya existían antes de la
        // 0020: un predicado de índice no admite casts (deben ser IMMUTABLE) y el migrador no deja
        // usar 'revertido' en la misma transacción que lo crea.
        sql`${table.referenciaBancaria} IS NOT NULL AND ${table.metodoPago} NOT IN ('efectivo_usd', 'efectivo_ves') AND ${table.estadoConciliacion} IN ('pendiente', 'aprobado')`
      ),
  })
);

export const tasasCambioReferencia = pgTable('tasas_cambio_referencia', {
  id: uuid('id').defaultRandom().primaryKey(),
  entrenadorId: uuid('entrenador_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' }),
  tasaOficialBcv: numeric('tasa_oficial_bcv', { precision: 12, scale: 4 }).notNull(),
  tasaParalelo: numeric('tasa_paralelo', { precision: 12, scale: 4 }),
  tasaActivaEntrenador: numeric('tasa_activa_entrenador', { precision: 12, scale: 4 }).notNull(),
  fuente: varchar('fuente', { length: 50 }).default('manual').notNull(),
  fechaActualizacionUtc: timestamp('fecha_actualizacion_utc', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
