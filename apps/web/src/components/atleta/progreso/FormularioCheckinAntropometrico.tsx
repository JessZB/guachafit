/**
 * Vista 2 · Formulario de check-in antropométrico (SL3, fase B).
 *
 * De `ProgresoPage.tsx:690-1001`: tarjeta "Registro de Medición Corporal"
 * con éxito (`PanelExitoCheckin`) o formulario (6 campos + pliegues +
 * fotos + nota de revisión + error + submit). Ids, labels, roles y copy
 * idénticos (exigidos por los 4 specs). El `key={claveFotos}` que remonta
 * el selector tras el éxito se conserva. Presentacional: props tipadas y
 * callbacks, sin `useQuery` ni `api-client` (R1). §6: 11–12px, submit
 * `min-h-11`, error `role="alert"`.
 */
import { AlertTriangle, ArrowRight, Lock } from 'lucide-react';
import type { EstadoVentanaCheckinCalculado } from '../../../lib/antropometria-ventana';
import { AvisoVentanaCheckin } from './AvisoVentanaCheckin';
import { SelectorFotosCheckin } from '../../antropometria/SelectorFotosCheckin';
import type {
  FotoAntropometriaInputDTO,
} from '@guachafit/shared';
import type {
  CampoMedidaCheckinAntropometrico,
} from '../../../lib/antropometria-checkin';
import { CampoMedidaCheckin } from './CampoMedidaCheckin';
import { SeccionPlieguesCheckin } from './SeccionPlieguesCheckin';
import { PanelExitoCheckin } from './PanelExitoCheckin';
import type {
  ClaveMedidaFormularioCheckin,
  MedidasFormularioCheckin,
} from './use-checkin-antropometrico';

interface FormularioCheckinAntropometricoProps {
  medidas: MedidasFormularioCheckin;
  onCambiarMedida: (campo: ClaveMedidaFormularioCheckin, valor: string) => void;
  erroresMedidas: Partial<Record<CampoMedidaCheckinAntropometrico, string>>;
  intentoEnvio: boolean;
  estadoVentana: EstadoVentanaCheckinCalculado;
  fotosSubiendo: boolean;
  isSubmitting: boolean;
  submitError: string | null;
  submitSuccess: boolean;
  isDemoMode: boolean;
  alumnoId: string;
  claveFotos: number;
  onCambioFotos: (estado: { fotos: FotoAntropometriaInputDTO[]; subiendo: boolean }) => void;
  fotosDeshabilitadas: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

const CAMPOS_PRINCIPALES: { campo: ClaveMedidaFormularioCheckin; id: string; etiqueta: string }[] = [
  { campo: 'pesoKg', id: 'checkin-peso', etiqueta: 'Peso (kg)' },
  { campo: 'porcentajeGrasa', id: 'checkin-grasa', etiqueta: '% Grasa estimado' },
  { campo: 'cinturaCm', id: 'checkin-cintura', etiqueta: 'Cintura (cm)' },
  { campo: 'brazoRelajadoCm', id: 'checkin-brazo-relajado', etiqueta: 'Brazo relajado (cm)' },
  { campo: 'brazoContraidoCm', id: 'checkin-brazo-contraido', etiqueta: 'Brazo contraído (cm)' },
  { campo: 'musloMedioCm', id: 'checkin-muslo-medio', etiqueta: 'Muslo medio (cm)' },
];

export function FormularioCheckinAntropometrico({
  medidas,
  onCambiarMedida,
  erroresMedidas,
  intentoEnvio,
  estadoVentana,
  fotosSubiendo,
  isSubmitting,
  submitError,
  submitSuccess,
  isDemoMode,
  alumnoId,
  claveFotos,
  onCambioFotos,
  fotosDeshabilitadas,
  onSubmit,
}: FormularioCheckinAntropometricoProps) {
  /**
   * Error inline de un campo: se muestra si el campo ya tiene texto (el usuario está escribiendo)
   * o si ya se intentó enviar. Nunca se pinta un error sobre un campo vacío opcional.
   */
  const errorInline = (campo: CampoMedidaCheckinAntropometrico, valor: string) => {
    const mensaje = erroresMedidas[campo];
    if (!mensaje) return null;
    if (!intentoEnvio && valor.trim() === '') return null;
    return mensaje;
  };
  const conErrorEn = (campo: CampoMedidaCheckinAntropometrico) =>
    Boolean(erroresMedidas[campo]);

  return (
    <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">Registro de Medición Corporal</h2>
        <p className="text-xs text-muted-foreground">
          Tus datos quedarán guardados y asociados a tu historial de evolución.
        </p>
      </div>

      {submitSuccess ? (
        <PanelExitoCheckin isDemoMode={isDemoMode} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {!estadoVentana.permiteRegistrar && (
            <AvisoVentanaCheckin estadoVentana={estadoVentana} variante="formulario" />
          )}

          {[0, 2, 4].map((inicio) => (
            <div key={inicio} className="grid grid-cols-2 gap-3">
              {CAMPOS_PRINCIPALES.slice(inicio, inicio + 2).map(({ campo, id, etiqueta }) => (
                <CampoMedidaCheckin
                  key={campo}
                  id={id}
                  etiqueta={etiqueta}
                  valor={medidas[campo]}
                  onCambiar={(valor) => onCambiarMedida(campo, valor)}
                  conError={conErrorEn(campo)}
                  error={errorInline(campo, medidas[campo])}
                />
              ))}
            </div>
          ))}

          {/* RN-02: pliegues cutáneos (mm), alternativa/complemento del % de grasa. */}
          <SeccionPlieguesCheckin
            valores={{
              tricepsMm: medidas.tricepsMm,
              subescapularMm: medidas.subescapularMm,
              suprailiacoMm: medidas.suprailiacoMm,
              abdominalMm: medidas.abdominalMm,
            }}
            onCambiar={onCambiarMedida}
            conErrorEn={conErrorEn}
            errorDe={errorInline}
          />

          <div className="space-y-2">
            <p className="text-xs font-bold text-foreground">Fotos de progreso (opcionales)</p>
            {isDemoMode && (
              <p className="text-[11px] text-muted-foreground">
                En la demostración no se suben fotos.
              </p>
            )}
            <SelectorFotosCheckin
              key={claveFotos}
              alumnoId={alumnoId}
              onCambio={onCambioFotos}
              deshabilitado={fotosDeshabilitadas}
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/80 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <Lock className="h-3.5 w-3.5 text-primary" />
              <span>Revisión de tu coach</span>
            </div>
            <p className="text-[11px]">
              Tu reporte queda registrado como remoto y tu coach lo revisa en su bandeja antes de consolidarlo en tus curvas.
            </p>
          </div>

          {submitError && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || fotosSubiendo || !estadoVentana.permiteRegistrar}
            className="w-full min-h-11 py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
          >
            <span>{isSubmitting ? 'Enviando...' : 'Enviar Evaluación al Coach'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          {!estadoVentana.permiteRegistrar && (
            <p className="text-[11px] text-muted-foreground text-center">
              {estadoVentana.motivoBloqueo}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
