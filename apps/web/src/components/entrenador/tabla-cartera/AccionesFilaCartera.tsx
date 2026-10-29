/**
 * Acciones por fila según la pestaña, RF-009 §4.B (prompt 85, Ola 3; UX-07b).
 *
 * Recorte verbatim de `components/entrenador/TablaCartera.tsx`. ÚNICO (R3).
 * Presentacional: recibe callbacks por props, no usa `useQuery` ni
 * `api-client` (R1).
 *
 * UX-07b (decisión D3, owner):
 * - `contexto="tabla"` (escritorio): los botones de siempre, con texto corto visible y nombre
 *   accesible propio por alumno; área táctil 44px en base y 36px desde `md`.
 * - `contexto="tarjeta"` (móvil): solo la acción principal visible y el resto en
 *   `MenuAccionesFilaCartera` ("Más acciones").
 */
import type { FilaCarteraDTO, PestanaCarteraDTO } from '@guachafit/shared';
import type { LucideIcon } from 'lucide-react';
import { BellRing, HandCoins, Receipt, UserRound } from 'lucide-react';
import { BotonTactil, type VarianteBotonTactil } from '../../ui/BotonTactil';
import { MenuAccionesFilaCartera } from './MenuAccionesFilaCartera';

export type ContextoAccionesCartera = 'tabla' | 'tarjeta';

export interface AccionesFilaCarteraProps {
  fila: FilaCarteraDTO;
  pestana: PestanaCarteraDTO;
  contexto: ContextoAccionesCartera;
  onRecordatorio: (fila: FilaCarteraDTO) => void;
  onCobrar: (fila: FilaCarteraDTO) => void;
  onVerFicha: (fila: FilaCarteraDTO) => void;
  onRevisarPago?: (fila: FilaCarteraDTO) => void;
}

/** En escritorio la altura baja a 36px desde `md`; en móvil se mantiene el mínimo de 44px. */
const CLASE_TABLA = 'md:min-h-9 md:py-1.5 md:px-3';

interface BotonAccionProps {
  contexto: ContextoAccionesCartera;
  variante: VarianteBotonTactil;
  icono: LucideIcon;
  texto: string;
  etiquetaAccesible: string;
  disabled?: boolean;
  onClick: () => void;
}

function BotonAccion({
  contexto,
  variante,
  icono: Icono,
  texto,
  etiquetaAccesible,
  disabled = false,
  onClick,
}: BotonAccionProps) {
  return (
    <BotonTactil
      variante={variante}
      etiquetaAccesible={etiquetaAccesible}
      disabled={disabled}
      onClick={onClick}
      className={contexto === 'tabla' ? CLASE_TABLA : ''}
    >
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </BotonTactil>
  );
}

export function AccionesFilaCartera({
  fila,
  pestana,
  contexto,
  onRecordatorio,
  onCobrar,
  onVerFicha,
  onRevisarPago,
}: AccionesFilaCarteraProps) {
  const nombre = fila.alumnoNombre;
  const esMoraOPorVencer = pestana === 'mora' || pestana === 'por_vencer';
  const puedeCobrar =
    esMoraOPorVencer && Boolean(fila.saldoPendienteUsd && Number(fila.saldoPendienteUsd) > 0);
  const puedeVerFicha = Boolean(fila.alumnoPerfilId);

  // WCAG 2.5.3 (Label in Name): el nombre accesible empieza por el texto visible "Recordatorio".
  const botonRecordatorio = (variante: VarianteBotonTactil) => (
    <BotonAccion
      contexto={contexto}
      variante={variante}
      icono={BellRing}
      texto="Recordatorio"
      etiquetaAccesible={`Recordatorio para ${nombre}`}
      onClick={() => onRecordatorio(fila)}
    />
  );

  const botonCobro = (
    <BotonAccion
      contexto={contexto}
      variante="primaria"
      icono={HandCoins}
      texto="Registrar cobro"
      etiquetaAccesible={`Registrar cobro de ${nombre}`}
      onClick={() => onCobrar(fila)}
    />
  );

  const botonFicha = (variante: VarianteBotonTactil) => (
    <BotonAccion
      contexto={contexto}
      variante={variante}
      icono={UserRound}
      texto="Ver ficha"
      etiquetaAccesible={`Ver ficha de ${nombre}`}
      disabled={!puedeVerFicha}
      onClick={() => onVerFicha(fila)}
    />
  );

  // WCAG 2.5.3: el nombre accesible empieza por el texto visible "Revisar en bandeja".
  // Sin `onRevisarPago` el botón queda deshabilitado en vez de no hacer nada al pulsarlo.
  const botonRevisar = (
    <BotonAccion
      contexto={contexto}
      variante="primaria"
      icono={Receipt}
      texto="Revisar en bandeja"
      etiquetaAccesible={`Revisar en bandeja el pago de ${nombre}`}
      disabled={!onRevisarPago}
      onClick={() => onRevisarPago?.(fila)}
    />
  );

  if (pestana === 'revision') {
    return <div className="flex flex-wrap items-center gap-1.5">{botonRevisar}</div>;
  }

  if (contexto === 'tabla') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {esMoraOPorVencer && botonRecordatorio('secundaria')}
        {puedeCobrar && botonCobro}
        {botonFicha('secundaria')}
      </div>
    );
  }

  // Tarjeta móvil: solo la acción principal visible; el resto en "Más acciones".
  if (pestana === 'al_dia') {
    return <div className="flex flex-wrap items-center gap-1.5">{botonFicha('secundaria')}</div>;
  }

  // El menú solo se renderiza si tiene al menos una opción habilitada; si no, sería un
  // disparador vacío o con únicamente "Ver ficha" deshabilitada (sin perfil del alumno).
  const recordatorioEnMenu = puedeCobrar ? () => onRecordatorio(fila) : undefined;
  const menuTieneOpcionHabilitada = recordatorioEnMenu !== undefined || puedeVerFicha;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {puedeCobrar ? botonCobro : botonRecordatorio('primaria')}
      {menuTieneOpcionHabilitada && (
        <MenuAccionesFilaCartera
          nombre={nombre}
          onRecordatorio={recordatorioEnMenu}
          puedeVerFicha={puedeVerFicha}
          onVerFicha={() => onVerFicha(fila)}
        />
      )}
    </div>
  );
}
