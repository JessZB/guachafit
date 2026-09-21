import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient, ApiError } from '../../lib/api-client';
import {
  MENSAJE_ACTIVACION_INVALIDA,
  MINIMO_CARACTERES_PASSWORD,
  validarPasswordActivacion,
} from '../../lib/onboarding-links';
import { Dumbbell, ArrowLeft, CheckCircle2, KeyRound, Lock, ShieldAlert } from 'lucide-react';

/**
 * WU-E (RF-011 RN-05): pantalla pública de activación de credenciales.
 *
 * Consume `POST /auth/invitacion/establecer-password` con el token de un solo uso (TTL 48h)
 * generado por el alta manual o por cualquier invitación. No requiere sesión: es el segundo paso
 * del flujo "crear alumno → compartir enlace → el alumno crea su contraseña".
 */
export function ActivacionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token')?.trim() ?? '';

  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInvalido, setTokenInvalido] = useState(false);
  const [success, setSuccess] = useState(false);

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
      await apiClient('/auth/invitacion/establecer-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
        skipAuth: true,
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err: any) {
      // 404 = token inexistente/expirado/ya usado; 401 = cuenta dada de baja o bloqueada.
      if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
        setTokenInvalido(true);
        setError(err.message || MENSAJE_ACTIVACION_INVALIDA);
      } else {
        setError(
          err?.message || 'No se pudo crear la contraseña. Revisa tu conexión e inténtalo de nuevo.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const enlaceInvalido = token.length === 0 || tokenInvalido;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <div className="w-full max-w-md space-y-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
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
              <h1 className="font-bold text-lg text-foreground">Crea tu contraseña</h1>
              <p className="text-xs text-muted-foreground">
                Activa tu cuenta de GUACHAFIT para empezar a entrenar.
              </p>
            </div>
          </div>

          {success ? (
            <div className="p-6 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h2 className="font-bold text-base text-foreground">¡Contraseña creada!</h2>
              <p className="text-xs text-muted-foreground">
                Ya puedes iniciar sesión con tu correo y tu nueva contraseña. Redirigiendo...
              </p>
            </div>
          ) : enlaceInvalido ? (
            <div className="p-5 rounded-xl bg-destructive/10 border border-destructive/30 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <span>Enlace no válido</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {error || MENSAJE_ACTIVACION_INVALIDA}
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Volver al inicio de sesión</span>
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
                <label className="text-xs font-semibold text-foreground" htmlFor="password">
                  Nueva contraseña
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={MINIMO_CARACTERES_PASSWORD}
                    maxLength={100}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Mínimo ${MINIMO_CARACTERES_PASSWORD} caracteres`}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground" htmlFor="confirmacion">
                  Confirma tu contraseña
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
                  <input
                    id="confirmacion"
                    type="password"
                    required
                    minLength={MINIMO_CARACTERES_PASSWORD}
                    maxLength={100}
                    value={confirmacion}
                    onChange={(e) => setConfirmacion(e.target.value)}
                    placeholder="Repite tu contraseña"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Usa al menos {MINIMO_CARACTERES_PASSWORD} caracteres. Este enlace es de un solo uso
                y caduca a las 48 horas.
              </p>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Creando contraseña...' : 'Crear contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
