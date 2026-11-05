/**
 * Módulo 6 · Nutrición: sección de metas RN-01 del coach (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B): carga/error/vacío + objetivos +
 * recursos. La grilla vive en `GrillaObjetivosMetas` y la tolerancia en `ToleranciaDelDia`.
 *
 * Átomos de la consolidación (48 §M6): `ui/CargaConEsqueleto` (antes `ui/EstadoCarga`) y `ui/EstadoError` en lugar de las
 * copias locales (el error suma `role="alert"`, como el gemelo del entrenador).
 * §6: reintento `min-h-11` vía `BotonTactil`, textos ≥11px, estados honestos.
 */
import { AlertTriangle, ExternalLink, Target } from 'lucide-react';
import { CargaConEsqueleto } from '../../ui/CargaConEsqueleto';
import { EsqueletoTarjetasKpi } from '../../ui/esqueletos';
import { EstadoError } from '../../ui/EstadoError';
import { metasConfiguradas, type ObjetivoMeta } from '../../../lib/nutricion-metas';
import type { MetasNutricionalesDetalleDTO } from '@guachafit/shared';
import { GrillaObjetivosMetas } from './GrillaObjetivosMetas';
import type { ReactNode } from 'react';

export interface SeccionMetasNutricionalesProps {
  isCargandoMetas: boolean;
  metasError: string | null;
  metas: MetasNutricionalesDetalleDTO | null;
  objetivos: ObjetivoMeta[];
  onReintentarMetas: () => void;
  tolerancia: ReactNode;
}

export function SeccionMetasNutricionales({
  isCargandoMetas,
  metasError,
  metas,
  objetivos,
  onReintentarMetas,
  tolerancia,
}: SeccionMetasNutricionalesProps) {
  return (
    <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-center gap-2 border-b border-border/80 pb-3">
        <Target className="h-4 w-4 text-primary" />
        <h2 className="font-bold text-sm text-foreground">Tus objetivos nutricionales</h2>
      </div>

      {isCargandoMetas && (
        <CargaConEsqueleto texto="Cargando tus metas…" claseContenedor="min-h-[300px]">
          <EsqueletoTarjetasKpi cantidad={3} />
        </CargaConEsqueleto>
      )}

      {metasError && (
        <EstadoError mensaje={metasError} textoReintentar="Reintentar" onReintentar={onReintentarMetas} />
      )}

      {!isCargandoMetas && !metasError && !metasConfiguradas(metas) && (
        <p className="text-xs text-muted-foreground">
          Tu entrenador todavía no configuró metas. Puedes registrar tu día igualmente.
        </p>
      )}

      {!metasError && objetivos.length > 0 && <GrillaObjetivosMetas objetivos={objetivos} />}

      {!metasError && (metas?.recursos?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Recursos de tu coach
          </span>
          <ul className="space-y-1.5">
            {metas!.recursos.map((recurso) => (
              <li key={recurso.storageKey ?? recurso.url ?? recurso.titulo}>
                {recurso.url ? (
                  <a
                    href={recurso.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span>{recurso.titulo}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 min-h-11 text-xs font-semibold text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                    <span>
                      {recurso.titulo} · el enlace no está disponible; pídele a tu coach que lo
                      vuelva a subir
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tolerancia}
    </section>
  );
}
