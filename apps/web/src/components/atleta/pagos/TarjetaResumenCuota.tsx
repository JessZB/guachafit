/**
 * Tarjeta de resumen de la cuota vigente en la vista `pagos` (fase B, prompt 54).
 *
 * Extraída tal cual desde `pages/atleta/PagosPage.tsx` (hub, L610–672): nombre
 * del plan y corte, badge de estado, saldo pendiente (USD + proyección en Bs.)
 * y línea de saldo a favor aplicado.
 *
 * R1: componente único de vista (composición completa sin equivalente; solo el
 * badge interno es reutilizable). Presentacional: props tipadas con el DTO de
 * `@guachafit/shared` (R4), sin `useQuery` ni `api-client`. El badge usa el
 * átomo consolidado `ui/BadgeEstado` consumiendo `.tono` de
 * `etiquetaEstadoCuota` (SUGGESTION-3 del inventario; la consolidación 48 §6 M4
 * lo exige en lugar del ternario hardcodeado).
 *
 * R5: conserva los textos que consultan los specs ("Saldo Pendiente",
 * "De esta cuota, … se cubrieron…" vía literal idéntico).
 *
 * §6: estados honestos (saldo en Bs. no disponible sin tasa), `font-bold`
 * (700), tokens con variante claro/oscuro, `pluralizar` donde corresponde.
 */
import type { CuotaDetalleDTO } from '@guachafit/shared';
import { BadgeEstado } from '../../ui/BadgeEstado';
import { etiquetaEstadoCuota } from '../../../lib/etiquetas-dominio';
import { tieneSaldoAFavor } from '../../../lib/saldo-a-favor';

export interface TarjetaResumenCuotaProps {
  /** `null` = sin cuota (no renderiza nada; el vacío honesto lo da el contenedor). */
  cuota: CuotaDetalleDTO | null;
  tasaEfectivaNum: number;
  saldoVesProyectado: string;
}

export function TarjetaResumenCuota({
  cuota,
  tasaEfectivaNum,
  saldoVesProyectado,
}: TarjetaResumenCuotaProps) {
  if (!cuota) return null;
  const etiqueta = etiquetaEstadoCuota(cuota.estado);
  return (
    <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md relative overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="min-w-0">
          <span className="text-xs font-bold text-primary uppercase tracking-wider break-words">
            {cuota.planNombre}
          </span>
          <div className="text-xs text-muted-foreground mt-0.5">
            Corte:{' '}
            {new Date(cuota.fechaCorteUtc).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: 'long',
            })}
          </div>
        </div>

        <BadgeEstado tono={etiqueta.tono}>{etiqueta.texto}</BadgeEstado>
      </div>

      {/* Saldo Grande */}
      <div className="my-5 flex items-baseline justify-between">
        <div>
          <span className="text-xs font-semibold text-muted-foreground block">
            Saldo Pendiente
          </span>
          <div className="text-3xl sm:text-4xl font-bold font-mono text-foreground mt-0.5">
            ${cuota.saldoPendienteUsd}{' '}
            <span className="text-sm font-semibold text-primary">USD</span>
          </div>
          <div className="text-xs font-mono text-muted-foreground mt-0.5">
            {tasaEfectivaNum > 0
              ? `≈ ${saldoVesProyectado} Bolívares`
              : 'Saldo en Bs. no disponible sin tasa vigente'}
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs font-semibold text-muted-foreground block">
            Total Cuota
          </span>
          <span className="text-lg font-bold font-mono text-muted-foreground">
            ${cuota.montoTotalUsd} USD
          </span>
        </div>
      </div>
      {tieneSaldoAFavor(cuota.saldoAFavorAplicadoUsd) && (
        <p className="text-xs font-semibold text-success">
          {`De esta cuota, ${cuota.saldoAFavorAplicadoUsd} USD se cubrieron con tu saldo a favor.`}
        </p>
      )}
    </div>
  );
}
