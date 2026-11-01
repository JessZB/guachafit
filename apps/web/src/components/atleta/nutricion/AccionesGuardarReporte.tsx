/**
 * Módulo 6 · Nutrición: acción Guardar y sus avisos (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B). El copy de los 5 estados del
 * botón está fijado por el spec (`Guardar reporte nutricional`, §6.1) y no cambia.
 * §6: botón `min-h-11`, estados honestos (encolado ≠ registrado, RF-002).
 */
import { Check, Flame, Loader2 } from 'lucide-react';
import { textoBotonFueraDeVentanaCheckin } from '../../../lib/nutricion-checkin';
import {
  AvisosReporteNutricional,
  type AvisoReporte,
} from '../../nutricion/AvisosReporteNutricional';

export interface AccionesGuardarReporteProps {
  isLoading: boolean;
  conFotos: boolean;
  reporteRegistradoHoy: boolean;
  reporteEncolado: boolean;
  confirmandoEnvio: boolean;
  fotosEncoladas: number;
  puedeReportar: boolean;
  deshabilitado: boolean;
  fechaRegistradaTexto: string;
  aviso: AvisoReporte | null;
  isDemoMode: boolean;
  zonaPerfil?: string;
  onGuardar: () => void;
}

export function AccionesGuardarReporte({
  isLoading,
  conFotos,
  reporteRegistradoHoy,
  reporteEncolado,
  confirmandoEnvio,
  fotosEncoladas,
  puedeReportar,
  deshabilitado,
  fechaRegistradaTexto,
  aviso,
  isDemoMode,
  zonaPerfil,
  onGuardar,
}: AccionesGuardarReporteProps) {
  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <button
        type="button"
        onClick={onGuardar}
        disabled={isLoading || deshabilitado}
        className="w-full min-h-11 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : reporteRegistradoHoy ? (
          <Check className="h-4 w-4" />
        ) : (
          <Flame className="h-4 w-4" />
        )}
        <span>
          {isLoading
            ? conFotos
              ? 'Subiendo fotos y guardando…'
              : 'Guardando…'
            : reporteRegistradoHoy
            ? 'Reporte de hoy ya registrado'
            : confirmandoEnvio
            ? 'Comprobando tu reporte…'
            : reporteEncolado
            ? fotosEncoladas > 0
              ? 'Guardado sin conexión · pendiente de envío (con fotos)'
              : 'Guardado sin conexión · pendiente de envío'
            : !puedeReportar
            ? textoBotonFueraDeVentanaCheckin(zonaPerfil)
            : 'Guardar reporte nutricional'}
        </span>
      </button>

      <AvisosReporteNutricional
        reporteRegistradoHoy={reporteRegistradoHoy}
        fechaRegistradaTexto={fechaRegistradaTexto}
        reporteEncolado={reporteEncolado}
        confirmando={confirmandoEnvio}
        fotosEncoladas={fotosEncoladas}
        aviso={aviso}
      />

      {isDemoMode && (
        <p className="text-center text-xs text-muted-foreground">
          Modo demo: el reporte es una simulación local con datos de ejemplo y no viaja a la API.
        </p>
      )}
    </div>
  );
}
