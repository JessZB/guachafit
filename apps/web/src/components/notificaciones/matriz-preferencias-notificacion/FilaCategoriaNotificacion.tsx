/**
 * RF-015 (Ola 3): one matrix row (category + Push/Email switches).
 *
 * Extracted verbatim from `components/notificaciones/MatrizPreferenciasNotificacion.tsx:283-352`.
 * Presentational (R1): typed props plus callback, no data fetching. Domain
 * types come from `@guachafit/shared` (R4); icon and tone come from the
 * existing `./estilos-categoria` and `lib/` modules (imported, not edited, R6).
 */
import { Lock, ShieldCheck } from 'lucide-react';
import type {
  CanalPreferenciaNotificacion,
  CategoriaPreferenciasDTO,
} from '@guachafit/shared';
import { categoriaVisualDeFila } from '../../../lib/notificaciones-in-app';
import {
  TEXTO_CANAL_OBLIGATORIO_SEGURIDAD,
  descripcionCategoriaNotificacion,
} from '../../../lib/preferencias-notificacion';
import { ICONO_CATEGORIA, TONO_CATEGORIA } from '../estilos-categoria';
import { InterruptorNotificacion } from './InterruptorNotificacion';

export interface FilaCategoriaNotificacionProps {
  fila: CategoriaPreferenciasDTO;
  onCambiarCanal: (
    fila: CategoriaPreferenciasDTO,
    canal: CanalPreferenciaNotificacion,
    valor: boolean
  ) => void;
}

export function FilaCategoriaNotificacion({ fila, onCambiarCanal }: FilaCategoriaNotificacionProps) {
  const categoria = categoriaVisualDeFila(fila.id);
  const Icono = ICONO_CATEGORIA[categoria];
  const emailBloqueado = fila.canalesObligatorios.includes('email');
  const pushBloqueado = fila.canalesObligatorios.includes('push');

  return (
    <li
      key={fila.id}
      className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3 min-w-0">
        <span className={`p-2.5 rounded-xl shrink-0 ${TONO_CATEGORIA[categoria]}`}>
          <Icono className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
            {fila.etiqueta}
            {(emailBloqueado || pushBloqueado) && (
              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            )}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {descripcionCategoriaNotificacion(fila.id)}
          </p>
          {emailBloqueado && (
            <p className="text-[11px] font-semibold text-muted-foreground mt-1 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {TEXTO_CANAL_OBLIGATORIO_SEGURIDAD}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-6 shrink-0 self-end sm:self-auto">
        <div className="flex flex-col items-center gap-0.5">
          <span aria-hidden="true" className="text-[11px] font-semibold text-muted-foreground">
            Push
          </span>
          <InterruptorNotificacion
            activo={fila.push}
            bloqueado={pushBloqueado}
            etiqueta={`${fila.etiqueta}: avisos Push`}
            onCambiar={(valor) => onCambiarCanal(fila, 'push', valor)}
          />
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span aria-hidden="true" className="text-[11px] font-semibold text-muted-foreground">
            Email
          </span>
          <InterruptorNotificacion
            activo={fila.email}
            bloqueado={emailBloqueado}
            etiqueta={`${fila.etiqueta}: avisos por Email`}
            onCambiar={(valor) => onCambiarCanal(fila, 'email', valor)}
          />
        </div>
      </div>
    </li>
  );
}
