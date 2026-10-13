/**
 * Cabecera fija "Identidad 360" de la ficha del alumno (organismo ÚNICO).
 *
 * Presentacional: recibe el perfil y callbacks, no llama a `api-client` ni a `useQuery` (R1).
 * Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-2). El `DialogoConfirmacion`
 * compartido de la ficha vive en el contenedor (sirve también a quitar plan/override).
 *
 * §6: táctil `min-h-11`, 11px mínimo, tokens con variante oscura, pesos ≤ 700, estados honestos
 * (`role="alert"` en el error, `role="status"` en el éxito).
 */
import { EstadoAlumno, type PerfilAlumnoDetalleDTO } from '@guachafit/shared';
import type { SemaforoPago } from '../../../lib/etiquetas-dominio';
import { BadgeEstadoPagoAlumno } from './BadgeEstadoPagoAlumno';
import { BadgeEstadoActivacionAlumno } from './BadgeEstadoActivacionAlumno';
import { BotonWhatsapp } from './BotonWhatsapp';
import { formatearDocumento } from '../../../lib/etiquetas-dominio';
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Lock,
  Mail,
  PauseCircle,
  Phone,
  PlayCircle,
  RefreshCw,
  Trash2,
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
                {alumno.modalidad}
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
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          {/* WhatsApp 1-Tap */}
          <BotonWhatsapp telefono={alumno.telefonoWhatsapp} nombres={alumno.nombres} />

          {/* Ciclo de Vida RF-012: Pausar / Suspender por pago / Reactivar */}
          {!archivado && (
            <>
              {alumno.estadoActivacion === EstadoAlumno.ACTIVO ? (
                <button
                  onClick={() => onCambiarEstado(EstadoAlumno.INACTIVO_PAUSADO)}
                  className="min-h-11 py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  title="Pausar alumno temporalmente por viaje o lesión"
                >
                  <PauseCircle className="h-4 w-4 text-warning" />
                  <span>Pausar</span>
                </button>
              ) : (
                <button
                  onClick={() => onCambiarEstado(EstadoAlumno.ACTIVO)}
                  className="min-h-11 py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  title="Reactivar alumno"
                >
                  <PlayCircle className="h-4 w-4 text-success" />
                  <span>Reactivar</span>
                </button>
              )}

              {alumno.estadoActivacion !== EstadoAlumno.SUSPENDIDO_PAGO && (
                <button
                  onClick={() => onCambiarEstado(EstadoAlumno.SUSPENDIDO_PAGO)}
                  className="min-h-11 py-2 px-3 rounded-xl bg-warning/10 hover:bg-warning/20 text-warning font-semibold text-xs border border-warning/25 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  title="Suspender la planificación por mensualidad pendiente"
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Suspender por pago</span>
                </button>
              )}

              {/* Archivar (los datos se conservan) */}
              <button
                onClick={onArchivar}
                className="min-h-11 py-2 px-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold text-xs border border-destructive/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Archivar alumno (sus datos se conservan)"
              >
                <Trash2 className="h-4 w-4" />
                <span>Archivar</span>
              </button>
            </>
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

      {/* ALERTA: Ficha médica confidencial resumen en cabecera si existe */}
      {alumno.fichaSaludPrivada && (
        <div className="p-3 rounded-2xl bg-warning/10 border border-warning/20 text-xs flex items-center justify-between gap-3 text-warning">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-warning shrink-0" />
            <span className="font-semibold text-foreground">Alerta Médica:</span>
            <span className="truncate">{alumno.fichaSaludPrivada}</span>
          </div>
          <button
            onClick={onVerFichaCompleta}
            className="text-[11px] font-bold text-primary underline hover:text-primary/80 cursor-pointer"
          >
            Ver Ficha Completa
          </button>
        </div>
      )}
    </div>
  );
}
