/**
 * Reglas puras del mensaje de recordatorio manual RN-02 (movida sin cambios desde
 * `cartera.service.ts`; la fachada la re-exporta para conservar el contrato).
 */

/**
 * Tipo de evento del recordatorio MANUAL (RF-009 RN-02). Distinto de los hitos automáticos de
 * WU-H (`CUOTA_VENCIDA`, `CUOTA_POR_VENCER`, ...) para no confundir una gestión del coach con un
 * recordatorio programado — y para poder medir el cooldown anti-spam.
 */
export const TIPO_EVENTO_RECORDATORIO_MANUAL = 'RECORDATORIO_MANUAL_COBRO';

/**
 * Horas mínimas entre dos recordatorios manuales al mismo alumno.
 *
 * El RF-009 no fija un límite; este cooldown evita el spam por doble clic o recordatorios
 * repetidos en la misma jornada sin bloquear una gestión legítima del día siguiente.
 */
export const HORAS_COOLDOWN_RECORDATORIO_MANUAL = 6;

/** Titular mínimo que necesita el compositor del mensaje manual (RN-02). */
export interface DatosMensajeRecordatorioManual {
  nombre: string;
  saldoPendienteUsd: string;
  saldoPendienteBs: string | null;
  periodo: string | null;
}

/**
 * Compositor PURO del mensaje manual (RN-02): incluye el saldo exacto en USD y, si existe tasa
 * vigente, su equivalente en Bs. Los datos bancarios del coach aún no se persisten en el modelo,
 * por lo que el mensaje no los inventa.
 */
export function construirMensajeRecordatorioManual(
  datos: DatosMensajeRecordatorioManual
): { titulo: string; cuerpo: string } {
  const saldoDual = datos.saldoPendienteBs
    ? `$${datos.saldoPendienteUsd} USD (o Bs. ${datos.saldoPendienteBs})`
    : `$${datos.saldoPendienteUsd} USD`;
  const ciclo = datos.periodo ? ` de ${datos.periodo}` : '';

  return {
    titulo: 'Recordatorio de pago',
    cuerpo:
      `Hola ${datos.nombre}, tu mensualidad${ciclo} tiene un saldo pendiente de ${saldoDual}. ` +
      'Puedes reportar tu pago desde la app para mantener tu plan al día.',
  };
}
