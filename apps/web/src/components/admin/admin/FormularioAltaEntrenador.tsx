/**
 * RF-010 Escenario 1 (WU Admin): formulario de alta de entrenadores.
 *
 * Componente presentacional puro (sin datos): los 6 campos con validación nativa y el envío con
 * estado de progreso. Recibe el formulario, el flag de envío y los callbacks. Recorte verbatim
 * de `AdminPage`.
 */
import React from 'react';
import { Lock } from 'lucide-react';
import type { FormularioAltaEntrenador } from '../../../lib/admin-alta-payload';

export interface FormularioAltaEntrenadorProps {
  formulario: FormularioAltaEntrenador;
  enviando: boolean;
  onCambiarCampo: (
    campo: keyof FormularioAltaEntrenador
  ) => (evento: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (evento: React.FormEvent) => void;
}

export function FormularioAltaEntrenador({
  formulario,
  enviando,
  onCambiarCampo,
  onSubmit,
}: FormularioAltaEntrenadorProps) {
  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          onChange={onCambiarCampo('nombres')}
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
          onChange={onCambiarCampo('apellidos')}
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
          onChange={onCambiarCampo('email')}
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
          onChange={onCambiarCampo('telefonoContacto')}
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
          onChange={onCambiarCampo('coachCode')}
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
          onChange={onCambiarCampo('nombreComercial')}
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
  );
}
