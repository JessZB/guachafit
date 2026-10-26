/**
 * Modal de nuevo control antropométrico en sala (organismo).
 *
 * CANDIDATO a `common/` (fase D): entidad "check-in antropométrico" en 2 vistas (formulario
 * del atleta en `pages/atleta/ProgresoPage.tsx:729-770`), con actores y flujos distintos
 * (R3.3: duda explícita, no promoción automática). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-5). El guardado vive en el hook de check-in
 * (SL-7); este modal solo presenta el formulario.
 *
 * W-6: conserva el ORDEN y `type="text"` de los inputs (los specs los localizan por
 * posición dentro del diálogo) y los hermanos `label` + control. `role="dialog"` +
 * `aria-modal` intactos. Cada medida y el título se asocian con `useId` (dos modales no repiten
 * `id`); las seis medidas abren el teclado decimal y el botón de cerrar tiene área táctil
 * `min-h-11`.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura, error honesto (`role="alert"`).
 */
import { useId } from 'react';
import type React from 'react';
import { AlertCircle, Scale, X } from 'lucide-react';
import { SelectorFotosCheckin } from '../../antropometria/SelectorFotosCheckin';
import { filtrarEntradaPesoCorporal } from '../../../lib/entrada-numerica';
import type { RetornoCheckinAntropometrico } from './use-checkin-antropometrico';

export interface ModalControlAntropometricoProps {
  checkin: RetornoCheckinAntropometrico;
  /** En la demostración no se suben fotos. */
  demo: boolean;
  usuarioId: string | undefined;
  refDialogo: React.RefObject<HTMLDivElement | null>;
}

export function ModalControlAntropometrico({
  checkin,
  demo,
  usuarioId,
  refDialogo,
}: ModalControlAntropometricoProps) {
  const {
    antroPeso: peso,
    antroGrasa: grasa,
    antroCintura: cintura,
    antroBrazo: brazo,
    antroPecho: pecho,
    antroMuslo: muslo,
    setAntroPeso: onCambiarPeso,
    setAntroGrasa: onCambiarGrasa,
    setAntroCintura: onCambiarCintura,
    setAntroBrazo: onCambiarBrazo,
    setAntroPecho: onCambiarPecho,
    setAntroMuslo: onCambiarMuslo,
    antroErrorMsg: error,
    isSavingAntro: guardando,
    fotosAntro,
    setFotosAntro: onCambioFotos,
    guardarCheckin: onGuardar,
    setIsAntroModalOpen,
  } = checkin;
  const fotosSubiendo = fotosAntro.subiendo;
  const onCerrar = () => setIsAntroModalOpen(false);
  const idBase = useId();
  const idTitulo = `${idBase}-titulo`;
  const idPeso = `${idBase}-peso`;
  const idGrasa = `${idBase}-grasa`;
  const idCintura = `${idBase}-cintura`;
  const idBrazo = `${idBase}-brazo`;
  const idPecho = `${idBase}-pecho`;
  const idMuslo = `${idBase}-muslo`;
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={refDialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h3 id={idTitulo} className="font-bold text-base text-foreground">
              Nuevo Control Antropométrico
            </h3>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar control antropométrico"
            className="min-h-11 min-w-11 inline-flex items-center justify-center p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* N3: error visible del contrato/API; el modal queda abierto y nada se declara guardado. */}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onGuardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={idPeso} className="text-xs font-semibold text-muted-foreground">Peso (kg)</label>
              <input
                id={idPeso}
                type="text"
                inputMode="decimal"
                required
                value={peso}
                onChange={(e) => {
                  // Lote E7: peso corporal filtrado al teclear (máx. 300 kg; el mínimo se valida al enviar).
                  const filtrado = filtrarEntradaPesoCorporal(e.target.value, peso);
                  if (filtrado !== peso) onCambiarPeso(filtrado);
                }}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={idGrasa} className="text-xs font-semibold text-muted-foreground">% Grasa Corporal</label>
              <input
                id={idGrasa}
                type="text"
                inputMode="decimal"
                required
                value={grasa}
                onChange={(e) => onCambiarGrasa(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={idCintura} className="text-xs font-semibold text-muted-foreground">Cintura (cm)</label>
              <input
                id={idCintura}
                type="text"
                inputMode="decimal"
                value={cintura}
                onChange={(e) => onCambiarCintura(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={idBrazo} className="text-xs font-semibold text-muted-foreground">Brazo Relajado (cm)</label>
              <input
                id={idBrazo}
                type="text"
                inputMode="decimal"
                value={brazo}
                onChange={(e) => onCambiarBrazo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={idPecho} className="text-xs font-semibold text-muted-foreground">Pecho (cm)</label>
              <input
                id={idPecho}
                type="text"
                inputMode="decimal"
                value={pecho}
                onChange={(e) => onCambiarPecho(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={idMuslo} className="text-xs font-semibold text-muted-foreground">Muslo Medio (cm)</label>
              <input
                id={idMuslo}
                type="text"
                inputMode="decimal"
                value={muslo}
                onChange={(e) => onCambiarMuslo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Fotos de progreso (opcionales)
            </p>
            {demo && (
              <p className="text-[11px] text-muted-foreground">En la demostración no se suben fotos.</p>
            )}
            <SelectorFotosCheckin
              alumnoId={usuarioId ?? ''}
              onCambio={onCambioFotos}
              deshabilitado={demo || guardando || !usuarioId}
            />
          </div>

          <button
            type="submit"
            disabled={guardando || fotosSubiendo}
            className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/20 active:scale-98 transition-all disabled:opacity-50 mt-2 cursor-pointer"
          >
            {guardando ? 'Guardando medidas...' : 'Guardar Control Antropométrico'}
          </button>
        </form>
      </div>
    </div>
  );
}
