/** Tipos públicos de la validación de arranque. */

/** Problema de configuración: la variable afectada y el texto que ve el operador. */
export interface ProblemaConfiguracion {
  variable: string;
  mensaje: string;
}

export interface ResultadoValidacionConfiguracion {
  problemas: ProblemaConfiguracion[];
  advertencias: string[];
}

/**
 * Clasificación de ENCRYPTION_KEY. `problemaProduccion` no es fatal por sí mismo: el llamador
 * decide (en producción es un error; fuera de producción solo alimenta el resumen local).
 */
export interface AnalisisClaveCifrado {
  claveEfectiva?: string;
  problemaFatal?: string;
  problemaProduccion?: string;
  advertencia?: string;
}

export type MotivoClaveCifrado = 'ausente' | 'malformada' | 'ejemplo' | 'debil';
