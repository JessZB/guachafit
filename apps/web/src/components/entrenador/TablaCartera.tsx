/**
 * WU-I (RF-009 §4.B): tabla del tablero de cartera.
 *
 * Contenedor presentacional puro (sin red ni router): la página le pasa la página de filas y los
 * callbacks de acción. Renderiza una tabla densa en escritorio/tablet (escena principal del
 * coach) y tarjetas apiladas en móvil, con estados vacíos honestos por pestaña.
 *
 * Estructura (prompt 85, Ola 3, ADR-022): las piezas viven en
 * `components/entrenador/tabla-cartera/` y la lógica pura en
 * `lib/tabla-cartera-*.ts`. Este archivo conserva su ruta, su export y su API
 * de props (R11); los archivos que lo importan no se tocan.
 */
import type { FilaCarteraDTO, PestanaCarteraDTO } from '@guachafit/shared';
import { EstadoVacioCartera } from './tabla-cartera/EstadoVacioCartera';
import { TablaEscritorioCartera } from './tabla-cartera/TablaEscritorioCartera';
import { TarjetasMovilCartera } from './tabla-cartera/TarjetasMovilCartera';

export interface TablaCarteraProps {
  pestana: PestanaCarteraDTO;
  filas: FilaCarteraDTO[];
  /** `true` cuando hay una búsqueda activa: cambia el vacío por "sin resultados". */
  buscando?: boolean;
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
}

export function TablaCartera({
  pestana,
  filas,
  buscando = false,
  onRecordatorio,
  onCobrar,
  onVerFicha,
  onRevisarPago,
}: TablaCarteraProps) {
  if (filas.length === 0) {
    return <EstadoVacioCartera pestana={pestana} buscando={buscando} />;
  }

  return (
    <div className="rounded-3xl bg-card border border-border/80 shadow-xs overflow-hidden">
      {/* Escritorio / tablet: tabla densa con scroll horizontal controlado */}
      <TablaEscritorioCartera
        pestana={pestana}
        filas={filas}
        onRecordatorio={onRecordatorio}
        onCobrar={onCobrar}
        onVerFicha={onVerFicha}
        onRevisarPago={onRevisarPago}
      />

      {/* Móvil: tarjetas apiladas con la misma información esencial */}
      <TarjetasMovilCartera
        pestana={pestana}
        filas={filas}
        onRecordatorio={onRecordatorio}
        onCobrar={onCobrar}
        onVerFicha={onVerFicha}
        onRevisarPago={onRevisarPago}
      />
    </div>
  );
}
