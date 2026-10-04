import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../../lib/api-client';
import { MENSAJE_ERROR_GENERICO } from '../../lib/mensajes-error';
import {
  MAXIMO_CARACTERES_PASSWORD,
  MINIMO_CARACTERES_PASSWORD,
  validarPasswordActivacion,
} from '../../lib/onboarding-links';
import {
  MENSAJE_RECUPERACION_INVALIDA,
  VIGENCIA_RECUPERACION_TEXTO,
  construirEstadoLoginConAviso,
  esEnlaceRecuperacionInvalido,
  leerTokenDeBusqueda,
} from '../../lib/recuperacion-password';
import { ArrowLeft, Dumbbell, Eye, EyeOff, KeyRound, Lock, ShieldAlert } from 'lucide-react';

/**
 * Pantalla pública para elegir una nueva contraseña con el enlace de recuperación
 * (`/restablecer?token=…`, un solo uso, vigencia `VIGENCIA_ENLACE_RECUPERACION_MS`).
 *
 * Misma regla de contraseña que la activación. Al terminar lleva a `/login` con el aviso
 * "Tu contraseña se actualizó. Ya puedes iniciar sesión.".
 */
export function RestablecerPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const token = leerTokenDeBusqueda(search);

  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlaceInvalido, setEnlaceInvalido] = useState(token.length === 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const errorValidacion = validarPasswordActivacion(password, confirmacion);
    if (errorValidacion) {
      setError(errorValidacion);
      return;
    }

    setIsLoading(true);
    try {
      await apiClient('/auth/restablecer-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        skipAuth: true,
      });
      navigate('/login', { replace: true, state: construirEstadoLoginConAviso() });
    } catch (err: any) {
      if (esEnlaceRecuperacionInvalido(err)) {
        setEnlaceInvalido(true);
        setError(MENSAJE_RECUPERACION_INVALIDA);
      } else if (err instanceof ApiError && err.status === 401) {
        // Cuenta desactivada o archivada: el cliente conserva el mensaje solo si es amigable.
        setEnlaceInvalido(true);
        setError(err.message !== MENSAJE_ERROR_GENERICO ? err.message : MENSAJE_RECUPERACION_INVALIDA);
      } else {
        setError(err?.message || MENSAJE_ERROR_GENERICO);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const tipoCampo = mostrarPassword ? 'text' : 'password';

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
              <h1 className="font-bold text-lg text-foreground">Crea una nueva contraseña</h1>
              <p className="text-xs text-muted-foreground">
                Elige una contraseña segura que puedas recordar.
              </p>
            </div>
          </div>

          {enlaceInvalido ? (
            <div className="p-5 rounded-xl bg-destructive/10 border border-destructive/30 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <span>Enlace no válido</span>
              </div>
              <p role="alert" className="text-xs text-muted-foreground leading-relaxed">
                {error || MENSAJE_RECUPERACION_INVALIDA}
              </p>
              <Link
                to="/recuperar"
                className="inline-flex items-center gap-1.5 min-h-11 py-2 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all"
              >
                <span>Pedir un enlace nuevo</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground" htmlFor="restablecer-password">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-muted-foreground absolute left-3 top-3.5" />
                  <input
                    id="restablecer-password"
                    name="password"
                    type={tipoCampo}
                    autoComplete="new-password"
                    required
                    minLength={MINIMO_CARACTERES_PASSWORD}
                    maxLength={MAXIMO_CARACTERES_PASSWORD}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Mínimo ${MINIMO_CARACTERES_PASSWORD} caracteres`}
                    className="w-full min-h-11 pl-9 pr-12 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword((actual) => !actual)}
                    aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={mostrarPassword}
                    aria-controls="restablecer-password restablecer-confirmacion"
                    className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {mostrarPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground" htmlFor="restablecer-confirmacion">
                  Confirma tu nueva contraseña
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-muted-foreground absolute left-3 top-3.5" />
                  <input
                    id="restablecer-confirmacion"
                    name="confirmacion"
                    type={tipoCampo}
                    autoComplete="new-password"
                    required
                    minLength={MINIMO_CARACTERES_PASSWORD}
                    maxLength={MAXIMO_CARACTERES_PASSWORD}
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                    placeholder="Repite tu contraseña"
                    className="w-full min-h-11 pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Usa al menos {MINIMO_CARACTERES_PASSWORD} caracteres. Este enlace se usa una sola vez
                y vence en {VIGENCIA_RECUPERACION_TEXTO}.
              </p>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Guardando...' : 'Guardar nueva contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
