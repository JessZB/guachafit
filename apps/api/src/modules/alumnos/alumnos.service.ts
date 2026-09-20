import {
  Injectable,
  Inject,
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
  lt,
  gt,
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
} from '@guachafit/database';
import { CryptoService } from '../../common/services/crypto.service';
import {
  AltaManualAlumnoDTO,
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
  Modalidad,
} from '@guachafit/shared';

/**
 * Escapa `%`, `_` y `\` de un término de búsqueda para usarlo como patrón LIKE literal
 * (Postgres usa `\` como escape por defecto en `ILIKE`).
 */
function escaparPatronLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

/**
 * WU23: regla ÚNICA de "cuota en mora" (idéntica a la bandeja "Alumnos en Mora" del dashboard,
 * `entrenador.service.ts`):
 * - la cuota está marcada como VENCIDA, o
 * - su fecha de corte ya pasó, tiene saldo pendiente y su estado no es AL_DIA/ANULADA.
 *
 * Se usa tanto para el COUNT del resumen del directorio como para hidratar `semaforoPago` por
 * fila: una sola definición, cero divergencia entre el KPI "En Mora" y la lista filtrada.
 */
function condicionCuotaEnMora(ahora: Date) {
  return or(
    eq(cuotasMembresia.estado, EstadoCuota.VENCIDA),
    and(
      lt(cuotasMembresia.fechaCorteUtc, ahora),
      gt(cuotasMembresia.saldoPendienteUsd, '0'),
      notInArray(cuotasMembresia.estado, [EstadoCuota.AL_DIA, EstadoCuota.ANULADA])
    )
  )!;
}

@Injectable()
export class AlumnosService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly cryptoService: CryptoService
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
      fichaSaludPrivada: fichaSalud,
      deletedAtUtc: perfil.deletedAtUtc ? new Date(perfil.deletedAtUtc).toISOString() : null,
      createdAtUtc: perfil.createdAtUtc ? new Date(perfil.createdAtUtc).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Alta Manual de Alumno por el Entrenador (RF-011, Vía A)
   */
  async crearAlumnoManual(entrenadorId: string, dto: AltaManualAlumnoDTO) {
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
      tokenInvitacion: rawToken, // Solo se retorna en el alta para disparo de correo de bienvenida
      mensaje: 'Alumno registrado con éxito. Se ha enviado un correo con el enlace de activación.',
    };
  }

  /**
   * Registro Público Autónomo vía Deep Link coachCode (RF-011, Vía B)
   */
  async registroPublico(dto: RegistroPublicoAlumnoDTO) {
    // 1. Validar existencia del coach_code
    const [coach] = await this.db
      .select()
      .from(perfilesEntrenador)
      .where(eq(perfilesEntrenador.coachCode, dto.coachCode));

    if (!coach) {
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

    return {
      id: nuevoPerfil.id,
      nombres: nuevoPerfil.nombres,
      email: nuevoUsuario.email,
      coachAsignado: coach.nombreComercial || `${coach.nombres} ${coach.apellidos}`,
      mensaje: 'Registro completado con éxito.',
    };
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
      mensaje: `El estado del alumno ha sido actualizado a ${actualizado.estadoActivacion}.`,
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

    return this.sanitizarPerfilParaRol(perfilActualizadoConEmail, Rol.ENTRENADOR);
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
   * `incluirArchivados: true` devuelve la cartera completa (vigentes + archivados); el default
   * `false` mantiene la semántica histórica de solo alumnos vigentes.
   */
  async listarAlumnos(
    entrenadorId: string,
    filtro?: FiltroDirectorioAlumnosDTO
  ): Promise<DirectorioAlumnosDTO> {
    const limit = filtro?.limit ?? LIMITE_DIRECTORIO_ALUMNOS_POR_DEFECTO;
    const offset = filtro?.offset ?? 0;
    const busqueda = (filtro?.busqueda ?? '').trim();

    const conditions = [eq(perfilesAlumno.entrenadorId, entrenadorId)];

    if (!filtro?.incluirArchivados) {
      conditions.push(isNull(perfilesAlumno.deletedAtUtc));
    }

    if (filtro?.estado) {
      conditions.push(eq(perfilesAlumno.estadoActivacion, filtro.estado));
    }

    if (filtro?.modalidad) {
      conditions.push(eq(perfilesAlumno.modalidad, filtro.modalidad));
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

    const items = records.map((perfil) => ({
      ...this.sanitizarPerfilParaRol(perfil, Rol.ENTRENADOR),
      // El helper asigna una entrada por cada `usuarioId` recibido: siempre hay valor.
      semaforoPago: semaforosPago.get(perfil.usuarioId)!,
    }));

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
   * WU23: hidrata `semaforoPago` de la página listada del directorio.
   *
   * Contexto: la pestaña "En Mora" y los badges de fila dependían de `semaforoPago`, un campo
   * que ninguna ruta del API completaba (siempre `undefined` => la UI asumía "Al día"). Con el
   * KPI `resumen.morosos` ya real, la pestaña decía "En Mora (N)" y la lista mostraba 0 filas.
   *
   * Dos consultas en lote sobre las cuotas de los alumnos listados (sin N+1), coherentes con la
   * MISMA condición de mora del resumen (`condicionCuotaEnMora`):
   * 1. `moroso`: tiene al menos una cuota que cumple la condición de mora.
   * 2. `al_dia`: tiene al menos una cuota no anulada que no está en mora.
   * 3. `sin_cuota`: no tiene ninguna cuota registrada (ni vigente ni vencida).
   */
  private async hidratarSemaforoPago(
    entrenadorId: string,
    alumnoUsuarioIds: string[]
  ): Promise<Map<string, 'al_dia' | 'moroso' | 'sin_cuota'>> {
    const semaforos = new Map<string, 'al_dia' | 'moroso' | 'sin_cuota'>();
    if (alumnoUsuarioIds.length === 0) return semaforos;

    const ahora = new Date();
    const [filasMorosas, filasConCuota] = await Promise.all([
      this.db
        .select({ clienteId: cuotasMembresia.clienteId })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            inArray(cuotasMembresia.clienteId, alumnoUsuarioIds),
            condicionCuotaEnMora(ahora)
          )
        ),
      this.db
        .select({ clienteId: cuotasMembresia.clienteId })
        .from(cuotasMembresia)
        .where(
          and(
            eq(cuotasMembresia.entrenadorId, entrenadorId),
            inArray(cuotasMembresia.clienteId, alumnoUsuarioIds),
            ne(cuotasMembresia.estado, EstadoCuota.ANULADA)
          )
        ),
    ]);

    const enMora = new Set(filasMorosas.map((fila) => fila.clienteId));
    const conCuota = new Set(filasConCuota.map((fila) => fila.clienteId));

    for (const usuarioId of alumnoUsuarioIds) {
      semaforos.set(
        usuarioId,
        enMora.has(usuarioId) ? 'moroso' : conCuota.has(usuarioId) ? 'al_dia' : 'sin_cuota'
      );
    }

    return semaforos;
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

    return this.sanitizarPerfilParaRol(perfil, actorRole);
  }
}
