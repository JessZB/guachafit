/**
 * Módulo `alumnos` (fase B, prompt 53) · tarjeta de alumno del directorio "Mis alumnos".
 *
 * Mis alumnos (2026-10-19): muestra estado de activación con texto, modalidad con etiqueta de
 * dominio, plan, último entreno (con alerta a partir de 7 días), racha y semáforo de pago.
 *
 * - R5: el nombre es el control principal, un `<button>` con `aria-label="Ver expediente de {..}"`
 *   cuyo enlace extendido (`after:`) cubre la tarjeta entera. WhatsApp ("Enviar mensaje de WhatsApp a
 *   {nombres}") y "Restaurar alumno {..}" van encima (`z-10`) y ejecutan solo su acción (PATCH +
 *   recarga, sin navegar).
 * - Teclado: Tab llega al nombre y Enter/Espacio abren el expediente de forma nativa; Enter sobre
 *   WhatsApp o Restaurar no navega (corrige D8 sin filtrar eventos).
 * - Alerta: el color se acompaña de un icono con `aria-hidden` y del texto (no depende solo del color).
 * §6: acciones de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700, foco visible.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import type { MouseEvent } from 'react';
import { AlertTriangle, ChevronRight, Flame, MessageSquare, RefreshCw } from 'lucide-react';
import type { AlumnoDirectorioItemDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { etiquetaModalidad } from '../../../lib/etiquetas-dominio';
import { describirRacha, describirUltimoEntreno } from '../../../lib/alumnos-directorio-actividad';
import { AvatarIniciales } from './AvatarIniciales';
import { BadgeEstadoAlumno } from './BadgeEstadoAlumno';
import { PuntoSemaforoPago, SemaforoPagoTexto } from './SemaforoPago';

export interface TarjetaAlumnoDirectorioProps {
  alumno: AlumnoDirectorioItemDTO;
  onVerExpediente: (id: string) => void;
  onRestaurar: (id: string, e: MouseEvent) => void;
}

export function TarjetaAlumnoDirectorio({
  alumno: a,
  onVerExpediente,
  onRestaurar,
}: TarjetaAlumnoDirectorioProps) {
  const isArchived = Boolean(a.deletedAtUtc);
  const ultimoEntreno = describirUltimoEntreno(a.ultimaSesionFecha, new Date());
  const racha = describirRacha(a.rachaDias);

  return (
    <article className="relative p-4 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3 hover:border-primary/50 hover:shadow-md transition-all duration-200 group flex flex-col justify-between">
      {/* Identidad: avatar con punto de pago, nombre, estado y modalidad */}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <AvatarIniciales nombres={a.nombres} apellidos={a.apellidos} variante="tarjeta" />
          <PuntoSemaforoPago semaforo={a.semaforoPago} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm text-foreground">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onVerExpediente(a.id);
              }}
              aria-label={`Ver expediente de ${a.nombres} ${a.apellidos}`}
              className="block w-full truncate text-left rounded-md cursor-pointer group-hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary after:absolute after:inset-0 after:rounded-3xl after:content-['']"
            >
              {a.nombres} {a.apellidos}
            </button>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <BadgeEstadoAlumno estadoActivacion={a.estadoActivacion} archivado={isArchived} />
            <span className="text-xs text-muted-foreground">{etiquetaModalidad(a.modalidad)}</span>
          </div>
        </div>
      </div>

      {/* Plan, último entreno y racha */}
      <div className="space-y-1 border-t border-border/40 pt-2 text-xs text-muted-foreground">
        {/* D6: sin plan real se muestra "Sin plan asignado"; nunca un nombre inventado. */}
        {a.planActivoNombre ? (
          <p className="truncate">{a.planActivoNombre}</p>
        ) : (
          <p className="truncate italic">Sin plan asignado</p>
        )}

        <p className={`flex items-center gap-1.5 ${ultimoEntreno.alerta ? 'font-bold text-warning' : ''}`}>
          {ultimoEntreno.alerta && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span>{ultimoEntreno.texto}</span>
        </p>

        {racha && (
          <p className="flex items-center gap-1.5 text-foreground">
            <Flame className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span>{racha}</span>
          </p>
        )}
      </div>

      {/* Pago y acciones: el contenedor va encima del enlace extendido del nombre */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <SemaforoPagoTexto semaforo={a.semaforoPago} />

        <div className="relative z-10 flex items-center gap-2">
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
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </a>

          {isArchived ? (
            <button
              type="button"
              onClick={(e) => onRestaurar(a.id, e)}
              className="min-h-11 py-1 px-3 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
              title="Restaurar alumno archivado"
              aria-label={`Restaurar alumno ${a.nombres} ${a.apellidos}`}
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span>Restaurar</span>
            </button>
          ) : (
            <div
              className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground border border-border/60 group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground transition-all group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              <ChevronRight className="h-3.5 w-3.5 transition-colors" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
