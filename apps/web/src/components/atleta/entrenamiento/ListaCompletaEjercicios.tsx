import type { ReactNode } from 'react';
import type {
  EjercicioSesionDetalleDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import type { UnidadPeso } from '../../../lib/weight-unit';
import { resolverRpeSugerido } from '../../../lib/entrenamiento-textos';
import { TarjetaEjercicioSesion } from './TarjetaEjercicioSesion';
import { CtaFinalizarSesion } from './CtaFinalizarSesion';

export interface ListaCompletaEjerciciosProps {
  sesion: SesionEntrenamientoDetalleDTO;
  enProgreso: boolean;
  unidadPeso: UnidadPeso;
  rpeSugeridoPorEjercicio: Record<string, string | null>;
  mostrarVolverAlEnfoque: boolean;
  onVolverAlEnfoque: () => void;
  onHacerAhora: (ejercicioIndex: number) => void;
  onVerTecnica: (ejercicioSesion: EjercicioSesionDetalleDTO) => void;
  renderSerie: (ejercicioIndex: number, serieIndex: number) => ReactNode;
  onFinalizar?: () => void;
}

/** Lista completa de ejercicios con sus tarjetas y CTA de finalización al final. */
export function ListaCompletaEjercicios({
  sesion,
  enProgreso,
  unidadPeso,
  rpeSugeridoPorEjercicio,
  mostrarVolverAlEnfoque,
  onVolverAlEnfoque,
  onHacerAhora,
  onVerTecnica,
  renderSerie,
  onFinalizar,
}: ListaCompletaEjerciciosProps) {
  return (
    <div className="space-y-4">
      {mostrarVolverAlEnfoque && (
        <button
          type="button"
          onClick={onVolverAlEnfoque}
          className="w-full min-h-11 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        >
          Volver al enfoque
        </button>
      )}
      {sesion.ejercicios.map((ejercicioSesion, ejIdx) => (
        <TarjetaEjercicioSesion
          key={ejercicioSesion.id}
          ejercicioSesion={ejercicioSesion}
          indice={ejIdx}
          unidadPeso={unidadPeso}
          rpeSugerido={resolverRpeSugerido(ejercicioSesion, rpeSugeridoPorEjercicio[ejercicioSesion.id])}
          enProgreso={enProgreso}
          hayPendientes={ejercicioSesion.series.some((serie) => !serie.completada)}
          onHacerAhora={() => onHacerAhora(ejIdx)}
          onVerTecnica={() => onVerTecnica(ejercicioSesion)}
          renderSerie={renderSerie}
        />
      ))}
      {enProgreso && onFinalizar && (
        <CtaFinalizarSesion onAbrir={onFinalizar} variante="final-lista" />
      )}
    </div>
  );
}
