import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database, eq, and, dispositivosUsuario, usuarios } from '@guachafit/database';
import { RegistrarDispositivoDTO, DispositivoUsuarioDTO } from '@guachafit/shared';

@Injectable()
export class DispositivosService {
  private readonly logger = new Logger(DispositivosService.name);

  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Registro y renovación idempotente de tokens Web Push / FCM / APNs (RF-016 RN-02).
   * Si el token ya existe para ese usuario, asegura isActive = true y actualiza timestamp.
   * Si pertenecía a otro usuario previo (ej. teléfono transferido), lo reasigna al usuario actual.
   */
  async registrarToken(
    usuarioId: string,
    dto: RegistrarDispositivoDTO
  ): Promise<DispositivoUsuarioDTO> {
    const nowUtc = new Date();

    // Validar existencia del usuario
    const [user] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`Usuario con ID '${usuarioId}' no encontrado`);
    }

    // Buscar si el token ya existe en la base de datos
    const [existente] = await this.db
      .select()
      .from(dispositivosUsuario)
      .where(eq(dispositivosUsuario.deviceToken, dto.deviceToken))
      .limit(1);

    if (existente) {
      const [actualizado] = await this.db
        .update(dispositivosUsuario)
        .set({
          usuarioId,
          platform: dto.platform,
          isActive: true,
          updatedAtUtc: nowUtc,
        })
        .where(eq(dispositivosUsuario.id, existente.id))
        .returning();

      this.logger.log(`Token '${dto.deviceToken.slice(0, 12)}...' renovado para usuario ${usuarioId}`);
      return this.mapearDispositivo(actualizado);
    }

    // Nuevo dispositivo
    const [nuevo] = await this.db
      .insert(dispositivosUsuario)
      .values({
        usuarioId,
        deviceToken: dto.deviceToken,
        platform: dto.platform,
        isActive: true,
        updatedAtUtc: nowUtc,
      })
      .returning();

    this.logger.log(`Nuevo dispositivo registrado para usuario ${usuarioId} (${dto.platform})`);
    return this.mapearDispositivo(nuevo);
  }

  /**
   * Desactivación de dispositivo por logout (RF-016 RN-03).
   * Marca isActive = false para el token específico del usuario.
   */
  async desactivarToken(usuarioId: string, deviceToken: string): Promise<boolean> {
    const nowUtc = new Date();

    const [actualizado] = await this.db
      .update(dispositivosUsuario)
      .set({
        isActive: false,
        updatedAtUtc: nowUtc,
      })
      .where(
        and(
          eq(dispositivosUsuario.usuarioId, usuarioId),
          eq(dispositivosUsuario.deviceToken, deviceToken)
        )
      )
      .returning();

    if (!actualizado) {
      throw new NotFoundException(`Dispositivo con token '${deviceToken.slice(0, 12)}...' no encontrado para este usuario`);
    }

    this.logger.log(`Dispositivo desactivado por logout para usuario ${usuarioId}`);
    return true;
  }

  /**
   * Lista todos los dispositivos activos registrados de un usuario (RF-016 RN-01).
   */
  async listarDispositivosActivos(usuarioId: string): Promise<DispositivoUsuarioDTO[]> {
    const rows = await this.db
      .select()
      .from(dispositivosUsuario)
      .where(
        and(
          eq(dispositivosUsuario.usuarioId, usuarioId),
          eq(dispositivosUsuario.isActive, true)
        )
      );

    return rows.map((r) => this.mapearDispositivo(r));
  }

  /**
   * Depuración reactiva automática ante errores del proveedor (RF-016 RN-04).
   * Invocado por los workers cuando FCM/APNs responden que el token es inválido o no registrado.
   */
  async marcarTokenInvalido(deviceToken: string): Promise<void> {
    const nowUtc = new Date();
    await this.db
      .update(dispositivosUsuario)
      .set({
        isActive: false,
        updatedAtUtc: nowUtc,
      })
      .where(eq(dispositivosUsuario.deviceToken, deviceToken));

    this.logger.warn(`[Auto-Depuración] Token caducado o app desinstalada: '${deviceToken.slice(0, 12)}...' marcado inactivo.`);
  }

  private mapearDispositivo(item: typeof dispositivosUsuario.$inferSelect): DispositivoUsuarioDTO {
    return {
      id: item.id,
      usuarioId: item.usuarioId,
      deviceToken: item.deviceToken,
      platform: item.platform,
      isActive: item.isActive,
      updatedAtUtc:
        item.updatedAtUtc instanceof Date
          ? item.updatedAtUtc.toISOString()
          : new Date(item.updatedAtUtc).toISOString(),
    };
  }
}
