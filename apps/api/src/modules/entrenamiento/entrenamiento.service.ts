import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';
import { RegistroIdempotencia } from '../../common/idempotencia/registro-idempotencia';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Database, TenantRlsContext, WithTenantFn } from '@guachafit/database';
import {
  Rol,
  CrearEjercicioCatalogoDTO,
  CrearSesionEntrenamientoDTO,
  GuardarRutinaSemanalDTO,
  RutinaSemanalDetalleDTO,
  SemanaEntrenamientoProgresoDTO,
  EntrenarBloqueHoyDTO,
  IniciarSesionDTO,
  SincronizarSeriesBatchDTO,
  FinalizarSesionDTO,
  FinalizarSesionResponseDTO,
  EjercicioCatalogoDetalleDTO,
  SesionEntrenamientoDetalleDTO,
  HistorialSesionesAlumnoDTO,
  MonitorAdherenciaDTO,
  FiltroMonitorAdherenciaDTO,
  LIMITE_HISTORIAL_SESIONES_POR_DEFECTO,
  LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO,
} from '@guachafit/shared';
import {
  crearContexto,
  contextoPerfilDeActor as resolverContextoPerfilDeActor,
  type ContextoEntrenamiento,
} from './casos-entrenamiento/contexto';
import { crearEjercicio as crearEjercicioCaso } from './casos-entrenamiento/crear-ejercicio';
import { listarEjercicios as listarEjerciciosCaso } from './casos-entrenamiento/listar-ejercicios';
import { obtenerRutinaSemanalActiva as obtenerRutinaSemanalActivaCaso } from './casos-entrenamiento/obtener-rutina-semanal-activa';
import { obtenerSemanaActualProgreso as obtenerSemanaActualProgresoCaso } from './casos-entrenamiento/obtener-semana-actual-progreso';
import { obtenerSesionHoy as obtenerSesionHoyCaso } from './casos-entrenamiento/obtener-sesion-hoy';
import { obtenerHistorialSesionesAlumno as obtenerHistorialSesionesAlumnoCaso } from './casos-entrenamiento/obtener-historial-sesiones';
import { obtenerSesionPorId as obtenerSesionPorIdCaso } from './casos-entrenamiento/obtener-sesion-por-id';
import { obtenerUltimaSesionAlumno as obtenerUltimaSesionAlumnoCaso } from './casos-entrenamiento/obtener-ultima-sesion';
import { calcularSemanaAdherencia as calcularSemanaAdherenciaCaso } from './casos-entrenamiento/calcular-semana-adherencia';
import { crearSesion as crearSesionCaso } from './casos-entrenamiento/crear-sesion';
import { guardarRutinaSemanal as guardarRutinaSemanalCaso } from './casos-entrenamiento/guardar-rutina-semanal';
import { ejecutarEntrenarBloqueHoy as ejecutarEntrenarBloqueHoyCaso } from './casos-entrenamiento/entrenar-bloque-hoy';
import { ejecutarIniciarSesion as ejecutarIniciarSesionCaso } from './casos-entrenamiento/iniciar-sesion';
import { ejecutarSincronizarSeries as ejecutarSincronizarSeriesCaso } from './casos-entrenamiento/sincronizar-series';
import { ejecutarFinalizarSesion as ejecutarFinalizarSesionCaso } from './casos-entrenamiento/finalizar-sesion';

// Re-export de helpers puros compartidos: mantiene la API pública histórica del
// servicio (tests y consumidores) y la única fuente de verdad en `adherencia.util.ts`.
export {
  evaluarAdherenciaSemanal,
  calcularRangoSemanaIso,
  obtenerDiaSugeridoBloque,
  obtenerFechaLocalYyyyMmDd,
  fechaAnteriorYyyyMmDd,
  calcularVentanaSemana,
  contarBloquesPrescritosHasta,
  diferenciaDiasCalendario,
} from '../../common/adherencia.util';

// Lógica pura extraída a `casos-entrenamiento/reglas-racha.ts` (P5); la fachada la
// re-exporta para mantener los imports históricos de tests y consumidores (P1).
export {
  calcularDuracionMinutos,
  toIsoUtcString,
  evaluarCumplimientoRachaPorVolumen,
  actualizarRacha,
  calcularRachaEfectiva,
  resumirPrescripcionParaAlumno,
} from './casos-entrenamiento/reglas-racha';
export type {
  SerieParaRacha,
  EvaluacionRacha,
  RachaEstado,
  RachaActualizada,
} from './casos-entrenamiento/reglas-racha';

@Injectable()
export class EntrenamientoService {
  private readonly logger = new Logger(EntrenamientoService.name);

  // RNF-002 §4: registro de idempotencia en memoria para reintentos inmediatos por lag de red.
  // Misma operación + mismo usuario + misma X-Idempotency-Key => se devuelve el resultado
  // original sin reaplicar la mutación. `ejecutar()` además une las peticiones simultáneas con la
  // misma clave a una sola ejecución y no recuerda los fallos (el reintento vuelve a ejecutar).
  private readonly idempotencia = new RegistroIdempotencia();

  // P2: contexto de dependencias explícito para los casos de uso (sin providers nuevos).
  private readonly ctx: ContextoEntrenamiento;

  private claveIdempotencia(
    operacion: 'entrenar-hoy' | 'iniciar' | 'series' | 'finalizar',
    alumnoId: string,
    idempotencyKey?: string
  ): string | null {
    const key = (idempotencyKey ?? '').trim();
    if (!key) return null;
    return `${operacion}:${alumnoId}:${key}`;
  }

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    // RNF-003/ADR-009: toda consulta a `rutinas` (tabla con RLS habilitado) corre
    // dentro de este envoltorio transaccional con el GUC del tenant aplicado.
    @Inject(WITH_TENANT) private readonly withTenant: WithTenantFn,
    // RF-014 RN-01: el servicio de negocio SOLO publica eventos de dominio en el bus.
    @Optional() private readonly eventEmitter?: EventEmitter2
  ) {
    this.ctx = crearContexto(db, withTenant, eventEmitter, this.logger);
  }

  /**
   * RNF-003/ADR-011 (etapa 3): contexto RLS del perfil del alumno para rutas multi-rol.
   * Delegación en el helper compartido (fuente única en `casos-entrenamiento/contexto.ts`).
   */
  private contextoPerfilDeActor(
    rol: Rol,
    actorUserId: string,
    entrenadorId?: string
  ): TenantRlsContext {
    return resolverContextoPerfilDeActor(rol, actorUserId, entrenadorId);
  }

  /** Crear ejercicio en el catálogo (global o del coach). */
  async crearEjercicio(
    entrenadorId: string | null | undefined,
    input: CrearEjercicioCatalogoDTO
  ): Promise<EjercicioCatalogoDetalleDTO> {
    return crearEjercicioCaso(this.ctx, entrenadorId, input);
  }

  /** Listar ejercicios activos (coach + globales). */
  async listarEjercicios(entrenadorId?: string): Promise<EjercicioCatalogoDetalleDTO[]> {
    return listarEjerciciosCaso(this.ctx, entrenadorId);
  }

  /** Prescribir sesión de entrenamiento (transacción atómica). */
  async crearSesion(
    entrenadorId: string,
    input: CrearSesionEntrenamientoDTO
  ): Promise<SesionEntrenamientoDetalleDTO> {
    return crearSesionCaso(this.ctx, entrenadorId, input);
  }

  /** Prescribir y activar la planificación semanal (desactiva la previa). */
  async guardarRutinaSemanal(
    entrenadorId: string,
    alumnoId: string,
    input: GuardarRutinaSemanalDTO
  ): Promise<RutinaSemanalDetalleDTO> {
    return guardarRutinaSemanalCaso(this.ctx, entrenadorId, alumnoId, input);
  }

  /** Rutina semanal activa del alumno. */
  async obtenerRutinaSemanalActiva(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol,
    currentUserId?: string
  ): Promise<RutinaSemanalDetalleDTO | null> {
    return obtenerRutinaSemanalActivaCaso(this.ctx, entrenadorId, alumnoId, rol, currentUserId);
  }

  /** Progreso semanal de la rutina activa (Lunes a Domingo) + racha efectiva. */
  async obtenerSemanaActualProgreso(
    alumnoId: string,
    timezoneCliente?: string
  ): Promise<SemanaEntrenamientoProgresoDTO> {
    return obtenerSemanaActualProgresoCaso(this.ctx, alumnoId, timezoneCliente);
  }

  /** Sesión de hoy (PASIVA, read-only RN-04): nunca muta; null si no hay. */
  async obtenerSesionHoy(
    alumnoId: string,
    timezoneCliente?: string,
    bloqueId?: string
  ): Promise<SesionEntrenamientoDetalleDTO | null> {
    return obtenerSesionHoyCaso(this.ctx, alumnoId, timezoneCliente, bloqueId);
  }

  /** Acción EXPLÍCITA: instancia o cambia la sesión del bloque hoy (RN-04). Idempotente. */
  async entrenarBloqueHoy(
    alumnoId: string,
    bloqueId: string,
    input: EntrenarBloqueHoyDTO = {},
    idempotencyKey?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    // RNF-002 §4: un reintento con la misma key devuelve la sesión original sin re-instaurar.
    const claveIdem = this.claveIdempotencia('entrenar-hoy', alumnoId, idempotencyKey);
    return this.idempotencia.ejecutar(claveIdem, () =>
      this.ejecutarEntrenarBloqueHoy(alumnoId, bloqueId, input)
    );
  }

  // Contrato api3 §5 (spy vía `as any`): se conserva el método y delega en el caso.
  private async ejecutarEntrenarBloqueHoy(
    alumnoId: string,
    bloqueId: string,
    input: EntrenarBloqueHoyDTO = {}
  ): Promise<SesionEntrenamientoDetalleDTO> {
    return ejecutarEntrenarBloqueHoyCaso(
      this.ctx,
      {
        // El inicio anidado pasa por el método público (con su idempotencia), igual que antes.
        iniciarSesion: (sesionId, alumnoId, dto) => this.iniciarSesion(sesionId, alumnoId, dto),
      },
      alumnoId,
      bloqueId,
      input
    );
  }

  /** Historial cronológico del alumno (envelope WU24 con COUNT SQL). */
  async obtenerHistorialSesionesAlumno(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol,
    limit = LIMITE_HISTORIAL_SESIONES_POR_DEFECTO,
    offset = 0,
    currentUserId?: string
  ): Promise<HistorialSesionesAlumnoDTO> {
    return obtenerHistorialSesionesAlumnoCaso(
      this.ctx,
      entrenadorId,
      alumnoId,
      rol,
      limit,
      offset,
      currentUserId
    );
  }

  /** Detalle de sesión por ID con verificación de permisos. */
  async obtenerSesionPorId(
    sesionId: string,
    usuarioId: string,
    rol: Rol,
    entrenadorId?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    return obtenerSesionPorIdCaso(this.ctx, sesionId, usuarioId, rol, entrenadorId);
  }

  /** Última sesión realmente entrenada (COMPLETADA o EN_PROGRESO) del alumno. */
  async obtenerUltimaSesionAlumno(
    entrenadorId: string,
    alumnoId: string,
    rol: Rol,
    currentUserId?: string
  ): Promise<SesionEntrenamientoDetalleDTO | null> {
    return obtenerUltimaSesionAlumnoCaso(this.ctx, entrenadorId, alumnoId, rol, currentUserId);
  }

  /** Iniciar sesión: PLANIFICADA → EN_PROGRESO. Idempotente por key. */
  async iniciarSesion(
    sesionId: string,
    alumnoId: string,
    input: IniciarSesionDTO,
    idempotencyKey?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    // RNF-002 §4: reintento idempotente del inicio (la transición repetida devolvería 400).
    const claveIdem = this.claveIdempotencia('iniciar', alumnoId, idempotencyKey);
    return this.idempotencia.ejecutar(claveIdem, () =>
      this.ejecutarIniciarSesion(sesionId, alumnoId, input)
    );
  }

  // Contrato api3 §5 (spy vía `as any`): se conserva el método y delega en el caso.
  private async ejecutarIniciarSesion(
    sesionId: string,
    alumnoId: string,
    input: IniciarSesionDTO
  ): Promise<SesionEntrenamientoDetalleDTO> {
    return ejecutarIniciarSesionCaso(this.ctx, sesionId, alumnoId, input);
  }

  /** Sincronizar lote de series (offline-first). Idempotente por key. */
  async sincronizarSeries(
    sesionId: string,
    alumnoId: string,
    input: SincronizarSeriesBatchDTO,
    idempotencyKey?: string
  ): Promise<SesionEntrenamientoDetalleDTO> {
    // RNF-002 §4: el batch offline reenviado con la misma key no re-aplica ni duplica series.
    const claveIdem = this.claveIdempotencia('series', alumnoId, idempotencyKey);
    return this.idempotencia.ejecutar(claveIdem, () =>
      this.ejecutarSincronizarSeries(sesionId, alumnoId, input)
    );
  }

  // Contrato api3 §5 (spy vía `as any`): se conserva el método y delega en el caso.
  private async ejecutarSincronizarSeries(
    sesionId: string,
    alumnoId: string,
    input: SincronizarSeriesBatchDTO
  ): Promise<SesionEntrenamientoDetalleDTO> {
    return ejecutarSincronizarSeriesCaso(this.ctx, sesionId, alumnoId, input);
  }

  /** Finalizar sesión: % cumplimiento, volumen, racha RN-02, evento al coach. Idempotente. */
  async finalizarSesion(
    sesionId: string,
    alumnoId: string,
    input: FinalizarSesionDTO,
    idempotencyKey?: string
  ): Promise<FinalizarSesionResponseDTO> {
    // RNF-002 §4: finalizar/omitir reenviado con la misma key devuelve la respuesta original
    // (sin recalcular racha ni re-notificar al coach).
    const claveIdem = this.claveIdempotencia('finalizar', alumnoId, idempotencyKey);
    return this.idempotencia.ejecutar(claveIdem, () =>
      this.ejecutarFinalizarSesion(sesionId, alumnoId, input)
    );
  }

  // Contrato api3 §5 (spy vía `as any`): se conserva el método y delega en el caso.
  private async ejecutarFinalizarSesion(
    sesionId: string,
    alumnoId: string,
    input: FinalizarSesionDTO
  ): Promise<FinalizarSesionResponseDTO> {
    return ejecutarFinalizarSesionCaso(this.ctx, sesionId, alumnoId, input);
  }

  /** Monitor semanal de adherencia del coach (RN-03, envelope WU24). */
  async calcularSemanaAdherencia(
    entrenadorId: string,
    timezone?: string,
    limit = LIMITE_MONITOR_ADHERENCIA_POR_DEFECTO,
    offset = 0,
    filtro?: FiltroMonitorAdherenciaDTO
  ): Promise<MonitorAdherenciaDTO> {
    return calcularSemanaAdherenciaCaso(this.ctx, entrenadorId, timezone, limit, offset, filtro);
  }

  // HELPER hidratarSesion: movido a `casos-entrenamiento/hidratar-sesion.ts` (P5).
}
