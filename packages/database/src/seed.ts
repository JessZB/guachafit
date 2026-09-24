import * as crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  db,
  withTenant,
  queryClient,
  usuarios,
  perfilesEntrenador,
  perfilesAlumno,
  preferenciasNotificacion,
  ejerciciosCatalogo,
  rutinas,
  plantillasRutina,
  sesionesEntrenamiento,
  ejerciciosSesion,
  seriesRegistro,
  checkinsNutricionales,
  controlesAntropometricos,
  fotosAntropometria,
  planesMembresia,
  cuotasMembresia,
  transaccionesPago,
  tasasCambioReferencia,
} from './index';
import {
  Rol,
  EstadoUsuario,
  EstadoLicencia,
  TipoDocumento,
  EstadoAlumno,
  Modalidad,
  EstadoSesion,
  SemaforoNutricional,
  OrigenAntropometria,
  EstadoMedicion,
  AnguloFoto,
  EstadoCuota,
  Moneda,
  MetodoPago,
  EstadoConciliacion,
  BloqueDiaRutinaDTO,
  NivelObjetivoPlantilla,
} from '@guachafit/shared';

// =============================================================================
// UTILIDADES CRIPTOGRÁFICAS Y ENCRIPTACIÓN AES-256-GCM
// =============================================================================

const ENCRYPTION_KEY_HEX =
  process.env.ENCRYPTION_KEY_HEX ||
  process.env.ENCRYPTION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

function hashSha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Cifra la ficha médica privada respetando el estándar AES-256-GCM (RNF-003)
 * Formato: ivHex:authTagHex:encryptedHex
 */
function encryptHealthRecord(plainText: string): string {
  const iv = crypto.randomBytes(12); // IV de 96 bits recomendado para GCM
  const key = Buffer.from(ENCRYPTION_KEY_HEX.slice(0, 64), 'hex');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// =============================================================================
// SCRIPT PRINCIPAL DE SEEDING
// =============================================================================

async function seed() {
  console.log('🌱 [GUACHAFIT SEED] Iniciando proceso de Seeding enriquecido...');
  const startTime = Date.now();

  try {
    // -------------------------------------------------------------------------
    // 0. Limpieza Idempotente (orden inverso a FKs)
    // -------------------------------------------------------------------------
    console.log('🧹 Limpiando tablas anteriores para inserción limpia...');
    await db.delete(fotosAntropometria);
    await db.delete(controlesAntropometricos);
    await db.delete(checkinsNutricionales);
    await db.delete(seriesRegistro);
    await db.delete(ejerciciosSesion);
    await db.delete(sesionesEntrenamiento);
    // RNF-003/ADR-009: `rutinas` tiene RLS; el seed es una ruta de sistema y usa el
    // bypass explícito de superadmin para operar sobre cualquier tenant.
    await withTenant({ isSuperadmin: true }, async (tx) => {
      await tx.delete(rutinas);
    });
    // RNF-003/ADR-011: `plantillas_rutina` tiene RLS; el seed es ruta de sistema y
    // usa el mismo bypass explícito de superadmin que `rutinas`.
    await withTenant({ isSuperadmin: true }, async (tx) => {
      await tx.delete(plantillasRutina);
    });
    await db.delete(ejerciciosCatalogo);
    // RNF-003/ADR-011 (etapa 2): `planes_membresia`, `cuotas_membresia` y `transacciones_pago`
    // tienen RLS; el seed es ruta de sistema y usa el mismo bypass explícito de superadmin.
    await withTenant({ isSuperadmin: true }, async (tx) => {
      await tx.delete(transaccionesPago);
      await tx.delete(cuotasMembresia);
      await tx.delete(planesMembresia);
    });
    await db.delete(tasasCambioReferencia);
    await db.delete(preferenciasNotificacion);
    // RNF-003/ADR-011 (etapa 3): `perfiles_alumno` tiene RLS; el seed es ruta de sistema y usa
    // el bypass explícito de superadmin (mismo precedente que rutinas/plantillas/finanzas).
    await withTenant({ isSuperadmin: true }, async (tx) => {
      await tx.delete(perfilesAlumno);
    });
    await db.delete(perfilesEntrenador);
    await db.delete(usuarios);

    // -------------------------------------------------------------------------
    // 1. Entrenador Demo (Head Coach)
    // -------------------------------------------------------------------------
    console.log('👤 Creando Entrenador Demo: Carlos Silva (Head Coach)...');
    const coachPasswordHash = hashPassword('Password123!');
    const nowUtc = new Date();

    const [coachUser] = await db
      .insert(usuarios)
      .values({
        email: 'entrenador@guachafit.com',
        passwordHash: coachPasswordHash,
        rol: Rol.ENTRENADOR,
        estado: EstadoUsuario.ACTIVO,
        timezone: 'America/Caracas',
        temaUi: 'system',
        activo: true,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    const [coachProfile] = await db
      .insert(perfilesEntrenador)
      .values({
        usuarioId: coachUser.id,
        nombres: 'Carlos',
        apellidos: 'Silva',
        nombreComercial: 'Carlos Silva (Head Coach)',
        coachCode: 'GUACHA-COACH',
        capacidadMaxima: 50,
        tasaCambioGlobal: '37.0000',
        telefonoContacto: '+584121234567',
        estadoLicencia: EstadoLicencia.ACTIVA,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    await db.insert(preferenciasNotificacion).values({
      usuarioId: coachUser.id,
      notifyPaymentsPush: true,
      notifyPaymentsEmail: true,
      notifyWorkoutsPush: true,
      notifyWorkoutsEmail: true,
      notifyCheckinsPush: true,
      notifyCheckinsEmail: true,
      digestWeeklyEmail: true,
    });

    // -------------------------------------------------------------------------
    // 2. Histórico de Tasas de Cambio BCV (Últimos 7 días)
    // -------------------------------------------------------------------------
    console.log('📈 Insertando histórico de tasas de cambio BCV (36.50 - 37.20 VES/USD)...');
    const tasasHistoricas = [
      { diasAtras: 6, tasaBcv: '36.5200', tasaActiva: '36.5200' },
      { diasAtras: 5, tasaBcv: '36.6500', tasaActiva: '36.6500' },
      { diasAtras: 4, tasaBcv: '36.7800', tasaActiva: '36.7800' },
      { diasAtras: 3, tasaBcv: '36.8500', tasaActiva: '36.8500' },
      { diasAtras: 2, tasaBcv: '36.9200', tasaActiva: '36.9200' },
      { diasAtras: 1, tasaBcv: '37.1500', tasaActiva: '37.0000' },
      { diasAtras: 0, tasaBcv: '37.0000', tasaActiva: '37.0000' },
    ];

    for (const item of tasasHistoricas) {
      const fechaTasa = new Date(Date.now() - item.diasAtras * 24 * 60 * 60 * 1000);
      await db.insert(tasasCambioReferencia).values({
        entrenadorId: coachUser.id,
        tasaOficialBcv: item.tasaBcv,
        tasaParalelo: (parseFloat(item.tasaBcv) * 1.15).toFixed(4),
        tasaActivaEntrenador: item.tasaActiva,
        fuente: 'bcv_oficial',
        fechaActualizacionUtc: fechaTasa,
      });
    }

    // -------------------------------------------------------------------------
    // 3. Catálogo de 20 Ejercicios Esenciales
    // -------------------------------------------------------------------------
    console.log('🏋️ Insertando catálogo de 20 ejercicios esenciales...');
    const catalogoDef = [
      // Pecho
      {
        nombre: 'Press de Banca Plano con Barra',
        grupoMuscular: 'Pecho',
        patronMovimiento: 'Empuje Horizontal',
        videoUrl: 'https://cdn.guachafit.com/videos/press-banca-plano.mp4',
      },
      {
        nombre: 'Press Inclinado con Mancuernas',
        grupoMuscular: 'Pecho',
        patronMovimiento: 'Empuje Inclinado',
        videoUrl: 'https://cdn.guachafit.com/videos/press-inclinado-mancuernas.mp4',
      },
      {
        nombre: 'Aperturas en Polea (Cruces de Pecho)',
        grupoMuscular: 'Pecho',
        patronMovimiento: 'Aislamiento Pectoral',
        videoUrl: 'https://cdn.guachafit.com/videos/cruces-polea.mp4',
      },
      // Espalda
      {
        nombre: 'Dominadas en Barra (Pull-ups)',
        grupoMuscular: 'Espalda',
        patronMovimiento: 'Tracción Vertical',
        videoUrl: 'https://cdn.guachafit.com/videos/dominadas.mp4',
      },
      {
        nombre: 'Remo con Barra Prono',
        grupoMuscular: 'Espalda',
        patronMovimiento: 'Tracción Horizontal',
        videoUrl: 'https://cdn.guachafit.com/videos/remo-barra.mp4',
      },
      {
        nombre: 'Jalón al Pecho en Polea Alta',
        grupoMuscular: 'Espalda',
        patronMovimiento: 'Tracción Vertical',
        videoUrl: 'https://cdn.guachafit.com/videos/jalon-pecho.mp4',
      },
      // Cuádriceps
      {
        nombre: 'Sentadilla Trasera con Barra (Back Squat)',
        grupoMuscular: 'Cuádriceps',
        patronMovimiento: 'Dominante de Rodilla',
        videoUrl: 'https://cdn.guachafit.com/videos/sentadilla-trasera.mp4',
      },
      {
        nombre: 'Prensa Inclinada de Piernas a 45°',
        grupoMuscular: 'Cuádriceps',
        patronMovimiento: 'Dominante de Rodilla',
        videoUrl: 'https://cdn.guachafit.com/videos/prensa-45.mp4',
      },
      {
        nombre: 'Extensiones de Cuádriceps en Máquina',
        grupoMuscular: 'Cuádriceps',
        patronMovimiento: 'Aislamiento de Rodilla',
        videoUrl: 'https://cdn.guachafit.com/videos/extensiones-cuadriceps.mp4',
      },
      // Isquios & Glúteos
      {
        nombre: 'Peso Muerto Rumano con Barra (RDL)',
        grupoMuscular: 'Isquios y Glúteos',
        patronMovimiento: 'Bisagra de Cadera',
        videoUrl: 'https://cdn.guachafit.com/videos/peso-muerto-rumano.mp4',
      },
      {
        nombre: 'Curl Femoral Tumbado en Máquina',
        grupoMuscular: 'Isquios y Glúteos',
        patronMovimiento: 'Aislamiento Isquiotibial',
        videoUrl: 'https://cdn.guachafit.com/videos/curl-femoral.mp4',
      },
      {
        nombre: 'Hip Thrust con Barra',
        grupoMuscular: 'Isquios y Glúteos',
        patronMovimiento: 'Extensión de Cadera',
        videoUrl: 'https://cdn.guachafit.com/videos/hip-thrust.mp4',
      },
      // Hombros
      {
        nombre: 'Press Militar de Pie con Barra (Overhead Press)',
        grupoMuscular: 'Hombros',
        patronMovimiento: 'Empuje Vertical',
        videoUrl: 'https://cdn.guachafit.com/videos/press-militar.mp4',
      },
      {
        nombre: 'Elevaciones Laterales con Mancuernas',
        grupoMuscular: 'Hombros',
        patronMovimiento: 'Abducción de Hombro',
        videoUrl: 'https://cdn.guachafit.com/videos/elevaciones-laterales.mp4',
      },
      {
        nombre: 'Pájaros Posteriores en Polea (Face Pull / Deltoides Posterior)',
        grupoMuscular: 'Hombros',
        patronMovimiento: 'Tracción Posterior',
        videoUrl: 'https://cdn.guachafit.com/videos/face-pull.mp4',
      },
      // Brazos
      {
        nombre: 'Curl de Bíceps con Barra Z',
        grupoMuscular: 'Brazos',
        patronMovimiento: 'Flexión de Codo Supina',
        videoUrl: 'https://cdn.guachafit.com/videos/curl-barra-z.mp4',
      },
      {
        nombre: 'Curl Martillo con Mancuernas',
        grupoMuscular: 'Brazos',
        patronMovimiento: 'Flexión de Codo Neutra',
        videoUrl: 'https://cdn.guachafit.com/videos/curl-martillo.mp4',
      },
      {
        nombre: 'Fondos en Paralelas (Dips)',
        grupoMuscular: 'Brazos',
        patronMovimiento: 'Empuje Vertical / Tríceps',
        videoUrl: 'https://cdn.guachafit.com/videos/fondos-paralelas.mp4',
      },
      {
        nombre: 'Extensiones de Tríceps en Polea Alta con Cuerda',
        grupoMuscular: 'Brazos',
        patronMovimiento: 'Extensión de Codo',
        videoUrl: 'https://cdn.guachafit.com/videos/triceps-cuerda.mp4',
      },
      // Core
      {
        nombre: 'Plancha Abdominal Isométrica (Plank)',
        grupoMuscular: 'Core',
        patronMovimiento: 'Anti-Extensión',
        videoUrl: 'https://cdn.guachafit.com/videos/plancha-isometrica.mp4',
      },
    ];

    const ejerciciosInsertados = await db
      .insert(ejerciciosCatalogo)
      .values(
        catalogoDef.map((e) => ({
          entrenadorId: coachUser.id,
          nombre: e.nombre,
          grupoMuscular: e.grupoMuscular,
          patronMovimiento: e.patronMovimiento,
          videoUrl: e.videoUrl,
          activo: true,
          createdAtUtc: nowUtc,
        }))
      )
      .returning();

    const mapaEjercicios = new Map(ejerciciosInsertados.map((e) => [e.nombre, e.id]));

    // -------------------------------------------------------------------------
    // 4. Planes de Membresía del Entrenador
    // -------------------------------------------------------------------------
    console.log('📋 Creando planes de membresía estándar y premium...');
    // RNF-003/ADR-011 (etapa 2): `planes_membresia` tiene RLS; escritura con bypass de sistema.
    const [planEstandar] = await withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .insert(planesMembresia)
        .values({
          entrenadorId: coachUser.id,
          nombre: 'Plan Básico - Entrenamiento Presencial',
          descripcion: 'Acceso a rutinas personalizadas y seguimiento quincenal.',
          beneficios: ['Rutina guiada en app', 'Soporte vía chat', '1 evaluación al mes'],
          precioBaseUsd: '35.00',
          duracionMeses: 1,
          activo: true,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning()
    );

    const [planPremium] = await withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .insert(planesMembresia)
        .values({
          entrenadorId: coachUser.id,
          nombre: 'Plan Integral Élite - Fuerza & Nutrición',
          descripcion: 'Monitoreo diario de nutrición, 3 entrenamientos semanales y antropometría mensual.',
          beneficios: [
            'Rutina PPL adaptativa',
            'Check-ins nutricionales diarios',
            'Controles antropométricos con fotos',
            'Soporte prioritario 24/7',
          ],
          precioBaseUsd: '40.00',
          duracionMeses: 1,
          activo: true,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning()
    );

    // -------------------------------------------------------------------------
    // 5. Los 5 Alumnos Demo con Diversidad de Estados
    // -------------------------------------------------------------------------
    console.log('👥 Creando 5 alumnos demo con estados de cartera y entrenamiento diferenciados...');
    const studentPasswordHash = hashPassword('Password123!');

    // --- ALUMNO 1: Activo y al día (Plan $35 pagado, check-ins 100%, sesión completada) ---
    console.log('  -> Alumno 1: Andrés Pérez (Al día y activo)');
    const [user1] = await db
      .insert(usuarios)
      .values({
        email: 'andres.perez@guachafit.com',
        passwordHash: studentPasswordHash,
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.ACTIVO,
        timezone: 'America/Caracas',
        temaUi: 'dark',
        activo: true,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    const fichaSaludCifrada1 = encryptHealthRecord(
      'Sin antecedentes cardiovasculares ni lesiones articulares activas. Apto para entrenamiento de alta intensidad con sobrecarga progresiva.'
    );

    // RNF-003/ADR-011 (etapa 3): escritura de sistema con bypass superadmin (RLS activo).
    const [perfil1] = await withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .insert(perfilesAlumno)
        .values({
          usuarioId: user1.id,
          entrenadorId: coachUser.id,
          tipoDocumento: TipoDocumento.V,
          numeroDocumento: '20111221',
          nombres: 'Andrés',
          apellidos: 'Pérez',
          fechaNacimiento: '1996-03-14',
          telefonoWhatsapp: '+584149876541',
          fichaSaludPrivada: fichaSaludCifrada1,
          estadoActivacion: EstadoAlumno.ACTIVO,
          modalidad: Modalidad.PRESENCIAL,
          rachaDias: 4,
          rachaUltimaFecha: nowUtc.toISOString().split('T')[0],
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning()
    );

    await db.insert(preferenciasNotificacion).values({
      usuarioId: user1.id,
      notifyPaymentsPush: true,
      notifyPaymentsEmail: true,
      notifyWorkoutsPush: true,
      notifyWorkoutsEmail: false,
      notifyCheckinsPush: true,
      notifyCheckinsEmail: false,
      digestWeeklyEmail: false,
    });

    // Cuota y Pago Alumno 1 (Al día)
    const periodoActual = `${nowUtc.getUTCFullYear()}-${String(nowUtc.getUTCMonth() + 1).padStart(2, '0')}`;
    const fechaEmision = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), 1));
    const fechaCorte = new Date(Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth() + 1, 5));

    const [cuota1] = await withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .insert(cuotasMembresia)
        .values({
          clienteId: user1.id,
          entrenadorId: coachUser.id,
          planId: planEstandar.id,
          periodo: periodoActual,
          montoTotalUsd: '35.00',
          montoAbonadoUsd: '35.00',
          saldoPendienteUsd: '0.00',
          fechaEmisionUtc: fechaEmision,
          fechaCorteUtc: fechaCorte,
          estado: EstadoCuota.AL_DIA,
          notas: 'Cuota mensual pagada y conciliada vía Zelle',
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning()
    );

    await withTenant({ isSuperadmin: true }, (tx) =>
      tx.insert(transaccionesPago).values({
        cuotaId: cuota1.id,
        clienteId: user1.id,
        entrenadorId: coachUser.id,
        registradoPor: user1.id,
        montoOriginal: '35.00',
        monedaOriginal: Moneda.USD,
        tasaCambioFijada: '1.0000',
        montoEquivalenteUsd: '35.00',
        metodoPago: MetodoPago.ZELLE,
        referenciaBancaria: 'ZELLE-CONF-88910',
        fechaOperacion: nowUtc.toISOString().split('T')[0],
        estadoConciliacion: EstadoConciliacion.APROBADO,
        fechaReporteUtc: nowUtc,
        fechaConciliacionUtc: nowUtc,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
    );

    // Check-in de Nutrición Alumno 1 (100% verde)
    await db.insert(checkinsNutricionales).values({
      alumnoId: user1.id,
      fecha: nowUtc.toISOString().split('T')[0],
      semaforo: SemaforoNutricional.CUMPLIDO,
      caloriasReportadas: 2450,
      proteinaGramosReportada: 165,
      aguaLitros: '3.20',
      notasAlumno: 'Cumplimiento estricto de requerimiento calórico y proteico. Excelente hidratación.',
      createdAtUtc: nowUtc,
      updatedAtUtc: nowUtc,
    });

    // --- ALUMNO 2: Pago pendiente de revisión (Bs. 1.295,00 a tasa 37.00 BCV) ---
    console.log('  -> Alumno 2: Mariana Gómez (Pago pendiente de revisión)');
    const [user2] = await db
      .insert(usuarios)
      .values({
        email: 'mariana.gomez@guachafit.com',
        passwordHash: studentPasswordHash,
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.ACTIVO,
        timezone: 'America/Caracas',
        temaUi: 'light',
        activo: true,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    // RNF-003/ADR-011 (etapa 3): escritura de sistema con bypass superadmin (RLS activo).
    await withTenant({ isSuperadmin: true }, (tx) =>
      tx.insert(perfilesAlumno).values({
        usuarioId: user2.id,
        entrenadorId: coachUser.id,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '20111222',
        nombres: 'Mariana',
        apellidos: 'Gómez',
        fechaNacimiento: '1998-07-22',
        telefonoWhatsapp: '+584241112233',
        fichaSaludPrivada: encryptHealthRecord('Condromalacia rotuliana grado 1 rodilla derecha. Evitar sobrecarga en sentadilla profunda.'),
        estadoActivacion: EstadoAlumno.ACTIVO,
        modalidad: Modalidad.REMOTO,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
    );

    const [cuota2] = await withTenant({ isSuperadmin: true }, (tx) =>
      tx
        .insert(cuotasMembresia)
        .values({
          clienteId: user2.id,
          entrenadorId: coachUser.id,
          planId: planEstandar.id,
          periodo: periodoActual,
          montoTotalUsd: '35.00',
          montoAbonadoUsd: '0.00',
          saldoPendienteUsd: '35.00',
          fechaEmisionUtc: fechaEmision,
          fechaCorteUtc: fechaCorte,
          estado: EstadoCuota.PENDIENTE_REVISION,
          notas: 'Transferencia bancaria en VES pendiente de validación por el entrenador',
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        })
        .returning()
    );

    await withTenant({ isSuperadmin: true }, (tx) =>
      tx.insert(transaccionesPago).values({
        cuotaId: cuota2.id,
        clienteId: user2.id,
        entrenadorId: coachUser.id,
        registradoPor: user2.id,
        montoOriginal: '1295.00',
        monedaOriginal: Moneda.VES,
        tasaCambioFijada: '37.0000',
        montoEquivalenteUsd: '35.00',
        metodoPago: MetodoPago.TRANSFERENCIA_BANCARIA,
        referenciaBancaria: 'TRANSF-BANESCO-771239',
        fechaOperacion: nowUtc.toISOString().split('T')[0],
        comprobanteStorageKey: 'comprobantes/2026-09/transferencia-1295-ves.jpg',
        estadoConciliacion: EstadoConciliacion.PENDIENTE,
        fechaReporteUtc: nowUtc,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
    );

    // --- ALUMNO 3: Moroso / Cuota vencida ($40 USD vencida hace 5 días) ---
    console.log('  -> Alumno 3: Roberto Mendoza (Moroso / Cuota vencida)');
    const [user3] = await db
      .insert(usuarios)
      .values({
        email: 'roberto.mendoza@guachafit.com',
        passwordHash: studentPasswordHash,
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.ACTIVO,
        timezone: 'America/Caracas',
        temaUi: 'system',
        activo: true,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    // RNF-003/ADR-011 (etapa 3): escritura de sistema con bypass superadmin (RLS activo).
    await withTenant({ isSuperadmin: true }, (tx) =>
      tx.insert(perfilesAlumno).values({
        usuarioId: user3.id,
        entrenadorId: coachUser.id,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '20111223',
        nombres: 'Roberto',
        apellidos: 'Mendoza',
        fechaNacimiento: '1992-11-05',
        telefonoWhatsapp: '+584125556677',
        fichaSaludPrivada: encryptHealthRecord('Sin lesiones previas. Fumador social en proceso de cese.'),
        estadoActivacion: EstadoAlumno.ACTIVO,
        modalidad: Modalidad.PRESENCIAL,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
    );

    // Periodo anterior vencido hace 5 días
    const fechaCorteVencida = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const fechaEmisionVencida = new Date(fechaCorteVencida.getTime() - 30 * 24 * 60 * 60 * 1000);
    const mesAnterior = fechaCorteVencida.getUTCMonth() + 1;
    const periodoVencido = `${fechaCorteVencida.getUTCFullYear()}-${String(mesAnterior).padStart(2, '0')}`;

    await withTenant({ isSuperadmin: true }, (tx) =>
      tx.insert(cuotasMembresia).values({
        clienteId: user3.id,
        entrenadorId: coachUser.id,
        planId: planPremium.id,
        periodo: periodoVencido,
        montoTotalUsd: '40.00',
        montoAbonadoUsd: '0.00',
        saldoPendienteUsd: '40.00',
        fechaEmisionUtc: fechaEmisionVencida,
        fechaCorteUtc: fechaCorteVencida,
        estado: EstadoCuota.VENCIDA,
        notas: 'Cuota vencida hace 5 días sin reporte de pago',
        createdAtUtc: fechaEmisionVencida,
        updatedAtUtc: nowUtc,
      })
    );

    // --- ALUMNO 4: Nuevo en Onboarding (Código pendiente GUACHA-8821) ---
    console.log('  -> Alumno 4: Valeria Castillo (En Onboarding con código GUACHA-8821)');
    const tokenInvitacionOnboarding = 'GUACHA-8821';
    const tokenInvitacionHash = hashSha256(tokenInvitacionOnboarding);
    const tokenExpira48h = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const [user4] = await db
      .insert(usuarios)
      .values({
        email: 'valeria.castillo@guachafit.com',
        passwordHash: studentPasswordHash, // O hash provisional hasta activación
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.ACTIVO,
        tokenInvitacionHash: tokenInvitacionHash,
        tokenInvitacionExpira: tokenExpira48h,
        timezone: 'America/Caracas',
        temaUi: 'system',
        activo: true,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    // RNF-003/ADR-011 (etapa 3): escritura de sistema con bypass superadmin (RLS activo).
    await withTenant({ isSuperadmin: true }, (tx) =>
      tx.insert(perfilesAlumno).values({
        usuarioId: user4.id,
        entrenadorId: coachUser.id,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '20111224',
        nombres: 'Valeria',
        apellidos: 'Castillo',
        fechaNacimiento: '2001-09-18',
        telefonoWhatsapp: '+584163334455',
        fichaSaludPrivada: encryptHealthRecord('Evaluación inicial en curso. Sin contraindicaciones detectadas.'),
        estadoActivacion: EstadoAlumno.ACTIVO,
        modalidad: Modalidad.PRESENCIAL,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
    );

    // --- ALUMNO 5: Inactivo / Pausado con historial de mediciones pasadas ---
    console.log('  -> Alumno 5: Diego Morales (Inactivo / Pausado con historial)');
    const [user5] = await db
      .insert(usuarios)
      .values({
        email: 'diego.morales@guachafit.com',
        passwordHash: studentPasswordHash,
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.INACTIVO,
        timezone: 'America/Caracas',
        temaUi: 'system',
        activo: false,
        createdAtUtc: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
        updatedAtUtc: nowUtc,
      })
      .returning();

    // RNF-003/ADR-011 (etapa 3): escritura de sistema con bypass superadmin (RLS activo).
    await withTenant({ isSuperadmin: true }, (tx) =>
      tx.insert(perfilesAlumno).values({
        usuarioId: user5.id,
        entrenadorId: coachUser.id,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '20111225',
        nombres: 'Diego',
        apellidos: 'Morales',
        fechaNacimiento: '1989-12-30',
        telefonoWhatsapp: '+584249998877',
        fichaSaludPrivada: encryptHealthRecord('Cirugía de menisco rodilla izquierda en 2021 (totalmente recuperado).'),
        estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
        modalidad: Modalidad.PRESENCIAL,
        createdAtUtc: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
        updatedAtUtc: nowUtc,
      })
    );

    // Medición histórica de Alumno 5 (hace 90 días)
    const fechaMedicionHistorica = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db.insert(controlesAntropometricos).values({
      alumnoId: user5.id,
      fechaEvaluacion: fechaMedicionHistorica.toISOString().split('T')[0],
      pesoKg: '82.00',
      alturaCm: '175.00',
      porcentajeGrasa: '18.50',
      cuelloCm: '40.00',
      pechoCm: '106.00',
      cinturaCm: '88.00',
      caderaCm: '102.00',
      brazoCm: '37.50',
      musloCm: '59.00',
      modalidad: Modalidad.PRESENCIAL,
      origen: OrigenAntropometria.PRESENCIAL_VERIFICADO,
      registradoPor: coachUser.id,
      estado: EstadoMedicion.APROBADO,
      observacionesCoach: 'Punto de partida antes de pausa por viaje de trabajo.',
      fechaAprobacionUtc: fechaMedicionHistorica,
      createdAtUtc: fechaMedicionHistorica,
      updatedAtUtc: fechaMedicionHistorica,
    });

    // -------------------------------------------------------------------------
    // 6. Plantilla de Rutina Semanal (Push / Pull / Legs) y Sesiones
    // -------------------------------------------------------------------------
    console.log('📅 Configurando plantilla de rutina semanal "Fuerza & Hipertrofia (Push/Pull/Legs)"...');
    const rutinaId = crypto.randomUUID(); // Identificador compartido de la rutina cíclica

    const ejercicioBancaId = mapaEjercicios.get('Press de Banca Plano con Barra')!;
    const ejercicioInclinadoId = mapaEjercicios.get('Press Inclinado con Mancuernas')!;
    const ejercicioMilitarId = mapaEjercicios.get('Press Militar de Pie con Barra (Overhead Press)')!;
    const ejercicioFondosId = mapaEjercicios.get('Fondos en Paralelas (Dips)')!;
    const ejercicioDominadasId = mapaEjercicios.get('Dominadas en Barra (Pull-ups)')!;
    const ejercicioRemoId = mapaEjercicios.get('Remo con Barra Prono')!;
    const ejercicioCurlZId = mapaEjercicios.get('Curl de Bíceps con Barra Z')!;
    const ejercicioSentadillaId = mapaEjercicios.get('Sentadilla Trasera con Barra (Back Squat)')!;
    const ejercicioPrensaId = mapaEjercicios.get('Prensa Inclinada de Piernas a 45°')!;
    const ejercicioRdlId = mapaEjercicios.get('Peso Muerto Rumano con Barra (RDL)')!;

    const bloquesRutina: BloqueDiaRutinaDTO[] = [
      {
        diaId: 'd1',
        titulo: 'Día 1 (Lunes): Empuje & Pectoral / Tríceps',
        enfoque: 'Hipertrofia e Intensidad RPE 8',
        diaSugerido: 1,
        ejercicios: [
          {
            ejercicioId: ejercicioBancaId,
            nombre: 'Press de Banca Plano con Barra',
            series: 4,
            reps: '8-10',
            peso: '75.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioInclinadoId,
            nombre: 'Press Inclinado con Mancuernas',
            series: 3,
            reps: '10-12',
            peso: '24.00',
            rpe: '8.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioMilitarId,
            nombre: 'Press Militar de Pie con Barra (Overhead Press)',
            series: 3,
            reps: '8-10',
            peso: '45.00',
            rpe: '8.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioFondosId,
            nombre: 'Fondos en Paralelas (Dips)',
            series: 3,
            reps: '12',
            peso: '0.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
        ],
      },
      {
        diaId: 'd2',
        titulo: 'Día 2 (Miércoles): Tracción & Espalda / Bíceps',
        enfoque: 'Volumen y Control Escapular',
        diaSugerido: 3,
        ejercicios: [
          {
            ejercicioId: ejercicioDominadasId,
            nombre: 'Dominadas en Barra (Pull-ups)',
            series: 4,
            reps: '8-10',
            peso: '0.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioRemoId,
            nombre: 'Remo con Barra Prono',
            series: 4,
            reps: '10-12',
            peso: '60.00',
            rpe: '8.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioCurlZId,
            nombre: 'Curl de Bíceps con Barra Z',
            series: 3,
            reps: '10-12',
            peso: '30.00',
            rpe: '8.5',
            descansoSegundos: 60,
          },
        ],
      },
      {
        diaId: 'd3',
        titulo: 'Día 3 (Viernes): Pierna & Enfoque Cuádriceps / Isquios',
        enfoque: 'Fuerza Controlada',
        diaSugerido: 5,
        ejercicios: [
          {
            ejercicioId: ejercicioSentadillaId,
            nombre: 'Sentadilla Trasera con Barra (Back Squat)',
            series: 4,
            reps: '8-10',
            peso: '85.00',
            rpe: '8.0',
            descansoSegundos: 120,
          },
          {
            ejercicioId: ejercicioPrensaId,
            nombre: 'Prensa Inclinada de Piernas a 45°',
            series: 4,
            reps: '10-12',
            peso: '140.00',
            rpe: '8.0',
            descansoSegundos: 120,
          },
        ],
      },
      {
        diaId: 'd4',
        titulo: 'Día 4 (Sábado): Full Body & Core',
        enfoque: 'Acondicionamiento y Estabilidad',
        diaSugerido: 6,
        ejercicios: [
          {
            ejercicioId: ejercicioRdlId,
            nombre: 'Peso Muerto Rumano con Barra (RDL)',
            series: 4,
            reps: '10-12',
            peso: '80.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
        ],
      },
    ];

    // RNF-003/ADR-009: inserción de rutina bajo el bypass explícito de sistema.
    await withTenant({ isSuperadmin: true }, async (tx) => {
      await tx.insert(rutinas).values({
        id: rutinaId,
        alumnoId: user1.id,
        entrenadorId: coachUser.id,
        nombre: 'Fuerza & Hipertrofia (Push/Pull/Legs)',
        bloques: bloquesRutina,
        activa: true,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      });
    });

    // -------------------------------------------------------------------------
    // 6b. Banco de Plantillas de Rutina del Coach (RF-017)
    // -------------------------------------------------------------------------
    console.log('🗂️  Creando banco de plantillas de rutina reutilizables (RF-017)...');

    const ejercicioTricepsCuerdaId = mapaEjercicios.get(
      'Extensiones de Tríceps en Polea Alta con Cuerda'
    )!;
    const ejercicioFacePullId = mapaEjercicios.get(
      'Pájaros Posteriores en Polea (Face Pull / Deltoides Posterior)'
    )!;
    const ejercicioPlanchaId = mapaEjercicios.get('Plancha Abdominal Isométrica (Plank)')!;
    const ejercicioJalonId = mapaEjercicios.get('Jalón al Pecho en Polea Alta')!;
    const ejercicioHipThrustId = mapaEjercicios.get('Hip Thrust con Barra')!;
    const ejercicioElevacionesLateralesId = mapaEjercicios.get(
      'Elevaciones Laterales con Mancuernas'
    )!;

    const bloquesTrenSuperiorHipertrofia: BloqueDiaRutinaDTO[] = [
      {
        diaId: 'tsh-d1',
        titulo: 'Día 1 (Lunes): Empuje — Pecho, Hombro y Tríceps',
        enfoque: 'Hipertrofia con RPE 8',
        diaSugerido: 1,
        ejercicios: [
          {
            ejercicioId: ejercicioBancaId,
            nombre: 'Press de Banca Plano con Barra',
            series: 4,
            reps: '6-8',
            peso: '80.00',
            rpe: '8.0',
            descansoSegundos: 120,
            notas: 'Tempo controlado 2-1-2. Última serie al fallo técnico.',
          },
          {
            ejercicioId: ejercicioInclinadoId,
            nombre: 'Press Inclinado con Mancuernas',
            series: 3,
            reps: '8-10',
            peso: '26.00',
            rpe: '8.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioMilitarId,
            nombre: 'Press Militar de Pie con Barra (Overhead Press)',
            series: 3,
            reps: '8-10',
            peso: '45.00',
            rpe: '8.5',
            descansoSegundos: 90,
            notas: 'Sin balanceo lumbar; glúteos activos.',
          },
          {
            ejercicioId: ejercicioTricepsCuerdaId,
            nombre: 'Extensiones de Tríceps en Polea Alta con Cuerda',
            series: 3,
            reps: '12-15',
            peso: '25.00',
            rpe: '8.0',
            descansoSegundos: 60,
          },
        ],
      },
      {
        diaId: 'tsh-d2',
        titulo: 'Día 2 (Miércoles): Tracción — Espalda y Bíceps',
        enfoque: 'Volumen y control escapular',
        diaSugerido: 3,
        ejercicios: [
          {
            ejercicioId: ejercicioDominadasId,
            nombre: 'Dominadas en Barra (Pull-ups)',
            series: 4,
            reps: '6-10',
            peso: '0.00',
            rpe: '8.0',
            descansoSegundos: 120,
            notas: 'Agregar lastre cuando supere 10 reps limpias.',
          },
          {
            ejercicioId: ejercicioRemoId,
            nombre: 'Remo con Barra Prono',
            series: 4,
            reps: '8-10',
            peso: '65.00',
            rpe: '8.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioCurlZId,
            nombre: 'Curl de Bíceps con Barra Z',
            series: 3,
            reps: '10-12',
            peso: '32.50',
            rpe: '8.5',
            descansoSegundos: 60,
          },
          {
            ejercicioId: ejercicioFacePullId,
            nombre: 'Pájaros Posteriores en Polea (Face Pull / Deltoides Posterior)',
            series: 3,
            reps: '15',
            peso: '20.00',
            rpe: '8.0',
            descansoSegundos: 60,
          },
        ],
      },
    ];

    const bloquesFullbodyPrincipiante: BloqueDiaRutinaDTO[] = [
      {
        diaId: 'fb-d1',
        titulo: 'Día 1 (Lunes): Full Body A',
        enfoque: 'Técnica y adaptación neuromuscular',
        diaSugerido: 1,
        ejercicios: [
          {
            ejercicioId: ejercicioSentadillaId,
            nombre: 'Sentadilla Trasera con Barra (Back Squat)',
            series: 3,
            reps: '10-12',
            peso: '40.00',
            rpe: '7.0',
            descansoSegundos: 120,
            notas: 'Profundidad a paralelo; sin rebote.',
          },
          {
            ejercicioId: ejercicioBancaId,
            nombre: 'Press de Banca Plano con Barra',
            series: 3,
            reps: '10-12',
            peso: '40.00',
            rpe: '7.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioRemoId,
            nombre: 'Remo con Barra Prono',
            series: 3,
            reps: '10-12',
            peso: '40.00',
            rpe: '7.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioPlanchaId,
            nombre: 'Plancha Abdominal Isométrica (Plank)',
            series: 3,
            reps: '30-45',
            peso: '0.00',
            rpe: '7.0',
            descansoSegundos: 45,
          },
        ],
      },
      {
        diaId: 'fb-d2',
        titulo: 'Día 2 (Miércoles): Full Body B',
        enfoque: 'Empuje vertical y tracción vertical',
        diaSugerido: 3,
        ejercicios: [
          {
            ejercicioId: ejercicioPrensaId,
            nombre: 'Prensa Inclinada de Piernas a 45°',
            series: 3,
            reps: '12-15',
            peso: '80.00',
            rpe: '7.5',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioMilitarId,
            nombre: 'Press Militar de Pie con Barra (Overhead Press)',
            series: 3,
            reps: '10-12',
            peso: '25.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioJalonId,
            nombre: 'Jalón al Pecho en Polea Alta',
            series: 3,
            reps: '10-12',
            peso: '40.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
        ],
      },
      {
        diaId: 'fb-d3',
        titulo: 'Día 3 (Viernes): Full Body C',
        enfoque: 'Bisagra de cadera y glúteo',
        diaSugerido: 5,
        ejercicios: [
          {
            ejercicioId: ejercicioRdlId,
            nombre: 'Peso Muerto Rumano con Barra (RDL)',
            series: 3,
            reps: '10-12',
            peso: '50.00',
            rpe: '7.5',
            descansoSegundos: 90,
            notas: 'Bisagra de cadera pura; barra rozando el muslo.',
          },
          {
            ejercicioId: ejercicioHipThrustId,
            nombre: 'Hip Thrust con Barra',
            series: 3,
            reps: '12-15',
            peso: '60.00',
            rpe: '8.0',
            descansoSegundos: 90,
          },
          {
            ejercicioId: ejercicioElevacionesLateralesId,
            nombre: 'Elevaciones Laterales con Mancuernas',
            series: 2,
            reps: '12-15',
            peso: '8.00',
            rpe: '8.0',
            descansoSegundos: 60,
          },
        ],
      },
    ];

    // RNF-003/ADR-011: inserción de sistema con bypass superadmin (RLS activo).
    await withTenant({ isSuperadmin: true }, async (tx) => {
      await tx.insert(plantillasRutina).values([
        {
          entrenadorId: coachUser.id,
          nombre: 'Tren Superior Hipertrofia A',
          nivelObjetivo: NivelObjetivoPlantilla.INTERMEDIO,
          bloques: bloquesTrenSuperiorHipertrofia,
          activa: true,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        },
        {
          entrenadorId: coachUser.id,
          nombre: 'Fullbody 3 Días Principiante',
          nivelObjetivo: NivelObjetivoPlantilla.PRINCIPIANTE,
          bloques: bloquesFullbodyPrincipiante,
          activa: true,
          createdAtUtc: nowUtc,
          updatedAtUtc: nowUtc,
        },
      ]);
    });

    // Sesión 1: PUSH (Completada hoy por Alumno 1)
    const [sesionPush] = await db
      .insert(sesionesEntrenamiento)
      .values({
        alumnoId: user1.id,
        rutinaId: rutinaId,
        bloqueId: 'd1',
        fechaProgramada: nowUtc.toISOString().split('T')[0],
        fechaInicioUtc: new Date(Date.now() - 3600 * 1000), // Hace 1 hora
        fechaFinUtc: nowUtc,
        timezoneCliente: 'America/Caracas',
        estado: EstadoSesion.COMPLETADA,
        porcentajeCumplimiento: '100.00',
        volumenTotalKg: '3420.00',
        notasAlumno: 'Gran congestión en pecho y hombro anterior. Pesos logrados según lo planificado.',
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    const [ejSesion1] = await db
      .insert(ejerciciosSesion)
      .values({
        sesionId: sesionPush.id,
        ejercicioId: ejercicioBancaId,
        orden: 1,
        notasCoach: 'Controlar excéntrica en 2 segundos, pausa de 1 seg en pecho.',
      })
      .returning();

    const [ejSesion2] = await db
      .insert(ejerciciosSesion)
      .values({
        sesionId: sesionPush.id,
        ejercicioId: ejercicioInclinadoId,
        orden: 2,
        notasCoach: 'Banco a 30 grados, enfoque clavicular.',
      })
      .returning();

    const [ejSesion3] = await db
      .insert(ejerciciosSesion)
      .values({
        sesionId: sesionPush.id,
        ejercicioId: ejercicioMilitarId,
        orden: 3,
        notasCoach: 'Bloqueo firme en glúteos y abdomen para proteger zona lumbar.',
      })
      .returning();

    const [ejSesion4] = await db
      .insert(ejerciciosSesion)
      .values({
        sesionId: sesionPush.id,
        ejercicioId: ejercicioFondosId,
        orden: 4,
        notasCoach: 'Rango completo sin forzar cápsula articular.',
      })
      .returning();

    // Series de Press de Banca (Alumno 1 completadas)
    // WU17: inicio real ≈ 45-60 s antes de la marca de completada (ejecución del set).
    await db.insert(seriesRegistro).values([
      {
        ejercicioSesionId: ejSesion1.id,
        numeroSerie: 1,
        repsObjetivo: 10,
        repsLogradas: 10,
        pesoKg: '70.00',
        pesoPrescritoKg: '70.00',
        rpe: '7.5',
        completada: true,
        timestampInicioUtc: new Date(Date.now() - 3060 * 1000),
        timestampCompletadaUtc: new Date(Date.now() - 3000 * 1000),
      },
      {
        ejercicioSesionId: ejSesion1.id,
        numeroSerie: 2,
        repsObjetivo: 8,
        repsLogradas: 8,
        pesoKg: '75.00',
        pesoPrescritoKg: '75.00',
        rpe: '8.0',
        completada: true,
        timestampInicioUtc: new Date(Date.now() - 2755 * 1000),
        timestampCompletadaUtc: new Date(Date.now() - 2700 * 1000),
      },
      {
        ejercicioSesionId: ejSesion1.id,
        numeroSerie: 3,
        repsObjetivo: 8,
        repsLogradas: 8,
        pesoKg: '80.00',
        pesoPrescritoKg: '80.00',
        rpe: '9.0',
        completada: true,
        timestampInicioUtc: new Date(Date.now() - 2455 * 1000),
        timestampCompletadaUtc: new Date(Date.now() - 2400 * 1000),
      },
      {
        ejercicioSesionId: ejSesion2.id,
        numeroSerie: 1,
        repsObjetivo: 10,
        repsLogradas: 10,
        pesoKg: '24.00',
        pesoPrescritoKg: '24.00',
        rpe: '8.0',
        completada: true,
        timestampInicioUtc: new Date(Date.now() - 2050 * 1000),
        timestampCompletadaUtc: new Date(Date.now() - 2000 * 1000),
      },
      {
        ejercicioSesionId: ejSesion3.id,
        numeroSerie: 1,
        repsObjetivo: 8,
        repsLogradas: 8,
        pesoKg: '45.00',
        pesoPrescritoKg: '45.00',
        rpe: '8.5',
        completada: true,
        timestampInicioUtc: new Date(Date.now() - 1545 * 1000),
        timestampCompletadaUtc: new Date(Date.now() - 1500 * 1000),
      },
      {
        ejercicioSesionId: ejSesion4.id,
        numeroSerie: 1,
        repsObjetivo: 12,
        repsLogradas: 12,
        pesoKg: '0.00',
        pesoPrescritoKg: null, // Ejercicio a peso corporal: sin prescripción cuantitativa
        rpe: '8.0',
        completada: true,
        timestampInicioUtc: new Date(Date.now() - 1050 * 1000),
        timestampCompletadaUtc: new Date(Date.now() - 1000 * 1000),
      },
    ]);

    // Sesión 2: PULL (Planificada para pasado mañana)
    const fechaManana = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const [sesionPull] = await db
      .insert(sesionesEntrenamiento)
      .values({
        alumnoId: user1.id,
        rutinaId: rutinaId,
        bloqueId: 'd2',
        fechaProgramada: fechaManana.toISOString().split('T')[0],
        timezoneCliente: 'America/Caracas',
        estado: EstadoSesion.PLANIFICADA,
        porcentajeCumplimiento: '0.00',
        notasAlumno: null,
        createdAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .returning();

    await db.insert(ejerciciosSesion).values([
      {
        sesionId: sesionPull.id,
        ejercicioId: ejercicioDominadasId,
        orden: 1,
        notasCoach: '4 series al fallo técnico con agarre amplio.',
      },
      {
        sesionId: sesionPull.id,
        ejercicioId: ejercicioRemoId,
        orden: 2,
        notasCoach: 'Mantener torso a 45 grados, tirón hacia la cadera.',
      },
      {
        sesionId: sesionPull.id,
        ejercicioId: ejercicioCurlZId,
        orden: 3,
        notasCoach: '3 series de 10-12 repeticiones sin balanceo.',
      },
    ]);

    // -------------------------------------------------------------------------
    // 7. Medición Antropométrica Completa con Fotos Mockeadas en MinIO
    // -------------------------------------------------------------------------
    console.log('📏 Creando control antropométrico demo para Alumno 1 con fotos y ficha privada...');
    const fechaControl = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const [control1] = await db
      .insert(controlesAntropometricos)
      .values({
        alumnoId: user1.id,
        fechaEvaluacion: fechaControl.toISOString().split('T')[0],
        pesoKg: '78.50',
        alturaCm: '178.00',
        porcentajeGrasa: '14.20',
        cuelloCm: '39.00',
        pechoCm: '104.00',
        cinturaCm: '82.50',
        caderaCm: '98.00',
        brazoCm: '38.00',
        musloCm: '58.00',
        modalidad: Modalidad.PRESENCIAL,
        origen: OrigenAntropometria.PRESENCIAL_VERIFICADO,
        registradoPor: coachUser.id,
        estado: EstadoMedicion.APROBADO,
        observacionesCoach: 'Excelente recomposición corporal en las últimas 4 semanas. Reducción visible de perímetro abdominal manteniendo masa magra.',
        fechaAprobacionUtc: fechaControl,
        createdAtUtc: fechaControl,
        updatedAtUtc: fechaControl,
      })
      .returning();

    // Fotos Antropometría (Frontal, Lateral, Posterior en MinIO / Cloudflare R2)
    await db.insert(fotosAntropometria).values([
      {
        controlId: control1.id,
        angulo: AnguloFoto.FRONTAL,
        storageKey: `antropometria/${user1.id}/${control1.id}/frontal.webp`,
        createdAtUtc: fechaControl,
      },
      {
        controlId: control1.id,
        angulo: AnguloFoto.LATERAL,
        storageKey: `antropometria/${user1.id}/${control1.id}/lateral.webp`,
        createdAtUtc: fechaControl,
      },
      {
        controlId: control1.id,
        angulo: AnguloFoto.POSTERIOR,
        storageKey: `antropometria/${user1.id}/${control1.id}/posterior.webp`,
        createdAtUtc: fechaControl,
      },
    ]);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✨ [GUACHAFIT SEED] Seeding completado exitosamente en ${duration}s.`);
    console.log('----------------------------------------------------------------');
    console.log('🔑 Credenciales Demo Entrenador:');
    console.log('   Email:    entrenador@guachafit.com');
    console.log('   Password: Password123!');
    console.log('🔑 Credenciales Demo Alumnos (1 al 5):');
    console.log('   Password: Password123!');
    console.log('   - andres.perez@guachafit.com (Al día, Zelle $35, sesión completada)');
    console.log('   - mariana.gomez@guachafit.com (Pendiente revisión, Bs. 1.295 a tasa 37.00)');
    console.log('   - roberto.mendoza@guachafit.com (Moroso, cuota $40 vencida hace 5 días)');
    console.log('   - valeria.castillo@guachafit.com (En onboarding, código GUACHA-8821)');
    console.log('   - diego.morales@guachafit.com (Inactivo/Pausado con historial)');
    console.log('----------------------------------------------------------------');
  } catch (error) {
    console.error('❌ [GUACHAFIT SEED] Error durante el proceso de seeding:', error);
    process.exit(1);
  } finally {
    await queryClient.end();
  }
}

seed().catch((err) => {
  console.error('❌ [GUACHAFIT SEED] Error fatal no capturado:', err);
  process.exit(1);
});
