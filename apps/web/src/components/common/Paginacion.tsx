/**
 * WU25a: componente reutilizable de paginación numerada.
 *
 * Controles: anterior/siguiente, números con elipsis, contador "Página X de Y · N registros" y
 * selector de "Filas por página" (10/25/50/100) con Radix DropdownMenu (RadioGroup: navegación
 * por teclado y `aria-checked` gratis, mismo design system que el resto de `components/common`).
 *
 * Responsive: en móvil solo anterior/siguiente + "Página X de Y"; desde `sm` aparecen los
 * números completos y el selector de filas.
 *
 * Accesible: `<nav aria-label="Paginación">`, botones con `aria-label` en español, la página
 * activa lleva `aria-current="page"` y los controles se deshabilitan mientras `cargando`.
 */
import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { CLASES_SALIDA_POPOVER, useSalidaModal } from '../../lib/use-salida-modal';
import {
  clampPagina,
  rangoPaginas,
  textoPaginacion,
  calcularTotalPaginas,
} from '../../lib/paginacion';

export const TAMANOS_PAGINA = [10, 25, 50, 100] as const;
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number];

export interface PaginacionProps {
  /** Página activa (1-indexada). */
  pagina: number;
  /** Registros por página. */
  tamano: number;
  /** Total real de registros (COUNT del servidor o del fixture demo). */
  total: number;
  onCambiarPagina: (pagina: number) => void;
  /** Si se omite, no se muestra el selector de filas por página. */
  onCambiarTamano?: (tamano: number) => void;
  /** Mientras carga: los controles se deshabilitan sin perder el contexto en pantalla. */
  cargando?: boolean;
  /** Deshabilita todo el control (p. ej. error de carga). */
  deshabilitado?: boolean;
  /** Nombre accesible de la navegación (UX-14). Por defecto "Paginación". */
  etiqueta?: string;
  /** Si es `false`, el contador no es región `status` (evita anunciar dos veces la misma paginación). */
  anunciarEstado?: boolean;
}

/** Botón base de paginación (anterior/siguiente y números).
 *  Móvil: 44×44 táctil; desde `sm` recupera la densidad de escritorio (32px). */
function claseBotonPaginacion(activo: boolean): string {
  return `min-w-11 h-11 sm:min-w-8 sm:h-8 px-2 inline-flex items-center justify-center rounded-xl border text-xs font-bold transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
    activo
      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
      : 'bg-card text-foreground border-border hover:border-primary/50 hover:bg-secondary/60'
  }`;
}

function SelectorFilasPorPagina({
  tamano,
  deshabilitado,
  onCambiarTamano,
}: {
  tamano: number;
  deshabilitado: boolean;
  onCambiarTamano: (tamano: number) => void;
}) {
  // Desplegable controlado: todo cierre pasa por `cerrar` (salida animada) antes de desmontarse.
  const [abierto, setAbierto] = useState(false);
  const { saliendo, cerrar } = useSalidaModal(() => setAbierto(false));

  return (
    <DropdownMenu.Root
      open={abierto}
      onOpenChange={(siguiente) => (siguiente ? setAbierto(true) : cerrar())}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={deshabilitado}
          aria-label={`Filas por página: ${tamano}`}
          className="h-11 min-w-11 sm:h-8 sm:min-w-0 inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl border border-border bg-card text-xs font-bold text-foreground hover:border-primary/50 hover:bg-secondary/60 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="hidden sm:inline text-muted-foreground font-semibold">Filas:</span>
          <span className="font-mono">{tamano}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          data-saliendo={saliendo || undefined}
          className={`z-50 min-w-36 rounded-2xl border border-border bg-card p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150 ${CLASES_SALIDA_POPOVER}`}
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Filas por página
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={String(tamano)}
            onValueChange={(valor) => {
              if (!saliendo) onCambiarTamano(Number(valor));
            }}
          >
            {TAMANOS_PAGINA.map((opcion) => (
              <DropdownMenu.RadioItem
                key={opcion}
                value={String(opcion)}
                className="flex min-h-11 sm:min-h-0 items-center justify-between gap-3 px-2.5 py-1.5 rounded-xl text-xs font-bold text-foreground cursor-pointer select-none outline-hidden data-[highlighted]:bg-secondary data-[highlighted]:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="font-mono">{opcion}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3.5 w-3.5 text-primary" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function Paginacion({
  pagina,
  tamano,
  total,
  onCambiarPagina,
  onCambiarTamano,
  cargando = false,
  deshabilitado = false,
  etiqueta = 'Paginación',
  anunciarEstado = true,
}: PaginacionProps) {
  const totalPaginas = calcularTotalPaginas(total, tamano);
  const paginaActiva = clampPagina(pagina, totalPaginas);
  const bloqueado = cargando || deshabilitado;
  const elementos = rangoPaginas(paginaActiva, totalPaginas);

  const irA = (destino: number) => {
    const siguiente = clampPagina(destino, totalPaginas);
    if (siguiente !== paginaActiva) onCambiarPagina(siguiente);
  };

  return (
    <nav
      aria-label={etiqueta}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p
        className="text-xs text-muted-foreground"
        role={anunciarEstado ? 'status' : undefined}
        aria-live={anunciarEstado ? 'polite' : undefined}
      >
        <span className="hidden sm:inline">{textoPaginacion(paginaActiva, totalPaginas, total)}</span>
        <span className="sm:hidden">
          Página <span className="font-mono font-bold text-foreground">{paginaActiva}</span> de{' '}
          <span className="font-mono font-bold text-foreground">{totalPaginas}</span>
        </span>
      </p>

      <div className="flex items-center justify-between sm:justify-end gap-1.5">
        <button
          type="button"
          onClick={() => irA(paginaActiva - 1)}
          disabled={bloqueado || paginaActiva <= 1}
          aria-label="Página anterior"
          title="Página anterior"
          className={claseBotonPaginacion(false)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Desktop: números con elipsis. En móvil se omite para dejar solo prev/next. */}
        <ul className="hidden sm:flex items-center gap-1" aria-label="Páginas">
          {elementos.map((elemento, indice) =>
            elemento === 'elipsis' ? (
              <li
                key={`elipsis-${indice}`}
                aria-hidden="true"
                className="min-w-6 text-center text-xs text-muted-foreground"
              >
                …
              </li>
            ) : (
              <li key={elemento}>
                <button
                  type="button"
                  onClick={() => irA(elemento)}
                  disabled={bloqueado}
                  aria-label={`Ir a la página ${elemento}`}
                  aria-current={elemento === paginaActiva ? 'page' : undefined}
                  className={claseBotonPaginacion(elemento === paginaActiva)}
                >
                  <span className="font-mono">{elemento}</span>
                </button>
              </li>
            )
          )}
        </ul>

        <button
          type="button"
          onClick={() => irA(paginaActiva + 1)}
          disabled={bloqueado || paginaActiva >= totalPaginas}
          aria-label="Página siguiente"
          title="Página siguiente"
          className={claseBotonPaginacion(false)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {onCambiarTamano && (
          <div className="ml-1">
            <SelectorFilasPorPagina
              tamano={tamano}
              deshabilitado={deshabilitado}
              onCambiarTamano={onCambiarTamano}
            />
          </div>
        )}
      </div>
    </nav>
  );
}
