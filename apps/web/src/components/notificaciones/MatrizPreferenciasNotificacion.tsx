/**
 * RF-015 (Ola 3 · N2b): matriz de preferencias de notificación por categoría y canal.
 *
 * Componente compartido por la pestaña "Notificaciones" de Ajustes (alumno `/app/ajustes`, coach
 * `/coach/ajustes`; RF-018 RN-09): la matriz que pinta viene del API (`matriz` +
 * `canalesObligatorios`), así que ambos roles ven exactamente lo que su contrato define.
 *
 * Contenedor orquestador (Ola 3): los datos viven en `use-matriz-preferencias` (mismo mecanismo
 * de siempre, R9) y cada sección en su pieza de `matriz-preferencias-notificacion/`.
 *
 * Reglas visibles:
 * - **RN-01**: los canales obligatorios van marcados, deshabilitados y con la nota del doc.
 * - **RN-02**: si la categoría de Finanzas del rol queda sin Push ni Email, se pide confirmación
 *   explícita con la advertencia del doc antes de enviar `confirmarSinCanalesFinanzas`.
 * - **Feedback honesto**: el éxito solo se declara tras un 2xx; un fallo se muestra con su mensaje
 *   y acción de reintento, y el borrador no se pierde.
 * - **Demo**: fixture tras `isDemoMode`; el guardado aplica a la sesión demo sin tocar la red.
 */
import { AlertCircle } from 'lucide-react';
import { DialogoConfirmacionFinanzas } from './matriz-preferencias-notificacion/DialogoConfirmacionFinanzas';
import { FilaCategoriaNotificacion } from './matriz-preferencias-notificacion/FilaCategoriaNotificacion';
import { PieGuardadoMatriz } from './matriz-preferencias-notificacion/PieGuardadoMatriz';
import { useMatrizPreferencias } from './matriz-preferencias-notificacion/use-matriz-preferencias';

export interface MatrizPreferenciasNotificacionProps {
  className?: string;
}

export function MatrizPreferenciasNotificacion({
  className = '',
}: MatrizPreferenciasNotificacionProps) {
  const {
    cargando,
    errorCarga,
    matriz,
    hayCambios,
    guardando,
    mensajeExito,
    errorGuardado,
    confirmacionFinanzasAbierta,
    cambiarCanal,
    guardar,
    confirmarDesactivacionFinanzas,
    cerrarConfirmacionFinanzas,
    recargar,
  } = useMatrizPreferencias();

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
          onClick={() => void recargar()}
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
          {matriz.map((fila) => (
            <FilaCategoriaNotificacion
              key={fila.id}
              fila={fila}
              onCambiarCanal={cambiarCanal}
            />
          ))}
        </ul>

        <PieGuardadoMatriz
          hayCambios={hayCambios}
          guardando={guardando}
          mensajeExito={mensajeExito}
          errorGuardado={errorGuardado}
          onGuardar={guardar}
        />
      </div>

      {/* RN-02: advertencia de canal mínimo en Finanzas (texto humano del doc) */}
      <DialogoConfirmacionFinanzas
        abierto={confirmacionFinanzasAbierta}
        guardando={guardando}
        onCancelar={cerrarConfirmacionFinanzas}
        onConfirmar={confirmarDesactivacionFinanzas}
      />
    </div>
  );
}
