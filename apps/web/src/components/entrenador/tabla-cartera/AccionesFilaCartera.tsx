/**
 * Acciones por fila según la pestaña, RF-009 §4.B (prompt 85, Ola 3).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx`. ÚNICO (R3).
 * Presentacional: recibe callbacks por props, no usa `useQuery` ni
 * `api-client` (R1).
 */
import type { FilaCarteraDTO, PestanaCarteraDTO } from '@guachafit/shared';
import { BellRing, HandCoins, Receipt, UserRound } from 'lucide-react';
import { BotonAccionCartera } from './BotonAccionCartera';

export function AccionesFilaCartera({
  fila,
  pestana,
  onRecordatorio,
  onCobrar,
  onVerFicha,
  onRevisarPago,
}: {
  fila: FilaCarteraDTO;
  pestana: PestanaCarteraDTO;
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
}) {
  if (pestana === 'revision') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <BotonAccionCartera
          onClick={() => onRevisarPago?.(fila)}
          icono={Receipt}
          texto="Revisar en bandeja"
          variante="primario"
        />
      </div>
    );
  }

  const puedeCobrar =
    (pestana === 'mora' || pestana === 'por_vencer') &&
    Boolean(fila.saldoPendienteUsd && Number(fila.saldoPendienteUsd) > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(pestana === 'mora' || pestana === 'por_vencer') && (
        <BotonAccionCartera
          onClick={() => onRecordatorio(fila)}
          icono={BellRing}
          texto="Recordatorio"
        />
      )}
      {puedeCobrar && (
        <BotonAccionCartera
          onClick={() => onCobrar(fila)}
          icono={HandCoins}
          texto="Registrar cobro"
          variante="primario"
        />
      )}
      <BotonAccionCartera
        onClick={() => onVerFicha(fila)}
        icono={UserRound}
        texto="Ver ficha"
        deshabilitado={!fila.alumnoPerfilId}
      />
    </div>
  );
}
