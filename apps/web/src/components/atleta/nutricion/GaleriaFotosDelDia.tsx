/**
 * Módulo 6 · Nutrición: galería de fotos del día registrado (ÚNICO hoy, CANDIDATO).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B). Comparte `MiniaturaFotoPlato`
 * con la vista del entrenador pero con layout distinto (R3: ante la duda, único hoy);
 * se decide su promoción en la fase D.
 * §6: sin interactivos propios salvo las miniaturas (botones del común).
 */
import { Camera } from 'lucide-react';
import { MiniaturaFotoPlato } from '../../common/MiniaturaFotoPlato';
import { formatFechaLargaCalendario } from '../../../lib/date-format';
import type { ObjetivoMeta } from '../../../lib/nutricion-metas';
import type {
  CheckinNutricionalDetalleDTO,
  FotoComidaDetalleDTO,
} from '@guachafit/shared';

export interface GaleriaFotosDelDiaProps {
  checkin: CheckinNutricionalDetalleDTO;
  totales: ObjetivoMeta[];
  onAbrirFoto: (foto: FotoComidaDetalleDTO, fecha: string) => void;
}

export function GaleriaFotosDelDia({ checkin, totales, onAbrirFoto }: GaleriaFotosDelDiaProps) {
  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm text-foreground">
          Fotos de hoy ({checkin.fotosPlatos.length})
        </h3>
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {checkin.fotosPlatos.map((foto) => (
          <li key={foto.id}>
            <MiniaturaFotoPlato
              foto={foto}
              fechaTexto={formatFechaLargaCalendario(checkin.fecha) ?? checkin.fecha}
              onAbrir={() => onAbrirFoto(foto, checkin.fecha)}
            />
          </li>
        ))}
      </ul>
      {totales.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {totales.map((total) => `${total.etiqueta}: ${total.valor}`).join(' · ')}
        </p>
      )}
    </section>
  );
}
