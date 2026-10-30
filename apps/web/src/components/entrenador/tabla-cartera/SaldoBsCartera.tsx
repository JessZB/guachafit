/**
 * Saldo en Bs honesto de la tabla de cartera (prompt 85, Ola 3).
 *
 * "—" cuando el coach no tiene tasa (nunca un monto inventado). El guion es decorativo
 * (`aria-hidden`) y el motivo se lee por un texto solo para lectores de pantalla.
 * ÚNICO (R3: solo tiene sentido en esta tabla). Sin datos: recibe la fila por props (R1).
 */
import type { FilaCarteraDTO } from '@guachafit/shared';
import { textoSaldoBs } from '../../../lib/cartera';
import { useFormatoNumero } from '../../../lib/use-formato-numero';

export function SaldoBsCartera({ fila }: { fila: FilaCarteraDTO }) {
  const { formato } = useFormatoNumero();
  const texto = textoSaldoBs(fila, formato);
  if (texto) {
    return <span className="font-mono font-bold text-foreground">{texto}</span>;
  }
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Sin tasa: Configura tu tasa en Ajustes para ver el monto en Bs.</span>
    </span>
  );
}
