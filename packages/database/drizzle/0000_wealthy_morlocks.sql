DO $$ BEGIN
 CREATE TYPE "public"."enum_angulo_foto" AS ENUM('frontal', 'lateral', 'posterior');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_estado_alumno" AS ENUM('activo', 'inactivo_pausado', 'suspendido_pago');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_estado_conciliacion" AS ENUM('pendiente', 'aprobado', 'rechazado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_estado_cuota" AS ENUM('emitida', 'abonada_parcial', 'al_dia', 'pendiente_revision', 'vencida', 'anulada');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_estado_licencia" AS ENUM('activa', 'suspendida_superadmin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_estado_medicion" AS ENUM('pendiente_aprobacion', 'aprobado', 'rechazado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_estado_sesion" AS ENUM('planificada', 'en_progreso', 'completada', 'omitida');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_estado_usuario" AS ENUM('activo', 'inactivo', 'bloqueado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_metodo_pago" AS ENUM('pago_movil', 'transferencia_bancaria', 'efectivo_usd', 'efectivo_ves', 'zelle', 'binance_usdt', 'otro');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_modalidad" AS ENUM('presencial', 'remoto');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_moneda" AS ENUM('USD', 'VES');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_origen_antropometria" AS ENUM('presencial_verificado', 'remoto_autoreporte');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_plataforma_dispositivo" AS ENUM('ios', 'android', 'web');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_rol" AS ENUM('superadmin', 'entrenador', 'alumno');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_semaforo_nutricional" AS ENUM('cumplido', 'parcial', 'no_cumplido');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_tipo_comida" AS ENUM('desayuno', 'almuerzo', 'cena', 'snack');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."enum_tipo_documento" AS ENUM('V_', 'E_', 'PASAPORTE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkins_nutricionales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"semaforo" "enum_semaforo_nutricional" NOT NULL,
	"calorias_reportadas" integer,
	"proteina_gramos_reportada" integer,
	"agua_litros" numeric(4, 2),
	"notas_alumno" varchar(280),
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "controles_antropometricos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"fecha_evaluacion" date NOT NULL,
	"peso_kg" numeric(5, 2) NOT NULL,
	"altura_cm" numeric(5, 2),
	"porcentaje_grasa" numeric(4, 2),
	"cuello_cm" numeric(5, 2),
	"pecho_cm" numeric(5, 2),
	"cintura_cm" numeric(5, 2),
	"cadera_cm" numeric(5, 2),
	"brazo_cm" numeric(5, 2),
	"muslo_cm" numeric(5, 2),
	"modalidad" "enum_modalidad" NOT NULL,
	"origen" "enum_origen_antropometria" NOT NULL,
	"registrado_por" uuid NOT NULL,
	"estado" "enum_estado_medicion" DEFAULT 'pendiente_aprobacion' NOT NULL,
	"observaciones_coach" text,
	"motivo_rechazo" text,
	"fecha_aprobacion_utc" timestamp with time zone,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cuotas_membresia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"entrenador_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"periodo" varchar(7) NOT NULL,
	"monto_total_usd" numeric(14, 2) NOT NULL,
	"monto_abonado_usd" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"saldo_pendiente_usd" numeric(14, 2) NOT NULL,
	"fecha_emision_utc" timestamp with time zone NOT NULL,
	"fecha_corte_utc" timestamp with time zone NOT NULL,
	"estado" "enum_estado_cuota" DEFAULT 'emitida' NOT NULL,
	"notas" text,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dispositivos_usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"device_token" varchar(255) NOT NULL,
	"platform" "enum_plataforma_dispositivo" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivos_usuario_device_token_unique" UNIQUE("device_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ejercicios_catalogo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entrenador_id" uuid,
	"nombre" varchar(120) NOT NULL,
	"grupo_muscular" varchar(60) NOT NULL,
	"patron_movimiento" varchar(60),
	"video_url" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ejercicios_sesion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sesion_id" uuid NOT NULL,
	"ejercicio_id" uuid NOT NULL,
	"orden" integer DEFAULT 1 NOT NULL,
	"notas_coach" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fotos_antropometria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"angulo" "enum_angulo_foto" NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fotos_comida" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkin_id" uuid NOT NULL,
	"tipo_comida" "enum_tipo_comida" NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notificaciones_in_app" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"titulo" varchar(100) NOT NULL,
	"cuerpo" text NOT NULL,
	"tipo_evento" varchar(50) NOT NULL,
	"leida" boolean DEFAULT false NOT NULL,
	"link_accion" varchar(255),
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "overrides_cliente_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"precio_acordado_usd" numeric(14, 2),
	"tasa_fijada_override" numeric(12, 4),
	"beneficios_personalizados" jsonb,
	"motivo_override" text,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfiles_alumno" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"entrenador_id" uuid NOT NULL,
	"tipo_documento" "enum_tipo_documento" DEFAULT 'V_' NOT NULL,
	"numero_documento" varchar(30) NOT NULL,
	"nombres" varchar(100) NOT NULL,
	"apellidos" varchar(100) NOT NULL,
	"fecha_nacimiento" date NOT NULL,
	"telefono_whatsapp" varchar(30) NOT NULL,
	"ficha_salud_privada" text,
	"estado_activacion" "enum_estado_alumno" DEFAULT 'activo' NOT NULL,
	"modalidad" "enum_modalidad" DEFAULT 'presencial' NOT NULL,
	"tasa_fijada_override" numeric(12, 4),
	"deleted_at_utc" timestamp with time zone,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfiles_alumno_usuario_id_unique" UNIQUE("usuario_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perfiles_entrenador" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"nombres" varchar(100) NOT NULL,
	"apellidos" varchar(100) NOT NULL,
	"nombre_comercial" varchar(150),
	"coach_code" varchar(15) NOT NULL,
	"capacidad_maxima" integer DEFAULT 50 NOT NULL,
	"tasa_cambio_global" numeric(12, 4) DEFAULT '65.0000' NOT NULL,
	"telefono_contacto" varchar(30) NOT NULL,
	"estado_licencia" "enum_estado_licencia" DEFAULT 'activa' NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfiles_entrenador_usuario_id_unique" UNIQUE("usuario_id"),
	CONSTRAINT "perfiles_entrenador_coach_code_unique" UNIQUE("coach_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planes_membresia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entrenador_id" uuid NOT NULL,
	"nombre" varchar(60) NOT NULL,
	"descripcion" text,
	"beneficios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"precio_base_usd" numeric(14, 2) NOT NULL,
	"duracion_meses" integer DEFAULT 1 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "preferencias_notificacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"notify_payments_push" boolean DEFAULT true NOT NULL,
	"notify_payments_email" boolean DEFAULT true NOT NULL,
	"notify_workouts_push" boolean DEFAULT true NOT NULL,
	"notify_workouts_email" boolean DEFAULT false NOT NULL,
	"notify_checkins_push" boolean DEFAULT true NOT NULL,
	"notify_checkins_email" boolean DEFAULT false NOT NULL,
	"digest_weekly_email" boolean DEFAULT false NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferencias_notificacion_usuario_id_unique" UNIQUE("usuario_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "series_registro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ejercicio_sesion_id" uuid NOT NULL,
	"numero_serie" integer NOT NULL,
	"reps_objetivo" integer NOT NULL,
	"reps_logradas" integer,
	"peso_kg" numeric(6, 2),
	"rpe" numeric(3, 1),
	"completada" boolean DEFAULT false NOT NULL,
	"timestamp_completada_utc" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sesiones_entrenamiento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alumno_id" uuid NOT NULL,
	"rutina_id" uuid,
	"fecha_programada" date NOT NULL,
	"fecha_inicio_utc" timestamp with time zone,
	"fecha_fin_utc" timestamp with time zone,
	"timezone_cliente" varchar(64) DEFAULT 'America/Caracas' NOT NULL,
	"estado" "enum_estado_sesion" DEFAULT 'planificada' NOT NULL,
	"porcentaje_cumplimiento" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"notas_alumno" text,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasas_cambio_referencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entrenador_id" uuid NOT NULL,
	"tasa_oficial_bcv" numeric(12, 4) NOT NULL,
	"tasa_paralelo" numeric(12, 4),
	"tasa_activa_entrenador" numeric(12, 4) NOT NULL,
	"fuente" varchar(50) DEFAULT 'manual' NOT NULL,
	"fecha_actualizacion_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transacciones_pago" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuota_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"entrenador_id" uuid NOT NULL,
	"registrado_por" uuid NOT NULL,
	"monto_original" numeric(14, 2) NOT NULL,
	"moneda_original" "enum_moneda" NOT NULL,
	"tasa_cambio_fijada" numeric(12, 4) NOT NULL,
	"monto_equivalente_usd" numeric(14, 2) NOT NULL,
	"metodo_pago" "enum_metodo_pago" NOT NULL,
	"referencia_bancaria" varchar(64),
	"fecha_operacion" date NOT NULL,
	"comprobante_storage_key" varchar(255),
	"estado_conciliacion" "enum_estado_conciliacion" DEFAULT 'pendiente' NOT NULL,
	"motivo_rechazo" text,
	"fecha_reporte_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"fecha_conciliacion_utc" timestamp with time zone,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255),
	"rol" "enum_rol" NOT NULL,
	"estado" "enum_estado_usuario" DEFAULT 'activo' NOT NULL,
	"token_invitacion_hash" varchar(64),
	"token_invitacion_expira" timestamp with time zone,
	"ultimo_acceso_utc" timestamp with time zone,
	"timezone" varchar(64) DEFAULT 'America/Caracas' NOT NULL,
	"tema_ui" varchar(10) DEFAULT 'system' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "checkins_nutricionales" ADD CONSTRAINT "checkins_nutricionales_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "controles_antropometricos" ADD CONSTRAINT "controles_antropometricos_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "controles_antropometricos" ADD CONSTRAINT "controles_antropometricos_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cuotas_membresia" ADD CONSTRAINT "cuotas_membresia_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cuotas_membresia" ADD CONSTRAINT "cuotas_membresia_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cuotas_membresia" ADD CONSTRAINT "cuotas_membresia_plan_id_planes_membresia_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes_membresia"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dispositivos_usuario" ADD CONSTRAINT "dispositivos_usuario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ejercicios_catalogo" ADD CONSTRAINT "ejercicios_catalogo_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ejercicios_sesion" ADD CONSTRAINT "ejercicios_sesion_sesion_id_sesiones_entrenamiento_id_fk" FOREIGN KEY ("sesion_id") REFERENCES "public"."sesiones_entrenamiento"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ejercicios_sesion" ADD CONSTRAINT "ejercicios_sesion_ejercicio_id_ejercicios_catalogo_id_fk" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."ejercicios_catalogo"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fotos_antropometria" ADD CONSTRAINT "fotos_antropometria_control_id_controles_antropometricos_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controles_antropometricos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fotos_comida" ADD CONSTRAINT "fotos_comida_checkin_id_checkins_nutricionales_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."checkins_nutricionales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notificaciones_in_app" ADD CONSTRAINT "notificaciones_in_app_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "overrides_cliente_plan" ADD CONSTRAINT "overrides_cliente_plan_plan_id_planes_membresia_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes_membresia"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "overrides_cliente_plan" ADD CONSTRAINT "overrides_cliente_plan_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfiles_alumno" ADD CONSTRAINT "perfiles_alumno_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfiles_alumno" ADD CONSTRAINT "perfiles_alumno_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfiles_entrenador" ADD CONSTRAINT "perfiles_entrenador_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "planes_membresia" ADD CONSTRAINT "planes_membresia_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "preferencias_notificacion" ADD CONSTRAINT "preferencias_notificacion_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "series_registro" ADD CONSTRAINT "series_registro_ejercicio_sesion_id_ejercicios_sesion_id_fk" FOREIGN KEY ("ejercicio_sesion_id") REFERENCES "public"."ejercicios_sesion"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sesiones_entrenamiento" ADD CONSTRAINT "sesiones_entrenamiento_alumno_id_usuarios_id_fk" FOREIGN KEY ("alumno_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasas_cambio_referencia" ADD CONSTRAINT "tasas_cambio_referencia_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transacciones_pago" ADD CONSTRAINT "transacciones_pago_cuota_id_cuotas_membresia_id_fk" FOREIGN KEY ("cuota_id") REFERENCES "public"."cuotas_membresia"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transacciones_pago" ADD CONSTRAINT "transacciones_pago_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transacciones_pago" ADD CONSTRAINT "transacciones_pago_entrenador_id_usuarios_id_fk" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transacciones_pago" ADD CONSTRAINT "transacciones_pago_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_checkin_nutricional_diario" ON "checkins_nutricionales" USING btree ("alumno_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cuota_cliente_plan_periodo" ON "cuotas_membresia" USING btree ("cliente_id","plan_id","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_control_angulo" ON "fotos_antropometria" USING btree ("control_id","angulo");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_override_plan_cliente" ON "overrides_cliente_plan" USING btree ("plan_id","cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_alumno_documento_entrenador" ON "perfiles_alumno" USING btree ("tipo_documento","numero_documento","entrenador_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alumnos_activos" ON "perfiles_alumno" USING btree ("entrenador_id","estado_activacion");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_transaccion_idempotencia" ON "transacciones_pago" USING btree ("metodo_pago","referencia_bancaria","fecha_operacion");