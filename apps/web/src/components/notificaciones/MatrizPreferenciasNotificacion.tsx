/**
 * RF-015 (Ola 3 · N2b): matriz de preferencias de notificación por categoría y canal.
 *
 * Componente compartido por la pestaña "Notificaciones" del coach (`AjustesPage`) y la pantalla
 * "Mis notificaciones" del alumno (`/app/preferencias`): la matriz que pinta viene del API
 * (`matriz` + `canalesObligatorios`), así que ambos roles ven exactamente lo que su contrato define.
 *
 * Reglas visibles:
 * - **RN-01**: los canales obligatorios van marcados, deshabilitados y con la nota del doc.
 * - **RN-02**: si la categoría de Finanzas del rol queda sin Push ni Email, se pide confirmación
 *   explícita con la advertencia del doc antes de enviar `confirmarSinCanalesFinanzas`.
 * - **Feedback honesto**: el éxito solo se declara tras un 2xx; un fallo se muestra con su mensaje
 *   y acción de reintento, y el borrador no se pierde.
 * - **Demo**: fixture tras `isDemoMode`; el guardado aplica a la sesión demo sin tocar la red.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Rol,
  type CategoriaPreferenciasDTO,
  type PreferenciasNotificacionDTO,
} from '@guachafit/shared';
import { ApiError, apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { buildDemoPreferenciasNotificacion } from '../../lib/demo-notificaciones';
import { categoriaVisualDeFila } from '../../lib/notificaciones-in-app';
import {
  CAMPO_CONFIRMACION_FINANZAS,
  TEXTO_ADVERTENCIA_FINANZAS,
  TEXTO_CANAL_OBLIGATORIO_SEGURIDAD,
  aplicarCambioCanal,
  construirPayloadPreferencias,
  descripcionCategoriaNotificacion,
  esErrorConfirmacionFinanzas,
  hayCambiosPreferencias,
  requiereConfirmacionFinanzas,
  type MatrizPreferenciasNotificacion,
  type ProblemaPreferenciasNotificacion,
} from '../../lib/preferencias-notificacion';
import { ICONO_CATEGORIA, TONO_CATEGORIA } from './estilos-categoria';

function clonarMatriz(matriz: MatrizPreferenciasNotificacion): MatrizPreferenciasNotificacion {
  return matriz.map((fila) => ({ ...fila, canalesObligatorios: [...fila.canalesObligatorios] }));
}

/** Interruptor accesible (`role="switch"`) con área táctil de 44px en móvil. */
function InterruptorNotificacion({
  activo,
  bloqueado,
  etiqueta,
  onCambiar,
}: {
  activo: boolean;
  bloqueado: boolean;
  etiqueta: string;
  onCambiar: (valor: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={bloqueado}
      onClick={() => onCambiar(!activo)}
      className="h-11 min-w-[52px] inline-flex items-center justify-center rounded-xl transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 rounded-full border transition-colors ${
          activo ? 'bg-primary border-primary' : 'bg-secondary border-border'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-xs transition-transform duration-150 ${
            activo ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export interface MatrizPreferenciasNotificacionProps {
  className?: string;
}

export function MatrizPreferenciasNotificacion({
  className = '',
}: MatrizPreferenciasNotificacionProps) {
  const { user, isDemoMode } = useAuth();
  const rol = user?.rol ?? Rol.ALUMNO;

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [original, setOriginal] = useState<MatrizPreferenciasNotificacion | null>(null);
  const [matriz, setMatriz] = useState<MatrizPreferenciasNotificacion | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [confirmacionFinanzasAbierta, setConfirmacionFinanzasAbierta] = useState(false);
  // Una vez confirmada la advertencia RN-02 en la sesión, un guardado posterior no vuelve a
  // interrumpir; el flag se reinicia si el usuario toca la fila de Finanzas.
  const [finanzasConfirmadas, setFinanzasConfirmadas] = useState(false);

  const refModalConfirmacion = useDialogoAccesible({
    abierto: confirmacionFinanzasAbierta,
    onCerrar: () => setConfirmacionFinanzasAbierta(false),
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);

    // MODO DEMO EXPLÍCITO: matriz de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      const demo = buildDemoPreferenciasNotificacion(rol);
      setOriginal(clonarMatriz(demo.matriz));
      setMatriz(clonarMatriz(demo.matriz));
      setCargando(false);
      return;
    }

    try {
      const data = await apiClient<PreferenciasNotificacionDTO>('/notificaciones/preferencias');
      setOriginal(clonarMatriz(data.matriz));
      setMatriz(clonarMatriz(data.matriz));
    } catch (error) {
      setOriginal(null);
      setMatriz(null);
      setErrorCarga(
        error instanceof ApiError
          ? error.problem?.detail || error.problem?.message || error.message
          : 'No se pudieron cargar tus preferencias de notificación. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setCargando(false);
    }
  }, [isDemoMode, rol]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hayCambios = !!original && !!matriz && hayCambiosPreferencias(original, matriz);

  const cambiarCanal = (
    fila: CategoriaPreferenciasDTO,
    canal: 'push' | 'email',
    valor: boolean
  ) => {
    triggerHaptic('selection');
    setMatriz((previa) => (previa ? aplicarCambioCanal(previa, fila.id, canal, valor) : previa));
    setMensajeExito(null);
    setErrorGuardado(null);
    if (fila.id === 'FINANZAS' || fila.id === 'COBRANZAS') setFinanzasConfirmadas(false);
  };

  const guardar = async () => {
    if (!matriz || !original) return;
    setGuardando(true);
    setMensajeExito(null);
    setErrorGuardado(null);

    const requiereConfirmacion = requiereConfirmacionFinanzas(rol, matriz);

    try {
      if (isDemoMode) {
        // Demo: la matriz se aplica a la sesión; no se finge una persistencia que no existe.
        setOriginal(clonarMatriz(matriz));
        setFinanzasConfirmadas(requiereConfirmacion);
        setConfirmacionFinanzasAbierta(false);
        setMensajeExito('Preferencias guardadas en esta sesión de demostración.');
        triggerHaptic('success');
        return;
      }

      const payload = construirPayloadPreferencias(rol, matriz);
      const cuerpo = requiereConfirmacion
        ? { ...payload, [CAMPO_CONFIRMACION_FINANZAS]: true }
        : payload;

      const res = await apiClient<PreferenciasNotificacionDTO>('/notificaciones/preferencias', {
        method: 'PUT',
        body: JSON.stringify(cuerpo),
      });

      setOriginal(clonarMatriz(res.matriz));
      setMatriz(clonarMatriz(res.matriz));
      setFinanzasConfirmadas(requiereConfirmacion);
      setConfirmacionFinanzasAbierta(false);
      setMensajeExito('Preferencias guardadas. Se aplicarán a tus próximas notificaciones.');
      triggerHaptic('success');
    } catch (error) {
      const problema =
        error instanceof ApiError
          ? (error.problem as ProblemaPreferenciasNotificacion | undefined)
          : undefined;

      if (esErrorConfirmacionFinanzas(problema)) {
        // Red de seguridad del servidor: el flujo normal ya pregunta antes de enviar.
        setConfirmacionFinanzasAbierta(true);
      } else {
        setErrorGuardado(
          error instanceof ApiError
            ? error.problem?.detail ||
                error.problem?.message ||
                error.message ||
                'No se pudieron guardar tus preferencias. Inténtalo de nuevo.'
            : 'No se pudieron guardar tus preferencias. Revisa tu conexión e inténtalo de nuevo.'
        );
      }
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardar = () => {
    if (!matriz || !hayCambios || guardando) return;
    if (requiereConfirmacionFinanzas(rol, matriz) && !finanzasConfirmadas) {
      setConfirmacionFinanzasAbierta(true);
      return;
    }
    void guardar();
  };

  const confirmarDesactivacionFinanzas = () => {
    triggerHaptic('warning');
    setFinanzasConfirmadas(true);
    setConfirmacionFinanzasAbierta(false);
    void guardar();
  };

  if (cargando) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary/20 border-t-primary" />
          <span className="text-[11px] font-semibold text-muted-foreground">
            Cargando tus preferencias...
          </span>
        </div>
      </div>
    );
  }

  if (errorCarga || !matriz) {
    return (
      <div
        role="alert"
        className={`p-4 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold flex items-start gap-2 ${className}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="flex-1">
          {errorCarga ?? 'No se pudieron cargar tus preferencias de notificación.'}
        </span>
        <button
          type="button"
          onClick={() => void cargar()}
          className="shrink-0 underline hover:no-underline cursor-pointer"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="rounded-3xl bg-card border border-border/80 overflow-hidden">
        <ul className="divide-y divide-border/70">
          {matriz.map((fila) => {
            const categoria = categoriaVisualDeFila(fila.id);
            const Icono = ICONO_CATEGORIA[categoria];
            const emailBloqueado = fila.canalesObligatorios.includes('email');
            const pushBloqueado = fila.canalesObligatorios.includes('push');

            return (
              <li
                key={fila.id}
                className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className={`p-2.5 rounded-xl shrink-0 ${TONO_CATEGORIA[categoria]}`}>
                    <Icono className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      {fila.etiqueta}
                      {(emailBloqueado || pushBloqueado) && (
                        <Lock
                          className="h-3.5 w-3.5 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {descripcionCategoriaNotificacion(fila.id)}
                    </p>
                    {emailBloqueado && (
                      <p className="text-[11px] font-semibold text-muted-foreground mt-1 flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {TEXTO_CANAL_OBLIGATORIO_SEGURIDAD}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:gap-6 shrink-0 self-end sm:self-auto">
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      aria-hidden="true"
                      className="text-[11px] font-semibold text-muted-foreground"
                    >
                      Push
                    </span>
                    <InterruptorNotificacion
                      activo={fila.push}
                      bloqueado={pushBloqueado}
                      etiqueta={`${fila.etiqueta}: avisos Push`}
                      onCambiar={(valor) => cambiarCanal(fila, 'push', valor)}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      aria-hidden="true"
                      className="text-[11px] font-semibold text-muted-foreground"
                    >
                      Email
                    </span>
                    <InterruptorNotificacion
                      activo={fila.email}
                      bloqueado={emailBloqueado}
                      etiqueta={`${fila.etiqueta}: avisos por Email`}
                      onCambiar={(valor) => cambiarCanal(fila, 'email', valor)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border/70 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary/20">
          <div className="space-y-1 min-w-0">
            {errorGuardado && (
              <p
                role="alert"
                className="text-[11px] font-semibold text-destructive flex items-start gap-1.5"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {errorGuardado}
              </p>
            )}
            {!errorGuardado && mensajeExito && (
              <p
                role="status"
                className="text-[11px] font-semibold text-success flex items-start gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {mensajeExito}
              </p>
            )}
            {!errorGuardado && !mensajeExito && (
              <p role="status" className="text-[11px] font-semibold text-muted-foreground">
                {hayCambios ? 'Tienes cambios sin guardar.' : 'Sin cambios pendientes.'}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {errorGuardado && (
              <button
                type="button"
                onClick={handleGuardar}
                disabled={guardando}
                className="h-11 sm:h-9 px-3 rounded-xl bg-secondary border border-border text-foreground font-bold text-[11px] hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${guardando ? 'animate-spin' : ''}`} />
                Reintentar
              </button>
            )}
            <button
              type="button"
              onClick={handleGuardar}
              disabled={!hayCambios || guardando}
              className="h-11 sm:h-9 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:shadow-none"
            >
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>

      {/* RN-02: advertencia de canal mínimo en Finanzas (texto humano del doc) */}
      {confirmacionFinanzasAbierta && (
        <div
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setConfirmacionFinanzasAbierta(false);
          }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            ref={refModalConfirmacion}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rn02-finanzas-titulo"
            tabIndex={-1}
            className="w-full max-w-md rounded-3xl bg-card border border-border p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-start gap-3">
              <span className="p-2.5 rounded-xl bg-warning/15 text-warning shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3
                  id="rn02-finanzas-titulo"
                  className="font-extrabold text-base text-foreground leading-tight"
                >
                  ¿Desactivar todos los avisos de pagos?
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {TEXTO_ADVERTENCIA_FINANZAS}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Si desactivas ambos canales no recibirás recordatorios de cuotas ni confirmaciones de
              pago. Puedes reactivarlos cuando quieras.
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-3 border-t border-border/70">
              <button
                type="button"
                onClick={() => setConfirmacionFinanzasAbierta(false)}
                className="h-11 sm:h-9 px-4 rounded-xl bg-secondary border border-border text-foreground font-bold text-xs hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer"
              >
                Mantener canales activos
              </button>
              <button
                type="button"
                onClick={confirmarDesactivacionFinanzas}
                disabled={guardando}
                className="h-11 sm:h-9 px-4 rounded-xl bg-destructive text-white font-bold text-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                Sí, desactivar de todos modos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
