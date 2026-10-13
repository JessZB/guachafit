/**
 * Tarjeta de un control pendiente: fecha/badge/alumno, tiles de medidas, modelo
 * ampliado, fotos y acciones (rechazar / aprobar).
 *
 * Recorte verbatim: componente presentacional, recibe el control y callbacks.
 */
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";
import { etiquetaAlumnoPendiente } from "../../../lib/antropometria-filtros";
import { formatFechaCalendario } from "../../../lib/date-format";
import { pluralizar } from "../../../lib/pluralizar";
import { ShieldCheck } from "lucide-react";
import { FotosTomaAntropometria } from "./FotosTomaAntropometria";
import { ModeloAmpliadoAntropometria } from "./ModeloAmpliadoAntropometria";

interface TarjetaControlPendienteProps {
  control: ControlAntropometricoDetalleDTO;
  fotosConError: string[];
  onFotoError: (fotoId: string) => void;
  onVerFoto: (
    foto: ControlAntropometricoDetalleDTO["fotos"][number],
    fecha: string,
  ) => void;
  onRechazar: (control: ControlAntropometricoDetalleDTO) => void;
  onAprobar: (id: string) => void;
}

export function TarjetaControlPendiente({
  control,
  fotosConError,
  onFotoError,
  onVerFoto,
  onRechazar,
  onAprobar,
}: TarjetaControlPendienteProps) {
  return (
    <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base text-foreground">
            Fecha de Toma:{" "}
            {formatFechaCalendario(control.fechaEvaluacion) ??
              control.fechaEvaluacion}
          </span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning border border-warning/20 uppercase">
            Pendiente Aprobación
          </span>
        </div>
        <span className="text-xs font-bold text-foreground">
          {etiquetaAlumnoPendiente(control)}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-2xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            Peso
          </span>
          <p className="font-mono font-bold text-base text-foreground">
            {control.pesoKg} kg
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            % Grasa
          </span>
          <p className="font-mono font-bold text-base text-foreground">
            {control.porcentajeGrasa ? `${control.porcentajeGrasa}%` : "—"}
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            Cintura
          </span>
          <p className="font-mono font-bold text-base text-foreground">
            {control.perimetros?.cinturaCm
              ? `${control.perimetros.cinturaCm} cm`
              : "—"}
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            Fotos Adjuntas
          </span>
          <p className="font-mono font-bold text-base text-foreground">
            {pluralizar(control.fotos.length, "foto", "fotos")}
          </p>
        </div>
      </div>

      {/* RN-02 (WU RF-003b): modelo ampliado para auditar antes de aprobar. */}
      <ModeloAmpliadoAntropometria control={control} />

      {/* RN-04: fotos del control pendiente para poder auditarlas (visor accesible). */}
      <FotosTomaAntropometria
        control={control}
        fotosConError={fotosConError}
        onFotoError={onFotoError}
        onVerFoto={onVerFoto}
      />

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>
            Fotos protegidas: se muestran con un enlace temporal seguro.
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onRechazar(control);
            }}
            className="py-2 px-4 rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 font-bold text-xs transition-colors"
          >
            Rechazar
          </button>
          <button
            onClick={() => onAprobar(control.id)}
            className="py-2 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md hover:brightness-110 active:scale-95 transition-all"
          >
            Aprobar y Consolidar
          </button>
        </div>
      </div>
    </div>
  );
}
