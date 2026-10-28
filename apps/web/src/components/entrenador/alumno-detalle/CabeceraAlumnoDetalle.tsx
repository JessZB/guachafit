/**
 * Cabecera fija "Identidad 360" de la ficha del alumno (organismo ÚNICO).
 *
 * Presentacional: recibe el perfil y callbacks, no llama a `api-client` ni a `useQuery` (R1).
 * Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-2). El `DialogoConfirmacion`
 * compartido de la ficha vive en el contenedor (sirve también a quitar plan/tarifa especial).
 *
 * L7: WhatsApp queda visible; Pausar/Reactivar, Suspender por pago y Archivar viven en el menú
 * "Más acciones" (`MenuAccionesAlumno`). La salud se muestra como chip que despliega el texto
 * completo (`ChipSaludAlumno`). La franja de datos clave va en la página, bajo esta cabecera.
 *
 * §6: táctil `min-h-11`, 11px mínimo, tokens con variante oscura, pesos ≤ 700, estados honestos
 * (`role="alert"` en el error, `role="status"` en el éxito).
 */
import { EstadoAlumno, type PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import type { SemaforoPago } from '../../../lib/etiquetas-dominio';
import { BadgeEstadoPagoAlumno } from './BadgeEstadoPagoAlumno';
import { BadgeEstadoActivacionAlumno } from './BadgeEstadoActivacionAlumno';
import { BotonWhatsapp } from './BotonWhatsapp';
import { MenuAccionesAlumno } from './MenuAccionesAlumno';
import { ChipSaludAlumno } from './ChipSaludAlumno';
import { etiquetaModalidad, formatearDocumento } from '../../../lib/etiquetas-dominio';
import {
  AlertCircle,
  CheckCircle2,
  Mail,
  Phone,
  RefreshCw,
  User,
} from 'lucide-react';

interface CabeceraAlumnoDetalleProps {
  alumno: PerfilAlumnoDetalleDTO;
  semaforo: SemaforoPago | null;
  archivado: boolean;
  errorAccion: string | null;
  exitoAccion: string | null;
  onCambiarEstado: (nuevoEstado: EstadoAlumno) => void;
  onArchivar: () => void;
  onRestaurar: () => void;
  onVerFichaCompleta: () => void;
}

export function CabeceraAlumnoDetalle({
  alumno,
  semaforo,
  archivado,
  errorAccion,
  exitoAccion,
  onCambiarEstado,
  onArchivar,
  onRestaurar,
  onVerFichaCompleta,
}: CabeceraAlumnoDetalleProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        {/* Avatar e Identidad */}
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-secondary/80 border-2 border-primary/30 flex items-center justify-center text-primary font-bold text-xl shadow-xs shrink-0">
            {alumno.nombres[0]}
            {alumno.apellidos[0]}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {alumno.nombres} {alumno.apellidos}
              </h1>
              {/* Semáforo de Pago */}
              <BadgeEstadoPagoAlumno semaforo={semaforo} />

              {/* Badge Estado de Activación */}
              <BadgeEstadoActivacionAlumno
                estadoActivacion={alumno.estadoActivacion}
                archivado={archivado}
              />

              {/* Badge Modalidad */}
              <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-secondary/80 text-foreground border border-border/70 flex items-center gap-1.5 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-foreground/50" />
                {etiquetaModalidad(alumno.modalidad)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-mono">
                <User className="h-3.5 w-3.5 text-primary" />
                {formatearDocumento(alumno.tipoDocumento, alumno.numeroDocumento) ?? '—'} •{' '}
                {alumno.edadCalculada} años
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5 text-primary" />
                {alumno.email || 'Sin correo'}
              </span>
              <span className="flex items-center gap-1 font-mono">
                <Phone className="h-3.5 w-3.5 text-primary" />
                {alumno.telefonoWhatsapp}
              </span>
            </div>

            {/* Salud y limitaciones: chip que despliega la ficha completa */}
            <ChipSaludAlumno
              key={alumno.id}
              fichaSaludPrivada={alumno.fichaSaludPrivada}
              onVerFichaCompleta={onVerFichaCompleta}
            />
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          {/* WhatsApp 1-Tap */}
          <BotonWhatsapp telefono={alumno.telefonoWhatsapp} nombres={alumno.nombres} />

          {/* Ciclo de Vida RF-012: Pausar / Reactivar / Suspender por pago / Archivar en el menú */}
          {!archivado && (
            <MenuAccionesAlumno
              estado={alumno.estadoActivacion}
              onCambiarEstado={onCambiarEstado}
              onArchivar={onArchivar}
            />
          )}

          {/* Si está archivado: Restaurar */}
          {archivado && (
            <button
              onClick={onRestaurar}
              className="min-h-11 py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Restaurar Alumno</span>
            </button>
          )}
        </div>
      </div>

      {/* D5: errores de acciones del ciclo de vida (pausar/reactivar/archivar/restaurar) */}
      {errorAccion && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorAccion}</span>
        </div>
      )}

      {/* WU-D: confirmación honesta del cambio de estado (solo tras 2xx o cambio demo local) */}
      {exitoAccion && (
        <div
          role="status"
          className="p-3 rounded-2xl bg-success/10 border border-success/30 text-success text-xs flex items-center gap-2"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{exitoAccion}</span>
        </div>
      )}
    </div>
  );
}
