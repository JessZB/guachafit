/**
 * RF-017 Escenario 1: banco de plantillas de rutina del coach.
 * Listado con estados explícitos (loading/vacío/error+retry) + creación/edición con los
 * selectores estructurados y el picker de catálogo del modal de prescripción (WU5).
 *
 * Contenedor orquestador (fase B, prompt 58): lee la bandera demo, compone filtros,
 * estados, tarjetas y modal, y conecta los hooks. Sin JSX de detalle (R1).
 * Usa los átomos de la consolidación 48 (`ui/EstadoCarga`, `ui/EstadoError`,
 * `ui/EstadoVacio`) en lugar de las copias locales.
 *
 * §6: estados honestos (carga/vacío/error+reintento), español claro, 44px,
 * 11px mínimo, tokens con variante claro/oscuro, peso ≤ 700.
 */
import { useMemo, useState } from 'react';
import type { PlantillaRutinaResumenDTO } from '@guachafit/shared';
import { resolverUrlApi } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { AvisoErrorRecarga } from '../../components/common/AvisoErrorRecarga';
import { AsignacionMasivaPlantilla } from '../../components/entrenador/AsignacionMasivaPlantilla';
import { CargaConEsqueleto } from '../../components/ui/CargaConEsqueleto';
import { EsqueletoRejillaTarjetas } from '../../components/ui/esqueletos';
import { EstadoError } from '../../components/ui/EstadoError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { Dumbbell, SearchX } from 'lucide-react';
import {
  contarPlantillasPorEstado,
  filtrarPlantillas,
  hayFiltroPlantillasActivo,
  type FiltroEstadoPlantilla,
  type FiltroNivelPlantilla,
} from '../../lib/plantillas-filtros';
import { usePlantillasBanco } from '../../components/entrenador/plantillas/use-plantillas-banco';
import { useFormularioPlantilla } from '../../components/entrenador/plantillas/use-formulario-plantilla';
import { CabeceraPlantillas } from '../../components/entrenador/plantillas/CabeceraPlantillas';
import { AvisoAccionPlantillas } from '../../components/entrenador/plantillas/AvisoAccionPlantillas';
import { FiltrosPlantillas } from '../../components/entrenador/plantillas/FiltrosPlantillas';
import { TarjetaPlantilla } from '../../components/entrenador/plantillas/TarjetaPlantilla';
import { ModalPlantilla } from '../../components/entrenador/plantillas/ModalPlantilla';

export function PlantillasPage() {
  const { isDemoMode } = useAuth();
  // D7: sin conexión no se puede guardar (la lista puede venir de la copia guardada).
  const { isOnline } = useFrescuraOffline(null);

  const banco = usePlantillasBanco(isDemoMode);
  const formulario = useFormularioPlantilla({
    isDemoMode,
    obtenerDetalle: banco.obtenerDetalle,
    reponerResumen: banco.reponerResumen,
    reponerDetalleDemo: banco.reponerDetalleDemo,
    informarErrorAccion: banco.setAccionError,
  });

  const [filtro, setFiltro] = useState<FiltroEstadoPlantilla>('activas');
  const [busqueda, setBusqueda] = useState('');
  const [filtroNivel, setFiltroNivel] = useState<FiltroNivelPlantilla>('todos');

  // A6: plantilla elegida para asignarla a varios alumnos.
  const [asignandoPlantilla, setAsignandoPlantilla] = useState<PlantillaRutinaResumenDTO | null>(
    null
  );

  const conteos = useMemo(() => contarPlantillasPorEstado(banco.plantillas), [banco.plantillas]);

  const visibles = useMemo(
    () => filtrarPlantillas(banco.plantillas, { estado: filtro, busqueda, nivel: filtroNivel }),
    [banco.plantillas, filtro, busqueda, filtroNivel]
  );

  const hayFiltroActivo = hayFiltroPlantillasActivo({ busqueda, nivel: filtroNivel });

  const limpiarFiltros = () => {
    triggerHaptic('selection');
    setBusqueda('');
    setFiltroNivel('todos');
  };

  const cambiarFiltro = (nuevo: FiltroEstadoPlantilla) => {
    triggerHaptic('selection');
    setFiltro(nuevo);
  };

  const asignarPlantilla = (plantilla: PlantillaRutinaResumenDTO) => {
    triggerHaptic('light');
    setAsignandoPlantilla(plantilla);
  };

  const pedirDesactivar = (id: string) => {
    triggerHaptic('light');
    banco.setConfirmandoId(id);
  };

  const tituloVacioPorEstado =
    filtro === 'activas'
      ? 'No tienes plantillas activas'
      : filtro === 'desactivadas'
        ? 'No tienes plantillas desactivadas'
        : 'Todavía no tienes plantillas de ejercicios';

  const errorSinDatos = Boolean(banco.error && banco.plantillas.length === 0);
  const hayDatos = banco.plantillas.length > 0;

  return (
    <div className="space-y-6 pb-12">
      <CabeceraPlantillas onNueva={formulario.abrirCrear} />

      {/* D7: la lista puede venir de la copia guardada cuando no hay conexión */}
      {!isDemoMode && banco.plantillas.length > 0 && (
        <AvisoDatosOffline url={resolverUrlApi('/plantillas')} />
      )}

      {banco.accionError && (
        <AvisoAccionPlantillas
          mensaje={banco.accionError}
          onDescartar={() => banco.setAccionError(null)}
        />
      )}

      <FiltrosPlantillas
        filtro={filtro}
        conteos={conteos}
        onCambiarFiltro={cambiarFiltro}
        busqueda={busqueda}
        onCambiarBusqueda={setBusqueda}
        filtroNivel={filtroNivel}
        onCambiarNivel={setFiltroNivel}
        visiblesCount={visibles.length}
        mostrarContador={!banco.cargandoInicial && !errorSinDatos}
      />

      {/* Estados de la lista */}
      {banco.cargandoInicial ? (
        <CargaConEsqueleto texto="Cargando plantillas…">
          <EsqueletoRejillaTarjetas cantidad={6} />
        </CargaConEsqueleto>
      ) : errorSinDatos ? (
        <EstadoError
          titulo="No se pudieron cargar las plantillas"
          mensaje={banco.error ?? 'No se pudieron cargar tus plantillas de ejercicios.'}
          onReintentar={banco.cargarPlantillas}
        />
      ) : (
        <>
          {banco.error && hayDatos && (
            <AvisoErrorRecarga
              mensaje={banco.error}
              onReintentar={banco.cargarPlantillas}
            />
          )}

          {visibles.length === 0 ? (
            hayFiltroActivo ? (
              <EstadoVacio
                titulo="Sin resultados"
                detalle="Ninguna plantilla coincide con la búsqueda o el nivel seleccionado."
                icono={SearchX}
                accion={{ texto: 'Limpiar filtros', onAccion: limpiarFiltros }}
              />
            ) : (
              <EstadoVacio
                titulo={tituloVacioPorEstado}
                detalle={
                  filtro === 'activas'
                    ? 'Crea tu primera plantilla para prescribir una semana completa con un clic a cualquier alumno.'
                    : 'Las plantillas desactivadas se conservan y pueden reactivarse cuando quieras.'
                }
                icono={Dumbbell}
                accion={{ texto: 'Crear plantilla', onAccion: formulario.abrirCrear, variante: 'primaria' }}
              />
            )
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              aria-busy={banco.recargando || undefined}
            >
              {visibles.map((plantilla) => (
                <TarjetaPlantilla
                  key={plantilla.id}
                  plantilla={plantilla}
                  confirmandoDesactivar={banco.confirmandoId === plantilla.id}
                  accionEnCurso={banco.ocupadaId === plantilla.id}
                  cargandoDetalle={banco.cargandoDetalleId === plantilla.id}
                  puedeAsignar={isOnline || isDemoMode}
                  tituloAsignarBloqueado={
                    !isOnline && !isDemoMode ? 'Necesitas internet para asignar' : undefined
                  }
                  onAsignar={() => asignarPlantilla(plantilla)}
                  onEditar={() => formulario.abrirEditar(plantilla)}
                  onPedirDesactivar={() => pedirDesactivar(plantilla.id)}
                  onConfirmarDesactivar={() => banco.desactivarPlantilla(plantilla.id)}
                  onCancelarDesactivar={() => banco.setConfirmandoId(null)}
                  onReactivar={() => banco.reactivarPlantilla(plantilla.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREAR / EDITAR PLANTILLA                                       */}
      {/* ===================================================================== */}
      {formulario.isModalOpen && (
        <ModalPlantilla
          editando={formulario.editando}
          formNombre={formulario.formNombre}
          onCambiarNombre={formulario.setFormNombre}
          formNivel={formulario.formNivel}
          onCambiarNivel={formulario.setFormNivel}
          bloquesEdit={formulario.bloquesEdit}
          onCambiarBloques={formulario.setBloquesEdit}
          editorKey={formulario.editorKey}
          catalogo={banco.catalogo}
          catalogoError={banco.catalogoError}
          onReintentarCatalogo={banco.cargarCatalogo}
          onCrearEjercicio={banco.crearEjercicioEnCatalogo}
          nombreError={formulario.nombreError}
          mostrarNombreError={formulario.mostrarNombreError}
          saveSuccess={formulario.saveSuccess}
          saveError={formulario.saveError}
          isSaving={formulario.isSaving}
          isOnline={isOnline}
          isDemoMode={isDemoMode}
          resumenEditor={formulario.resumenEditor}
          confirmandoCierre={formulario.confirmandoCierre}
          onGuardar={formulario.guardarPlantilla}
          onCerrar={formulario.cerrarModal}
          onSeguirEditando={() => formulario.setConfirmandoCierre(false)}
          onSalirSinGuardar={formulario.cerrarModalSinPreguntar}
        />
      )}

      {/* A6: asignar la plantilla a varios alumnos */}
      {asignandoPlantilla && (
        <AsignacionMasivaPlantilla
          plantilla={asignandoPlantilla}
          onCerrar={() => setAsignandoPlantilla(null)}
        />
      )}
    </div>
  );
}
