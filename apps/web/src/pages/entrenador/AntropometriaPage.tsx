import { useState } from "react";
import { apiClient } from "../../lib/api-client";
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";
import { etiquetaAlumnoPendiente } from "../../lib/antropometria-filtros";
import {
  construirCuerpoConciliacionAntropometria,
  mensajeExitoConciliacionAntropometria,
  validarMotivoRechazoAntropometria,
} from "../../lib/antropometria-conciliacion";
import { VisorFoto } from "../../components/common/VisorFoto";
import { ComparadorAntropometrico } from "../../components/entrenador/ComparadorAntropometrico";
import { ColaPendientesAntropometria } from "../../components/entrenador/antropometria/ColaPendientesAntropometria";
import {
  EncabezadoAntropometria,
  type PestanaAntropometria,
} from "../../components/entrenador/antropometria/EncabezadoAntropometria";
import { ModalRechazoAntropometria } from "../../components/entrenador/antropometria/ModalRechazoAntropometria";
import { useColaAntropometria } from "../../components/entrenador/antropometria/use-cola-antropometria";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export function AntropometriaPage() {
  const cola = useColaAntropometria();
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
    error,
    recargar,
    busqueda,
    setBusqueda,
    visibles,
    limpiarBusqueda,
    registrarResueltoDemo,
  } = cola;

  const [activeTab, setActiveTab] =
    useState<PestanaAntropometria>("pendientes");
  // D5: fallo de conciliación visible; la tarjeta no desaparece si el server no confirmó.
  const [actionError, setActionError] = useState<string | null>(null);

  // Comparator State
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
    else recargar();
    if (accion === "rechazar") cerrarModalRechazo();
    setActionSuccess(mensajeExitoConciliacionAntropometria(accion));
    setTimeout(() => setActionSuccess(null), 3000);
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
        <div className="p-4 rounded-2xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
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

      {!isLoading && error ? (
        <div className="p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => recargar()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      ) : activeTab === "pendientes" ? (
        /* Review Queue */
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
      ) : (
        /* RF-004: comparador real A/B contra el endpoint (demo conservada vía fixture local). */
        <ComparadorAntropometrico />
      )}

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
