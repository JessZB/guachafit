/**
 * RF-018 · Ajustes del entrenador: motor de tasa activa Bs/USD (ADR-003).
 *
 * Extraído de `pages/entrenador/AjustesPage.tsx:652-830`.
 * Presentacional: todo el estado y la red entran por props desde `useTasasCambio`.
 * Conserva textos, roles (`alert`) y el aviso honesto "Sin tasa configurada" (D6).
 * El error con reintento usa el átomo `ui/EstadoError` (fila M7 de la consolidación 48).
 */
import { CheckCircle, DollarSign } from 'lucide-react';
import type { TasaCambioVigenteDTO } from '@guachafit/shared';
import { EstadoError } from '../../ui/EstadoError';
import { BotonTactil } from '../../ui/BotonTactil';
import type { FuenteTasaAjustes } from './use-tasas-cambio';

export interface FormularioTasaProps {
  tasaVigente: TasaCambioVigenteDTO | null;
  isLoadingTasas: boolean;
  tasasError: string | null;
  tasaSuccessMsg: string | null;
  fuenteSeleccionada: FuenteTasaAjustes;
  tasaOficialBcvInput: string;
  tasaParaleloInput: string;
  tasaActivaInput: string;
  isSavingTasa: boolean;
  onSeleccionarFuente: (fuente: FuenteTasaAjustes) => void;
  onCambiarOficial: (valor: string) => void;
  onCambiarParalelo: (valor: string) => void;
  onCambiarActiva: (valor: string) => void;
  onGuardar: () => void;
  onReintentar: () => void;
}

export function FormularioTasa({
  tasaVigente,
  isLoadingTasas,
  tasasError,
  tasaSuccessMsg,
  fuenteSeleccionada,
  tasaOficialBcvInput,
  tasaParaleloInput,
  tasaActivaInput,
  isSavingTasa,
  onSeleccionarFuente,
  onCambiarOficial,
  onCambiarParalelo,
  onCambiarActiva,
  onGuardar,
  onReintentar,
}: FormularioTasaProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar();
      }}
      className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-5"
    >
      <div className="flex items-center justify-between border-b border-border/80 pb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h3 className="font-bold text-base text-foreground">
            Motor de Tasa Activa (Bs/USD)
          </h3>
        </div>
        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
          ADR-003 Vigente
        </span>
      </div>

      {tasaSuccessMsg && (
        <div className="p-3 rounded-2xl bg-success/10 border border-success/30 text-success text-xs flex items-center gap-2">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{tasaSuccessMsg}</span>
        </div>
      )}

      {tasasError && (
        <EstadoError mensaje={tasasError} onReintentar={onReintentar} />
      )}

      {/* D6: estado honesto cuando todavía no existe ninguna tasa configurada. */}
      {!isLoadingTasas && !tasasError && !tasaVigente?.tasaEfectiva && (
        <div className="p-4 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs space-y-1">
          <p className="font-bold">Sin tasa configurada</p>
          <p className="text-[11px] text-warning/90">
            Define al menos tu tasa BCV y tu tasa activa de cobro y guárdalas. Mientras no
            exista una tasa vigente, los cobros y reportes de pago en bolívares quedan
            bloqueados con un mensaje claro y no se muestran proyecciones en Bs.
          </p>
        </div>
      )}

      {/* Selector de Fuente Predilecta */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground">
          Fuente o Modalidad de Cobro para tu Cartera
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onSeleccionarFuente('oficial_bcv')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
              fuenteSeleccionada === 'oficial_bcv'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            <div className="text-[11px] font-bold">Oficial BCV</div>
            <div className="text-xs font-mono font-bold mt-1 text-primary">
              {tasaOficialBcvInput ? `${tasaOficialBcvInput} Bs` : '—'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSeleccionarFuente('paralelo')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
              fuenteSeleccionada === 'paralelo'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            <div className="text-[11px] font-bold">Paralelo</div>
            <div className="text-xs font-mono font-bold mt-1 text-primary">
              {tasaParaleloInput ? `${tasaParaleloInput} Bs` : '—'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onSeleccionarFuente('manual')}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
              fuenteSeleccionada === 'manual'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            <div className="text-[11px] font-bold">Personalizada</div>
            <div className="text-xs font-mono font-bold mt-1 text-primary">
              {tasaActivaInput ? `${tasaActivaInput} Bs` : '—'}
            </div>
          </button>
        </div>
      </div>

      {/* Campos de Tasa */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Tasa BCV (Bs/USD)</label>
          <input
            type="text"
            inputMode="decimal"
            required
            value={tasaOficialBcvInput}
            onChange={(e) => onCambiarOficial(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Tasa Paralelo (Bs/USD)</label>
          <input
            type="text"
            inputMode="decimal"
            value={tasaParaleloInput}
            onChange={(e) => onCambiarParalelo(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-primary">Tasa Activa de Cobro</label>
          <input
            type="text"
            inputMode="decimal"
            required
            value={tasaActivaInput}
            onChange={(e) => onCambiarActiva(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-primary/10 border-2 border-primary text-sm font-mono font-bold text-foreground focus:outline-hidden"
          />
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <BotonTactil
          type="submit"
          disabled={isSavingTasa}
          className="px-5 shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98]"
        >
          {isSavingTasa ? 'Guardando Tasa...' : 'Guardar Tasa Activa Global'}
        </BotonTactil>
      </div>
    </form>
  );
}
