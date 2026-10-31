/**
 * M8 plantillas (fase B, prompt 58) · cabecera del banco de plantillas.
 *
 * Origen: `PlantillasPage.tsx:489-510`. Componente único + CANDIDATO a
 * `EncabezadoPagina` en D (patrón repetido `AlumnosPage.tsx:402-407`; fila 34
 * de la consolidación 48). Solo props y callbacks (R1): sin `useQuery` ni
 * `api-client`. Usa `ui/BotonTactil` (consolidación 48 §M8, fila 6).
 *
 * §6: español claro, `BotonTactil` 44px, 11px mínimo, tokens con variante
 * claro/oscuro, peso ≤ 700.
 */
import { ClipboardList, Plus } from 'lucide-react';
import { BotonTactil } from '../../ui/BotonTactil';
import { DESTINOS_ENTRENADOR } from '../../../lib/etiquetas-dominio';

export interface CabeceraPlantillasProps {
  onNueva: () => void;
}

export function CabeceraPlantillas({ onNueva }: CabeceraPlantillasProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{DESTINOS_ENTRENADOR.plantillas.etiqueta}</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Diseña rutinas reutilizables y asígnalas a tus alumnos en segundos. Cada asignación es una
          copia independiente: editar la plantilla no altera lo ya prescrito.
        </p>
      </div>

      <BotonTactil onClick={onNueva} className="self-start sm:self-auto">
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span>Nueva plantilla</span>
      </BotonTactil>
    </div>
  );
}

