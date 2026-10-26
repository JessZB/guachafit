/**
 * Tarjeta de un control antropométrico del historial (SL4, fase B).
 *
 * De `ProgresoPage.tsx:1056-1168`: cabecera con fecha + `BadgeEstadoMedicion`
 * + origen, grilla de 4 medidas ("—" cuando faltan) y fotos con visor.
 * Textos y roles idénticos (R5). Compone `MiniaturaFotoProgreso`.
 * Presentacional: props tipadas y callbacks, sin datos (R1).
 * §6: 11px mínimo, mono en datos.
 */
import { Calendar } from 'lucide-react';
import { etiquetaEstadoMedicion, etiquetaOrigenAntropometria } from '../../../lib/etiquetas-dominio';
import { formatFechaCalendario } from '../../../lib/date-format';
import type {
  ControlAntropometricoDetalleDTO,
  FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import { BadgeEstadoMedicion } from './BadgeEstadoMedicion';
import { MiniaturaFotoProgreso } from './MiniaturaFotoProgreso';

interface TarjetaEvaluacionAntropometricaProps {
  item: ControlAntropometricoDetalleDTO;
  fotosConError: string[];
  onFotoError: (fotoId: string) => void;
  onVerFoto: (foto: FotoAntropometriaDetalleDTO, fecha: string) => void;
}

export function TarjetaEvaluacionAntropometrica({
  item,
  fotosConError,
  onFotoError,
  onVerFoto,
}: TarjetaEvaluacionAntropometricaProps) {
  const estadoMedicion = etiquetaEstadoMedicion(item.estado);
  return (
    <div className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex flex-wrap min-w-0 items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-bold text-sm text-foreground">
            {formatFechaCalendario(item.fechaEvaluacion) ?? item.fechaEvaluacion}
          </span>
          <BadgeEstadoMedicion tono={estadoMedicion.tono} texto={estadoMedicion.texto} />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {etiquetaOrigenAntropometria(item.origen)}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-2.5 rounded-xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            Peso
          </span>
          <p className="font-mono font-bold text-sm text-foreground">
            {item.pesoKg} kg
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            % Grasa
          </span>
          <p className="font-mono font-bold text-sm text-foreground">
            {item.porcentajeGrasa ? `${item.porcentajeGrasa}%` : '—'}
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            Cintura
          </span>
          <p className="font-mono font-bold text-sm text-foreground">
            {item.perimetros?.cinturaCm ? `${item.perimetros.cinturaCm} cm` : '—'}
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            Brazo relajado
          </span>
          <p className="font-mono font-bold text-sm text-foreground">
            {item.perimetros?.brazoRelajadoCm ?? item.perimetros?.brazoCm
              ? `${item.perimetros?.brazoRelajadoCm ?? item.perimetros?.brazoCm} cm`
              : '—'}
          </p>
        </div>
      </div>

      {/* RF-004 RN-02/RN-03: fotos propias de la toma, con visor accesible. */}
      {item.fotos.length > 0 && (
        <div className="space-y-2 pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Fotos de esta toma
          </span>
          <div className="flex flex-wrap gap-2">
            {item.fotos.map((foto) => (
              <MiniaturaFotoProgreso
                key={foto.id}
                foto={foto}
                fechaEvaluacion={item.fechaEvaluacion}
                conFallo={fotosConError.includes(foto.id)}
                onVer={() => onVerFoto(foto, item.fechaEvaluacion)}
                onErrorImagen={() =>
                  onFotoError(foto.id)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
