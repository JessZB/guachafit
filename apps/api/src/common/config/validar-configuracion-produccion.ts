/**
 * Barril de la validación de arranque: reexporta la superficie pública sin cambiarla.
 *
 * Las piezas viven en `validacion-produccion/`: constantes, tipos, reglas de la clave de
 * cifrado, lectura de CORS, resumen local con Swagger y la validación que las une.
 *
 * Los reexports son explícitos (no `export *`): los auxiliares que las piezas comparten entre
 * sí (`problemasCors`, `primerValor`, etc.) no forman parte de la superficie pública.
 */
export {
  ENCRYPTION_KEY_DESARROLLO,
  STORAGE_ACCESS_KEY_EJEMPLO,
  STORAGE_SECRET_KEY_EJEMPLO,
  STORAGE_BUCKET_EJEMPLO,
  BULL_BOARD_PASS_EJEMPLO,
  LONGITUD_MINIMA_BULL_BOARD_PASS,
} from './validacion-produccion/constantes-configuracion';
export type {
  ProblemaConfiguracion,
  ResultadoValidacionConfiguracion,
  AnalisisClaveCifrado,
  MotivoClaveCifrado,
} from './validacion-produccion/tipos-configuracion';
export { mensajeClaveCifrado, analizarClaveCifrado } from './validacion-produccion/clave-cifrado-reglas';
export { origenesCors } from './validacion-produccion/origenes-cors';
export {
  resumenProblemasConfiguracion,
  debeExponerSwagger,
} from './validacion-produccion/resumen-swagger';
export { validarConfiguracionProduccion } from './validacion-produccion/validar-configuracion';
