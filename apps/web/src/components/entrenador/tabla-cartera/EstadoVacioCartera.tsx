/**
 * Estado vacío honesto de la tabla de cartera (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx`: icono
 * `h-10 w-10` en `success` (no `h-9 muted` como `ui/EstadoVacio`), así que NO
 * es sustituible de forma mecánica y queda como ÚNICO con CANDIDATO a
 * `EstadoVacio` para el cierre. Sin datos: recibe `pestana` y `buscando`.
 */
import type { PestanaCarteraDTO } from '@guachafit/shared';
import { CheckCircle2, SearchX } from 'lucide-react';
import { vacioTablaCartera } from '../../../lib/tabla-cartera-vacio';

export function EstadoVacioCartera({
  pestana,
  buscando = false,
}: {
  pestana: PestanaCarteraDTO;
  buscando?: boolean;
}) {
  const vacio = vacioTablaCartera(pestana, buscando);
  const Icono = buscando ? SearchX : CheckCircle2;

  return (
    <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
      <Icono
        className={`h-10 w-10 mx-auto ${
          buscando ? 'text-muted-foreground opacity-50' : 'text-success'
        }`}
      />
      <h3 className="text-sm font-bold text-foreground">{vacio.titulo}</h3>
      <p className="text-xs text-muted-foreground max-w-md mx-auto">{vacio.detalle}</p>
    </div>
  );
}
