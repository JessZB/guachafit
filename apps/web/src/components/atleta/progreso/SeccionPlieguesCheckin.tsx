/**
 * Bloque de pliegues cutáneos del check-in (SL3, fase B).
 *
 * De `ProgresoPage.tsx:855-948` (RN-02: mm, opcional, complemento del % de
 * grasa). Ids, labels y copy idénticos (R5). Compone `CampoMedidaCheckin`.
 * Presentacional: props tipadas y callback, sin datos (R1). §6: 11–12px.
 */
import { CampoMedidaCheckin } from './CampoMedidaCheckin';
import type { ClaveMedidaFormularioCheckin } from './use-checkin-antropometrico';

export type ClavePliegueCheckin =
  | 'tricepsMm'
  | 'subescapularMm'
  | 'suprailiacoMm'
  | 'abdominalMm';

interface SeccionPlieguesCheckinProps {
  valores: Record<ClavePliegueCheckin, string>;
  onCambiar: (campo: ClaveMedidaFormularioCheckin, valor: string) => void;
  conErrorEn: (campo: ClaveMedidaFormularioCheckin) => boolean;
  errorDe: (campo: ClaveMedidaFormularioCheckin, valor: string) => string | null;
}

const CAMPOS: { campo: ClavePliegueCheckin; id: string; etiqueta: string }[] = [
  { campo: 'tricepsMm', id: 'checkin-pliegue-triceps', etiqueta: 'Tríceps (mm)' },
  { campo: 'subescapularMm', id: 'checkin-pliegue-subescapular', etiqueta: 'Subescapular (mm)' },
  { campo: 'suprailiacoMm', id: 'checkin-pliegue-suprailiaco', etiqueta: 'Suprailíaco (mm)' },
  { campo: 'abdominalMm', id: 'checkin-pliegue-abdominal', etiqueta: 'Abdominal (mm)' },
];

export function SeccionPlieguesCheckin({
  valores,
  onCambiar,
  conErrorEn,
  errorDe,
}: SeccionPlieguesCheckinProps) {
  return (
    <div className="p-4 rounded-2xl bg-secondary/30 border border-border/70 space-y-3">
      <div>
        <span className="text-xs font-bold text-foreground block">
          Pliegues cutáneos (mm) — opcional
        </span>
        <span className="text-[11px] text-muted-foreground">
          Si tu coach te los mide, regístralos junto al % de grasa estimado.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {CAMPOS.map(({ campo, id, etiqueta }) => (
          <CampoMedidaCheckin
            key={campo}
            id={id}
            etiqueta={etiqueta}
            valor={valores[campo]}
            onCambiar={(valor) => onCambiar(campo, valor)}
            conError={conErrorEn(campo)}
            error={errorDe(campo, valores[campo])}
          />
        ))}
      </div>
    </div>
  );
}
