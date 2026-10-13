/**
 * Un campo de ajuste con su etiqueta, filtro al teclear y error enlazado (`aria-describedby`).
 *
 * Recorte verbatim del módulo `selector-plantilla-asignacion` (prompt 71, lote B):
 * misma estructura, distinto filtro y teclado por campo (§6.13).
 */
import {
  extraerNumeroPegado,
  filtrarEntradaPeso,
  filtrarEntradaRepsPrescritas,
  filtrarEntradaSeries,
} from '../../../lib/entrada-numerica';

export type CampoAjusteCampo = 'peso' | 'series' | 'reps';

/** Campos de un ajuste: misma estructura, distinto filtro y teclado. */
export const CAMPOS_AJUSTE: Array<{
  campo: CampoAjusteCampo;
  etiqueta: string;
  inputMode: 'decimal' | 'numeric' | 'text';
  anchoClase: string;
  filtrar: (nuevo: string, anterior: string) => string;
}> = [
  {
    campo: 'peso',
    etiqueta: 'Peso (kg)',
    inputMode: 'decimal',
    anchoClase: 'w-24',
    filtrar: (nuevo, anterior) => filtrarEntradaPeso(nuevo, anterior, 'kg'),
  },
  { campo: 'series', etiqueta: 'Series', inputMode: 'numeric', anchoClase: 'w-16', filtrar: filtrarEntradaSeries },
  {
    campo: 'reps',
    etiqueta: 'Repeticiones',
    inputMode: 'text',
    anchoClase: 'w-20',
    filtrar: filtrarEntradaRepsPrescritas,
  },
];

export function CampoAjuste({
  id,
  etiqueta,
  inputMode,
  anchoClase,
  valor,
  invalido,
  idError,
  deshabilitado,
  pegarConUnidad,
  onCambio,
}: {
  id: string;
  etiqueta: string;
  inputMode: 'decimal' | 'numeric' | 'text';
  anchoClase: string;
  valor: string;
  invalido: boolean;
  idError?: string;
  deshabilitado: boolean;
  /** Solo el peso: pegar '60 kg' escribe 60. En series y reps el pegado sigue el filtro nativo. */
  pegarConUnidad: boolean;
  onCambio: (texto: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {etiqueta}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        onPaste={(e) => {
          if (!pegarConUnidad) return;
          const numero = extraerNumeroPegado(e.clipboardData.getData('text'));
          if (numero === null) return;
          e.preventDefault();
          onCambio(numero);
        }}
        disabled={deshabilitado}
        placeholder="sin cambio"
        aria-invalid={invalido}
        aria-describedby={idError}
        className={`h-11 ${anchoClase} px-2 rounded-lg bg-background border text-center font-mono text-sm text-foreground focus:outline-hidden focus:border-primary ${
          invalido ? 'border-destructive/70' : 'border-border'
        }`}
      />
    </div>
  );
}
