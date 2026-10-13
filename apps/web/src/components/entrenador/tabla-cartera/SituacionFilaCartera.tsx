/**
 * Texto de la columna "situación" según la pestaña (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx`. ÚNICO (R3:
 * reglas de presentación propias de esta tabla). Presentacional: no usa
 * `useQuery` ni `api-client`; los tipos de dominio vienen de
 * `@guachafit/shared` (R1/R4).
 */
import type { FilaCarteraDTO, PestanaCarteraDTO } from '@guachafit/shared';
import { etiquetaEstadoCuota } from '../../../lib/etiquetas-dominio';
import { formatFechaHoraLocal } from '../../../lib/date-format';
import {
  etiquetaDiasAtraso,
  etiquetaDiasEspera,
  etiquetaDiasRestantes,
} from '../../../lib/cartera';
import { Clock3 } from 'lucide-react';
import { BadgeCartera } from './BadgeCartera';

export function SituacionFilaCartera({
  fila,
  pestana,
}: {
  fila: FilaCarteraDTO;
  pestana: PestanaCarteraDTO;
}) {
  if (pestana === 'mora') {
    const etiqueta = etiquetaEstadoCuota(fila.estadoCuota);
    const dias = etiquetaDiasAtraso(fila.diasAtraso);
    return (
      <div className="flex flex-col gap-1">
        <BadgeCartera tono={etiqueta.tono}>{etiqueta.texto}</BadgeCartera>
        {dias && <span className="text-[11px] font-bold text-destructive">{dias}</span>}
      </div>
    );
  }

  if (pestana === 'por_vencer') {
    const etiqueta = etiquetaEstadoCuota(fila.estadoCuota);
    const dias = etiquetaDiasRestantes(fila.diasRestantes);
    const vence = formatFechaHoraLocal(fila.fechaCorteUtc);
    return (
      <div className="flex flex-col gap-1">
        <BadgeCartera tono={etiqueta.tono}>{etiqueta.texto}</BadgeCartera>
        {dias && <span className="text-[11px] font-bold text-warning">{dias}</span>}
        {vence && <span className="text-[11px] text-muted-foreground">Corte: {vence}</span>}
      </div>
    );
  }

  if (pestana === 'revision') {
    const espera = etiquetaDiasEspera(fila.diasEspera);
    const reportado = formatFechaHoraLocal(fila.fechaReporteUtc);
    return (
      <div className="flex flex-col gap-1">
        <BadgeCartera tono="info">Pago en revisión</BadgeCartera>
        {espera && (
          <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
            <Clock3 className="h-3 w-3" /> {espera}
          </span>
        )}
        {reportado && <span className="text-[11px] text-muted-foreground">Reportado: {reportado}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <BadgeCartera tono="success">Al día</BadgeCartera>
      <span className="text-[11px] text-muted-foreground">Ciclo {fila.periodo ?? '—'}</span>
    </div>
  );
}
