/**
 * Franja de datos clave bajo la cabecera de la ficha del alumno (L7.8).
 *
 * Cuatro accesos directos (saldo, próxima cuota, último entreno y peso). Cada uno lleva el
 * nombre accesible completo ("Saldo pendiente: $125.50. Ver Pagos") y abre su pestaña con
 * `onIrATab`. Los valores salen del helper puro `datosClaveAlumno`.
 *
 * Decisión del owner (2026-10-26, lote L7 de la ficha del alumno): datos clave visibles bajo la
 * cabecera, fuera de las pestañas; cada dato lleva a la pestaña donde se gestiona.
 *
 * §6: táctil `min-h-11`, etiqueta 11px, valor `text-xs` en `sm:text-sm` hasta dos líneas, tokens
 * semánticos y foco visible.
 */
import type {
  ResumenFinancieroAlumnoDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { ControlAntroFila } from '../../../lib/alumno-detalle-controles';
import type { TabFichaAlumno } from '../../../lib/alumno-detalle-tab';
import { datosClaveAlumno } from '../../../lib/datos-clave-alumno';

interface FranjaDatosClaveAlumnoProps {
  finanzas: ResumenFinancieroAlumnoDTO | null;
  ultimaSesion: SesionEntrenamientoDetalleDTO | null;
  controles: ControlAntroFila[];
  ahora: Date;
  onIrATab: (tab: TabFichaAlumno) => void;
}

const claseDato =
  'min-h-11 min-w-0 flex flex-col items-start justify-center gap-0.5 p-3 rounded-2xl bg-card border border-border text-left transition-all hover:border-primary/50 hover:bg-secondary/60 active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary';

export function FranjaDatosClaveAlumno({
  finanzas,
  ultimaSesion,
  controles,
  ahora,
  onIrATab,
}: FranjaDatosClaveAlumnoProps) {
  const datos = datosClaveAlumno({ finanzas, ultimaSesion, controles, ahora });

  const celdas: Array<{
    etiqueta: string;
    valor: string;
    destino: TabFichaAlumno;
    textoDestino: string;
  }> = [
    { etiqueta: 'Saldo pendiente', valor: datos.saldo, destino: 'finanzas', textoDestino: 'Pagos' },
    {
      etiqueta: 'Próxima cuota',
      valor: datos.proximaCuota,
      destino: 'finanzas',
      textoDestino: 'Pagos',
    },
    {
      etiqueta: 'Último entreno',
      valor: datos.ultimoEntreno,
      destino: 'entrenamiento',
      textoDestino: 'Entrenos',
    },
    { etiqueta: 'Peso', valor: datos.peso, destino: 'antropometria', textoDestino: 'Medidas' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {celdas.map((celda) => (
        <button
          key={celda.etiqueta}
          type="button"
          aria-label={`${celda.etiqueta}: ${celda.valor}. Ver ${celda.textoDestino}`}
          onClick={() => onIrATab(celda.destino)}
          className={claseDato}
        >
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {celda.etiqueta}
          </span>
          <span className="block w-full line-clamp-2 break-words text-xs sm:text-sm font-bold text-foreground">
            {celda.valor}
          </span>
        </button>
      ))}
    </div>
  );
}
