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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import {
  Rol,
  EstadoUsuario,
  EstadoLicencia,
  TipoDocumento,
  EstadoAlumno,
  Modalidad,
  EstadoSesion,
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
export const estadoCuotaEnum = pgEnum('enum_estado_cuota', [
  EstadoCuota.EMITIDA,
  EstadoCuota.ABONADA_PARCIAL,
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
    tasaFijadaOverride: numeric('tasa_fijada_override', { precision: 12, scale: 4 }),
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
export const preferenciasNotificacion = pgTable('preferencias_notificacion', {
  id: uuid('id').defaultRandom().primaryKey(),
  usuarioId: uuid('usuario_id')
    .notNull()
    .references(() => usuarios.id, { onDelete: 'cascade' })
    .unique(),
  notifyPaymentsPush: boolean('notify_payments_push').default(true).notNull(),
  notifyPaymentsEmail: boolean('notify_payments_email').default(true).notNull(),
  notifyWorkoutsPush: boolean('notify_workouts_push').default(true).notNull(),
  notifyWorkoutsEmail: boolean('notify_workouts_email').default(false).notNull(),
  notifyCheckinsPush: boolean('notify_checkins_push').default(true).notNull(),
  notifyCheckinsEmail: boolean('notify_checkins_email').default(false).notNull(),
  digestWeeklyEmail: boolean('digest_weekly_email').default(false).notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

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
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
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
  porcentajeCumplimiento: numeric('porcentaje_cumplimiento', { precision: 5, scale: 2 })
    .default('0.00')
    .notNull(),
  volumenTotalKg: numeric('volumen_total_kg', { precision: 8, scale: 2 })
    .default('0.00')
    .notNull(),
  notasAlumno: text('notas_alumno'),
  createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
  updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
});

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
  pesoKg: numeric('peso_kg', { precision: 6, scale: 2 }),
  rpe: numeric('rpe', { precision: 3, scale: 1 }),
  descansoSegundos: integer('descanso_segundos'),
  completada: boolean('completada').default(false).notNull(),
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
  brazoCm: numeric('brazo_cm', { precision: 5, scale: 2 }),
  musloCm: numeric('muslo_cm', { precision: 5, scale: 2 }),
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
    fechaEmisionUtc: timestamp('fecha_emision_utc', { withTimezone: true }).notNull(),
    fechaCorteUtc: timestamp('fecha_corte_utc', { withTimezone: true }).notNull(),
    estado: estadoCuotaEnum('estado').default(EstadoCuota.EMITIDA).notNull(),
    notas: text('notas'),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueCuota: uniqueIndex('uq_cuota_cliente_plan_periodo').on(
      table.clienteId,
      table.planId,
      table.periodo
    ),
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
    metodoPago: metodoPagoEnum('metodo_pago').notNull(),
    referenciaBancaria: varchar('referencia_bancaria', { length: 64 }),
    fechaOperacion: date('fecha_operacion').notNull(),
    comprobanteStorageKey: varchar('comprobante_storage_key', { length: 255 }),
    estadoConciliacion: estadoConciliacionEnum('estado_conciliacion')
      .default(EstadoConciliacion.PENDIENTE)
      .notNull(),
    motivoRechazo: text('motivo_rechazo'),
    fechaReporteUtc: timestamp('fecha_reporte_utc', { withTimezone: true }).defaultNow().notNull(),
    fechaConciliacionUtc: timestamp('fecha_conciliacion_utc', { withTimezone: true }),
    createdAtUtc: timestamp('created_at_utc', { withTimezone: true }).defaultNow().notNull(),
    updatedAtUtc: timestamp('updated_at_utc', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    idempotenciaIndex: uniqueIndex('uq_transaccion_idempotencia').on(
      table.metodoPago,
      table.referenciaBancaria,
      table.fechaOperacion
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
