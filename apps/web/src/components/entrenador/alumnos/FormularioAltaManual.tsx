/**
 * Módulo `alumnos` (fase B, prompt 53) · formulario de alta manual en sala.
 *
 * Extraído de `pages/entrenador/AlumnosPage.tsx:1154-1299` (incluye `CampoWhatsapp`
 * y validaciones). Clasificación: ÚNICO (formulario completo solo de esta vista;
 * inventario 42 §3; el que más se acerca al tope R2 con ~150 líneas).
 *
 * R5: conserva idénticos labels/ids (`alta-nombres`, `alta-apellidos`, `alta-email`,
 * `alta-tipo-documento`, `alta-documento`, `alta-nacimiento`, `alta-modalidad`,
 * `alta-whatsapp-*`, `alta-ficha-salud`), el error en `role="alert"` y
 * "Inscribir Alumno"/"Inscribiendo alumno...". Reutiliza `CampoWhatsapp` existente
 * (solo importado, no editado).
 * §6: campos y submit de 44px, texto ≥ 12px.
 * Presentacional: valores + callbacks, sin `useQuery` ni `api-client` (R1).
 */

import type { FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modalidad, TipoDocumento } from '@guachafit/shared';
import { CampoWhatsapp } from '../../common/CampoWhatsapp';
import { fechaLocalHoyISO, textoEdad } from '../../../lib/formulario-registro';

export interface FormularioAltaManualProps {
  nombres: string;
  apellidos: string;
  email: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaNacimiento: string;
  prefijoWhatsapp: string;
  numeroWhatsapp: string;
  modalidad: Modalidad;
  fichaSaludPrivada: string;
  isSubmitting: boolean;
  formError: string | null;
  onCambiarNombres: (v: string) => void;
  onCambiarApellidos: (v: string) => void;
  onCambiarEmail: (v: string) => void;
  onCambiarTipoDocumento: (v: TipoDocumento) => void;
  onCambiarNumeroDocumento: (v: string) => void;
  onCambiarFechaNacimiento: (v: string) => void;
  onCambiarPrefijoWhatsapp: (v: string) => void;
  onCambiarNumeroWhatsapp: (v: string) => void;
  onCambiarModalidad: (v: Modalidad) => void;
  onCambiarFichaSalud: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function FormularioAltaManual(p: FormularioAltaManualProps) {
  return (
    <form onSubmit={p.onSubmit} className="space-y-3">
      {p.formError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{p.formError}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="alta-nombres" className="text-xs font-semibold text-muted-foreground">Nombres</label>
          <input
            id="alta-nombres"
            autoComplete="off"
            type="text"
            required
            value={p.nombres}
            onChange={(e) => p.onCambiarNombres(e.target.value)}
            placeholder="Carlos"
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="alta-apellidos" className="text-xs font-semibold text-muted-foreground">Apellidos</label>
          <input
            id="alta-apellidos"
            autoComplete="off"
            type="text"
            required
            value={p.apellidos}
            onChange={(e) => p.onCambiarApellidos(e.target.value)}
            placeholder="Mendoza"
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="alta-email" className="text-xs font-semibold text-muted-foreground">Correo electrónico</label>
        <input
          id="alta-email"
          autoComplete="off"
          type="email"
          required
          value={p.email}
          onChange={(e) => p.onCambiarEmail(e.target.value)}
          placeholder="carlos@email.com"
          className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1 col-span-1">
          <label htmlFor="alta-tipo-documento" className="text-xs font-semibold text-muted-foreground">Tipo de documento</label>
          <select
            id="alta-tipo-documento"
            value={p.tipoDocumento}
            onChange={(e) => p.onCambiarTipoDocumento(e.target.value as TipoDocumento)}
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          >
            <option value={TipoDocumento.V}>V-</option>
            <option value={TipoDocumento.E}>E-</option>
            <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
          </select>
        </div>
        <div className="space-y-1 col-span-2">
          <label htmlFor="alta-documento" className="text-xs font-semibold text-muted-foreground">Número de documento</label>
          <input
            id="alta-documento"
            autoComplete="off"
            type="text"
            required
            value={p.numeroDocumento}
            onChange={(e) => p.onCambiarNumeroDocumento(e.target.value)}
            placeholder="24123456"
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="alta-nacimiento" className="text-xs font-semibold text-muted-foreground">Fecha de nacimiento</label>
          <input
            id="alta-nacimiento"
            autoComplete="off"
            type="date"
            required
            max={fechaLocalHoyISO()}
            value={p.fechaNacimiento}
            onChange={(e) => p.onCambiarFechaNacimiento(e.target.value)}
            aria-describedby="alta-edad"
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
          <p id="alta-edad" aria-live="polite" className="text-xs font-mono font-bold text-primary min-h-4">
            {textoEdad(p.fechaNacimiento) ?? ''}
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor="alta-modalidad" className="text-xs font-semibold text-muted-foreground">Modalidad</label>
          <select
            id="alta-modalidad"
            value={p.modalidad}
            onChange={(e) => p.onCambiarModalidad(e.target.value as Modalidad)}
            className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          >
            <option value={Modalidad.PRESENCIAL}>Presencial</option>
            <option value={Modalidad.REMOTO}>Remoto</option>
          </select>
        </div>
      </div>

      <CampoWhatsapp
        idBase="alta-whatsapp"
        prefijo={p.prefijoWhatsapp}
        numero={p.numeroWhatsapp}
        onCambiarPrefijo={p.onCambiarPrefijoWhatsapp}
        onCambiarNumero={p.onCambiarNumeroWhatsapp}
        etiquetaClassName="text-xs font-semibold text-muted-foreground"
        ayuda="Número sin el código de país; el prefijo va en la casilla de la izquierda."
      />

      <div className="space-y-1">
        <label htmlFor="alta-ficha-salud" className="text-xs font-semibold text-muted-foreground">
          Ficha médica confidencial (se guarda cifrada)
        </label>
        <textarea
          id="alta-ficha-salud"
          rows={2}
          value={p.fichaSaludPrivada}
          onChange={(e) => p.onCambiarFichaSalud(e.target.value)}
          placeholder="Lesiones previas, dolor articular, recomendaciones..."
          className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={p.isSubmitting}
        className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 mt-2 cursor-pointer"
      >
        {p.isSubmitting ? 'Inscribiendo alumno...' : 'Inscribir Alumno'}
      </button>
    </form>
  );
}
