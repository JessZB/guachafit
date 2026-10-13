/**
 * Formulario de datos personales y deportivos del alumno (organismo ÚNICO).
 *
 * Presentacional: valores y setters por props, sin `api-client` ni `useQuery` (R1).
 * Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-3). Conserva idénticos los
 * labels que consultan los specs (`Teléfono / WhatsApp`, `Guardar Cambios` vive en el pie
 * del contenedor de pestaña).
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { Modalidad, TipoDocumento } from '@guachafit/shared';
import { User } from 'lucide-react';
import { calcularEdadAlumno } from '../../../lib/alumno-detalle-metricas';

export interface FormularioDatosAlumnoProps {
  nombres: string;
  apellidos: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaNacimiento: string;
  telefonoWhatsapp: string;
  modalidad: Modalidad;
  setNombres: (valor: string) => void;
  setApellidos: (valor: string) => void;
  setTipoDocumento: (valor: TipoDocumento) => void;
  setNumeroDocumento: (valor: string) => void;
  setFechaNacimiento: (valor: string) => void;
  setTelefonoWhatsapp: (valor: string) => void;
  setModalidad: (valor: Modalidad) => void;
}

export function FormularioDatosAlumno({
  nombres,
  apellidos,
  tipoDocumento,
  numeroDocumento,
  fechaNacimiento,
  telefonoWhatsapp,
  modalidad,
  setNombres,
  setApellidos,
  setTipoDocumento,
  setNumeroDocumento,
  setFechaNacimiento,
  setTelefonoWhatsapp,
  setModalidad,
}: FormularioDatosAlumnoProps) {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-center gap-2 border-b border-border/80 pb-3">
        <User className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm text-foreground">Ficha Deportiva & Personal</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Nombres</label>
          <input
            type="text"
            required
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Apellidos</label>
          <input
            type="text"
            required
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1 col-span-1">
          <label className="text-xs font-semibold text-muted-foreground">Tipo Doc</label>
          <select
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          >
            <option value={TipoDocumento.V}>V-</option>
            <option value={TipoDocumento.E}>E-</option>
            <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
          </select>
        </div>
        <div className="space-y-1 col-span-2">
          <label className="text-xs font-semibold text-muted-foreground">Número de Documento</label>
          <input
            type="text"
            required
            value={numeroDocumento}
            onChange={(e) => setNumeroDocumento(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground">Fecha Nacimiento</label>
            <span className="text-[11px] font-mono font-bold text-primary">
              {calcularEdadAlumno(fechaNacimiento)} años
            </span>
          </div>
          <input
            type="date"
            required
            value={fechaNacimiento}
            onChange={(e) => setFechaNacimiento(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Modalidad</label>
          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as Modalidad)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
          >
            <option value={Modalidad.PRESENCIAL}>Presencial en Sala</option>
            <option value={Modalidad.REMOTO}>Online / Asesoría Remota</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">Teléfono / WhatsApp</label>
        <input
          type="tel"
          inputMode="tel"
          required
          value={telefonoWhatsapp}
          onChange={(e) => setTelefonoWhatsapp(e.target.value)}
          placeholder="+584121234567"
          className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
        />
      </div>
    </div>
  );
}
