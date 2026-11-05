import React from 'react';
import { useLocation } from 'react-router-dom';
import { useTransicionVista } from '../../lib/use-transicion-vista';

/**
 * Entrada unificada de la vista activa: todo el contenido de una ruta cuelga de un único nodo con
 * `view-transition-name: contenido`, de modo que la cabecera, la barra inferior y el menú lateral
 * (con su propio nombre) quedan fijos y solo el contenido hace la transición.
 *
 * El `key` por ruta remonta el nodo al navegar. Con View Transitions la animación la define
 * `index.css`; sin soporte o con movimiento reducido se usa un fundido de respaldo (solo opacidad,
 * para no crear un bloque contenedor que confine modales `fixed` de las páginas).
 */
export function EntradaVista({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const conTransicion = useTransicionVista();

  return (
    <div
      key={pathname}
      data-vista="contenido"
      className={`[view-transition-name:contenido]${conTransicion ? '' : ' animate-fade-in'}`}
    >
      {children}
    </div>
  );
}
