/**
 * Tarjeta de un control pendiente: nombre del alumno como título, fecha y badge; tiles de
 * medidas, modelo ampliado, fotos y acciones (rechazar / aprobar).
 *
 * Móvil (SEG-21, SEG-22, SEG-24): la cabecera envuelve y el nombre puede ocupar dos líneas; el
 * aviso de fotos protegidas va en su propia línea y los botones táctiles (44px) se apilan con
 * "Aprobar" arriba. Recorte verbatim: componente presentacional, recibe el control y callbacks.
 */
import type { ControlAntropometricoDetalleDTO } from "@guachafit/shared";
import { etiquetaAlumnoPendiente } from "../../../lib/antropometria-filtros";
import { formatFechaCalendario } from "../../../lib/date-format";
import { pluralizar } from "../../../lib/pluralizar";
import { ShieldCheck } from "lucide-react";
import { BadgeEstado } from "../../ui/BadgeEstado";
import { BotonTactil } from "../../ui/BotonTactil";
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/50 pb-3">
        <h3 className="min-w-0 max-w-full font-bold text-base text-foreground line-clamp-2 break-words">
          {etiquetaAlumnoPendiente(control)}
        </h3>
        <p className="text-xs font-semibold text-muted-foreground">
          Fecha de Toma:{" "}
          {formatFechaCalendario(control.fechaEvaluacion) ??
            control.fechaEvaluacion}
        </p>
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <BadgeEstado tono="warning">Pendiente Aprobación</BadgeEstado>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-2xl bg-secondary/30">
          <span className="text-[11px] text-muted-foreground uppercase font-semibold">
            Peso
          </span>
          <p className="font-mono font-bold text-base text-foreground">
            {control.pesoKg ? `${control.pesoKg} kg` : "—"}
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

      {/* Aviso de privacidad en su propia línea, fuera del bloque de acciones. */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span>
          Fotos protegidas: se muestran con un enlace temporal seguro.
        </span>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <BotonTactil
          variante="peligro-contorno"
          className="w-full sm:w-auto"
          onClick={() => onRechazar(control)}
        >
          Rechazar
        </BotonTactil>
        <BotonTactil
          variante="primaria"
          className="w-full sm:w-auto"
          onClick={() => onAprobar(control.id)}
        >
          Aprobar y Consolidar
        </BotonTactil>
      </div>
    </div>
  );
}
