/**
 * V12 (M5-L1B): zona horaria determinista para toda la suite de la web.
 *
 * Los specs de día local fijan el reloj a instantes con offset −04:00 (p. ej.
 * `2026-10-09T23:30:00-04:00`) y esperan el día local del proyecto (`America/Caracas`). Sin esto,
 * el día local depende de la zona del runner: en UTC, las 23:30 de Caracas ya son el día siguiente
 * y los specs fallan en CI.
 *
 * `process.env.TZ` se asigna aquí, en el setup que corre en cada worker ANTES de importar los
 * tests. Node ≥ 16 relee la zona al cambiarla en runtime (también en Windows), así que
 * `new Date(...).getDate()` y las APIs `Intl` locales usan Caracas con independencia de la zona
 * del sistema. `vitest.config.ts` también la fija en el proceso principal para que los workers la
 * hereden desde su creación (doble garantía: local y CI).
 */
process.env.TZ = 'America/Caracas';
