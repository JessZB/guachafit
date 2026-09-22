import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import { Database, eq, preferenciasNotificacion, usuarios } from '@guachafit/database';
import {
  ActualizarPreferenciasNotificacionDTO,
  CAMPO_CONFIRMACION_FINANZAS,
  CANALES_OBLIGATORIOS_NOTIFICACION,
  CampoPreferenciaNotificacion,
  CategoriaPreferenciasDTO,
  MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD,
  MENSAJE_MINIMO_CANAL_FINANZAS,
  PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
  PreferenciasNotificacionDTO,
  Rol,
  matrizPreferenciasPorRol,
} from '@guachafit/shared';

/** Campos de la matriz completa (mismo orden que el contrato compartido). */
const CAMPOS_PREFERENCIA = Object.keys(
  PREFERENCIAS_NOTIFICACION_POR_DEFECTO
) as CampoPreferenciaNotificacion[];

@Injectable()
export class PreferenciasNotificacionService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  /**
   * Obtiene la matriz de preferencias de un usuario (RF-015).
   *
   * - Si el usuario no tiene fila, la crea con los defaults del doc (`§A`/`§B`) según su rol.
   * - Devuelve la matriz completa del rol (RF-015 §A para alumnos, §B para entrenadores) más los
   *   campos planos por compatibilidad.
   */
  async obtenerPreferencias(usuarioId: string): Promise<PreferenciasNotificacionDTO> {
    const [existente] = await this.db
      .select()
      .from(preferenciasNotificacion)
      .where(eq(preferenciasNotificacion.usuarioId, usuarioId))
      .limit(1);

    if (existente) {
      const rol = (await this.resolverRol(usuarioId)) ?? Rol.ALUMNO;
      return this.mapearPreferencias(existente, rol);
    }

    // Verificar que el usuario exista antes de crear preferencias (y resolver su rol).
    const rol = await this.resolverRol(usuarioId);

    if (!rol) {
      throw new NotFoundException(`Usuario con ID '${usuarioId}' no encontrado`);
    }

    const [nuevo] = await this.db
      .insert(preferenciasNotificacion)
      .values({
        usuarioId,
        // Defaults óptimos del doc (RF-015 §A/§B), fuente única en `@guachafit/shared`.
        ...PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
        updatedAtUtc: new Date(),
      })
      .returning();

    return this.mapearPreferencias(nuevo, rol);
  }

  /**
   * Actualiza la matriz del usuario autenticado (RF-015 §A/§B) validando las reglas de negocio
   * sobre el estado EFECTIVO (lo persistido + lo que llega en el PUT):
   *
   * - **RN-01**: el correo de seguridad no puede desactivarse (400 con mensaje claro).
   * - **RN-02**: apagar Push y Email de Finanzas exige confirmación explícita; sin ella, 400 con la
   *   advertencia exacta del doc y el campo de confirmación para reintentar.
   * - Los campos que no pertenecen al rol del usuario se rechazan (no se configura una dimensión
   *   que su rol no gobierna).
   */
  async actualizarPreferencias(
    usuarioId: string,
    dto: ActualizarPreferenciasNotificacionDTO
  ): Promise<PreferenciasNotificacionDTO> {
    const actual = await this.obtenerPreferencias(usuarioId);

    this.validarPertenenciaAlRol(actual.rol, dto);

    // Estado efectivo: los campos ausentes del payload conservan lo persistido.
    const efectivo = {} as Record<CampoPreferenciaNotificacion, boolean>;
    for (const campo of CAMPOS_PREFERENCIA) {
      efectivo[campo] = dto[campo] ?? actual[campo];
    }

    this.validarReglasDeNegocio(efectivo, dto);

    const updateData: Partial<typeof preferenciasNotificacion.$inferInsert> = {
      updatedAtUtc: new Date(),
    };
    for (const campo of CAMPOS_PREFERENCIA) {
      const valor = dto[campo];
      if (valor !== undefined) {
        updateData[campo] = valor;
      }
    }

    const [actualizado] = await this.db
      .update(preferenciasNotificacion)
      .set(updateData)
      .where(eq(preferenciasNotificacion.usuarioId, usuarioId))
      .returning();

    return this.mapearPreferencias(actualizado, actual.rol);
  }

  /** Rol del usuario (una fila por usuario con la matriz completa: el rol decide qué mitad aplica). */
  private async resolverRol(usuarioId: string): Promise<Rol | null> {
    const [fila] = await this.db
      .select({ rol: usuarios.rol })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId))
      .limit(1);

    return fila?.rol ?? null;
  }

  /** RN-01 + RN-02 sobre el estado efectivo. */
  private validarReglasDeNegocio(
    efectivo: Record<CampoPreferenciaNotificacion, boolean>,
    dto: ActualizarPreferenciasNotificacionDTO
  ): void {
    if (efectivo.notifySeguridadEmail === false) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'RN-01',
        message: MENSAJE_CANAL_OBLIGATORIO_SEGURIDAD,
        canalObligatorio: 'notifySeguridadEmail',
      });
    }

    const sinCanalesFinanzas =
      efectivo.notifyPaymentsPush === false && efectivo.notifyPaymentsEmail === false;

    if (sinCanalesFinanzas && !dto[CAMPO_CONFIRMACION_FINANZAS]) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'RN-02',
        message: MENSAJE_MINIMO_CANAL_FINANZAS,
        advertencia: true,
        requiereConfirmacion: true,
        campoConfirmacion: CAMPO_CONFIRMACION_FINANZAS,
      });
    }
  }

  /** Cada rol gobierna solo su mitad de la matriz (RF-015 §A/§B). */
  private validarPertenenciaAlRol(
    rol: Rol,
    dto: ActualizarPreferenciasNotificacionDTO
  ): void {
    const permitidos = new Set(
      matrizPreferenciasPorRol(rol).flatMap((fila) => [fila.push, fila.email])
    );

    const ajenos = CAMPOS_PREFERENCIA.filter(
      (campo) => dto[campo] !== undefined && !permitidos.has(campo)
    );

    if (ajenos.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'RF-015',
        message:
          `Campos de preferencia que no pertenecen al rol '${rol}': ${ajenos.join(', ')}. ` +
          'Cada rol configura únicamente su matriz.',
        camposRechazados: ajenos,
      });
    }
  }

  private mapearPreferencias(
    item: typeof preferenciasNotificacion.$inferSelect,
    rol: Rol
  ): PreferenciasNotificacionDTO {
    const seguridadEmailObligatorio = CANALES_OBLIGATORIOS_NOTIFICACION.includes(
      'notifySeguridadEmail'
    );

    const matriz: CategoriaPreferenciasDTO[] = matrizPreferenciasPorRol(rol).map((fila) => {
      const pushObligatorio = fila.canalesObligatorios.includes('push');
      const emailObligatorio = fila.canalesObligatorios.includes('email');

      return {
        id: fila.id,
        etiqueta: fila.etiqueta,
        // Un canal obligatorio se reporta SIEMPRE activo, aunque una fila legada lo tuviera apagado
        // (RN-01: el despachador lo fuerza igualmente).
        push: pushObligatorio ? true : item[fila.push],
        email: emailObligatorio ? true : item[fila.email],
        canalesObligatorios: [...fila.canalesObligatorios],
      };
    });

    return {
      id: item.id,
      usuarioId: item.usuarioId,
      rol,
      notifyPaymentsPush: item.notifyPaymentsPush,
      notifyPaymentsEmail: item.notifyPaymentsEmail,
      notifyWorkoutsPush: item.notifyWorkoutsPush,
      notifyWorkoutsEmail: item.notifyWorkoutsEmail,
      notifyCheckinsPush: item.notifyCheckinsPush,
      notifyCheckinsEmail: item.notifyCheckinsEmail,
      notifySeguridadPush: item.notifySeguridadPush,
      notifySeguridadEmail: seguridadEmailObligatorio ? true : item.notifySeguridadEmail,
      notifyCobranzasPush: item.notifyCobranzasPush,
      notifyCobranzasEmail: item.notifyCobranzasEmail,
      notifyNuevosRegistrosPush: item.notifyNuevosRegistrosPush,
      notifyNuevosRegistrosEmail: item.notifyNuevosRegistrosEmail,
      notifyReportesProgresoPush: item.notifyReportesProgresoPush,
      notifyReportesProgresoEmail: item.notifyReportesProgresoEmail,
      digestWeeklyPush: item.digestWeeklyPush,
      digestWeeklyEmail: item.digestWeeklyEmail,
      updatedAtUtc:
        item.updatedAtUtc instanceof Date
          ? item.updatedAtUtc.toISOString()
          : new Date(item.updatedAtUtc).toISOString(),
      matriz,
      canalesObligatorios: [...CANALES_OBLIGATORIOS_NOTIFICACION],
    };
  }
}
