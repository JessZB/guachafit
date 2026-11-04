/**
 * Módulo `alumnos` (fase B, prompt 53) · contenedor orquestador de "Mis alumnos".
 *
 * Mis alumnos (2026-10-19): cabecera con "Invitar" e "Inscribir Manual", controles con chips de
 * estado con conteo, orden y la lista en tarjetas o tabla. Los KPI y el banner de captación salen de
 * la vista; el enlace de captación vive en el diálogo "Invitar".
 *
 * - Datos: `useDirectorioAlumnos` (paginación server-side + filtros + orden + restaurar),
 *   `useAltaManualAlumno` (modal + `POST /alumnos/manual`) y `useEnlaceCaptacion`
 *   (`GET /entrenador/perfil`).
 * - Sin conexión (fuera de demo): con datos, `AvisoDatosOffline` sobre la lista; sin datos y con
 *   error, el aviso de sin datos sustituye a `EstadoErrorDirectorio`; con datos y error sin conexión solo queda `AvisoDatosOffline` (TanStack reintenta al reconectar).
 * - R2: contenedor ≤ 300 líneas; cada sección vive en `components/entrenador/alumnos/`.
 * - Orden de render: cabecera → controles → aviso sin conexión → paginación → carga / error / acción /
 *   vacío → lista → diálogos.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { Paginacion } from '../../components/common/Paginacion';
import type { ModoVistaDirectorio } from '../../lib/alumnos-directorio-filtros';
import { useDirectorioAlumnos } from '../../components/entrenador/alumnos/use-directorio-alumnos';
import { useAltaManualAlumno } from '../../components/entrenador/alumnos/use-alta-manual-alumno';
import { useEnlaceCaptacion } from '../../components/entrenador/alumnos/use-enlace-captacion';
import { CabeceraAlumnos } from '../../components/entrenador/alumnos/CabeceraAlumnos';
import { FiltrosDirectorioAlumnos } from '../../components/entrenador/alumnos/FiltrosDirectorioAlumnos';
import { EsqueletoDirectorio } from '../../components/entrenador/alumnos/EsqueletoDirectorio';
import { EstadoErrorDirectorio } from '../../components/entrenador/alumnos/EstadoErrorDirectorio';
import { AvisoErrorDirectorio } from '../../components/entrenador/alumnos/AvisoErrorDirectorio';
import { EstadoVacioDirectorio } from '../../components/entrenador/alumnos/EstadoVacioDirectorio';
import { TarjetaAlumnoDirectorio } from '../../components/entrenador/alumnos/TarjetaAlumnoDirectorio';
import { TablaAlumnosDirectorio } from '../../components/entrenador/alumnos/TablaAlumnosDirectorio';
import { ModalEnlaceCaptacion } from '../../components/entrenador/alumnos/ModalEnlaceCaptacion';
import { ModalInscripcionAlumno } from '../../components/entrenador/alumnos/ModalInscripcionAlumno';
import { FormularioAltaManual } from '../../components/entrenador/alumnos/FormularioAltaManual';
import { ExitoAltaManualAlumno } from '../../components/entrenador/alumnos/ExitoAltaManualAlumno';

export function AlumnosPage() {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();
  const { isOnline } = useFrescuraOffline(null);
  const [viewMode, setViewMode] = useState<ModoVistaDirectorio>('cards');
  const [invitacionAbierta, setInvitacionAbierta] = useState(false);

  const directorio = useDirectorioAlumnos({ isDemoMode });
  const captacion = useEnlaceCaptacion({ isDemoMode });
  // D17: al abrir el modal «Invitar» se refresca el enlace (otra sesión pudo rotarlo o pausarlo).
  const { recargarCaptacion } = captacion;
  useEffect(() => {
    if (invitacionAbierta) recargarCaptacion();
  }, [invitacionAbierta, recargarCaptacion]);

  const alta = useAltaManualAlumno({
    onAltaExitosa: () => {
      directorio.setPagina(1);
      directorio.recargar();
    },
  });

  // U3b: Escape, trampa de Tab, foco inicial y restore del foco al disparador.
  const refModalInscripcion = useDialogoAccesible({ abierto: alta.isModalOpen, onCerrar: alta.cerrarModal });
  const cerrarInvitacion = () => setInvitacionAbierta(false);
  const refModalInvitacion = useDialogoAccesible({ abierto: invitacionAbierta, onCerrar: cerrarInvitacion });

  const verExpediente = (id: string) => navigate(`/coach/alumnos/${id}`);

  const {
    alumnos,
    total,
    isLoading,
    error,
    hayDatos,
    pagina,
    tamano,
    resumen,
    filterEstado,
    filterModalidad,
    search,
    orden,
    actionError,
    urlConsulta,
  } = directorio;
  // F3: solo sin datos en pantalla el error ocupa la vista; con lista visible es un aviso inline.
  const errorSinDatos = Boolean(error) && !hayDatos;
  // Sin conexión fuera de demo: la lista guardada se marca como tal; en demo no hay consulta real.
  const sinConexionReal = !isDemoMode && !isOnline;

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-12">
      <CabeceraAlumnos
        onInvitar={() => setInvitacionAbierta(true)}
        onInscribir={alta.abrirModalInscripcion}
      />

      {/* CHIPS DE ESTADO, BÚSQUEDA, ORDEN, MODALIDAD Y VISTA */}
      <FiltrosDirectorioAlumnos
        resumen={resumen}
        filterEstado={filterEstado}
        filterModalidad={filterModalidad}
        search={search}
        orden={orden}
        viewMode={viewMode}
        onCambiarEstado={directorio.setFilterEstado}
        onCambiarModalidad={directorio.setFilterModalidad}
        onCambiarBusqueda={directorio.setSearch}
        onCambiarOrden={directorio.setOrden}
        onCambiarVista={setViewMode}
      />

      {/* Mis alumnos (2026-10-19): sin conexión con la lista ya visible, aviso con la frescura de la copia */}
      {sinConexionReal && hayDatos && <AvisoDatosOffline url={urlConsulta} />}

      {/* WU25a: paginación numerada server-side. WU26: con total=0 no se pinta. */}
      {!isLoading && !errorSinDatos && total > 0 && (
        <div className="px-1">
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            onCambiarPagina={directorio.setPagina}
            onCambiarTamano={directorio.setTamano}
            cargando={directorio.cargando}
          />
        </div>
      )}

      {/* Mis alumnos (2026-10-19): esqueleto con nombre accesible; nada de cifras falsas al cargar */}
      {isLoading && <EsqueletoDirectorio />}

      {/* D2: error de carga honesto con reintento (sin roster demo fuera del modo demo) */}
      {!isLoading && error && !hayDatos && !sinConexionReal && (
        <EstadoErrorDirectorio mensaje={error} onReintentar={directorio.recargar} />
      )}

      {/* Sin conexión y sin datos: el error no es definitivo; TanStack reintenta al reconectar */}
      {!isLoading && error && !hayDatos && sinConexionReal && (
        <AvisoDatosOffline variante="sin-datos" />
      )}

      {/* F3: la lista sigue visible si la consulta falla con datos previos; el aviso ofrece reintentar */}
      {!isLoading && error && hayDatos && !sinConexionReal && (
        <AvisoErrorDirectorio mensaje={error} onReintentar={directorio.recargar} />
      )}

      {/* D5: fallo visible de acciones (restaurar) sin mutación local silenciosa */}
      {!isLoading && !errorSinDatos && actionError && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* WU25a: estado vacío honesto — cartera sin alumnos o búsqueda/filtros sin coincidencias */}
      {!isLoading && !errorSinDatos && total === 0 && (
        <EstadoVacioDirectorio
          hayFiltrosActivos={directorio.hayFiltrosActivos}
          onLimpiarFiltros={directorio.limpiarFiltros}
        />
      )}

      {/* VISTA 1: TARJETAS */}
      {!isLoading && !errorSinDatos && total > 0 && viewMode === 'cards' && (
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

      {/* VISTA 2: TABLA */}
      {!isLoading && !errorSinDatos && total > 0 && viewMode === 'table' && (
        <TablaAlumnosDirectorio
          alumnos={alumnos}
          onVerExpediente={verExpediente}
          onRestaurar={directorio.handleRestaurarAlumno}
        />
      )}

      {/* DIÁLOGO: INVITAR (enlace de captación) */}
      {invitacionAbierta && (
        <ModalEnlaceCaptacion
          refDialogo={refModalInvitacion}
          onCerrar={cerrarInvitacion}
          registrationUrl={captacion.registrationUrl}
          coachCode={captacion.coachCode}
          coachCodeError={captacion.coachCodeError}
          isDemoMode={isDemoMode}
          copiado={captacion.isCopied}
          errorCopia={captacion.errorCopiaCaptacion}
          onCopiar={captacion.handleCopyLink}
          captacionActiva={captacion.captacionActiva}
          registrosPorEnlace={captacion.registrosPorEnlace}
          rotando={captacion.rotando}
          cambiandoCaptacion={captacion.cambiandoCaptacion}
          errorCaptacion={captacion.errorCaptacion}
          mensajeCaptacion={captacion.mensajeCaptacion}
          onRotarEnlace={captacion.rotarEnlace}
          onAlternarCaptacion={captacion.alternarCaptacion}
        />
      )}

      {/* DIÁLOGO: INSCRIPCIÓN MANUAL EN SALA */}
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
