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
  Rol,
  EstadoUsuario,
  EstadoAlumno,
} from '@guachafit/shared';

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
   * Listar Directorio de Alumnos del Entrenador (RF-011, RF-012)
   */
  async listarAlumnos(entrenadorId: string): Promise<PerfilAlumnoDetalleDTO[]> {
    const records = await this.db
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
        and(
          eq(perfilesAlumno.entrenadorId, entrenadorId),
          isNull(perfilesAlumno.deletedAtUtc)
        )
      );

    return records.map((perfil) => this.sanitizarPerfilParaRol(perfil, Rol.ENTRENADOR));
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
