/**
 * Módulo `alumnos` (fase B, prompt 53) · contenedor orquestador del directorio.
 *
 * Reescrito desde 1306 líneas como contenedor (R2: ≤ 300): lee el modo de sesión,
 * conecta los hooks de datos y compone las secciones. Sin JSX de detalle (R1):
 * cada sección vive en `components/entrenador/alumnos/`.
 *
 * - Datos: `useDirectorioAlumnos` (paginación server-side + filtros + restaurar),
 *   `useAltaManualAlumno` (modal + `POST /alumnos/manual`) y `useEnlaceCaptacion`
 *   (`GET /entrenador/perfil`), con el MISMO mecanismo que usaba la vista (R9).
 * - R5: los roles, labels y textos que consultan los specs viven intactos en los
 *   componentes extraídos; este archivo conserva el orden y las condiciones de
 *   render (carga → error → acción → vacío → lista → modal).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { Paginacion } from '../../components/common/Paginacion';
import {
  type ModoVistaDirectorio,
} from '../../lib/alumnos-directorio-filtros';
import { useDirectorioAlumnos } from '../../components/entrenador/alumnos/use-directorio-alumnos';
import { useAltaManualAlumno } from '../../components/entrenador/alumnos/use-alta-manual-alumno';
import { useEnlaceCaptacion } from '../../components/entrenador/alumnos/use-enlace-captacion';
import { CabeceraAlumnos } from '../../components/entrenador/alumnos/CabeceraAlumnos';
import { FilaKpisCartera } from '../../components/entrenador/alumnos/FilaKpisCartera';
import { BannerCaptacion } from '../../components/entrenador/alumnos/BannerCaptacion';
import { FiltrosDirectorioAlumnos } from '../../components/entrenador/alumnos/FiltrosDirectorioAlumnos';
import { EstadoErrorDirectorio } from '../../components/entrenador/alumnos/EstadoErrorDirectorio';
import { EstadoVacioDirectorio } from '../../components/entrenador/alumnos/EstadoVacioDirectorio';
import { TarjetaAlumnoDirectorio } from '../../components/entrenador/alumnos/TarjetaAlumnoDirectorio';
import { TablaAlumnosDirectorio } from '../../components/entrenador/alumnos/TablaAlumnosDirectorio';
import { ModalInscripcionAlumno } from '../../components/entrenador/alumnos/ModalInscripcionAlumno';
import { FormularioAltaManual } from '../../components/entrenador/alumnos/FormularioAltaManual';
import { ExitoAltaManualAlumno } from '../../components/entrenador/alumnos/ExitoAltaManualAlumno';

export function AlumnosPage() {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();
  const [viewMode, setViewMode] = useState<ModoVistaDirectorio>('cards');

  const directorio = useDirectorioAlumnos({ isDemoMode });
  const captacion = useEnlaceCaptacion({ isDemoMode });
  const alta = useAltaManualAlumno({
    onAltaExitosa: () => {
      directorio.setPagina(1);
      directorio.recargar();
    },
  });

  // U3b: Escape, trampa de Tab, foco inicial y restore del foco al disparador.
  const refModalInscripcion = useDialogoAccesible({ abierto: alta.isModalOpen, onCerrar: alta.cerrarModal });

  const verExpediente = (id: string) => navigate(`/coach/alumnos/${id}`);

  const {
    alumnos,
    total,
    cargando,
    isLoading,
    error,
    pagina,
    tamano,
    kpis,
    filterEstado,
    filterModalidad,
    search,
    actionError,
  } = directorio;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER PRINCIPAL */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <CabeceraAlumnos
          viewMode={viewMode}
          onCambiarVista={setViewMode}
          onInscribir={alta.abrirModalInscripcion}
        />

        {/* KPIs EN CABECERA INTERACTIVOS */}
        <FilaKpisCartera
          kpis={kpis}
          filterEstado={filterEstado}
          filterModalidad={filterModalidad}
          onCambiarEstado={directorio.setFilterEstado}
          onCambiarModalidad={directorio.setFilterModalidad}
          onVerCarteraCompleta={() => {
            directorio.setFilterEstado('todos');
            directorio.setFilterModalidad('todas');
          }}
        />
      </div>

      {/* BANNER DE CAPTACIÓN / DEEP LINK (RF-011 Vía B) */}
      <BannerCaptacion
        registrationUrl={captacion.registrationUrl}
        coachCode={captacion.coachCode}
        coachCodeError={captacion.coachCodeError}
        isDemoMode={isDemoMode}
        copiado={captacion.isCopied}
        errorCopia={captacion.errorCopiaCaptacion}
        onCopiar={captacion.handleCopyLink}
      />

      {/* FILTROS Y BÚSQUEDA */}
      <FiltrosDirectorioAlumnos
        kpis={kpis}
        filterEstado={filterEstado}
        filterModalidad={filterModalidad}
        search={search}
        onCambiarEstado={directorio.setFilterEstado}
        onCambiarModalidad={directorio.setFilterModalidad}
        onCambiarBusqueda={directorio.setSearch}
      />

      {/* WU25a: paginación numerada server-side (contador + filas por página 10/25/50/100).
          WU26: con total=0 no se pinta ("Página 1 de 1 · 0 registros" sobra junto al estado
          vacío, tenga o no filtros activos). */}
      {!isLoading && !error && total > 0 && (
        <div className="px-1">
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            onCambiarPagina={directorio.setPagina}
            onCambiarTamano={directorio.setTamano}
            cargando={cargando}
          />
        </div>
      )}

      {/* D2: error de carga honesto con reintento (sin roster demo fuera del modo demo) */}
      {!isLoading && error && (
        <EstadoErrorDirectorio mensaje={error} onReintentar={directorio.recargar} />
      )}

      {/* D5: fallo visible de acciones (restaurar) sin mutación local silenciosa */}
      {!isLoading && !error && actionError && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* WU25a: estado vacío honesto — cartera sin alumnos o búsqueda/filtros sin coincidencias */}
      {!isLoading && !error && total === 0 && (
        <EstadoVacioDirectorio
          hayFiltrosActivos={directorio.hayFiltrosActivos}
          onLimpiarFiltros={directorio.limpiarFiltros}
        />
      )}

      {/* VISTA 1: CARDS COMPACTAS DENSAS (~120px) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {alumnos.map((a) => (
            <TarjetaAlumnoDirectorio
              key={a.id}
              alumno={a}
              onVerExpediente={verExpediente}
              onRestaurar={directorio.handleRestaurarAlumno}
            />
          ))}
        </div>
      )}

      {/* VISTA 2: VISTA TABLA */}
      {viewMode === 'table' && (
        <TablaAlumnosDirectorio
          alumnos={alumnos}
          onVerExpediente={verExpediente}
          onRestaurar={directorio.handleRestaurarAlumno}
        />
      )}

      {/* MODAL: INSCRIPCIÓN MANUAL EN SALA */}
      {alta.isModalOpen && (
        <ModalInscripcionAlumno refDialogo={refModalInscripcion} onCerrar={alta.cerrarModal}>
          {alta.alumnoCreado ? (
            <ExitoAltaManualAlumno
              alumnoCreado={alta.alumnoCreado}
              copiado={alta.activacionCopiada}
              errorCopia={alta.errorCopiaActivacion}
              onCopiar={alta.handleCopyActivacionLink}
              onListo={alta.cerrarModal}
            />
          ) : (
            <FormularioAltaManual
              nombres={alta.nombres}
              apellidos={alta.apellidos}
              email={alta.email}
              tipoDocumento={alta.tipoDocumento}
              numeroDocumento={alta.numeroDocumento}
              fechaNacimiento={alta.fechaNacimiento}
              prefijoWhatsapp={alta.prefijoWhatsapp}
              numeroWhatsapp={alta.numeroWhatsapp}
              modalidad={alta.modalidad}
              fichaSaludPrivada={alta.fichaSaludPrivada}
              isSubmitting={alta.isSubmitting}
              formError={alta.formError}
              onCambiarNombres={alta.setNombres}
              onCambiarApellidos={alta.setApellidos}
              onCambiarEmail={alta.setEmail}
              onCambiarTipoDocumento={alta.setTipoDocumento}
              onCambiarNumeroDocumento={alta.setNumeroDocumento}
              onCambiarFechaNacimiento={alta.setFechaNacimiento}
              onCambiarPrefijoWhatsapp={alta.setPrefijoWhatsapp}
              onCambiarNumeroWhatsapp={alta.setNumeroWhatsapp}
              onCambiarModalidad={alta.setModalidad}
              onCambiarFichaSalud={alta.setFichaSaludPrivada}
              onSubmit={alta.handleCrearAlumnoManual}
            />
          )}
        </ModalInscripcionAlumno>
      )}
    </div>
  );
}
