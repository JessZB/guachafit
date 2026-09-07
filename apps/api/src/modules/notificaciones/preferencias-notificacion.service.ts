import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database, eq, preferenciasNotificacion, usuarios } from '@guachafit/database';
import {
  PreferenciasNotificacionDTO,
  ActualizarPreferenciasNotificacionDTO,
} from '@guachafit/shared';

@Injectable()
export class PreferenciasNotificacionService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Obtiene las preferencias de notificación de un usuario.
   * Si no existen, las inicializa con los defaults del sistema (RF-015).
   */
  async obtenerPreferencias(usuarioId: string): Promise<PreferenciasNotificacionDTO> {
    const [existente] = await this.db
      .select()
      .from(preferenciasNotificacion)
      .where(eq(preferenciasNotificacion.usuarioId, usuarioId))
      .limit(1);

    if (existente) {
      return this.mapearPreferencias(existente);
    }

    // Verificar que el usuario exista antes de crear preferencias
    const [user] = await this.db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    if (!user) {
      throw new NotFoundException(`Usuario con ID '${usuarioId}' no encontrado`);
    }

    // Crear con defaults óptimos
    const nowUtc = new Date();
    const [nuevo] = await this.db
      .insert(preferenciasNotificacion)
      .values({
        usuarioId,
        notifyPaymentsPush: true,
        notifyPaymentsEmail: true,
        notifyWorkoutsPush: true,
        notifyWorkoutsEmail: false,
        notifyCheckinsPush: true,
        notifyCheckinsEmail: false,
        digestWeeklyEmail: false,
        updatedAtUtc: nowUtc,
      })
      .returning();

    return this.mapearPreferencias(nuevo);
  }

  /**
   * Actualiza las preferencias del usuario respetando las reglas de negocio (RF-015).
   */
  async actualizarPreferencias(
    usuarioId: string,
    dto: ActualizarPreferenciasNotificacionDTO
  ): Promise<PreferenciasNotificacionDTO> {
    // Asegurarse de que exista el registro base
    await this.obtenerPreferencias(usuarioId);

    const nowUtc = new Date();
    const updateData: Partial<typeof preferenciasNotificacion.$inferInsert> = {
      updatedAtUtc: nowUtc,
    };

    if (dto.notifyPaymentsPush !== undefined) updateData.notifyPaymentsPush = dto.notifyPaymentsPush;
    if (dto.notifyPaymentsEmail !== undefined) updateData.notifyPaymentsEmail = dto.notifyPaymentsEmail;
    if (dto.notifyWorkoutsPush !== undefined) updateData.notifyWorkoutsPush = dto.notifyWorkoutsPush;
    if (dto.notifyWorkoutsEmail !== undefined) updateData.notifyWorkoutsEmail = dto.notifyWorkoutsEmail;
    if (dto.notifyCheckinsPush !== undefined) updateData.notifyCheckinsPush = dto.notifyCheckinsPush;
    if (dto.notifyCheckinsEmail !== undefined) updateData.notifyCheckinsEmail = dto.notifyCheckinsEmail;
    if (dto.digestWeeklyEmail !== undefined) updateData.digestWeeklyEmail = dto.digestWeeklyEmail;

    const [actualizado] = await this.db
      .update(preferenciasNotificacion)
      .set(updateData)
      .where(eq(preferenciasNotificacion.usuarioId, usuarioId))
      .returning();

    return this.mapearPreferencias(actualizado);
  }

  private mapearPreferencias(item: typeof preferenciasNotificacion.$inferSelect): PreferenciasNotificacionDTO {
    return {
      id: item.id,
      usuarioId: item.usuarioId,
      notifyPaymentsPush: item.notifyPaymentsPush,
      notifyPaymentsEmail: item.notifyPaymentsEmail,
      notifyWorkoutsPush: item.notifyWorkoutsPush,
      notifyWorkoutsEmail: item.notifyWorkoutsEmail,
      notifyCheckinsPush: item.notifyCheckinsPush,
      notifyCheckinsEmail: item.notifyCheckinsEmail,
      digestWeeklyEmail: item.digestWeeklyEmail,
      updatedAtUtc:
        item.updatedAtUtc instanceof Date
          ? item.updatedAtUtc.toISOString()
          : new Date(item.updatedAtUtc).toISOString(),
    };
  }
}
