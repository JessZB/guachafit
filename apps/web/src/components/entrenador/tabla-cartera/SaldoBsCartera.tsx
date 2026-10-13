/**
 * Saldo en Bs honesto de la tabla de cartera (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx`: "—" cuando el
 * coach no tiene tasa (nunca un monto inventado). ÚNICO (R3: solo tiene sentido
 * en esta tabla). Sin datos: recibe la fila por props (R1).
 */
import type { FilaCarteraDTO } from '@guachafit/shared';
import { textoSaldoBs } from '../../../lib/cartera';

export function SaldoBsCartera({ fila }: { fila: FilaCarteraDTO }) {
  const texto = textoSaldoBs(fila);
  if (texto) {
    return <span className="font-mono font-bold text-foreground">{texto}</span>;
  }
  return (
    <span className="text-muted-foreground" title="Configura tu tasa en Ajustes para proyectar Bs">
      —
    </span>
  );
}
