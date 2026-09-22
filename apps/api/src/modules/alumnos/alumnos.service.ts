import {
  Injectable,
  Inject,
  Logger,
  Optional,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import {
  Database,
  eq,
  and,
  or,
  isNull,
  isNotNull,
  ilike,
  inArray,
  ne,
  notInArray,
  count,
  countDistinct,
  desc,
  asc,
  cuotasMembresia,
  usuarios,
  perfilesAlumno,
  perfilesEntrenador,
  overridesClientePlan,
  planesMembresia,
} from '@guachafit/database';
import { CryptoService } from '../../common/services/crypto.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlumnoRegistradoEvent } from '../notificaciones/events/eventos-notificacion';
import {
  AltaManualAlumnoDTO,
  AltaManualAlumnoResultadoDTO,
  CoachPublicoDTO,
  RegistroPublicoAlumnoDTO,
  CambioEstadoAlumnoDTO,
  ActualizarPerfilAlumnoDTO,
  PerfilAlumnoDetalleDTO,
  FiltroDirectorioAlumnosDTO,
  RestaurarAlumnoDTO,
  ResumenDirectorioAlumnosDTO,
  DirectorioAlumnosDTO,
  LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO,
  Rol,
  EstadoUsuario,
  EstadoAlumno,
  EstadoCuota,
  EstadoLicencia,
  Modalidad,
} from '@guachafit/shared';
import {
  condicionCuotaEnMora,
  condicionCuotaPorVencer,
  escaparPatronLike,
} from '../../common/cartera.util';

/**
 * WU25a: UUID nil (RFC 4122) para representar "sin candidatos" en un `IN`.
 * `IN ()` no es SQL válido y un filtro sin coincidencias debe devolver 0 filas (no romper la
 * consulta); ningún perfil real usa este UUID.
 */
const UUID_SIN_CANDIDATOS = '00000000-0000-4000-8000-000000000000';

/**
 * §6: etiquetas humanas del estado de activación para los mensajes devueltos al usuario.
 * Nunca se interpola el valor crudo del enum (`inactivo_pausado`).
 */
const ETIQUETA_ESTADO_ACTIVACION: Record<EstadoAlumno, string> = {
  [EstadoAlumno.ACTIVO]: 'activo',
  [EstadoAlumno.INACTIVO_PAUSADO]: 'pausado',
  [EstadoAlumno.SUSPENDIDO_PAGO]: 'suspendido por pago',
};

@Injectable()
export class AlumnosService {
  private readonly logger = new Logger(AlumnosService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly cryptoService: CryptoService,
    // RF-014 / WU-E: el alta por deep link publica un evento de dominio para el coach (RN-07.4).
    // Opcional para no romper los consumidores que instancian el servicio sin bus de eventos.
    @Optional() private readonly eventEmitter?: EventEmitter2
  ) {}

  /**
   * Cálculo dinámico de edad según fecha de nacimiento (RF-011, RN-02)
   */
  calcularEdad(fechaNacimiento: string): number {
    const nacimiento = new Date(fechaNacimiento);
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
    return Math.max(0, edad);
  }

  /**
   * Sanitiza el DTO según el rol del actor que consulta (RF-011, Escenario 3 / RNF-003)
   * Los alumnos jamás ven la ficha de salud privada; los coaches la reciben desencriptada.
   */
  sanitizarPerfilParaRol(perfil: any, actorRole: Rol): PerfilAlumnoDetalleDTO {
    let fichaSalud: string | null = null;

    if (actorRole === Rol.ENTRENADOR || actorRole === Rol.SUPERADMIN) {
      if (perfil.fichaSaludPrivada) {
        try {
          fichaSalud = this.cryptoService.decryptHealthRecord(perfil.fichaSaludPrivada);
        } catch {
          fichaSalud = perfil.fichaSaludPrivada;
        }
      }
    }

    return {
      id: perfil.id,
      usuarioId: perfil.usuarioId,
      entrenadorId: perfil.entrenadorId,
      tipoDocumento: perfil.tipoDocumento,
      numeroDocumento: perfil.numeroDocumento,
      nombres: perfil.nombres,
      apellidos: perfil.apellidos,
      email: perfil.email ?? null,
      fechaNacimiento: perfil.fechaNacimiento,
      edadCalculada: this.calcularEdad(perfil.fechaNacimiento),
      telefonoWhatsapp: perfil.telefonoWhatsapp,
      modalidad: perfil.modalidad,
      estadoActivacion: perfil.estadoActivacion,
      tasaFijadaOverride: perfil.tasaFijadaOverride,
      // RF-005: plan y tarifa hidratados (override vigente > plan de la última cuota). Nunca
      // se inventa un plan: si no hay dato real, quedan `null` y la UI muestra "Sin plan asignado".
      planActivoId: perfil.planActivoId ?? null,
      planActivoNombre: perfil.planActivoNombre ?? null,
      precioAcordadoOverride: perfil.precioAcordadoOverride ?? null,
      fichaSaludPrivada: fichaSalud,
      deletedAtUtc: perfil.deletedAtUtc ? new Date(perfil.deletedAtUtc).toISOString() : null,
      createdAtUtc: perfil.createdAtUtc ? new Date(perfil.createdAtUtc).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Alta Manual de Alumno por el Entrenador (RF-011, Vía A)
   *
   * WU-E (RN-05): el backend NO envía correos por sí mismo (no existe adaptador de email en este
   * flujo). Devuelve el token de un solo uso para que el entrenador comparta el enlace de
   * activación; el mensaje nunca afirma un envío que no ocurrió.
   */
  async crearAlumnoManual(
    entrenadorId: string,
    dto: AltaManualAlumnoDTO
  ): Promise<AltaManualAlumnoResultadoDTO> {
    // 1. Verificar unicidad de correo
    const [existente] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

    if (existente) {
      throw new ConflictException(
        'Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña.'
      );
    }

    // 2. Cifrar ficha de salud si se suministra (RNF-003)
    const fichaCifrada = dto.fichaSaludPrivada
      ? this.cryptoService.encryptHealthRecord(dto.fichaSaludPrivada)
      : null;

    // 3. Generar token de bienvenida SHA-256 (TTL 48h)
    const { rawToken, tokenHash, expiresAt } = this.cryptoService.generateInvitationToken();

    // 4. Crear usuario en estado activo
    const [nuevoUsuario] = await this.db
      .insert(usuarios)
      .values({
        email: dto.email.toLowerCase().trim(),
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.ACTIVO,
        tokenInvitacionHash: tokenHash,
        tokenInvitacionExpira: expiresAt,
        activo: true,
      })
      .returning();

    // 5. Crear perfil de alumno
    const [nuevoPerfil] = await this.db
      .insert(perfilesAlumno)
      .values({
        usuarioId: nuevoUsuario.id,
        entrenadorId: entrenadorId,
        tipoDocumento: dto.tipoDocumento,
        numeroDocumento: dto.numeroDocumento.trim(),
        nombres: dto.nombres.trim(),
        apellidos: dto.apellidos.trim(),
        fechaNacimiento: dto.fechaNacimiento,
        telefonoWhatsapp: dto.telefonoWhatsapp.trim(),
        fichaSaludPrivada: fichaCifrada,
        modalidad: dto.modalidad,
        tasaFijadaOverride: dto.tasaFijadaOverride || null,
        estadoActivacion: EstadoAlumno.ACTIVO,
      })
      .returning();

    return {
      id: nuevoPerfil.id,
      nombres: nuevoPerfil.nombres,
      apellidos: nuevoPerfil.apellidos,
      email: nuevoUsuario.email,
      edadCalculada: this.calcularEdad(nuevoPerfil.fechaNacimiento),
      modalidad: nuevoPerfil.modalidad,
      estadoActivacion: nuevoPerfil.estadoActivacion,
      tokenInvitacion: rawToken, // Único momento en que el token en claro sale del backend
      mensaje:
        'Alumno registrado con éxito. Comparte el enlace de activación con tu alumno para que cree su contraseña.',
    };
  }

  /**
   * Resolución Pública del `coach_code` para el Deep Link de captación (RF-011, RN-06/RN-07.1).
   *
   * Solo devuelve identidad comercial del coach cuando el código existe Y su licencia está
   * vigente. Un código inexistente y uno con licencia suspendida responden igual (404): nunca se
   * filtra qué códigos existen. No expone datos sensibles (teléfono, capacidad, cartera, etc.).
   */
  async resolverCoachPublico(code: string): Promise<CoachPublicoDTO> {
    const codigoNormalizado = code.trim().toUpperCase();

    const [coach] = await this.db
      .select()
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.coachCode, codigoNormalizado));

    if (!coach || coach.estadoLicencia !== EstadoLicencia.ACTIVA) {
      throw new NotFoundException(
        'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
      );
    }

    return {
      coachCode: coach.coachCode,
      nombre: `${coach.nombres} ${coach.apellidos}`.trim(),
      nombreComercial: coach.nombreComercial,
    };
  }

  /**
   * Registro Público Autónomo vía Deep Link coachCode (RF-011, Vía B)
   *
   * RN-07: valida el código y la vigencia de la licencia del coach, crea la cuenta vinculada al
   * tenant y notifica al coach del nuevo registro.
   */
  async registroPublico(dto: RegistroPublicoAlumnoDTO) {
    // 1. Validar existencia del coach_code (los códigos se persisten en mayúsculas)
    const [coach] = await this.db
      .select()
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.coachCode, dto.coachCode.trim().toUpperCase()));

    if (!coach) {
      throw new NotFoundException(
        'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
      );
    }

    // RN-07.1: el deep link solo puede vincular alumnos a un coach con licencia vigente.
    // Mismo mensaje que un código inexistente: no se filtra el estado de licencia de un coach.
    if (coach.estadoLicencia !== EstadoLicencia.ACTIVA) {
      throw new NotFoundException(
        'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.'
      );
    }

    // 2. Validar que el correo no esté duplicado
    const [existente] = await this.db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, dto.email.toLowerCase().trim()));

    if (existente) {
      throw new ConflictException(
        'Este correo ya se encuentra registrado. Si eres tú, inicia sesión o recupera tu contraseña.'
      );
    }

    // 3. Hashear contraseña
    const passwordHash = await this.cryptoService.hashPassword(dto.password);

    // 4. Crear usuario alumno
    const [nuevoUsuario] = await this.db
      .insert(usuarios)
      .values({
        email: dto.email.toLowerCase().trim(),
        passwordHash,
        rol: Rol.ALUMNO,
        estado: EstadoUsuario.ACTIVO,
        activo: true,
      })
      .returning();

    // 5. Vincular alumno al tenant del coach
    const [nuevoPerfil] = await this.db
      .insert(perfilesAlumno)
      .values({
        usuarioId: nuevoUsuario.id,
        entrenadorId: coach.usuarioId,
        tipoDocumento: dto.tipoDocumento,
        numeroDocumento: dto.numeroDocumento.trim(),
        nombres: dto.nombres.trim(),
        apellidos: dto.apellidos.trim(),
        fechaNacimiento: dto.fechaNacimiento,
        telefonoWhatsapp: dto.telefonoWhatsapp.trim(),
        modalidad: dto.modalidad,
        estadoActivacion: EstadoAlumno.ACTIVO,
      })
      .returning();

    // 6. RN-07.4: notificar al coach del nuevo registro por la infraestructura existente
    //    (RF-014). Fire-and-forget: un fallo de la bandeja/colas NUNCA tumba el alta del alumno.
    this.notificarCoachNuevoAlumno(coach, {
      alumnoId: nuevoPerfil.id,
      usuarioId: nuevoUsuario.id,
      email: nuevoUsuario.email,
      nombres: nuevoPerfil.nombres,
      apellidos: nuevoPerfil.apellidos,
    });

    return {
      id: nuevoPerfil.id,
      nombres: nuevoPerfil.nombres,
      email: nuevoUsuario.email,
      coachAsignado: coach.nombreComercial || `${coach.nombres} ${coach.apellidos}`,
      mensaje: 'Registro completado con éxito.',
    };
  }

  /**
   * WU-E (RF-011 RN-07.4): publica el evento de dominio "Nuevo alumno registrado" hacia el coach.
   * La categoría `ALUMNOS` ("Nuevos Registros" en RF-015 §B) se persiste siempre en la bandeja
   * In-App (RF-014 RN-04); los canales externos quedan deshabilitados hasta que RF-015 defina
   * sus columnas de preferencia (no se reutilizan las de otra categoría).
   */
  private notificarCoachNuevoAlumno(
    coach: { usuarioId: string; coachCode: string; nombres: string; apellidos: string; nombreComercial: string | null },
    alumno: {
      alumnoId: string;
      usuarioId: string;
      email: string;
      nombres: string;
      apellidos: string;
    }
  ): void {
    if (!this.eventEmitter) return;

    const nombreCompleto = `${alumno.nombres} ${alumno.apellidos}`.trim();

    // RF-014 RN-01: fire-and-forget; un fallo del bus/colas NUNCA tumba el alta del alumno.
    void this.eventEmitter
      .emitAsync(
        AlumnoRegistradoEvent.NOMBRE,
        new AlumnoRegistradoEvent({
          tipoEvento: 'ALUMNO_REGISTRADO',
          destinatarioUserId: coach.usuarioId,
          entrenadorId: coach.usuarioId,
          categoria: 'ALUMNOS',
          titulo: 'Nuevo alumno registrado',
          cuerpo: `${nombreCompleto} se registró con tu enlace de invitación.`,
          linkAccion: `/coach/alumnos/${alumno.alumnoId}`,
          datosAdicionales: {
            alumnoId: alumno.alumnoId,
            usuarioId: alumno.usuarioId,
            email: alumno.email,
            coachCode: coach.coachCode,
          },
          esCriticoSeguridad: false,
          // RNF-004 §3: ref de origen del jobId determinista.
          referenciaId: alumno.alumnoId,
        })
      )
      .catch((error) => {
        this.logger.warn(
          `No se pudo notificar al coach ${coach.usuarioId} el registro del alumno ${alumno.alumnoId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
  }

  /**
   * Cambio de estado de activación del alumno (RF-012)
   */
  async cambiarEstado(entrenadorId: string, alumnoId: string, dto: CambioEstadoAlumnoDTO) {
    const [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.id, alumnoId),
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      );

    if (!perfil) {
      throw new NotFoundException('El alumno especificado no existe o no pertenece a su cartera.');
    }

    const [actualizado] = await this.db
      .update(perfilesAlumno)
      .set({
        estadoActivacion: dto.nuevoEstado,
        updatedAtUtc: new Date(),
      })
      .where(eq(perfilesAlumno.id, alumnoId))
      .returning();

    return {
      id: actualizado.id,
      estadoActivacion: actualizado.estadoActivacion,
      mensaje: `El estado del alumno ha sido actualizado a ${
        ETIQUETA_ESTADO_ACTIVACION[actualizado.estadoActivacion] ?? 'sin dato'
      }.`,
    };
  }

  /**
   * Edición completa de la ficha e información de alumnos por el entrenador (RF-011, RF-012)
   */
  async actualizarAlumno(
    entrenadorId: string,
    alumnoId: string,
    dto: ActualizarPerfilAlumnoDTO
  ): Promise<PerfilAlumnoDetalleDTO> {
    const [perfil] = await this.db
      .select({
        id: perfilesAlumno.id,
        usuarioId: perfilesAlumno.usuarioId,
        entrenadorId: perfilesAlumno.entrenadorId,
        tipoDocumento: perfilesAlumno.tipoDocumento,
        numeroDocumento: perfilesAlumno.numeroDocumento,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
        email: usuarios.email,
        fechaNacimiento: perfilesAlumno.fechaNacimiento,
        telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
        fichaSaludPrivada: perfilesAlumno.fichaSaludPrivada,
        estadoActivacion: perfilesAlumno.estadoActivacion,
        modalidad: perfilesAlumno.modalidad,
        tasaFijadaOverride: perfilesAlumno.tasaFijadaOverride,
        deletedAtUtc: perfilesAlumno.deletedAtUtc,
        createdAtUtc: perfilesAlumno.createdAtUtc,
      })
      .from(perfilesAlumno)
      .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
      .where(
        or(
          eq(perfilesAlumno.id, alumnoId),
          eq(perfilesAlumno.usuarioId, alumnoId)
        )
      );

    if (!perfil) {
      throw new NotFoundException('Alumno no encontrado');
    }

    if (perfil.entrenadorId !== entrenadorId) {
      throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
    }

    // RF-012 RN-02/RN-04: un alumno archivado sólo admite la restauración; editar su expediente
    // mientras está de baja sería operar sobre una cuenta sin acceso operativo.
    if (perfil.deletedAtUtc) {
      throw new ConflictException(
        'El alumno está dado de baja. Restáuralo para volver a operar sobre su expediente.'
      );
    }

    const valoresAActualizar: Record<string, any> = {
      updatedAtUtc: new Date(),
    };

    if (dto.nombres !== undefined) {
      valoresAActualizar.nombres = dto.nombres.trim();
    }
    if (dto.apellidos !== undefined) {
      valoresAActualizar.apellidos = dto.apellidos.trim();
    }
    if (dto.tipoDocumento !== undefined) {
      valoresAActualizar.tipoDocumento = dto.tipoDocumento;
    }
    if (dto.numeroDocumento !== undefined) {
      valoresAActualizar.numeroDocumento = dto.numeroDocumento.trim();
    }
    if (dto.fechaNacimiento !== undefined) {
      valoresAActualizar.fechaNacimiento = dto.fechaNacimiento;
    }
    if (dto.telefonoWhatsapp !== undefined) {
      valoresAActualizar.telefonoWhatsapp = dto.telefonoWhatsapp.trim();
    }
    if (dto.modalidad !== undefined) {
      valoresAActualizar.modalidad = dto.modalidad;
    }
    if (dto.tasaFijadaOverride !== undefined) {
      valoresAActualizar.tasaFijadaOverride = dto.tasaFijadaOverride || null;
    }
    if (dto.fichaSaludPrivada !== undefined) {
      valoresAActualizar.fichaSaludPrivada =
        dto.fichaSaludPrivada && dto.fichaSaludPrivada.trim().length > 0
          ? this.cryptoService.encryptHealthRecord(dto.fichaSaludPrivada)
          : null;
    }

    const [actualizado] = await this.db
      .update(perfilesAlumno)
      .set(valoresAActualizar)
      .where(eq(perfilesAlumno.id, perfil.id))
      .returning();

    const perfilActualizadoConEmail = {
      ...actualizado,
      email: perfil.email,
    };

    // RF-005: la respuesta del PATCH conserva plan activo y precio acordado reales (la UI fusiona
    // la respuesta en su estado; sin esto el expediente perdería el plan hasta recargar).
    const planActivo = (
      await this.hidratarPlanActivo(actualizado.entrenadorId, [actualizado.usuarioId])
    ).get(actualizado.usuarioId);

    return this.sanitizarPerfilParaRol(
      planActivo ? { ...perfilActualizadoConEmail, ...planActivo } : perfilActualizadoConEmail,
      Rol.ENTRENADOR
    );
  }

  /**
   * Borrado Lógico (Soft Delete) de Alumno (RF-012, RN-01, RN-02)
   * Prohibición absoluta de sentencias DELETE físicas
   */
  async softDelete(entrenadorId: string, alumnoId: string) {
    const [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.id, alumnoId),
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      );

    if (!perfil) {
      throw new NotFoundException('El alumno especificado no existe o no pertenece a su cartera.');
    }

    const nowUtc = new Date();
    await this.db
      .update(perfilesAlumno)
      .set({
        deletedAtUtc: nowUtc,
        updatedAtUtc: nowUtc,
      })
      .where(eq(perfilesAlumno.id, alumnoId));

    return {
      id: alumnoId,
      deletedAtUtc: nowUtc.toISOString(),
      mensaje: 'Alumno dado de baja exitosamente. Su histórico deportivo y financiero ha sido preservado.',
    };
  }

  /**
   * Restauración de Alumno Dado de Baja Lógica (RF-012, RN-04)
   */
  async restaurarAlumno(entrenadorId: string, alumnoId: string, _dto?: RestaurarAlumnoDTO) {
    const [perfil] = await this.db
      .select()
      .from(perfilesAlumno)
      .where(
        and(
          eq(perfilesAlumno.id, alumnoId),
          eq(perfilesAlumno.entrenadorId, entrenadorId)
        )
      );

    if (!perfil) {
      // Verificar si el alumno existe pero pertenece a otro entrenador
      const [perfilOtroCoach] = await this.db
        .select()
        .from(perfilesAlumno)
        .where(eq(perfilesAlumno.id, alumnoId));

      if (perfilOtroCoach) {
        throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a restaurar alumno de otro entrenador.');
      }

      throw new NotFoundException('El alumno especificado no existe o no pertenece a su cartera.');
    }

    // Idempotencia: si ya está activo
    if (!perfil.deletedAtUtc && perfil.estadoActivacion === EstadoAlumno.ACTIVO) {
      return {
        id: alumnoId,
        estadoActivacion: EstadoAlumno.ACTIVO,
        deletedAtUtc: null,
        mensaje: 'El alumno ya se encuentra activo en su cartera.',
      };
    }

    const nowUtc = new Date();
    await this.db
      .update(perfilesAlumno)
      .set({
        deletedAtUtc: null,
        estadoActivacion: EstadoAlumno.ACTIVO,
        updatedAtUtc: nowUtc,
      })
      .where(eq(perfilesAlumno.id, alumnoId));

    await this.db
      .update(usuarios)
      .set({
        activo: true,
        estado: EstadoUsuario.ACTIVO,
        updatedAtUtc: nowUtc,
      })
      .where(eq(usuarios.id, perfil.usuarioId));

    return {
      id: alumnoId,
      estadoActivacion: EstadoAlumno.ACTIVO,
      deletedAtUtc: null,
      mensaje: 'Alumno restaurado exitosamente. Todo su histórico deportivo y financiero ha sido reactivado.',
    };
  }

  /**
   * Listar Directorio de Alumnos del Entrenador (RF-011, RF-012)
   *
   * WU19: respuesta paginada `{ items, total, limit, offset, resumen }`.
   * - `items`: página actual (default 100, techo 100) con la búsqueda y filtros aplicados EN SQL,
   *   con orden estable por `createdAtUtc` + `id` para que el offset no repita ni salte filas.
   * - `total`: COUNT real de filas que cumplen la consulta (sin traer el resto a memoria).
   * - `resumen`: contadores de la cartera COMPLETA (COUNT en el servidor) para los KPIs del
   *   directorio; no dependen de la página, la búsqueda ni los filtros.
   *
   * WU24: la búsqueda server-side acepta `q` (canónico) o `busqueda` (alias legado) y combina
   * ILIKE con escape de `%`, `_` y `\` sobre nombre/apellido/correo/documento.
   *
   * WU25a: `soloArchivados` (pestaña dedicada de archivados) y `semaforoPago` (pestaña "En Mora")
   * se resuelven también en SQL, ANTES del `limit`/`offset`, para que la paginación numerada sea
   * coherente entre páginas. El `resumen` nunca se altera por los filtros.
   *
   * `incluirArchivados: true` devuelve la cartera completa (vigentes + archivados); el default
   * `false` mantiene la semántica histórica de solo alumnos vigentes.
   */
  async listarAlumnos(
    entrenadorId: string,
    filtro?: FiltroDirectorioAlumnosDTO
  ): Promise<DirectorioAlumnosDTO> {
    const limit = filtro?.limit ?? LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO;
    const offset = filtro?.offset ?? 0;
    // WU24: `q` es el parámetro canónico; `busqueda` (WU19) se mantiene como alias legado.
    const busqueda = (filtro?.q ?? filtro?.busqueda ?? '').trim();

    const conditions = [eq(perfilesAlumno.entrenadorId, entrenadorId)];

    if (filtro?.soloArchivados) {
      // WU25a: pestaña "Archivados" (RF-012 RN-05): SOLO dados de baja lógica.
      conditions.push(isNotNull(perfilesAlumno.deletedAtUtc));
    } else if (!filtro?.incluirArchivados) {
      conditions.push(isNull(perfilesAlumno.deletedAtUtc));
    }

    if (filtro?.estado) {
      conditions.push(eq(perfilesAlumno.estadoActivacion, filtro.estado));
    }

    if (filtro?.modalidad) {
      conditions.push(eq(perfilesAlumno.modalidad, filtro.modalidad));
    }

    if (filtro?.semaforoPago) {
      // WU25a: filtro por semáforo de pago server-side, para que la pestaña "En Mora" pagine
      // de verdad (antes se filtraba en memoria sobre la página cargada).
      const condicionPago = await this.condicionSemaforoPago(entrenadorId, filtro.semaforoPago);
      if (condicionPago) conditions.push(condicionPago);
    }

    if (busqueda.length > 0) {
      // Paridad con la búsqueda previa en memoria (case-insensitive por nombre/apellido/correo/
      // documento) pero resuelta en SQL para poder paginar y contar de verdad. El patrón escapa
      // `%`, `_` y `\` para que el texto del usuario se trate como literal.
      const patron = `%${escaparPatronLike(busqueda)}%`;
      conditions.push(
        or(
          ilike(perfilesAlumno.nombres, patron),
          ilike(perfilesAlumno.apellidos, patron),
          ilike(usuarios.email, patron),
          ilike(perfilesAlumno.numeroDocumento, patron)
        )!
      );
    }

    const whereDirectorio = and(...conditions);

    const [filaTotal, records, resumen] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(perfilesAlumno)
        .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
        .where(whereDirectorio),
      this.db
        .select({
          id: perfilesAlumno.id,
          usuarioId: perfilesAlumno.usuarioId,
          entrenadorId: perfilesAlumno.entrenadorId,
          tipoDocumento: perfilesAlumno.tipoDocumento,
          numeroDocumento: perfilesAlumno.numeroDocumento,
          nombres: perfilesAlumno.nombres,
          apellidos: perfilesAlumno.apellidos,
          email: usuarios.email,
          fechaNacimiento: perfilesAlumno.fechaNacimiento,
          telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
          fichaSaludPrivada: perfilesAlumno.fichaSaludPrivada,
          estadoActivacion: perfilesAlumno.estadoActivacion,
          modalidad: perfilesAlumno.modalidad,
          tasaFijadaOverride: perfilesAlumno.tasaFijadaOverride,
          deletedAtUtc: perfilesAlumno.deletedAtUtc,
          createdAtUtc: perfilesAlumno.createdAtUtc,
        })
        .from(perfilesAlumno)
        .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
        .where(whereDirectorio)
        .orderBy(desc(perfilesAlumno.createdAtUtc), asc(perfilesAlumno.id))
        .limit(limit)
        .offset(offset),
      this.calcularResumenDirectorio(entrenadorId),
    ]);

    // WU23: semáforo de pago real por fila (misma regla de mora que `resumen.morosos`) para que
    // la pestaña "En Mora" y los badges de fila coincidan con el KPI del servidor.
    const semaforosPago = await this.hidratarSemaforoPago(
      entrenadorId,
      records.map((perfil) => perfil.usuarioId)
    );

    // RF-005: plan activo y precio acordado por fila (una consulta en lote, sin N+1).
    const planesActivos = await this.hidratarPlanActivo(
      entrenadorId,
      records.map((perfil) => perfil.usuarioId)
    );

    const items = records.map((perfil) => {
      const planActivo = planesActivos.get(perfil.usuarioId);
      return {
        ...this.sanitizarPerfilParaRol(
          planActivo ? { ...perfil, ...planActivo } : perfil,
          Rol.ENTRENADOR
        ),
        // El helper asigna una entrada por cada `usuarioId` recibido: siempre hay valor.
        semaforoPago: semaforosPago.get(perfil.usuarioId)!,
      };
    });

    return {
      items,
      total: Number(filaTotal[0]?.total ?? 0),
      limit,
      offset,
      resumen,
    };
  }

  /**
   * WU19: contadores reales de la cartera para los KPIs del directorio.
   *
   * Tres COUNT en el servidor (jamás se traen los perfiles a memoria):
   * 1. Agrupado de alumnos vigentes por estado + modalidad (suma de grupos).
   * 2. Archivados (soft-deleted).
   * 3. Morosos: alumnos vigentes con al menos una cuota vencida; se reutiliza la misma regla
   *    de la bandeja "Alumnos en Mora" del dashboard (`entrenador.service.ts`) para no divergir.
   */
  private async calcularResumenDirectorio(
    entrenadorId: string
  ): Promise<ResumenDirectorioAlumnosDTO> {
    const ahora = new Date();

    const [grupos, filaArchivados, filaMorosos] = await Promise.all([
      this.db
        .select({
          estadoActivacion: perfilesAlumno.estadoActivacion,
          modalidad: perfilesAlumno.modalidad,
          total: count(),
        })
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.entrenadorId, entrenadorId),
            isNull(perfilesAlumno.deletedAtUtc)
          )
        )
        .groupBy(perfilesAlumno.estadoActivacion, perfilesAlumno.modalidad),
      this.db
        .select({ total: count() })
        .from(perfilesAlumno)
        .where(
          and(
            eq(perfilesAlumno.entrenadorId, entrenadorId),
            isNotNull(perfilesAlumno.deletedAtUtc)
          )
        ),
      this.db
        .select({ total: countDistinct(cuotasMembresia.clienteId) })
        .from(cuotasMembresia)
        .innerJoin(
          perfilesAlumno,
          and(
            eq(perfilesAlumno.usuarioId, cuotasMembresia.clienteId),
            eq(perfilesAlumno.entrenadorId, entrenadorId),
            isNull(perfilesAlumno.deletedAtUtc)
          )
        )
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            condicionCuotaEnMora(ahora)
          )
        ),
    ]);

    const resumen: ResumenDirectorioAlumnosDTO = {
      total: 0,
      activos: 0,
      pausados: 0,
      morosos: Number(filaMorosos[0]?.total ?? 0),
      presenciales: 0,
      remotos: 0,
      archivados: Number(filaArchivados[0]?.total ?? 0),
    };

    for (const grupo of grupos) {
      const cantidad = Number(grupo.total ?? 0);
      resumen.total += cantidad;
      if (grupo.estadoActivacion === EstadoAlumno.ACTIVO) resumen.activos += cantidad;
      if (grupo.estadoActivacion === EstadoAlumno.INACTIVO_PAUSADO) resumen.pausados += cantidad;
      if (grupo.modalidad === Modalidad.PRESENCIAL) resumen.presenciales += cantidad;
      if (grupo.modalidad === Modalidad.REMOTO) resumen.remotos += cantidad;
    }
    resumen.total += resumen.archivados;

    return resumen;
  }

  /**
   * WU25a: condición SQL para filtrar el directorio por semáforo de pago.
   *
   * Reutiliza la MISMA regla de mora del resumen (`condicionCuotaEnMora`) y la misma definición
   * de "al día" que `hidratarSemaforoPago` (tiene al menos una cuota no anulada y ninguna en
   * mora). El conjunto de ids se resuelve en una consulta agregada previa (sin subqueries en el
   * WHERE, que romperían el aislamiento por tenant y la lectura del plan).
   *
   * `sin_cuota` es el complemento (no tiene ninguna cuota registrada): se expresa con un
   * `NOT IN` sobre los alumnos con cuota; si nadie tiene cuota, no se agrega condición.
   */
  private async condicionSemaforoPago(
    entrenadorId: string,
    semaforo: 'moroso' | 'al_dia' | 'sin_cuota'
  ) {
    const { enMora, conCuota } = await this.calcularConjuntosSemaforoPago(entrenadorId);

    if (semaforo === 'sin_cuota') {
      const conCuotaLista = [...conCuota];
      return conCuotaLista.length > 0
        ? notInArray(perfilesAlumno.usuarioId, conCuotaLista)
        : undefined;
    }

    const ids =
      semaforo === 'moroso'
        ? [...enMora]
        : [...conCuota].filter((usuarioId) => !enMora.has(usuarioId));

    return inArray(perfilesAlumno.usuarioId, ids.length > 0 ? ids : [UUID_SIN_CANDIDATOS]);
  }

  /**
   * WU25a/WU23/WU-H: conjuntos de alumnos por semáforo de pago con tres consultas en lote:
   * 1. `enMora`: alumnos con al menos una cuota que cumple `condicionCuotaEnMora`.
   * 2. `porVencer`: alumnos con al menos una cuota que cumple `condicionCuotaPorVencer`.
   * 3. `conCuota`: alumnos con al menos una cuota no anulada (vigente o vencida).
   *
   * Sin `alumnoUsuarioIds` cubre la cartera completa del coach (filtro server-side); con la
   * lista de la página, solo esos alumnos (hidratación por fila, sin N+1).
   */
  private async calcularConjuntosSemaforoPago(
    entrenadorId: string,
    alumnoUsuarioIds?: string[]
  ): Promise<{ enMora: Set<string>; porVencer: Set<string>; conCuota: Set<string> }> {
    const ahora = new Date();
    const filtroAlumnos =
      alumnoUsuarioIds && alumnoUsuarioIds.length > 0
        ? inArray(cuotasMembresia.clienteId, alumnoUsuarioIds)
        : undefined;

    const [filasMorosas, filasPorVencer, filasConCuota] = await Promise.all([
      this.db
        .select({ clienteId: cuotasMembresia.clienteId })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            filtroAlumnos,
            condicionCuotaEnMora(ahora)
          )
        ),
      this.db
        .select({ clienteId: cuotasMembresia.clienteId })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            filtroAlumnos,
            condicionCuotaPorVencer(ahora)
          )
        ),
      this.db
        .select({ clienteId: cuotasMembresia.clienteId })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            filtroAlumnos,
            ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
          )
        ),
    ]);

    return {
      enMora: new Set(filasMorosas.map((fila) => fila.clienteId)),
      porVencer: new Set(filasPorVencer.map((fila) => fila.clienteId)),
      conCuota: new Set(filasConCuota.map((fila) => fila.clienteId)),
    };
  }

  /**
   * WU23: hidrata `semaforoPago` de la página listada del directorio.
   *
   * Contexto: la pestaña "En Mora" y los badges de fila dependían de `semaforoPago`, un campo
   * que ninguna ruta del API completaba (siempre `undefined` => la UI asumía "Al día"). Con el
   * KPI `resumen.morosos` ya real, la pestaña decía "En Mora (N)" y la lista mostraba 0 filas.
   *
   * Reutiliza `calcularConjuntosSemaforoPago` (misma condición de mora que el resumen) limitado a
   * los `usuarioId` de la página, para no traer las cuotas de toda la cartera:
   * 1. `moroso`: tiene al menos una cuota que cumple la condición de mora.
   * 2. `por_vencer`: no está en mora y tiene una cuota impaga a ≤5 días del corte (WU-H).
   * 3. `al_dia`: tiene al menos una cuota no anulada que no está en mora ni por vencer.
   * 4. `sin_cuota`: no tiene ninguna cuota registrada (ni vigente ni vencida).
   */
  private async hidratarSemaforoPago(
    entrenadorId: string,
    alumnoUsuarioIds: string[]
  ): Promise<Map<string, 'al_dia' | 'por_vencer' | 'moroso' | 'sin_cuota'>> {
    const semaforos = new Map<string, 'al_dia' | 'por_vencer' | 'moroso' | 'sin_cuota'>();
    if (alumnoUsuarioIds.length === 0) return semaforos;

    const { enMora, porVencer, conCuota } = await this.calcularConjuntosSemaforoPago(
      entrenadorId,
      alumnoUsuarioIds
    );

    for (const usuarioId of alumnoUsuarioIds) {
      semaforos.set(
        usuarioId,
        enMora.has(usuarioId)
          ? 'moroso'
          : porVencer.has(usuarioId)
          ? 'por_vencer'
          : conCuota.has(usuarioId)
          ? 'al_dia'
          : 'sin_cuota'
      );
    }

    return semaforos;
  }

  /**
   * RF-005: hidrata el "plan activo" y el precio acordado de un lote de alumnos.
   *
   * Semántica (no hay columna de plan asignado en `perfiles_alumno`; el plan se deriva de datos
   * reales, nunca de un valor inventado):
   * 1. Override vigente del alumno (el más reciente si tuviera varios): define plan activo,
   *    nombre del plan y `precioAcordadoUsd` (puede ser 0.00 en becados).
   * 2. Sin override: el plan de la ÚLTIMA cuota emitida por el coach (la deuda vigente describe
   *    el plan contratado). `precioAcordadoOverride` queda `null` (hereda precio del catálogo).
   * 3. Sin override ni cuotas: sin plan (los campos quedan `null` y la UI dice "Sin plan asignado").
   *
   * El aislamiento de tenant se garantiza filtrando por los planes y cuotas del propio entrenador;
   * se resuelve con consultas en lote (sin N+1) sobre las tablas `overrides_cliente_plan`,
   * `planes_membresia` y `cuotas_membresia`.
   */
  private async hidratarPlanActivo(
    entrenadorId: string,
    alumnoUsuarioIds: string[]
  ): Promise<
    Map<
      string,
      { planActivoId: string | null; planActivoNombre: string | null; precioAcordadoOverride: string | null }
    >
  > {
    const planesActivos = new Map<
      string,
      { planActivoId: string | null; planActivoNombre: string | null; precioAcordadoOverride: string | null }
    >();
    const ids = [...new Set(alumnoUsuarioIds)].filter(Boolean);
    if (ids.length === 0) return planesActivos;

    const planes = await this.db
      .select({
        id: planesMembresia.id,
        nombre: planesMembresia.nombre,
        precioBaseUsd: planesMembresia.precioBaseUsd,
      })
      .from(planesMembresia)
      .where(eq(planesMembresia.entrenadorId, entrenadorId));

    if (planes.length === 0) return planesActivos;
    const planesPorId = new Map(planes.map((plan) => [plan.id, plan]));
    const idsPlanes = planes.map((plan) => plan.id);

    // 1. Overrides del lote (más recientes primero) — solo de planes del coach.
    const overrides = await this.db
      .select()
      .from(overridesClientePlan)
      .where(
        and(
          inArray(overridesClientePlan.clienteId, ids),
          inArray(overridesClientePlan.planId, idsPlanes)
        )
      )
      .orderBy(desc(overridesClientePlan.updatedAtUtc), desc(overridesClientePlan.id));

    for (const override of overrides) {
      if (planesActivos.has(override.clienteId)) continue;
      const plan = planesPorId.get(override.planId);
      if (!plan) continue;
      planesActivos.set(override.clienteId, {
        planActivoId: plan.id,
        planActivoNombre: plan.nombre,
        precioAcordadoOverride: override.precioAcordadoUsd ?? null,
      });
    }

    // 2. Sin override: plan de la última cuota emitida por el coach (una consulta en lote).
    const sinOverride = ids.filter((usuarioId) => !planesActivos.has(usuarioId));
    if (sinOverride.length > 0) {
      const cuotas = await this.db
        .select({
          clienteId: cuotasMembresia.clienteId,
          planId: cuotasMembresia.planId,
          createdAtUtc: cuotasMembresia.createdAtUtc,
        })
        .from(cuotasMembresia)
        .where(
          and(
            inArray(cuotasMembresia.clienteId, sinOverride),
            eq(cuotasMembresia.entrenadorId, entrenadorId)
          )
        )
        .orderBy(desc(cuotasMembresia.createdAtUtc), desc(cuotasMembresia.id));

      for (const cuota of cuotas) {
        if (planesActivos.has(cuota.clienteId)) continue;
        const plan = planesPorId.get(cuota.planId);
        if (!plan) continue;
        planesActivos.set(cuota.clienteId, {
          planActivoId: plan.id,
          planActivoNombre: plan.nombre,
          precioAcordadoOverride: null,
        });
      }
    }

    return planesActivos;
  }

  /**
   * Obtener perfil por ID con aislamiento de Tenancy
   */
  async obtenerPorId(alumnoId: string, actorUserId: string, actorRole: Rol, actorEntrenadorId?: string) {
    const [perfil] = await this.db
      .select({
        id: perfilesAlumno.id,
        usuarioId: perfilesAlumno.usuarioId,
        entrenadorId: perfilesAlumno.entrenadorId,
        tipoDocumento: perfilesAlumno.tipoDocumento,
        numeroDocumento: perfilesAlumno.numeroDocumento,
        nombres: perfilesAlumno.nombres,
        apellidos: perfilesAlumno.apellidos,
        email: usuarios.email,
        fechaNacimiento: perfilesAlumno.fechaNacimiento,
        telefonoWhatsapp: perfilesAlumno.telefonoWhatsapp,
        fichaSaludPrivada: perfilesAlumno.fichaSaludPrivada,
        estadoActivacion: perfilesAlumno.estadoActivacion,
        modalidad: perfilesAlumno.modalidad,
        tasaFijadaOverride: perfilesAlumno.tasaFijadaOverride,
        deletedAtUtc: perfilesAlumno.deletedAtUtc,
        createdAtUtc: perfilesAlumno.createdAtUtc,
      })
      .from(perfilesAlumno)
      .innerJoin(usuarios, eq(perfilesAlumno.usuarioId, usuarios.id))
      .where(eq(perfilesAlumno.id, alumnoId));

    if (!perfil) {
      throw new NotFoundException('Alumno no encontrado');
    }

    // Aislamiento: El alumno solo puede verse a sí mismo
    if (actorRole === Rol.ALUMNO && perfil.usuarioId !== actorUserId) {
      throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro alumno.');
    }

    // Aislamiento: El coach solo puede ver a alumnos de su tenant
    if (actorRole === Rol.ENTRENADOR && perfil.entrenadorId !== actorEntrenadorId && perfil.entrenadorId !== actorUserId) {
      throw new ForbiddenException('Aislamiento de Tenant: Acceso denegado a datos de otro entrenador.');
    }

    // RF-005: plan activo + precio acordado reales del expediente (override o última cuota).
    const planActivo = (
      await this.hidratarPlanActivo(perfil.entrenadorId, [perfil.usuarioId])
    ).get(perfil.usuarioId);

    return this.sanitizarPerfilParaRol(
      planActivo ? { ...perfil, ...planActivo } : perfil,
      actorRole
    );
  }
}
