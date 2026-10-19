/**
 * Módulo `alumnos` (fase B, prompt 53) · tabla del directorio "Mis alumnos".
 *
 * Mis alumnos (2026-10-19): columnas Alumno, Estado, Modalidad, Plan, Último entreno, Racha, Pago y
 * Acciones. Documento y Contacto salen de la tabla; el teléfono se alcanza por la acción de WhatsApp.
 *
 * - Teclado (D9): el nombre es un botón enfocable; Enter (y el clic) lleva al expediente. Ya no hay
 *   clic de fila: la navegación vive en controles con nombre accesible.
 * - R5: "Contactar por WhatsApp a {nombres}", "Ver expediente de {..}", "Restaurar alumno {..}" y el
 *   badge "Archivado" se conservan.
 * §6: acciones de 44px (`min-h-11`), texto ≥ 12px, peso ≤ 700, foco visible.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import type { MouseEvent } from 'react';
import { AlertTriangle, ChevronRight, MessageSquare, RefreshCw } from 'lucide-react';
import type { AlumnoDirectorioItemDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { etiquetaModalidad } from '../../../lib/etiquetas-dominio';
import { describirRacha, describirUltimoEntreno } from '../../../lib/alumnos-directorio-actividad';
import { AvatarIniciales } from './AvatarIniciales';
import { BadgeEstadoAlumno } from './BadgeEstadoAlumno';
import { SemaforoPagoTexto } from './SemaforoPago';

export interface TablaAlumnosDirectorioProps {
  alumnos: AlumnoDirectorioItemDTO[];
  onVerExpediente: (id: string) => void;
  onRestaurar: (id: string, e: MouseEvent) => void;
}

const ENCABEZADOS = [
  'Alumno',
  'Estado',
  'Modalidad',
  'Plan',
  'Último entreno',
  'Racha',
  'Pago',
  'Acciones',
] as const;

export function TablaAlumnosDirectorio({
  alumnos,
  onVerExpediente,
  onRestaurar,
}: TablaAlumnosDirectorioProps) {
  return (
    <div className="p-4 rounded-3xl bg-card border border-border shadow-xs overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead className="border-b border-border/80 text-muted-foreground uppercase text-xs">
          <tr>
            {ENCABEZADOS.map((encabezado) => (
              <th
                key={encabezado}
                className={`py-3 px-3 ${encabezado === 'Acciones' ? 'text-right' : ''}`}
              >
                {encabezado}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {alumnos.map((a) => {
            const isArchived = Boolean(a.deletedAtUtc);
            const ultimoEntreno = describirUltimoEntreno(a.ultimaSesionFecha, new Date());
            const racha = describirRacha(a.rachaDias);

            return (
              <tr key={a.id} className="hover:bg-secondary/30 transition-colors group">
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2.5">
                    <AvatarIniciales nombres={a.nombres} apellidos={a.apellidos} variante="tabla" />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onVerExpediente(a.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          triggerHaptic('light');
                          onVerExpediente(a.id);
                        }}
                        className="min-h-11 text-left font-bold text-foreground group-hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-primary rounded-md"
                      >
                        {a.nombres} {a.apellidos}
                      </button>
                      <span className="block text-xs text-muted-foreground">{a.email}</span>
                    </div>
                  </div>
                </td>

                <td className="py-3 px-3">
                  <BadgeEstadoAlumno estadoActivacion={a.estadoActivacion} archivado={isArchived} />
                </td>

                <td className="py-3 px-3 text-muted-foreground">{etiquetaModalidad(a.modalidad)}</td>

                <td className="py-3 px-3">
                  {/* D6: sin plan real se muestra "Sin plan asignado"; nunca un nombre inventado. */}
                  {a.planActivoNombre ? (
                    <span>{a.planActivoNombre}</span>
                  ) : (
                    <span className="italic text-muted-foreground">Sin plan asignado</span>
                  )}
                </td>

                <td className="py-3 px-3">
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      ultimoEntreno.alerta ? 'font-bold text-warning' : 'text-muted-foreground'
                    }`}
                  >
                    {ultimoEntreno.alerta && (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span>{ultimoEntreno.texto}</span>
                  </span>
                </td>

                <td className="py-3 px-3 text-foreground">{racha ?? '—'}</td>

                <td className="py-3 px-3">
                  <SemaforoPagoTexto semaforo={a.semaforoPago} />
                </td>

                <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <a
                      href={`https://wa.me/${a.telefonoWhatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                      aria-label={`Contactar por WhatsApp a ${a.nombres}`}
                    >
                      <MessageSquare className="h-4 w-4 text-success" aria-hidden="true" />
                    </a>

                    {isArchived ? (
                      <button
                        type="button"
                        onClick={(e) => onRestaurar(a.id, e)}
                        className="min-h-11 py-1 px-3 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={`Restaurar alumno ${a.nombres} ${a.apellidos}`}
                      >
                        <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        <span>Restaurar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onVerExpediente(a.id);
                        }}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={`Ver expediente de ${a.nombres} ${a.apellidos}`}
                      >
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
