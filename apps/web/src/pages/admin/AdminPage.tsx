import React, { useCallback, useState } from 'react';
import {
  CambioEstadoEntrenadorResultadoDTO,
  CambioLicenciaEntrenadorResultadoDTO,
  EntrenadorAdminDTO,
  EntrenadorCreadoDTO,
  EstadoLicencia,
  ListadoEntrenadoresAdminDTO,
} from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import { construirLinkActivacion, normalizarCoachCode } from '../../lib/onboarding-links';
import { useLogoutSeguro } from '../../lib/use-logout-seguro';
import { useAuth } from '../../context/auth-context';
import { usePaginacionServidor, type ParametrosCargaPagina } from '../../lib/use-paginacion-servidor';
import {
  TAMANO_PAGINA_ENTRENADORES_ADMIN,
  endpointEstadoEntrenador,
  endpointLicenciaEntrenador,
  endpointListadoEntrenadores,
  listarEntrenadoresDemo,
  type CambioDemoEntrenador,
} from '../../lib/admin-entrenadores';
import { DialogoLogoutPendientes } from '../../components/common/DialogoLogoutPendientes';
import { DialogoConfirmacion } from '../../components/common/DialogoConfirmacion';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../lib/acceso-ui';
import { Paginacion } from '../../components/common/Paginacion';
import { TablaEntrenadoresAdmin } from '../../components/admin/TablaEntrenadoresAdmin';
import {
  Check,
  ClipboardCopy,
  Clock,
  Lock,
  LogOut,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';

/**
 * RF-010 RN-01: el superadmin solo administra la plataforma. Hoy las capacidades reales son el
 * alta de entrenadores (Escenario 1), el listado del panel, la habilitación/deshabilitación de
 * cuentas y la gestión de licencias; el resto se declara "en construcción" para no fabricar
 * pantallas ni datos que aún no existen.
 */
const CAPACIDADES_PENDIENTES = [
  'Planes y facturación de la plataforma (la licencia hoy solo se activa o suspende)',
  'Envío automático del correo de bienvenida con el enlace de activación',
];

const FORMULARIO_INICIAL = {
  nombres: '',
  apellidos: '',
  email: '',
  telefonoContacto: '',
  coachCode: '',
  nombreComercial: '',
};

/** Acción pendiente de confirmación sobre un entrenador (nunca se ejecuta sin confirmar). */
type AccionEntrenador =
  | { tipo: 'estado'; entrenador: EntrenadorAdminDTO; activo: boolean }
  | { tipo: 'licencia'; entrenador: EntrenadorAdminDTO; estadoLicencia: EstadoLicencia };

export function AdminPage() {
  // U4 (Ola 4): logout con confirmación si hay cambios sin sincronizar.
  const logoutSeguro = useLogoutSeguro();
  const { user, isDemoMode } = useAuth();

  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<EntrenadorCreadoDTO | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState<string | null>(null);

  // Listado paginado del panel (RF-010 RN-01).
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(TAMANO_PAGINA_ENTRENADORES_ADMIN);

  // Modo demo (solo con la bandera explícita): cambios de la sesión sin tocar la red.
  const [cambiosDemo, setCambiosDemo] = useState<Record<string, CambioDemoEntrenador>>({});
  const [versionDemo, setVersionDemo] = useState(0);

  // Confirmación accesible y feedback honesto (solo se anuncia éxito con un 2xx real).
  const [confirmacion, setConfirmacion] = useState<AccionEntrenador | null>(null);
  const [procesandoUsuarioId, setProcesandoUsuarioId] = useState<string | null>(null);
  const [accionError, setAccionError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargarEntrenadores = useCallback(
    async ({ pagina: paginaPedida, tamano: tamanoPedido }: ParametrosCargaPagina) => {
      if (isDemoMode) {
        return listarEntrenadoresDemo(paginaPedida, tamanoPedido, cambiosDemo);
      }
      return apiClient.get<ListadoEntrenadoresAdminDTO>(
        endpointListadoEntrenadores(paginaPedida, tamanoPedido)
      );
    },
    [isDemoMode, cambiosDemo]
  );

  const { items, total, cargando, error: errorListado, recargar } = usePaginacionServidor<
    EntrenadorAdminDTO,
    ListadoEntrenadoresAdminDTO
  >({
    clave: isDemoMode ? ['admin-entrenadores-demo', versionDemo] : 'admin-entrenadores',
    pagina,
    tamano,
    cargar: cargarEntrenadores,
    onAjustarPagina: setPagina,
  });

  const actualizarCampo =
    (campo: keyof typeof FORMULARIO_INICIAL) => (evento: React.ChangeEvent<HTMLInputElement>) => {
      setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }));
    };

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setError(null);
    setCreado(null);
    setCopiado(false);
    setErrorCopia(null);
    setEnviando(true);
    try {
      const nombreComercial = formulario.nombreComercial.trim();
      const respuesta = await apiClient.post<EntrenadorCreadoDTO>('/auth/entrenador', {
        nombres: formulario.nombres.trim(),
        apellidos: formulario.apellidos.trim(),
        email: formulario.email.trim(),
        telefonoContacto: formulario.telefonoContacto.trim(),
        coachCode: normalizarCoachCode(formulario.coachCode),
        ...(nombreComercial ? { nombreComercial } : {}),
      });
      setCreado(respuesta);
      setFormulario(FORMULARIO_INICIAL);
      // El alta nueva aparece en la lista del panel sin recargar la página.
      recargar();
    } catch (err) {
      // Mensaje honesto: el cliente conserva el texto de la API si es legible (correo duplicado,
      // código en uso) y traduce los técnicos.
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo crear el entrenador. Intenta de nuevo.'
      );
    } finally {
      setEnviando(false);
    }
  };

  const enlaceActivacion = creado?.tokenInvitacion
    ? construirLinkActivacion(creado.tokenInvitacion, window.location.origin)
    : null;

  const copiarEnlace = async () => {
    if (!enlaceActivacion) return;
    const ok = await copiarAlPortapapeles(enlaceActivacion);
    setCopiado(ok);
    setErrorCopia(ok ? null : MENSAJE_COPIA_FALLIDA);
  };

  const solicitarCambioEstado = (entrenador: EntrenadorAdminDTO, activo: boolean) => {
    setAccionError(null);
    setAviso(null);
    setConfirmacion({ tipo: 'estado', entrenador, activo });
  };

  const solicitarCambioLicencia = (
    entrenador: EntrenadorAdminDTO,
    estadoLicencia: EstadoLicencia
  ) => {
    setAccionError(null);
    setAviso(null);
    setConfirmacion({ tipo: 'licencia', entrenador, estadoLicencia });
  };

  /**
   * Ejecuta la acción confirmada. El aviso de éxito SOLO se muestra cuando la API responde 2xx
   * (en demo, cuando el cambio se aplica al fixture local); cualquier fallo cae en `accionError`.
   */
  const confirmarAccion = async () => {
    if (!confirmacion) return;
    const { entrenador } = confirmacion;
    setProcesandoUsuarioId(entrenador.usuarioId);
    setAccionError(null);
    try {
      if (isDemoMode) {
        const cambio: CambioDemoEntrenador =
          confirmacion.tipo === 'estado'
            ? { activo: confirmacion.activo }
            : { estadoLicencia: confirmacion.estadoLicencia };
        setCambiosDemo((actual) => ({
          ...actual,
          [entrenador.usuarioId]: { ...actual[entrenador.usuarioId], ...cambio },
        }));
        setVersionDemo((version) => version + 1);
        setAviso('Cambio aplicado en esta sesión de demostración (no se guardó en el servidor).');
        setConfirmacion(null);
        return;
      }

      if (confirmacion.tipo === 'estado') {
        const respuesta = await apiClient.patch<CambioEstadoEntrenadorResultadoDTO>(
          endpointEstadoEntrenador(entrenador.usuarioId),
          { activo: confirmacion.activo }
        );
        setAviso(respuesta.mensaje);
      } else {
        const respuesta = await apiClient.patch<CambioLicenciaEntrenadorResultadoDTO>(
          endpointLicenciaEntrenador(entrenador.usuarioId),
          { estadoLicencia: confirmacion.estadoLicencia }
        );
        setAviso(respuesta.mensaje);
      }
      setConfirmacion(null);
      recargar();
    } catch (err) {
      setAccionError(
        err instanceof Error && err.message
          ? err.message
          : 'No se pudo aplicar el cambio. Intenta de nuevo.'
      );
    } finally {
      setProcesandoUsuarioId(null);
    }
  };

  const textoConfirmacion = confirmacion
    ? {
        titulo:
          confirmacion.tipo === 'estado'
            ? confirmacion.activo
              ? `¿Reactivar a ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`
              : `¿Deshabilitar a ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`
            : confirmacion.estadoLicencia === EstadoLicencia.ACTIVA
              ? `¿Activar la licencia de ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`
              : `¿Suspender la licencia de ${confirmacion.entrenador.nombres} ${confirmacion.entrenador.apellidos}?`,
        detalle:
          confirmacion.tipo === 'estado'
            ? confirmacion.activo
              ? 'Podrá volver a iniciar sesión. Sus alumnos también recuperan el acceso.'
              : 'Ya no podrá entrar: su sesión se cerrará en unos minutos (máximo 15). Sus alumnos tampoco podrán entrar mientras la cuenta esté deshabilitada.'
            : confirmacion.estadoLicencia === EstadoLicencia.ACTIVA
              ? 'Podrá volver a iniciar sesión y su enlace de registro para alumnos vuelve a funcionar. Sus alumnos también recuperan el acceso.'
              : 'Ya no podrá entrar y su enlace de registro para alumnos dejará de funcionar. Sus alumnos tampoco podrán entrar mientras la licencia esté suspendida.',
        boton: confirmacion.tipo === 'estado'
          ? confirmacion.activo
            ? 'Reactivar cuenta'
            : 'Deshabilitar cuenta'
          : confirmacion.estadoLicencia === EstadoLicencia.ACTIVA
            ? 'Activar licencia'
            : 'Suspender licencia',
      }
    : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Plataforma GUACHAFIT
          </span>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-foreground mt-1">
            Panel de administración
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Administra las cuentas y licencias de los entrenadores, y comparte sus enlaces de
            activación.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void logoutSeguro.solicitarCierre()}
          className="min-h-11 min-w-11 justify-center flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 text-xs font-semibold transition-colors cursor-pointer"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Cerrar sesión</span>
        </button>
      </div>

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 rounded-xl bg-success/10 border border-success/30 text-success text-xs font-semibold flex items-center gap-2"
        >
          <Check className="h-4 w-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      {accionError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold"
        >
          {accionError}
        </div>
      )}

      {/* Listado y gestión de entrenadores (RF-010 RN-01 / §6) */}
      <section className="p-5 sm:p-6 rounded-2xl bg-card border border-border/80 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Entrenadores de la plataforma</h2>
            <p className="text-xs text-muted-foreground">
              Deshabilita cuentas o suspende licencias: el acceso del entrenador se revoca la
              próxima vez que la persona use la app.
            </p>
          </div>
        </div>

        <TablaEntrenadoresAdmin
          items={items}
          cargando={cargando}
          error={errorListado ? (errorListado.message || 'No se pudo cargar el listado.') : null}
          usuarioActualId={user?.id}
          procesandoUsuarioId={procesandoUsuarioId}
          onReintentar={recargar}
          onCambiarEstado={solicitarCambioEstado}
          onCambiarLicencia={solicitarCambioLicencia}
        />

        {total > 0 && (
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            onCambiarPagina={setPagina}
            onCambiarTamano={(nuevoTamano) => {
              setTamano(nuevoTamano);
              setPagina(1);
            }}
            cargando={cargando}
          />
        )}
      </section>

      {/* Alta de entrenadores (RF-010 Escenario 1) */}
      <section className="p-5 sm:p-6 rounded-2xl bg-card border border-border/80 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/15 text-primary">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Crear entrenador</h2>
            <p className="text-xs text-muted-foreground">
              El entrenador recibirá un enlace de activación válido por 48 horas para crear su
              contraseña.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold"
          >
            {error}
          </div>
        )}

        {creado && (
          <div className="p-4 rounded-xl bg-success/10 border border-success/30 space-y-3">
            <div className="flex items-center gap-2 text-success text-sm font-bold">
              <Check className="h-4 w-4" />
              <span>{creado.mensaje}</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                <span className="font-semibold text-foreground">
                  {creado.nombres} {creado.apellidos}
                </span>{' '}
                — {creado.email}
              </p>
              <p>
                Código de entrenador: <span className="font-mono font-bold text-foreground">{creado.coachCode}</span>
              </p>
            </div>
            {enlaceActivacion ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Comparte este enlace de activación (válido 48 horas):
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono break-all px-2.5 py-2 rounded-lg bg-background border border-border text-foreground">
                    {enlaceActivacion}
                  </code>
                  <button
                    type="button"
                    onClick={copiarEnlace}
                    className="min-h-11 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    {copiado ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                    <span>{copiado ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                {errorCopia && (
                  <p role="alert" className="text-xs font-semibold text-destructive">
                    {errorCopia}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                La cuenta quedó activa con la contraseña definida.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="admin-nombres" className="text-xs font-semibold text-foreground">
              Nombres
            </label>
            <input
              id="admin-nombres"
              required
              minLength={2}
              maxLength={100}
              value={formulario.nombres}
              onChange={actualizarCampo('nombres')}
              placeholder="Marcos"
              className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-apellidos" className="text-xs font-semibold text-foreground">
              Apellidos
            </label>
            <input
              id="admin-apellidos"
              required
              minLength={2}
              maxLength={100}
              value={formulario.apellidos}
              onChange={actualizarCampo('apellidos')}
              placeholder="Fitness"
              className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-email" className="text-xs font-semibold text-foreground">
              Correo electrónico
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={formulario.email}
              onChange={actualizarCampo('email')}
              placeholder="marcos@gym.com"
              className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-telefono" className="text-xs font-semibold text-foreground">
              Teléfono de contacto
            </label>
            <input
              id="admin-telefono"
              type="tel"
              inputMode="tel"
              required
              minLength={8}
              maxLength={30}
              value={formulario.telefonoContacto}
              onChange={actualizarCampo('telefonoContacto')}
              placeholder="+58 412 000 0000"
              className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-coach-code" className="text-xs font-semibold text-foreground">
              Código de entrenador
            </label>
            <input
              id="admin-coach-code"
              required
              minLength={4}
              maxLength={15}
              pattern="[A-Za-z0-9_\-]+"
              title="Solo letras, números, guion y guion bajo (4 a 15 caracteres)"
              value={formulario.coachCode}
              onChange={actualizarCampo('coachCode')}
              placeholder="MARCOS-921"
              className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm font-mono focus:outline-hidden focus:border-primary transition-colors"
            />
            <p className="text-xs text-muted-foreground">
              Será el código del enlace de captación de sus alumnos.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-nombre-comercial" className="text-xs font-semibold text-foreground">
              Nombre comercial <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="admin-nombre-comercial"
              minLength={2}
              maxLength={150}
              value={formulario.nombreComercial}
              onChange={actualizarCampo('nombreComercial')}
              placeholder="Marcos Fitness"
              className="w-full min-h-11 px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              La contraseña se define con el enlace de activación.
            </span>
            <button
              type="submit"
              disabled={enviando}
              className="min-h-11 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
            >
              {enviando ? 'Creando cuenta...' : 'Crear entrenador'}
            </button>
          </div>
        </form>
      </section>

      {/* Capacidades administrativas pendientes — copy honesto, sin datos inventados */}
      <section className="p-5 rounded-2xl bg-card/60 border border-border/70 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-bold text-foreground">En construcción</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Estas capacidades de administración todavía no están disponibles:
        </p>
        <ul className="space-y-1.5">
          {CAPACIDADES_PENDIENTES.map((capacidad) => (
            <li key={capacidad} className="text-xs text-muted-foreground flex gap-2">
              <span className="text-muted-foreground/70">•</span>
              <span>{capacidad}</span>
            </li>
          ))}
        </ul>
      </section>

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
