/** Recolección de los problemas del panel Bull-Board. */
import {
  NOMBRE_BULL_BOARD_PASS,
  NOMBRE_BULL_BOARD_USER,
  type EntornoConfiguracion,
} from './lectura-entorno';
import {
  BULL_BOARD_PASS_EJEMPLO,
  LONGITUD_MINIMA_BULL_BOARD_PASS,
} from './constantes-configuracion';
import type { ProblemaConfiguracion } from './tipos-configuracion';

export function problemasBullBoard(entorno: EntornoConfiguracion): ProblemaConfiguracion[] {
  const usuario = (entorno[NOMBRE_BULL_BOARD_USER] ?? '').trim();
  if (!usuario) return [];

  const password = (entorno[NOMBRE_BULL_BOARD_PASS] ?? '').trim();
  if (!password) {
    return [
      {
        variable: NOMBRE_BULL_BOARD_PASS,
        mensaje:
          `${NOMBRE_BULL_BOARD_PASS}: falta. Con ${NOMBRE_BULL_BOARD_USER} configurado, en ` +
          'producción la contraseña del panel Bull-Board es obligatoria y debe tener al menos ' +
          `${LONGITUD_MINIMA_BULL_BOARD_PASS} caracteres.`,
      },
    ];
  }
  if (password === BULL_BOARD_PASS_EJEMPLO) {
    return [
      {
        variable: NOMBRE_BULL_BOARD_PASS,
        mensaje:
          `${NOMBRE_BULL_BOARD_PASS}: conserva el valor de ejemplo "${BULL_BOARD_PASS_EJEMPLO}". ` +
          'En producción usa una contraseña propia de al menos ' +
          `${LONGITUD_MINIMA_BULL_BOARD_PASS} caracteres.`,
      },
    ];
  }
  if (password.length < LONGITUD_MINIMA_BULL_BOARD_PASS) {
    return [
      {
        variable: NOMBRE_BULL_BOARD_PASS,
        mensaje:
          `${NOMBRE_BULL_BOARD_PASS}: tiene ${password.length} caracteres; en producción debe ` +
          `tener al menos ${LONGITUD_MINIMA_BULL_BOARD_PASS}.`,
      },
    ];
  }
  return [];
}
