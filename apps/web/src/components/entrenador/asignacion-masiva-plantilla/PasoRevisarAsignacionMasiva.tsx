/**
 * Lote E10 · módulo `asignacion-masiva-plantilla` (presentacional).
 *
 * Paso 2 de la asignación masiva: mientras carga el detalle muestra un indicador; si falla, un
 * `role="alert"` con "Reintentar"; en demo sin detalle, un aviso (se sigue sin ajustes). Con el
 * detalle reutiliza `PasoRevisar` de la asignación individual con todos los días abiertos: los
 * ajustes son comunes a todos los alumnos elegidos.
 */
import { Loader2 } from 'lucide-react';
import type { PlantillaRutinaDTO } from '@guachafit/shared';
import { PasoRevisar } from '../selector-plantilla-asignacion/PasoRevisar';
import type { useAjustesPlantilla } from '../selector-plantilla-asignacion/use-ajustes-plantilla';

type AjustesPlantilla = ReturnType<typeof useAjustesPlantilla>;

export function PasoRevisarAsignacionMasiva({
  idBase,
  detalle,
  cargando,
  error,
  sinVistaPreviaDemo,
  diasAbiertos,
  ajustes,
  onAlternarDia,
  onReintentar,
}: {
  idBase: string;
  detalle: PlantillaRutinaDTO | null;
  cargando: boolean;
  error: string | null;
  sinVistaPreviaDemo: boolean;
  diasAbiertos: ReadonlySet<string>;
  ajustes: AjustesPlantilla;
  onAlternarDia: (diaId: string | null) => void;
  onReintentar: () => void;
}) {
  if (cargando) {
    return (
      <div className="py-6 flex justify-center">
        <Loader2
          className="h-5 w-5 animate-spin text-primary"
          role="img"
          aria-label="Cargando plantilla"
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-2"
      >
        <p>{error}</p>
        <button
          type="button"
          onClick={onReintentar}
          className="min-h-11 px-3 rounded-xl bg-secondary text-foreground font-bold text-xs cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!detalle) {
    return sinVistaPreviaDemo ? (
      <p className="text-sm text-muted-foreground">
        La vista previa no está disponible para esta plantilla en el modo demo.
      </p>
    ) : null;
  }

  return (
    <PasoRevisar
      idBase={idBase}
      detalle={detalle}
      bloquesPreview={ajustes.bloquesPreview}
      overrides={ajustes.overrides}
      erroresAjustes={ajustes.erroresAjustes}
      diaAbierto={null}
      diasAbiertos={diasAbiertos}
      ajustando={ajustes.ajustando}
      asignacionCompletada={false}
      resumenErroresRef={ajustes.refResumenErrores}
      onSeleccionarDia={onAlternarDia}
      onAlternarAjuste={ajustes.alternarAjuste}
      onActualizarCampo={ajustes.actualizarOverride}
      onLimpiar={ajustes.limpiarOverride}
      onIrAlCampoConError={ajustes.irAlCampoConError}
    />
  );
}
