import { useState } from 'react';
import type { CambioDemoEntrenador } from '../../lib/admin-entrenadores';
import { construirTextoConfirmacion } from '../../lib/admin-confirmacion';
import { useLogoutSeguro } from '../../lib/use-logout-seguro';
import { useAuth } from '../../context/auth-context';
import { DialogoLogoutPendientes } from '../../components/common/DialogoLogoutPendientes';
import { DialogoConfirmacion } from '../../components/common/DialogoConfirmacion';
import { CabeceraAdmin } from '../../components/admin/admin/CabeceraAdmin';
import { AvisosAdmin } from '../../components/admin/admin/AvisosAdmin';
import { SeccionListadoEntrenadores } from '../../components/admin/admin/SeccionListadoEntrenadores';
import { SeccionAltaEntrenador } from '../../components/admin/admin/SeccionAltaEntrenador';
import { SeccionEnConstruccion } from '../../components/admin/admin/SeccionEnConstruccion';
import { useListadoEntrenadoresAdmin } from '../../components/admin/admin/use-listado-entrenadores-admin';
import { useAccionesEntrenador } from '../../components/admin/admin/use-acciones-entrenador';
import { useAltaEntrenador } from '../../components/admin/admin/use-alta-entrenador';

/**
 * RF-010 RN-01: el superadmin solo administra la plataforma. Hoy las capacidades reales son el
 * alta de entrenadores (Escenario 1), el listado del panel, la habilitación/deshabilitación de
 * cuentas y la gestión de licencias; el resto se declara "en construcción" para no fabricar
 * pantallas ni datos que aún no existen.
 *
 * Contenedor orquestador (R1): compone las secciones y conecta los hooks. Sin JSX de detalle.
 */
const CAPACIDADES_PENDIENTES = [
  'Planes y facturación de la plataforma (la licencia hoy solo se activa o suspende)',
];

export function AdminPage() {
  // U4 (Ola 4): logout con confirmación si hay cambios sin sincronizar.
  const logoutSeguro = useLogoutSeguro();
  const { user, isDemoMode } = useAuth();

  // Modo demo (solo con la bandera explícita): cambios de la sesión sin tocar la red.
  const [cambiosDemo, setCambiosDemo] = useState<Record<string, CambioDemoEntrenador>>({});
  const [versionDemo, setVersionDemo] = useState(0);

  // Listado paginado del panel (RF-010 RN-01).
  const {
    items,
    total,
    cargando,
    errorListado,
    recargar,
    pagina,
    setPagina,
    tamano,
    setTamano,
  } = useListadoEntrenadoresAdmin({ isDemoMode, cambiosDemo, versionDemo });

  // Confirmación accesible y feedback honesto (solo se anuncia éxito con un 2xx real).
  const {
    confirmacion,
    setConfirmacion,
    procesandoUsuarioId,
    accionError,
    aviso,
    solicitarCambioEstado,
    solicitarCambioLicencia,
    confirmarAccion,
  } = useAccionesEntrenador({
    isDemoMode,
    onAplicarCambioDemo: (usuarioId, cambio) => {
      setCambiosDemo((actual) => ({
        ...actual,
        [usuarioId]: { ...actual[usuarioId], ...cambio },
      }));
      setVersionDemo((version) => version + 1);
    },
    onRecargar: recargar,
  });

  // Alta de entrenadores (RF-010 Escenario 1).
  const {
    formulario,
    enviando,
    error,
    creado,
    copiado,
    errorCopia,
    enlaceActivacion,
    actualizarCampo,
    handleSubmit,
    copiarEnlace,
  } = useAltaEntrenador({ onRecargar: recargar });

  const textoConfirmacion = construirTextoConfirmacion(confirmacion);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      <CabeceraAdmin onSolicitarCierre={logoutSeguro.solicitarCierre} />

      <AvisosAdmin aviso={aviso} accionError={accionError} />

      {/* Listado y gestión de entrenadores (RF-010 RN-01 / §6) */}
      <SeccionListadoEntrenadores
        items={items}
        cargando={cargando}
        error={errorListado ? errorListado.message || 'No se pudo cargar el listado.' : null}
        usuarioActualId={user?.id}
        procesandoUsuarioId={procesandoUsuarioId}
        pagina={pagina}
        tamano={tamano}
        total={total}
        onReintentar={recargar}
        onCambiarEstado={solicitarCambioEstado}
        onCambiarLicencia={solicitarCambioLicencia}
        onCambiarPagina={setPagina}
        onCambiarTamano={setTamano}
      />

      {/* Alta de entrenadores (RF-010 Escenario 1) */}
      <SeccionAltaEntrenador
        error={error}
        creado={creado}
        enlaceActivacion={enlaceActivacion}
        copiado={copiado}
        errorCopia={errorCopia}
        formulario={formulario}
        enviando={enviando}
        onCambiarCampo={actualizarCampo}
        onSubmit={handleSubmit}
        onCopiar={copiarEnlace}
      />

      {/* Capacidades administrativas pendientes — copy honesto, sin datos inventados */}
      <SeccionEnConstruccion capacidades={CAPACIDADES_PENDIENTES} />

      {/* Confirmación accesible de las acciones de cuenta/licencia */}
      <DialogoConfirmacion
        abierto={confirmacion !== null && textoConfirmacion !== null}
        idTitulo="admin-confirmacion-titulo"
        titulo={textoConfirmacion?.titulo ?? ''}
        detalle={textoConfirmacion?.detalle ?? ''}
        textoConfirmar={textoConfirmacion?.boton ?? ''}
        procesando={!!procesandoUsuarioId}
        onCancelar={() => setConfirmacion(null)}
        onConfirmar={() => void confirmarAccion()}
      />

      <DialogoLogoutPendientes
        abierto={logoutSeguro.dialogoAbierto}
        pendientes={logoutSeguro.pendientes}
        sincronizando={logoutSeguro.sincronizando}
        mensaje={logoutSeguro.mensaje}
        onCancelar={logoutSeguro.cancelar}
        onConfirmar={logoutSeguro.confirmar}
        onSincronizar={() => void logoutSeguro.sincronizarAhora()}
      />
    </div>
  );
}
