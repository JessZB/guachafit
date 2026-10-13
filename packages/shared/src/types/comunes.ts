// Tipos transversales: errores RFC 7807 y paginación server-side.
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  /**
   * D7: código máquina estable y canónico para errores de negocio que la UI debe distinguir
   * (p. ej. `SESION_VACIA` en el cierre de sesión sin series completadas).
   * Campo único alineado al esquema estándar RFC 7807 §1 del doc de contratos.
   */
  code?: string;
  /** Mensaje humano del error tal como lo emite la API (NestJS lo incluye en el cuerpo). */
  message?: string;
  invalidParams?: Array<{ field: string; reason: string }>;
  timestampUtc: string;
}

/**
 * WU24: envelope de paginación server-side compartido por los listados del coach.
 *
 * `total` es el COUNT REAL de filas que cumplen el filtro (nunca el tamaño de `items`), de modo
 * que la UI puede mostrar "Mostrando X de N" y pedir la siguiente página con `offset` sin
 * repetir ni saltar filas. `limit`/`offset` son la página efectiva aplicada por el servidor.
 */
export interface PaginadoDTO<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
