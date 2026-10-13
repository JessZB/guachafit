/**
 * Módulo `monitor-adherencia` (prompt 72, Ola 2) · contenedor orquestador del monitor semanal.
 *
 * Reescrito desde 888 líneas como contenedor (R2: ≤ 300): conecta el hook de datos y compone
 * las secciones. Sin JSX de detalle (R1): cada sección vive en
 * `components/entrenador/monitor-adherencia/`.
 *
 * - Datos: `useMonitorAdherencia` (paginación server-side + filtros + modal) y
 *   `useHistorialActividad` (historial del modal), con el MISMO mecanismo que usaba la vista
 *   (R9: `usePaginacionServidor` + `apiClient`, demo con fixtures locales).
 * - R5: los roles, labels y textos que consultan los specs viven intactos en los
 *   componentes extraídos; este archivo conserva el orden y las condiciones de
 *   render (cabecera → carga → error → vacío cartera → vacío filtros → lista → modal).
 */

import { useAuth } from '../../context/auth-context';
import { Paginacion } from '../../components/common/Paginacion';
import { useMonitorAdherencia } from '../../components/entrenador/monitor-adherencia/use-monitor-adherencia';
import { CabeceraMonitor } from '../../components/entrenador/monitor-adherencia/CabeceraMonitor';
import {
  CargaMonitor,
  ErrorMonitor,
  VacioCarteraMonitor,
  VacioFiltrosMonitor,
} from '../../components/entrenador/monitor-adherencia/EstadosMonitor';
import { TarjetaAlumnoMonitor } from '../../components/entrenador/monitor-adherencia/TarjetaAlumnoMonitor';
import { ModalActividadAlumno } from '../../components/entrenador/monitor-adherencia/ModalActividadAlumno';

export function MonitorAdherenciaPage() {
  const { isDemoMode } = useAuth();
  const monitor = useMonitorAdherencia({ isDemoMode });

  const {
    alumnos,
    total,
    totalCartera,
    resumen,
    cargando,
    isLoading,
    error,
    recargar,
    pagina,
    tamano,
    setPagina,
    setTamano,
    filtroSemaforo,
    setFiltroSemaforo,
    busqueda,
    setBusqueda,
    filtroActivo,
    limpiarFiltros,
    alumnoActivo,
    setAlumnoActivo,
  } = monitor;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Cabecera */}
      <CabeceraMonitor
        resumen={resumen}
        totalCartera={totalCartera}
        total={total}
        filtroSemaforo={filtroSemaforo}
        onCambiarFiltroSemaforo={setFiltroSemaforo}
        busqueda={busqueda}
        onCambiarBusqueda={setBusqueda}
        filtroActivo={filtroActivo}
        isLoading={isLoading}
        error={error}
        cargando={cargando}
        onRecargar={recargar}
      />

      {/* Estados de carga / error / vacío */}
      {isLoading && <CargaMonitor />}

      {!isLoading && error && <ErrorMonitor mensaje={error} onReintentar={recargar} />}

      {!isLoading && !error && totalCartera === 0 && <VacioCarteraMonitor />}

      {/* WU25a: estado vacío honesto de filtros (cartera con alumnos, filtro sin coincidencias) */}
      {!isLoading && !error && totalCartera > 0 && total === 0 && (
        <VacioFiltrosMonitor onLimpiarFiltros={limpiarFiltros} />
      )}

      {/* WU25a: paginación numerada server-side + listado del orden de riesgo del endpoint */}
      {!isLoading && !error && total > 0 && (
        <div className="space-y-3">
          <div className="px-1">
            <Paginacion
              pagina={pagina}
              tamano={tamano}
              total={total}
              onCambiarPagina={setPagina}
              onCambiarTamano={setTamano}
              cargando={cargando}
            />
          </div>

          <div className="space-y-3">
            {alumnos.map((alumno) => (
              <TarjetaAlumnoMonitor
                key={alumno.alumnoId}
                alumno={alumno}
                onVerActividad={setAlumnoActivo}
              />
            ))}
          </div>
        </div>
      )}

      {/* WU15: modal de actividad reciente (detalle en sitio sin salir del monitor) */}
      {alumnoActivo && (
        <ModalActividadAlumno
          alumno={alumnoActivo}
          isDemoMode={isDemoMode}
          onCerrar={() => setAlumnoActivo(null)}
        />
      )}
    </div>
  );
}
