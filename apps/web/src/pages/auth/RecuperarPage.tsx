import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { MENSAJE_ERROR_GENERICO } from '../../lib/mensajes-error';
import {
  MENSAJE_RECUPERACION_ENVIADA,
  VIGENCIA_RECUPERACION_TEXTO,
  normalizarCorreoRecuperacion,
  validarCorreoRecuperacion,
} from '../../lib/recuperacion-password';
import { ArrowLeft, Dumbbell, Loader2, Mail, MailCheck } from 'lucide-react';

/**
 * Pantalla pública "¿Olvidaste tu contraseña?".
 *
 * Envía el correo a `POST /auth/recuperar-password`. La respuesta es siempre el mismo mensaje
 * genérico (no revela si el correo está registrado); el enlace llega por correo y vence según
 * `VIGENCIA_ENLACE_RECUPERACION_MS`.
 */
export function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errorValidacion = validarCorreoRecuperacion(email);
    if (errorValidacion) {
      setError(errorValidacion);
      return;
    }

    setIsLoading(true);
    try {
      await apiClient('/auth/recuperar-password', {
        method: 'POST',
        body: JSON.stringify({ email: normalizarCorreoRecuperacion(email) }),
        skipAuth: true,
      });
      setEnviado(true);
    } catch (err: any) {
      // Límite de intentos o red: el cliente de API ya traduce el mensaje a lenguaje claro.
      setError(err?.message || MENSAJE_ERROR_GENERICO);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <div className="w-full max-w-md space-y-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 min-h-11 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al inicio de sesión</span>
        </Link>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-md space-y-5">
          <div className="flex items-center gap-3 border-b border-border/80 pb-4">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground">¿Olvidaste tu contraseña?</h1>
              <p className="text-xs text-muted-foreground">
                Escribe tu correo y te enviamos un enlace para crear una nueva.
              </p>
            </div>
          </div>

          {enviado ? (
            <div className="p-6 text-center space-y-3" role="status" aria-live="polite">
              <MailCheck className="h-12 w-12 text-success mx-auto" />
              <h2 className="font-bold text-base text-foreground">Revisa tu correo</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {MENSAJE_RECUPERACION_ENVIADA} El enlace vence en {VIGENCIA_RECUPERACION_TEXTO}. Si no lo ves, revisa la
                carpeta de correo no deseado.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 active:scale-95 transition-all"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground" htmlFor="recuperar-email">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="h-4 w-4 text-muted-foreground absolute left-3 top-3.5" />
                  <input
                    id="recuperar-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tucorreo@ejemplo.com"
                    className="w-full min-h-11 pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading ? true : undefined}
                className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                <span>{isLoading ? 'Enviando...' : 'Enviarme el enlace'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
