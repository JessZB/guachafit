import React, { useState } from 'react';
import { EntrenadorCreadoDTO } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import { ApiError, apiClient } from '../../lib/api-client';
import { construirLinkActivacion, normalizarCoachCode } from '../../lib/onboarding-links';
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
 * RF-010 RN-01: el superadmin solo administra la plataforma. Hoy la única capacidad real es el
 * alta de entrenadores (Escenario 1); el resto se declara "en construcción" para no fabricar
 * pantallas ni datos que aún no existen.
 */
const CAPACIDADES_PENDIENTES = [
  'Deshabilitar y reactivar entrenadores',
  'Gestión de licencias y planes de la plataforma',
  'Invalidación de sesiones al desactivar una cuenta (caso borde del RF-010)',
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

export function AdminPage() {
  const { logout } = useAuth();
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<EntrenadorCreadoDTO | null>(null);
  const [copiado, setCopiado] = useState(false);

  const actualizarCampo =
    (campo: keyof typeof FORMULARIO_INICIAL) => (evento: React.ChangeEvent<HTMLInputElement>) => {
      setFormulario((actual) => ({ ...actual, [campo]: evento.target.value }));
    };

  const handleSubmit = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setError(null);
    setCreado(null);
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
    } catch (err) {
      // Mensaje honesto: el detalle real de la API (correo duplicado, código en uso o formato).
      setError(
        err instanceof ApiError
          ? err.problem.detail || err.message
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
    try {
      await navigator.clipboard.writeText(enlaceActivacion);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

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
            Crea la cuenta de un entrenador y comparte su enlace de activación.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 text-xs font-semibold transition-colors cursor-pointer"
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Cerrar sesión</span>
        </button>
      </div>

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
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
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
                  <code className="flex-1 text-[11px] font-mono break-all px-2.5 py-2 rounded-lg bg-background border border-border text-foreground">
                    {enlaceActivacion}
                  </code>
                  <button
                    type="button"
                    onClick={copiarEnlace}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
                  >
                    {copiado ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                    <span>{copiado ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="admin-telefono" className="text-xs font-semibold text-foreground">
              Teléfono de contacto
            </label>
            <input
              id="admin-telefono"
              required
              minLength={8}
              maxLength={30}
              value={formulario.telefonoContacto}
              onChange={actualizarCampo('telefonoContacto')}
              placeholder="+58 412 000 0000"
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm font-mono focus:outline-hidden focus:border-primary transition-colors"
            />
            <p className="text-[11px] text-muted-foreground">
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
              className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
            />
          </div>

          <div className="sm:col-span-2 flex items-center justify-between gap-3 pt-1">
            <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              La contraseña se define con el enlace de activación.
            </span>
            <button
              type="submit"
              disabled={enviando}
              className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all cursor-pointer disabled:opacity-50"
            >
              {enviando ? 'Creando cuenta...' : 'Crear entrenador'}
            </button>
          </div>
        </form>
      </section>

      {/* Capacidades administrativas pendientes (Ola 3) — copy honesto, sin datos inventados */}
      <section className="p-5 rounded-2xl bg-card/60 border border-border/70 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-400" />
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
    </div>
  );
}
