import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  Database,
  WithTenantFn,
  withTenant as withTenantBase,
  eq,
  usuarios,
  perfilesAlumno,
  perfilesEntrenador,
} from '@guachafit/database';
import {
  ActualizarMiPerfilDTO,
  MENSAJE_CUENTA_NO_ENCONTRADA,
  MENSAJE_DATO_NO_EDITABLE,
  MENSAJE_FICHA_NO_ENCONTRADA,
  MiPerfilDTO,
  Rol,
  TipoDocumento,
  ZONA_HORARIA_ALUMNO_POR_DEFECTO,
} from '@guachafit/shared';
import { DRIZZLE_DB, WITH_TENANT } from '../../database/database.module';

/**
 * RF-018 "Mi perfil": lectura y edición de los datos propios de cualquier rol.
 *
 * - Alumno: edita nombres, apellidos y teléfono de WhatsApp; el documento y la fecha de nacimiento
 *   se muestran pero solo los cambia su entrenador (RN-01). Lectura y escritura con el contexto
 *   del propio usuario (RLS self de `perfiles_alumno`, RNF-003).
 * - Entrenador: edita nombres, apellidos, nombre comercial y teléfono de contacto.
 * - Superadmin: no tiene ficha; ningún dato se edita por aquí.
 *
 * El correo y la contraseña viven en `AuthService` (tokens, enlaces y avisos de seguridad).
 */
@Injectable()
export class UsuariosService {
  private readonly withTenant: WithTenantFn;

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Optional() @Inject(WITH_TENANT) withTenant?: WithTenantFn
  ) {
    this.withTenant = withTenant ?? ((contexto, fn) => withTenantBase(contexto, fn, this.db));
  }

  async obtenerMiPerfil(usuarioId: string): Promise<MiPerfilDTO> {
    const [usuario] = await this.db.select().from(usuarios).where(eq(usuarios.id, usuarioId));
    if (!usuario) {
      throw new NotFoundException(MENSAJE_CUENTA_NO_ENCONTRADA);
    }

    const perfil: MiPerfilDTO = {
      id: usuario.id,
      email: usuario.email,
      rol: usuario.rol as Rol,
      correoPendiente: usuario.correoPendiente ?? null,
      correoPendienteExpiraUtc: usuario.tokenCambioCorreoExpira
        ? new Date(usuario.tokenCambioCorreoExpira).toISOString()
        : null,
      alumno: null,
      entrenador: null,
    };

    if (usuario.rol === Rol.ALUMNO) {
      const [ficha] = await this.withTenant({ usuarioId }, (tx) =>
        tx.select().from(perfilesAlumno).where(eq(perfilesAlumno.usuarioId, usuarioId))
      );
      if (ficha) {
        perfil.alumno = {
          nombres: ficha.nombres,
          apellidos: ficha.apellidos,
          telefonoWhatsapp: ficha.telefonoWhatsapp,
          tipoDocumento: ficha.tipoDocumento as TipoDocumento,
          numeroDocumento: ficha.numeroDocumento,
          fechaNacimiento: String(ficha.fechaNacimiento),
          zonaHoraria: ficha.zonaHoraria ?? ZONA_HORARIA_ALUMNO_POR_DEFECTO,
        };
      }
    } else if (usuario.rol === Rol.ENTRENADOR) {
      const [ficha] = await this.db
        .select()
        .from(perfilesEntrenador)
        .where(eq(perfilesEntrenador.usuarioId, usuarioId));
      if (ficha) {
        perfil.entrenador = {
          nombres: ficha.nombres,
          apellidos: ficha.apellidos,
          nombreComercial: ficha.nombreComercial ?? null,
          telefonoContacto: ficha.telefonoContacto,
        };
      }
    }

    return perfil;
  }

  async actualizarMiPerfil(usuarioId: string, dto: ActualizarMiPerfilDTO): Promise<MiPerfilDTO> {
    const [usuario] = await this.db
      .select({ id: usuarios.id, rol: usuarios.rol })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId));
    if (!usuario) {
      throw new NotFoundException(MENSAJE_CUENTA_NO_ENCONTRADA);
    }

    const ahora = new Date();
    if (usuario.rol === Rol.ALUMNO) {
      if (dto.nombreComercial !== undefined) {
        throw new BadRequestException(MENSAJE_DATO_NO_EDITABLE);
      }
      const cambios = {
        ...(dto.nombres !== undefined && { nombres: dto.nombres }),
        ...(dto.apellidos !== undefined && { apellidos: dto.apellidos }),
        ...(dto.telefono !== undefined && { telefonoWhatsapp: dto.telefono }),
        updatedAtUtc: ahora,
      };
      const actualizadas = await this.withTenant({ usuarioId }, (tx) =>
        tx
          .update(perfilesAlumno)
          .set(cambios)
          .where(eq(perfilesAlumno.usuarioId, usuarioId))
          .returning({ id: perfilesAlumno.id })
      );
      if (actualizadas.length === 0) {
        throw new NotFoundException(MENSAJE_FICHA_NO_ENCONTRADA);
      }
    } else if (usuario.rol === Rol.ENTRENADOR) {
      const cambios = {
        ...(dto.nombres !== undefined && { nombres: dto.nombres }),
        ...(dto.apellidos !== undefined && { apellidos: dto.apellidos }),
        ...(dto.telefono !== undefined && { telefonoContacto: dto.telefono }),
        ...(dto.nombreComercial !== undefined && { nombreComercial: dto.nombreComercial }),
        updatedAtUtc: ahora,
      };
      const actualizadas = await this.db
        .update(perfilesEntrenador)
        .set(cambios)
        .where(eq(perfilesEntrenador.usuarioId, usuarioId))
        .returning({ id: perfilesEntrenador.id });
      if (actualizadas.length === 0) {
        throw new NotFoundException(MENSAJE_FICHA_NO_ENCONTRADA);
      }
    } else {
      // El superadmin no tiene ficha: ningún dato se edita desde "Mi perfil".
      throw new BadRequestException(MENSAJE_DATO_NO_EDITABLE);
    }

    return this.obtenerMiPerfil(usuarioId);
  }
}
