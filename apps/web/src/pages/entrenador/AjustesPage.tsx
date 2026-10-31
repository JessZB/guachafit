import { useEffect, useState } from 'react';
import type { PlanMembresiaDetalleDTO } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import type { PestanaAjustes } from '../../lib/ajustes';
import { PantallaAjustes } from '../../components/ajustes/PantallaAjustes';
import { ConversorTasas } from '../../components/entrenador/ajustes-entrenador/ConversorTasas';
import { FormularioTasa } from '../../components/entrenador/ajustes-entrenador/FormularioTasa';
import { ModalPlanComercial } from '../../components/entrenador/ajustes-entrenador/ModalPlanComercial';
import { PanelPlanes } from '../../components/entrenador/ajustes-entrenador/PanelPlanes';
import { PestanaNotificaciones } from '../../components/entrenador/ajustes-entrenador/PestanaNotificaciones';
import { usePlanesComerciales } from '../../components/entrenador/ajustes-entrenador/use-planes-comerciales';
import { useTasasCambio } from '../../components/entrenador/ajustes-entrenador/use-tasas-cambio';

/** Modal de plan: cerrado, crear o editar un plan existente. */
type EstadoModalPlan =
  | { abierto: false }
  | { abierto: true; plan: PlanMembresiaDetalleDTO | null };

/**
 * RF-018 RN-09 · Ajustes del entrenador. La pantalla común (pestañas, URL y secciones de perfil y
 * acceso) vive en `PantallaAjustes`; aquí solo se ponen las pestañas del negocio y el modal de plan.
 */
export function AjustesPage() {
  const { isDemoMode } = useAuth();
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
    planes.limpiarErrorGuardado();
    setModalPlan({ abierto: true, plan: null });
  }

  function abrirModalEditarPlan(plan: PlanMembresiaDetalleDTO) {
    triggerHaptic('light');
    planes.limpiarMensajePlan();
    planes.limpiarErrorGuardado();
    setModalPlan({ abierto: true, plan });
  }

  function cerrarModalPlan() {
    setModalPlan({ abierto: false });
    planes.limpiarErrorGuardado();
  }

  const contenidoPestana = (pestana: PestanaAjustes) => {
    if (pestana === 'planes') {
      return (
        <PanelPlanes
          planes={planes.planes}
          isLoadingPlanes={planes.isLoadingPlanes}
          planesError={planes.planesError}
          errorToggle={planes.errorToggle}
          planEnCurso={planes.planEnCurso}
          onCerrarErrorToggle={planes.limpiarErrorToggle}
          onEditar={abrirModalEditarPlan}
          onToggleActivo={(plan) => void planes.toggleActivoPlan(plan)}
          onCrear={abrirModalCrearPlan}
          onReintentar={() => void planes.cargarPlanes()}
        />
      );
    }
    if (pestana === 'tasas') {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in-50 duration-200">
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
      );
    }
    if (pestana === 'notificaciones') return <PestanaNotificaciones />;
    return null;
  };

  return (
    <>
      <PantallaAjustes
        descripcion="Tu cuenta y tu negocio."
        conteos={
          planes.isLoadingPlanes || planes.planesError
            ? undefined
            : { planes: planes.planes.length }
        }
        ancho="amplio"
        renderPestana={contenidoPestana}
      />

      {/* MODAL: CREAR / EDITAR PLAN COMERCIAL */}
      {modalPlan.abierto && (
        <ModalPlanComercial
          key={modalPlan.plan?.id ?? 'nuevo'}
          plan={modalPlan.plan}
          isSubmitting={planes.isSubmittingPlan}
          successMsg={planes.planSuccessMsg}
          errorGuardado={planes.errorGuardado}
          onGuardar={(datos, editingId, onCierreExito) =>
            void planes.guardarPlan(datos, editingId, onCierreExito)
          }
          onCerrar={cerrarModalPlan}
        />
      )}
    </>
  );
}
