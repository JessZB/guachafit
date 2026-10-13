/**
 * Módulo `alumnos` (fase B, prompt 53) · tabla densa del directorio.
 *
 * Extraída de `pages/entrenador/AlumnosPage.tsx:944-1065` (7 columnas).
 * Clasificación: CANDIDATO (hoy único: carcasa de tabla densa en
 * `TablaCartera.tsx:269-297` con contrato distinto —`PerfilAlumnoDetalleDTO` vs
 * `FilaCarteraDTO`—; inventario 42 §3).
 *
 * R5: conserva idénticos los 7 encabezados ("Alumno/Documento/Modalidad/Estado/
 * Semáforo de Pago/Contacto/Acciones"), la navegación por fila, "Contactar por
 * WhatsApp a {nombres}" (`wa.me`), "Ver expediente de {..}", "Restaurar alumno
 * {..}" y el badge "Archivado".
 * §6: acciones de 44px, texto ≥ 12px, peso ≤ 700.
 * Presentacional: solo props, sin `useQuery` ni `api-client` (R1).
 */

import type { MouseEvent } from 'react';
import { ChevronRight, MessageSquare, RefreshCw } from 'lucide-react';
import type { PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import { triggerHaptic } from '../../../lib/haptics';
import { formatearDocumento } from '../../../lib/etiquetas-dominio';
import { AvatarIniciales } from './AvatarIniciales';
import { BadgeEstadoAlumno } from './BadgeEstadoAlumno';
import { SemaforoPagoTexto } from './SemaforoPago';

export interface TablaAlumnosDirectorioProps {
  alumnos: PerfilAlumnoDetalleDTO[];
  onVerExpediente: (id: string) => void;
  onRestaurar: (id: string, e: MouseEvent) => void;
}

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
            <th className="py-3 px-3">Alumno</th>
            <th className="py-3 px-3">Documento</th>
            <th className="py-3 px-3">Modalidad</th>
            <th className="py-3 px-3">Estado</th>
            <th className="py-3 px-3">Semáforo de Pago</th>
            <th className="py-3 px-3">Contacto</th>
            <th className="py-3 px-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {alumnos.map((a) => {
            const isArchived = Boolean(a.deletedAtUtc);

            return (
              <tr
                key={a.id}
                onClick={() => onVerExpediente(a.id)}
                className="hover:bg-secondary/30 transition-colors cursor-pointer group"
              >
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2.5">
                    <AvatarIniciales nombres={a.nombres} apellidos={a.apellidos} variante="tabla" />
                    <div>
                      <p className="font-bold text-foreground group-hover:text-primary transition-colors">
                        {a.nombres} {a.apellidos}
                      </p>
                      <span className="text-xs text-muted-foreground">{a.email}</span>
                    </div>
                  </div>
                </td>

                <td className="py-3 px-3 font-mono">
                  {formatearDocumento(a.tipoDocumento, a.numeroDocumento) ?? '—'} ({a.edadCalculada}
                  a)
                </td>

                <td className="py-3 px-3">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border uppercase">
                    {a.modalidad}
                  </span>
                </td>

                <td className="py-3 px-3">
                  <BadgeEstadoAlumno
                    estadoActivacion={a.estadoActivacion}
                    archivado={isArchived}
                  />
                </td>

                <td className="py-3 px-3 font-mono font-bold">
                  <SemaforoPagoTexto semaforo={a.semaforoPago} />
                </td>

                <td className="py-3 px-3 font-mono text-muted-foreground">{a.telefonoWhatsapp}</td>

                <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <a
                      href={`https://wa.me/${a.telefonoWhatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer"
                      aria-label={`Contactar por WhatsApp a ${a.nombres}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-success" />
                    </a>

                    {isArchived ? (
                      <button
                        type="button"
                        onClick={(e) => onRestaurar(a.id, e)}
                        className="min-h-11 py-1 px-3 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                        aria-label={`Restaurar alumno ${a.nombres} ${a.apellidos}`}
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Restaurar</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          onVerExpediente(a.id);
                        }}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-all cursor-pointer"
                        aria-label={`Ver expediente de ${a.nombres} ${a.apellidos}`}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
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
