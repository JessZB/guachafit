import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-client";
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";
import { etiquetaAlumnoPendiente } from "../../lib/antropometria-filtros";
import { CLAVE_PENDIENTES_NAVEGACION } from "../../lib/insignias-pendientes";
import {
  construirCuerpoConciliacionAntropometria,
  mensajeExitoConciliacionAntropometria,
  validarMotivoRechazoAntropometria,
} from "../../lib/antropometria-conciliacion";
import { useFrescuraOffline } from "../../lib/use-frescura-offline";
import { useTabsAccesibles } from "../../lib/use-tabs-accesibles";
import { VisorFoto } from "../../components/common/VisorFoto";
import { AvisoDatosOffline } from "../../components/common/AvisoDatosOffline";
import { AvisoErrorRecarga } from "../../components/common/AvisoErrorRecarga";
import { EstadoCarga } from "../../components/ui/EstadoCarga";
import { EstadoError } from "../../components/ui/EstadoError";
import { ComparadorAntropometrico } from "../../components/entrenador/ComparadorAntropometrico";
import { ColaPendientesAntropometria } from "../../components/entrenador/antropometria/ColaPendientesAntropometria";
import {
  CLAVES_PESTANAS_ANTROPOMETRIA,
  EncabezadoAntropometria,
  ID_BASE_PESTANAS_ANTROPOMETRIA,
  type PestanaAntropometria,
} from "../../components/entrenador/antropometria/EncabezadoAntropometria";
import { ModalRechazoAntropometria } from "../../components/entrenador/antropometria/ModalRechazoAntropometria";
import { useColaAntropometria } from "../../components/entrenador/antropometria/use-cola-antropometria";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

export function AntropometriaPage() {
  const cola = useColaAntropometria();
  const queryClient = useQueryClient();
  const {
    isDemoMode,
    pagina,
    setPagina,
    tamano,
    setTamano,
    pendientes,
    total,
    cargando,
    isLoading,
    hayDatos,
    error,
    recargar,
    busqueda,
    setBusqueda,
    visibles,
    limpiarBusqueda,
    registrarResueltoDemo,
  } = cola;

  // Sin conexión y sin datos guardados no hay nada que cargar ni que reintentar (patrón del Monitor).
  const { isOnline } = useFrescuraOffline(null);
  const sinConexionSinDatos = !isOnline && !hayDatos;
  // Sin datos previos, el fallo es un bloque con reintento; con datos y en línea, un aviso de recarga.
  const errorSinDatos = !isLoading && !hayDatos ? error : null;
  const errorConDatos = hayDatos && isOnline ? error : null;

  const [activeTab, setActiveTab] =
    useState<PestanaAntropometria>("pendientes");
  const { propsPanel } = useTabsAccesibles({
    claves: CLAVES_PESTANAS_ANTROPOMETRIA,
    activa: activeTab,
    onActivar: setActiveTab,
    idBase: ID_BASE_PESTANAS_ANTROPOMETRIA,
  });
  // D5: fallo de conciliación visible; la tarjeta no desaparece si el server no confirmó.
  const [actionError, setActionError] = useState<string | null>(null);

  // Éxito de conciliación: se anuncia con role="status" y lo cierra el usuario.
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // RF-003 RN-04 (WU RF-003b): auditoría de fotos con visor accesible y rechazo con motivo libre.
  const [fotoVisor, setFotoVisor] = useState<{
    foto: ControlAntropometricoDetalleDTO["fotos"][number];
    fecha: string;
  } | null>(null);
  const [fotosConError, setFotosConError] = useState<string[]>([]);
  const [controlARechazar, setControlARechazar] =
    useState<ControlAntropometricoDetalleDTO | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [isRechazando, setIsRechazando] = useState(false);

  const cerrarModalRechazo = () => {
    setControlARechazar(null);
    setMotivoRechazo("");
    setErrorMotivo(null);
  };

  const abrirModalRechazo = (ctrl: ControlAntropometricoDetalleDTO) => {
    setActionError(null);
    setActionSuccess(null);
    setErrorMotivo(null);
    setMotivoRechazo("");
    setControlARechazar(ctrl);
  };

  /**
   * RN-04: concilia un control pendiente.
   * - `aprobar`: consolida sin observación prefabricada (la observación es opcional del coach).
   * - `rechazar`: exige el motivo libre que verá/recibirá el alumno (validado antes de enviar).
   * Solo se declara éxito con 2xx (o el cambio local en modo demo); si falla, la tarjeta sigue.
   */
  const handleConciliar = async (
    id: string,
    accion: "aprobar" | "rechazar",
    motivo?: string,
  ) => {
    setActionError(null);
    setActionSuccess(null);

    const cuerpo = construirCuerpoConciliacionAntropometria(accion, motivo);

    if (accion === "rechazar") {
      const errorValidacion = validarMotivoRechazoAntropometria(motivo);
      if (errorValidacion) {
        setErrorMotivo(errorValidacion);
        return;
      }
    }

    // MODO DEMO EXPLÍCITO: la conciliación vive en estado local, sin llamadas reales (el banner
    // demo visible lo declara). Nunca se declara éxito de un servidor que no respondió.
    if (!isDemoMode) {
      setIsRechazando(accion === "rechazar");
      try {
        await apiClient(`/antropometria/${id}/conciliar`, {
          method: "PATCH",
          body: JSON.stringify(cuerpo),
        });
      } catch (err: any) {
        // D5: sin éxito falso ni desaparición optimista; la evaluación sigue pendiente.
        const mensaje =
          err?.message ||
          "No se pudo conciliar la evaluación. Revisa tu conexión e inténtalo de nuevo.";
        if (accion === "rechazar") setErrorMotivo(mensaje);
        else setActionError(mensaje);
        return;
      } finally {
        setIsRechazando(false);
      }
    }

    // WU25b: el servidor manda; se recarga la página actual (el hook ajusta si el total encogió).
    // En demo se registra el id resuelto y el slice local se recalcula.
    if (isDemoMode) registrarResueltoDemo(id);
    else {
      recargar();
      // Las evaluaciones pendientes de la insignia de navegación bajan tras conciliar.
      queryClient.invalidateQueries({ queryKey: [CLAVE_PENDIENTES_NAVEGACION] });
    }
    if (accion === "rechazar") cerrarModalRechazo();
    setActionSuccess(mensajeExitoConciliacionAntropometria(accion));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <EncabezadoAntropometria
        pestanaActiva={activeTab}
        totalPendientes={total}
        onCambiarPestana={setActiveTab}
      />

      {actionSuccess && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">{actionSuccess}</span>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => setActionSuccess(null)}
            className="min-h-11 min-w-11 -my-2 -mr-2 inline-flex items-center justify-center rounded-xl hover:bg-success/15 cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Panel "Por revisar": existe siempre (aria-controls válido); solo pinta su contenido activo. */}
      <div
        {...propsPanel("pendientes")}
        hidden={activeTab !== "pendientes"}
        className="space-y-4"
      >
        {activeTab === "pendientes" &&
          (sinConexionSinDatos ? (
            <AvisoDatosOffline variante="sin-datos" />
          ) : (
            <>
              {/* Sin conexión con datos guardados: aviso de frescura encima de la cola */}
              {!isOnline && <AvisoDatosOffline />}

              {/* Recarga fallida con la cola visible: se conserva y se ofrece reintentar */}
              {errorConDatos && (
                <AvisoErrorRecarga
                  mensaje={errorConDatos}
                  onReintentar={recargar}
                />
              )}

              {/* Sin datos previos: el error vive solo en este panel, el comparador sigue disponible */}
              {errorSinDatos && (
                <EstadoError
                  titulo="No pudimos cargar las evaluaciones"
                  mensaje={errorSinDatos}
                  onReintentar={recargar}
                  nivelTitulo={2}
                />
              )}

              {/* Primera carga: estado de carga; nunca el vacío (sería un falso "sin pendientes") */}
              {isLoading && <EstadoCarga texto="Cargando evaluaciones…" />}

              {!isLoading && !errorSinDatos && (
                <ColaPendientesAntropometria
                  pagina={pagina}
                  tamano={tamano}
                  total={total}
                  cargando={cargando}
                  busqueda={busqueda}
                  visibles={visibles}
                  totalEnPagina={pendientes.length}
                  fotosConError={fotosConError}
                  onCambiarPagina={setPagina}
                  onCambiarTamano={setTamano}
                  onCambiarBusqueda={setBusqueda}
                  onLimpiarBusqueda={limpiarBusqueda}
                  onFotoError={(fotoId) =>
                    setFotosConError((prev) =>
                      prev.includes(fotoId) ? prev : [...prev, fotoId],
                    )
                  }
                  onVerFoto={(foto, fecha) => setFotoVisor({ foto, fecha })}
                  onRechazar={abrirModalRechazo}
                  onAprobar={(id) => handleConciliar(id, "aprobar")}
                />
              )}
            </>
          ))}
      </div>

      {/* Panel "Comparar" (RF-004): comparador real A/B contra el endpoint (demo vía fixture local). */}
      <div
        {...propsPanel("comparador")}
        hidden={activeTab !== "comparador"}
      >
        {activeTab === "comparador" && <ComparadorAntropometrico />}
      </div>

      {/* RN-04 (WU RF-003b): rechazo con motivo libre (antes: textos fijos prefabricados). */}
      {controlARechazar && (
        <ModalRechazoAntropometria
          control={controlARechazar}
          alumnoEtiqueta={etiquetaAlumnoPendiente(controlARechazar)}
          motivo={motivoRechazo}
          error={errorMotivo}
          isRechazando={isRechazando}
          onCambiarMotivo={(valor) => {
            setMotivoRechazo(valor);
            if (errorMotivo) setErrorMotivo(null);
          }}
          onCerrar={cerrarModalRechazo}
          onConfirmar={(id, motivo) => handleConciliar(id, "rechazar", motivo)}
        />
      )}

      {/* Visor accesible de la foto auditada (Escape, trampa de foco y enlace temporal). */}
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
