import {
  CarteraDTO,
  FiltroCarteraDTO,
  LIMITE_CARTERA_POR_DEFECTO,
} from '@guachafit/shared';
import {
  condicionCuotaEnMora,
  condicionCuotaPorVencer,
  escaparPatronLike,
} from '../../../common/cartera.util';
import type { ContextoCartera, ContextoTasa } from './contexto-cartera';
import { calcularResumenCartera } from './calcular-resumen-cartera';
import { listarCuotasPorUrgencia as listarCuotasPorUrgenciaCaso } from './listar-cuotas-urgencia';
import { listarRevisionCartera } from './listar-revision-cartera';
import { listarAlDiaCartera } from './listar-al-dia-cartera';

/**
 * Tablero de cartera: KPIs + pestaña activa (RF-009 §4.A y §4.B).
 *
 * El resumen se calcula SIEMPRE sobre la cartera completa; los filtros de búsqueda y la
 * paginación solo recortan la lista de la pestaña.
 */
export async function obtenerCartera(
  ctx: ContextoCartera,
  entrenadorId: string,
  filtro: FiltroCarteraDTO
): Promise<CarteraDTO> {
  const ahora = new Date();
  const limit = filtro.limit ?? LIMITE_CARTERA_POR_DEFECTO;
  const offset = filtro.offset ?? 0;
  const busqueda = (filtro.q ?? '').trim();
  const patron = busqueda.length > 0 ? `%${escaparPatronLike(busqueda)}%` : null;

  const resumen = await calcularResumenCartera(ctx, entrenadorId, ahora);
  const contexto: ContextoTasa = { tasaBase: resumen.tasaVigente };

  switch (filtro.pestana) {
    case 'mora':
      return listarCuotasPorUrgenciaCaso(ctx, {
        entrenadorId,
        ahora,
        limit,
        offset,
        patron,
        contexto,
        condicion: condicionCuotaEnMora(ahora),
        tipo: 'mora',
        resumen,
      });
    case 'por_vencer':
      return listarCuotasPorUrgenciaCaso(ctx, {
        entrenadorId,
        ahora,
        limit,
        offset,
        patron,
        contexto,
        condicion: condicionCuotaPorVencer(ahora),
        tipo: 'por_vencer',
        resumen,
      });
    case 'revision':
      return listarRevisionCartera(ctx, { entrenadorId, ahora, limit, offset, patron, resumen });
    case 'al_dia':
    default:
      return listarAlDiaCartera(ctx, { entrenadorId, ahora, limit, offset, patron, contexto, resumen });
  }
}
