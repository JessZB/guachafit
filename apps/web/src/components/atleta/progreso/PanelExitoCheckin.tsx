/**
 * Panel de éxito del check-in (SL3, fase B).
 *
 * De `ProgresoPage.tsx:701-710`: "¡Mediciones Guardadas!" con rama demo
 * ("En la demostración no se envía nada a tu entrenador.", exigida por el
 * spec demo). Textos idénticos (R5). Presentacional: una prop (R1). §6: 12px.
 */
import { CheckCircle2 } from 'lucide-react';

interface PanelExitoCheckinProps {
  isDemoMode: boolean;
}

export function PanelExitoCheckin({ isDemoMode }: PanelExitoCheckinProps) {
  return (
    <div className="p-8 text-center space-y-3">
      <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
      <h4 className="font-bold text-base text-foreground">¡Mediciones Guardadas!</h4>
      <p className="text-xs text-muted-foreground">
        {isDemoMode
          ? 'En la demostración no se envía nada a tu entrenador.'
          : 'Tus datos fueron enviados a tu entrenador para auditoría y validación.'}
      </p>
    </div>
  );
}
