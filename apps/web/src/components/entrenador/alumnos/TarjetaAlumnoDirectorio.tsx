/**
 * Módulo `alumnos` (fase B, prompt 53) · tarjeta de alumno del directorio.
 *
 * Extraída de `pages/entrenador/AlumnosPage.tsx:826-942` (vista cards, ~120px).
 * Clasificación: CANDIDATO (hoy único: entidad `alumno` como tarjeta también en
 * `MonitorAdherenciaPage.tsx:751-764` con contenido distinto —adherencia vs
 * directorio—; solo carcasa común; convergencia en D según guía 48 filas 29 y 52).
 *
 * R5: conserva idénticos `role="button"` + `aria-label="Ver expediente de {..}"`,
 * navegación por click y Enter/Espacio, enlace `wa.me` ("Enviar mensaje de WhatsApp
 * a {nombres}"), "Restaurar alumno {..}" (PATCH + recarga, sin navegar) y los
 * textos "Sin plan asignado" / plan real / semáforo. DEFECTO CONOCIDO PRESERVADO
 * (WARNING 42 §5, caracterizado en C19): el `onKeyDown` del contenedor navega con
 * Enter/Espacio aunque el foco esté en una acción interna (diverge del puntero,
 * donde `stopPropagation` sí evita navegar); no se corrige aquí.
 *
 * §6: acciones de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700, foco visible.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import type { MouseEvent } from 'react';
import { ChevronRight, MessageSquare, RefreshCw } from 'lucide-react';
import type { PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { formatearDocumento } from '../../../lib/etiquetas-dominio';
import { AvatarIniciales } from './AvatarIniciales';
import { PuntoSemaforoPago, SemaforoPagoTexto } from './SemaforoPago';

export interface TarjetaAlumnoDirectorioProps {
  alumno: PerfilAlumnoDetalleDTO;
  onVerExpediente: (id: string) => void;
  onRestaurar: (id: string, e: MouseEvent) => void;
}

export function TarjetaAlumnoDirectorio({
  alumno: a,
  onVerExpediente,
  onRestaurar,
}: TarjetaAlumnoDirectorioProps) {
  const isArchived = Boolean(a.deletedAtUtc);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        triggerHaptic('light');
        onVerExpediente(a.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerHaptic('light');
          onVerExpediente(a.id);
        }
      }}
      aria-label={`Ver expediente de ${a.nombres} ${a.apellidos}`}
      className="p-4 rounded-3xl bg-card border border-border/80 shadow-xs space-y-2.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary transition-all duration-200 cursor-pointer group flex flex-col justify-between"
    >
      {/* Top Row: Avatar, Nombre y Semáforo */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative">
            <AvatarIniciales nombres={a.nombres} apellidos={a.apellidos} variante="tarjeta" />
            {/* Punto de Semáforo */}
            <PuntoSemaforoPago semaforo={a.semaforoPago} />
          </div>

          <div className="min-w-0">
            <h3 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {a.nombres} {a.apellidos}
            </h3>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {formatearDocumento(a.tipoDocumento, a.numeroDocumento) ?? '—'} • {a.edadCalculada}a
            </p>
          </div>
        </div>

        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border uppercase shrink-0">
          {a.modalidad}
        </span>
      </div>

      {/* Middle Info: Plan y Estado */}
      <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2 text-muted-foreground">
        {/* D6: sin plan real se muestra "Sin plan asignado"; nunca un nombre inventado. */}
        {a.planActivoNombre ? (
          <span className="truncate">{a.planActivoNombre}</span>
        ) : (
          <span className="truncate italic">Sin plan asignado</span>
        )}
        <SemaforoPagoTexto semaforo={a.semaforoPago} />
      </div>

      {/* Bottom Row: Botón WhatsApp y Acción */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-mono text-muted-foreground truncate">
          {a.telefonoWhatsapp}
        </span>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <a
            href={`https://wa.me/${a.telefonoWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
              `Hola ${a.nombres}, te contacto desde Guachafit.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-success/15 hover:bg-success/30 text-success border border-success/20 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-success"
            title="Enviar mensaje por WhatsApp"
            aria-label={`Enviar mensaje de WhatsApp a ${a.nombres}`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </a>

          {isArchived ? (
            <button
              type="button"
              onClick={(e) => onRestaurar(a.id, e)}
              className="min-h-11 py-1 px-3 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              title="Restaurar alumno archivado"
              aria-label={`Restaurar alumno ${a.nombres} ${a.apellidos}`}
            >
              <RefreshCw className="h-3 w-3" />
              <span>Restaurar</span>
            </button>
          ) : (
            <div
              className="p-1.5 rounded-lg bg-secondary/70 text-muted-foreground border border-border/60 group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground transition-all flex items-center justify-center group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              <ChevronRight className="h-3.5 w-3.5 transition-colors" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
