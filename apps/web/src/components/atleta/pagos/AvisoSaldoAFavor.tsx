/**
 * Aviso de saldo a favor del alumno en la vista `pagos` (fase B, prompt 54).
 *
 * Extraído tal cual desde `pages/atleta/PagosPage.tsx` (L561–571): banner
 * `role="status"` con el texto compartido de `lib/saldo-a-favor.ts` y el aviso
 * de aplicación automática (RF-006 RN-05).
 *
 * R1: vive en la carpeta de la vista. CANDIDATO (R3.3: la entidad "saldo a favor"
 * aparece en ≥2 vistas — `AlumnoDetallePage:2984–2988`, `TablaCartera:305–308` —
 * pero la presentación difiere por vista; solo el texto está consolidado).
 * La fase D decide si se promueve.
 *
 * §6: región `role="status"` (los specs exigen que el texto viva dentro),
 * textos exactos vía `textoSaldoAFavor`, tokens `success` con variante oscura.
 */
import { tieneSaldoAFavor, textoSaldoAFavor } from '../../../lib/saldo-a-favor';

export interface AvisoSaldoAFavorProps {
  saldoAFavorUsd: string;
  tasaEfectiva?: string | null;
}

export function AvisoSaldoAFavor({ saldoAFavorUsd, tasaEfectiva }: AvisoSaldoAFavorProps) {
  // RF-006 RN-05: sin saldo no hay banner (nunca se simula saldo).
  if (!tieneSaldoAFavor(saldoAFavorUsd)) return null;
  return (
    <div role="status" className="p-4 rounded-3xl bg-success/10 border border-success/30 space-y-0.5">
      <p className="text-sm font-bold text-foreground">
        {textoSaldoAFavor(saldoAFavorUsd, tasaEfectiva)}
      </p>
      <p className="text-xs text-muted-foreground">
        Se aplicará automáticamente a tu próxima cuota.
      </p>
    </div>
  );
}
