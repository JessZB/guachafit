/**
 * RF-003 RN-01 / RN-04 / §6 (WU RF-003a): calendario de periodicidad y ventana del check-in remoto.
 *
 * Este módulo es PURO (sin Nest, sin DB) para que las reglas del doc se testeen con zonas horarias
 * reales sin infraestructura:
 *
 * 1. **Periodicidad (RN-01, precondición 2)**: `Semanal`, `Quincenal` o `Mensual`, anclada en la
 *    fecha `antropometriaInicio`. Las fechas programadas son `inicio + k * intervalo` (días para
 *    semanal/quincenal, meses calendario para mensual). Sin ancla o sin periodicidad NO hay
 *    calendario: la ventana de RN-04 no aplica y el alumno conserva el comportamiento previo.
 *
 * 2. **Ventana (RN-04 + §6)**: el doc define la ventana como "día programado ± 24 horas" y, en
 *    §6, como "la ventana de 48 h". Ambas lecturas coinciden en UNA sola: desde las 00:00 locales
 *    de `D-1` hasta las 00:00 locales de `D+1` (fin EXCLUSIVO), es decir 48 horas exactas alrededor
 *    del día programado `D` en el día local del alumno.
 *
 * 3. **Día local**: se usa la zona IANA del usuario (`usuarios.timezone`) — mismo patrón que
 *    nutrición y entrenamiento (`adherencia.util.ts`)—; una zona inválida cae a
 *    `America/Caracas`, la zona por defecto del producto.
 *
 * Barril: reexporta las piezas de `periodicidad/` con la misma lista de nombres; los consumidores
 * importan desde esta ruta sin cambios.
 */
export * from './periodicidad/constantes';
export * from './periodicidad/calendario-reglas';
export * from './periodicidad/ventana-reglas';
export * from './periodicidad/recordatorio-reglas';
