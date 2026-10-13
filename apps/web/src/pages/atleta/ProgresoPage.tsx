/**
 * Mi Progreso Físico — contenedor orquestador (fase B, SL4).
 *
 * Solo compone: lee la sesión, conecta los 3 hooks de datos
 * (`use-contexto-antropometrico`, `use-evolucion-progreso`,
 * `use-checkin-antropometrico`), la navegación `vistaActiva` y el visor de
 * foto. Sin JSX de detalle (R1): hub, formulario, historial y estados viven
 * en `components/atleta/progreso/`. R5: roles, labels y textos idénticos.
 * §6: se conserva vía los componentes extraídos.
 */
import { useState } from 'react';
import { Scale } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { resolverUrlApi } from '../../lib/api-client';
import type { BloqueoAlumno } from '../../lib/acceso-alumno';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { GraficoEvolucion } from '../../components/common/GraficoEvolucion';
import { VisorFoto } from '../../components/common/VisorFoto';
import { EstadoCarga } from '../../components/ui/EstadoCarga';
import type {
  EvolucionCorporalDTO,
  FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import type { EscenarioDemoAntropometria } from '../../lib/demo-antropometria';
import { useContextoAntropometrico } from '../../components/atleta/progreso/use-contexto-antropometrico';
import { useEvolucionProgreso } from '../../components/atleta/progreso/use-evolucion-progreso';
import { useCheckinAntropometrico } from '../../components/atleta/progreso/use-checkin-antropometrico';
import { HubProgreso } from '../../components/atleta/progreso/HubProgreso';
import { FormularioCheckinAntropometrico } from '../../components/atleta/progreso/FormularioCheckinAntropometrico';
import { EncabezadoSeccionProgreso } from '../../components/atleta/progreso/EncabezadoSeccionProgreso';
import { PanelSoloLecturaProgreso } from '../../components/atleta/progreso/PanelSoloLecturaProgreso';
import { BannerEscenarioDemoProgreso } from '../../components/atleta/progreso/BannerEscenarioDemoProgreso';
import { AvisoVentanaCheckin } from '../../components/atleta/progreso/AvisoVentanaCheckin';
import { AvisoErrorEvolucion } from '../../components/atleta/progreso/AvisoErrorEvolucion';
import { EstadoVacioProgreso } from '../../components/atleta/progreso/EstadoVacioProgreso';
import { HistorialEvaluacionesProgreso } from '../../components/atleta/progreso/HistorialEvaluacionesProgreso';

export function ProgresoPage() {
  const { user, isDemoMode } = useAuth();

  // Progressive Disclosure: 'hub' (selector) | 'nuevo' | 'evolucion'
  const [vistaActiva, setVistaActiva] = useState<'hub' | 'nuevo' | 'evolucion'>('hub');
  // RF-012: alumno pausado no puede enviar el check-in remoto; el panel informativo lo declara.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);
  // RF-004: visor accesible de una foto de progreso (Escape y trampa de foco en `VisorFoto`).
  const [fotoVisor, setFotoVisor] = useState<{
    foto: FotoAntropometriaDetalleDTO;
    fecha: string;
  } | null>(null);

  // U4: URL del GET de evolución, para datar la copia cacheada cuando no hay conexión.
  const urlEvolucion = user?.id ? resolverUrlApi(`/antropometria/evolucion/${user.id}`) : null;

  const {
    esSoloLectura,
    estadoVentana,
    motivoRegistroBloqueado,
    escenarioDemo,
    setEscenarioDemo,
  } = useContextoAntropometrico(user, isDemoMode);

  const {
    evolucion,
    setEvolucion,
    isLoading,
    error,
    fotosConError,
    setFotosConError,
    cargarEvolucion,
  } = useEvolucionProgreso(user, isDemoMode);

  const checkin = useCheckinAntropometrico({
    user,
    isDemoMode,
    evolucion,
    esSoloLectura,
    estadoVentana,
    onAbrirFormulario: () => setVistaActiva('nuevo'),
    onEvolucionActualizada: (actualizada: EvolucionCorporalDTO) => setEvolucion(actualizada),
    onBloqueo: (detectado: BloqueoAlumno) => setBloqueo(detectado),
    onCheckinExitoso: () => setVistaActiva('evolucion'),
  });

  /** Miniatura con enlace temporal fallido: se rotula "Sin imagen" (sin duplicar el id). */
  const marcarFotoConError = (fotoId: string) => {
    setFotosConError((prev) => (prev.includes(fotoId) ? prev : [...prev, fotoId]));
  };

  /** Cambio de escenario demo: vuelve al hub y limpia los errores de envío. */
  const cambiarEscenarioDemo = (escenario: EscenarioDemoAntropometria) => {
    setEscenarioDemo(escenario);
    setVistaActiva('hub');
    checkin.reiniciarEstadoEnvio();
  };

  if (isLoading) {
    return <EstadoCarga />;
  }

  const sinFotos =
    evolucion &&
    evolucion.evaluaciones.length > 0 &&
    evolucion.evaluaciones.every((item) => item.fotos.length === 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Cabecera Principal */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Scale className="h-3.5 w-3.5" />
            <span>Fisiología y Métricas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-0.5">
            Mi Progreso Físico
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Registro de medidas corporales y evolución física a lo largo del tiempo.
          </p>
        </div>
      </div>

      {/* U4: evolución servida desde la caché del SW (sin conexión), con su antigüedad. */}
      {!isDemoMode && evolucion && <AvisoDatosOffline url={urlEvolucion} />}

      {/* DEMO (solo isDemoMode): escenarios conmutables para ejercitar RN-03/RN-04 sin red. */}
      {isDemoMode && (
        <BannerEscenarioDemoProgreso
          escenarioActivo={escenarioDemo}
          onCambiar={cambiarEscenarioDemo}
        />
      )}

      {/* D2: error de carga honesto con reintento (sin evolución demo fuera del modo demo) */}
      {error && <AvisoErrorEvolucion mensaje={error} onReintentar={() => cargarEvolucion()} />}

      {/* RF-012: aviso de bloqueo del check-in remoto (el historial sigue en modo lectura) */}
      {bloqueo && !isDemoMode && (
        <BloqueoAlumnoPanel
          bloqueo={bloqueo}
          onReintentar={() => setBloqueo(null)}
          className="max-w-none"
        />
      )}

      {/* RN-04/§6: estado visible de la ventana de check-in (solo alumnos remotos con calendario) */}
      {!esSoloLectura && estadoVentana.aplica && (
        <AvisoVentanaCheckin estadoVentana={estadoVentana} variante="global" />
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: HUB PRINCIPAL (Selector de 2 Caminos)                             */}
      {/* ========================================================================= */}
      {vistaActiva === 'hub' && (
        <HubProgreso
          evolucion={evolucion}
          esSoloLectura={esSoloLectura}
          accesoPresencialServidor={checkin.accesoPresencialServidor}
          permiteRegistrar={estadoVentana.permiteRegistrar}
          motivoBloqueo={motivoRegistroBloqueado}
          onAbrirFormulario={checkin.abrirFormularioCheckin}
          onVerEvolucion={() => setVistaActiva('evolucion')}
        />
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: FORMULARIO DE CHECK-IN ENFOCADO                                    */}
      {/* ========================================================================= */}
      {vistaActiva === 'nuevo' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <EncabezadoSeccionProgreso
            variante="formulario"
            onVolver={() => setVistaActiva('hub')}
          />

          {esSoloLectura || checkin.accesoPresencialServidor ? (
            <PanelSoloLecturaProgreso
              mensajeServidor={checkin.accesoPresencialServidor}
              onVerHistorial={() => setVistaActiva('evolucion')}
            />
          ) : (
            <FormularioCheckinAntropometrico
              medidas={checkin.medidas}
              onCambiarMedida={checkin.actualizarMedida}
              erroresMedidas={checkin.erroresMedidas}
              intentoEnvio={checkin.intentoEnvio}
              estadoVentana={estadoVentana}
              fotosSubiendo={checkin.fotosCheckin.subiendo}
              isSubmitting={checkin.isSubmitting}
              submitError={checkin.submitError}
              submitSuccess={checkin.submitSuccess}
              isDemoMode={isDemoMode}
              alumnoId={user?.id ?? ''}
              claveFotos={checkin.claveFotos}
              onCambioFotos={checkin.setFotosCheckin}
              fotosDeshabilitadas={isDemoMode || checkin.isSubmitting || !user?.id}
              onSubmit={checkin.handleSubmitCheckin}
            />
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 3: HISTORIAL Y EVOLUCIÓN CRONOLÓGICA                                */}
      {/* ========================================================================= */}
      {vistaActiva === 'evolucion' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <EncabezadoSeccionProgreso
            variante="evolucion"
            onVolver={() => setVistaActiva('hub')}
            onNuevoCheckin={checkin.abrirFormularioCheckin}
            mostrarNuevo={!esSoloLectura && !checkin.accesoPresencialServidor}
            puedeRegistrar={estadoVentana.permiteRegistrar}
            motivoBloqueo={motivoRegistroBloqueado}
          />

          {/* RF-004 RN-01: gráfico multieje con filtros de rango sobre la serie real. */}
          {evolucion && evolucion.evaluaciones.length > 0 && (
            <GraficoEvolucion evaluaciones={evolucion.evaluaciones} />
          )}

          {/* RF-004 RN-02/RN-03: sin fotos adjuntas todavía, vacío honesto (no se simula galería). */}
          {sinFotos ? <EstadoVacioProgreso /> : null}

          <HistorialEvaluacionesProgreso
            evaluaciones={evolucion?.evaluaciones ?? []}
            fotosConError={fotosConError}
            onFotoError={marcarFotoConError}
            onVerFoto={(foto, fecha) => setFotoVisor({ foto, fecha })}
          />
        </div>
      )}

      {/* RF-004: visor de foto de progreso (solo montado con una foto elegida). */}
      {fotoVisor && (
        <VisorFoto
          foto={fotoVisor.foto}
          fecha={fotoVisor.fecha}
          onCerrar={() => setFotoVisor(null)}
        />
      )}
    </div>
  );
}
