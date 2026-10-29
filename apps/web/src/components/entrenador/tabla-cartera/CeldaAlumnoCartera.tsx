/**
 * Celda del alumno de la tabla de cartera (prompt 85, Ola 3).
 *
 * Recorte de `components/entrenador/TablaCartera.tsx` que unifica el bloque
 * duplicado entre la tabla de escritorio (`div`) y la tarjeta móvil (`p`):
 * nombre + saldo a favor (RF-006 RN-05) + teléfono. El markup difiere en la
 * etiqueta (`div`/`p` y `truncate` en móvil), así que se parametrize con la
 * variante `contexto` sin cambiar el DOM observable de cada una. ÚNICO (R3).
 * Presentacional: sin `useQuery` ni `api-client` (R1).
 */
import type { FilaCarteraDTO } from '@guachafit/shared';
import { tieneSaldoAFavor } from '../../../lib/saldo-a-favor';

export function CeldaAlumnoCartera({
  fila,
  contexto,
}: {
  fila: FilaCarteraDTO;
  contexto: 'tabla' | 'tarjeta';
}) {
  if (contexto === 'tarjeta') {
    return (
      <div className="min-w-0">
        <p className="font-bold text-sm text-foreground line-clamp-2 break-words">{fila.alumnoNombre}</p>
        {tieneSaldoAFavor(fila.saldoAFavorUsd) && (
          <p className="text-[11px] font-semibold text-success">
            {`A favor: ${fila.saldoAFavorUsd} USD`}
          </p>
        )}
        {fila.telefonoWhatsapp && (
          <p className="text-[11px] text-muted-foreground font-mono">
            {fila.telefonoWhatsapp}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="font-bold text-foreground">{fila.alumnoNombre}</div>
      {tieneSaldoAFavor(fila.saldoAFavorUsd) && (
        <div className="text-[11px] font-semibold text-success">
          {`A favor: ${fila.saldoAFavorUsd} USD`}
        </div>
      )}
      {fila.telefonoWhatsapp && (
        <div className="text-[11px] text-muted-foreground font-mono">
          {fila.telefonoWhatsapp}
        </div>
      )}
    </>
  );
}
