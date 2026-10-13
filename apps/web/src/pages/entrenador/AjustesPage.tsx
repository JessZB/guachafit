import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { Rol } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import { useTabsAccesibles } from '../../lib/use-tabs-accesibles';
import { ContenidoConPerfil } from '../../components/ajustes/ContenidoConPerfil';
import { SeccionCorreoPassword } from '../../components/ajustes/SeccionCorreoPassword';
import { SeccionPerfil } from '../../components/ajustes/SeccionPerfil';
import { useMiPerfil } from '../../lib/use-mi-perfil';
import {
  pestanaAjustesDesdeUrl,
  pestanasAjustes,
  type PestanaAjustes,
} from '../../lib/ajustes';
import { ConversorTasas } from '../../components/entrenador/ajustes-entrenador/ConversorTasas';
import { FormularioTasa } from '../../components/entrenador/ajustes-entrenador/FormularioTasa';
import { ModalPlanComercial } from '../../components/entrenador/ajustes-entrenador/ModalPlanComercial';
import { PanelPlanes } from '../../components/entrenador/ajustes-entrenador/PanelPlanes';
import { PestanaNotificaciones } from '../../components/entrenador/ajustes-entrenador/PestanaNotificaciones';
import { PestanasAjustes } from '../../components/entrenador/ajustes-entrenador/PestanasAjustes';
import { usePlanesComerciales } from '../../components/entrenador/ajustes-entrenador/use-planes-comerciales';
import { useTasasCambio } from '../../components/entrenador/ajustes-entrenador/use-tasas-cambio';

type TabType = PestanaAjustes;

/**
 * Claves de las pestañas en orden visual. RF-018 RN-09 unifica aquí los ajustes personales del
 * coach (Perfil y Correo y contraseña) con los de su negocio (Planes y Tasas).
 */
const CLAVES_TABS = pestanasAjustes(Rol.ENTRENADOR);

/** Modal de plan: cerrado, crear o editar un plan existente. */
type EstadoModalPlan =
  | { abierto: false }
  | { abierto: true; plan: PlanMembresiaDetalleDTO | null };

export function AjustesPage() {
  const { user, isDemoMode } = useAuth();
  // La pestaña activa vive en la URL (`?tab=…`) para que la campana pueda enlazar directo a la
  // matriz de preferencias del coach.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = pestanaAjustesDesdeUrl(Rol.ENTRENADOR, searchParams.get('tab'));

  const setActiveTab = (tab: TabType) => {
    triggerHaptic('light');
    setSearchParams(tab === CLAVES_TABS[0] ? {} : { tab }, { replace: true });
  };

  // RF-018: perfil propio para las pestañas Perfil y Correo y contraseña.
  const miPerfil = useMiPerfil(user, isDemoMode);

  const tabs = useTabsAccesibles<TabType>({
    claves: CLAVES_TABS,
    activa: activeTab,
    onActivar: setActiveTab,
    idBase: 'ajustes-tabs',
  });

  // N2b: al entrar por enlace directo (`?tab=notificaciones`) o cambiar de pestaña, la activa se
  // trae a la vista dentro del tablist con scroll horizontal en móvil.
  const idTabActiva = tabs.idTab(activeTab);
  useEffect(() => {
    document.getElementById(idTabActiva)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [idTabActiva]);

  const planes = usePlanesComerciales(isDemoMode);
  const tasas = useTasasCambio(isDemoMode);

  const [modalPlan, setModalPlan] = useState<EstadoModalPlan>({ abierto: false });

  useEffect(() => {
    void planes.cargarPlanes();
    void tasas.cargarTasas();
    // Carga eager al montar (el spec mockea ambas rutas al montar la página).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirModalCrearPlan() {
    triggerHaptic('light');
    planes.limpiarMensajePlan();
    setModalPlan({ abierto: true, plan: null });
  }

  function abrirModalEditarPlan(plan: PlanMembresiaDetalleDTO) {
    triggerHaptic('light');
    planes.limpiarMensajePlan();
    setModalPlan({ abierto: true, plan });
  }

  function cerrarModalPlan() {
    setModalPlan({ abierto: false });
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground">
            Ajustes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tu perfil, tu acceso, tus notificaciones, tus planes de membresía y las tasas de cambio.
          </p>
        </div>

        {activeTab === 'planes' && (
          <button
            type="button"
            onClick={abrirModalCrearPlan}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Plan Comercial</span>
          </button>
        )}
      </div>

      {/* Tabs Selector (N2b: patrón APG de pestañas con flechas + roving tabindex) */}
      <PestanasAjustes
        claves={CLAVES_TABS}
        activa={activeTab}
        conteoPlanes={planes.planes.length}
        propsTablist={tabs.propsTablist}
        propsTab={tabs.propsTab}
      />

      {/* ===================================================================== */}
      {/* RF-018: PERFIL Y CORREO Y CONTRASEÑA                                  */}
      {/* ===================================================================== */}
      {/* Siempre montadas (la inactiva con `hidden`): un guardado en vuelo no pierde su resultado. */}
      {(['perfil', 'seguridad'] as const).map((pestana) => (
        <div
          key={pestana}
          {...tabs.propsPanel(pestana)}
          hidden={activeTab !== pestana}
          className="space-y-6 animate-in fade-in-50 duration-200"
        >
          <ContenidoConPerfil
            perfil={miPerfil.perfil}
            cargando={miPerfil.cargando}
            error={miPerfil.error}
            isDemoMode={isDemoMode}
            onReintentar={() => void miPerfil.recargar()}
            mostrarAvisoOffline={activeTab === pestana}
          >
            {(perfil) =>
              pestana === 'perfil' ? (
                <SeccionPerfil
                  perfil={perfil}
                  isDemoMode={isDemoMode}
                  onActualizado={miPerfil.setPerfil}
                />
              ) : (
                <SeccionCorreoPassword
                  perfil={perfil}
                  isDemoMode={isDemoMode}
                  onRecargarPerfil={() => void miPerfil.recargar()}
                  visible={activeTab === pestana}
                />
              )
            }
          </ContenidoConPerfil>
        </div>
      ))}

      {/* ===================================================================== */}
      {/* PESTAÑA: CATÁLOGO DE PLANES                                         */}
      {/* ===================================================================== */}
      {activeTab === 'planes' && (
        <div {...tabs.propsPanel('planes')} className="space-y-4 animate-in fade-in-50 duration-200">
          <PanelPlanes
            planes={planes.planes}
            isLoadingPlanes={planes.isLoadingPlanes}
            planesError={planes.planesError}
            onEditar={abrirModalEditarPlan}
            onToggleActivo={(plan) => void planes.toggleActivoPlan(plan)}
            onCrear={abrirModalCrearPlan}
            onReintentar={() => void planes.cargarPlanes()}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA: TASAS DE CAMBIO & DIVISAS                                   */}
      {/* ===================================================================== */}
      {activeTab === 'tasas' && (
        <div
          {...tabs.propsPanel('tasas')}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in-50 duration-200"
        >
          {/* Columna Izquierda: Configuración de Tasas */}
          <div className="lg:col-span-2 space-y-6">
            <FormularioTasa
              tasaVigente={tasas.tasaVigente}
              isLoadingTasas={tasas.isLoadingTasas}
              tasasError={tasas.tasasError}
              tasaSuccessMsg={tasas.tasaSuccessMsg}
              fuenteSeleccionada={tasas.fuenteSeleccionada}
              tasaOficialBcvInput={tasas.tasaOficialBcvInput}
              tasaParaleloInput={tasas.tasaParaleloInput}
              tasaActivaInput={tasas.tasaActivaInput}
              isSavingTasa={tasas.isSavingTasa}
              onSeleccionarFuente={tasas.seleccionarFuente}
              onCambiarOficial={tasas.cambiarTasaOficial}
              onCambiarParalelo={tasas.cambiarTasaParalelo}
              onCambiarActiva={tasas.cambiarTasaActiva}
              onGuardar={() => void tasas.guardarTasa()}
              onReintentar={() => void tasas.cargarTasas()}
            />
          </div>

          {/* Columna Derecha: Calculadora Instantánea de Conversión */}
          <div className="space-y-4">
            <ConversorTasas
              tasaActivaInput={tasas.tasaActivaInput}
              calculadoraUsd={tasas.calculadoraUsd}
              calculadoraVes={tasas.calculadoraVes}
              onCambiarUsd={tasas.cambiarMontoUsd}
              onCambiarVes={tasas.cambiarMontoVes}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PESTAÑA (N2b): PREFERENCIAS DE NOTIFICACIÓN (RF-015 §B)              */}
      {/* ===================================================================== */}
      {activeTab === 'notificaciones' && (
        <div
          {...tabs.propsPanel('notificaciones')}
          className="space-y-4 animate-in fade-in-50 duration-200"
        >
          <PestanaNotificaciones />
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREAR / EDITAR PLAN COMERCIAL                                  */}
      {/* ===================================================================== */}
      {modalPlan.abierto && (
        <ModalPlanComercial
          key={modalPlan.plan?.id ?? 'nuevo'}
          plan={modalPlan.plan}
          isSubmitting={planes.isSubmittingPlan}
          successMsg={planes.planSuccessMsg}
          onGuardar={(datos, editingId, onCierreExito) =>
            void planes.guardarPlan(datos, editingId, onCierreExito)
          }
          onCerrar={cerrarModalPlan}
        />
      )}
    </div>
  );
}
