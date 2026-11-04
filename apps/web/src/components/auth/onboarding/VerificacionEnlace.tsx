/**
 * Onboarding (D17, RF-011): estados transitorios de la verificación del enlace de registro.
 *
 * - `validando`: indicador de carga (`role="status"`), sin formulario.
 * - `error`: la consulta falló por red, 5xx o límite de peticiones (no es un enlace inválido):
 *   mensaje y botón «Reintentar».
 *
 * Presentacional (R1/ADR-022): solo props. §6: controles de 44px (`min-h-11`), texto ≥ 12px.
 */
import { Loader2 } from 'lucide-react';

export interface VerificacionEnlaceProps {
  estado: 'validando' | 'error';
  onReintentar: () => void;
}

export function VerificacionEnlace({ estado, onReintentar }: VerificacionEnlaceProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <section className="w-full max-w-lg p-6 rounded-2xl bg-card border border-border shadow-md space-y-4 text-center">
        {estado === 'validando' ? (
          <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Verificando tu enlace...</span>
          </p>
        ) : (
          <>
            <p role="alert" className="text-sm font-semibold text-destructive">
              No pudimos verificar tu enlace. Revisa tu conexión e inténtalo de nuevo.
            </p>
            <button
              type="button"
              onClick={onReintentar}
              className="inline-flex items-center justify-center min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Reintentar
            </button>
          </>
        )}
      </section>
    </main>
  );
}
