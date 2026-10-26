/**
 * Formulario de datos personales y deportivos del alumno (organismo ÚNICO).
 *
 * Presentacional: valores y setters por props, sin `api-client` ni `useQuery` (R1).
 * Extraído de `pages/entrenador/AlumnoDetallePage.tsx` (SL-3). Cada control tiene su etiqueta
 * asociada con `useId` (dos formularios montados no repiten `id`). Las opciones de modalidad son
 * `Presencial` y `Remoto`; la edad se muestra debajo de la fecha de nacimiento. Los controles
 * tienen área táctil `min-h-11`; la fila de documento apila en móvil y pasa a tres columnas en `sm`.
 * Teléfono usa teclado telefónico; nombres y apellidos declaran su autocompletado.
 *
 * §6: 11px mínimo, pesos ≤ 700, tokens con variante oscura.
 */
import { useId } from 'react';
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

const CLASE_CAMPO =
  'w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary';

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
  const idBase = useId();
  const id = {
    nombres: `${idBase}-nombres`,
    apellidos: `${idBase}-apellidos`,
    tipoDocumento: `${idBase}-tipo-documento`,
    numeroDocumento: `${idBase}-numero-documento`,
    fechaNacimiento: `${idBase}-fecha-nacimiento`,
    modalidad: `${idBase}-modalidad`,
    telefono: `${idBase}-telefono`,
  };

  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
      <div className="flex items-center gap-2 border-b border-border/80 pb-3">
        <User className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm text-foreground">Ficha Deportiva & Personal</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={id.nombres} className="text-xs font-semibold text-muted-foreground">Nombres</label>
          <input
            id={id.nombres}
            type="text"
            required
            autoComplete="given-name"
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            className={CLASE_CAMPO}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={id.apellidos} className="text-xs font-semibold text-muted-foreground">Apellidos</label>
          <input
            id={id.apellidos}
            type="text"
            required
            autoComplete="family-name"
            value={apellidos}
            onChange={(e) => setApellidos(e.target.value)}
            className={CLASE_CAMPO}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1 sm:col-span-1">
          <label htmlFor={id.tipoDocumento} className="text-xs font-semibold text-muted-foreground">Tipo Doc</label>
          <select
            id={id.tipoDocumento}
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
            className={CLASE_CAMPO}
          >
            <option value={TipoDocumento.V}>V-</option>
            <option value={TipoDocumento.E}>E-</option>
            <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={id.numeroDocumento} className="text-xs font-semibold text-muted-foreground">Número de Documento</label>
          <input
            id={id.numeroDocumento}
            type="text"
            required
            value={numeroDocumento}
            onChange={(e) => setNumeroDocumento(e.target.value)}
            className={CLASE_CAMPO}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor={id.fechaNacimiento} className="text-xs font-semibold text-muted-foreground">Fecha Nacimiento</label>
          <input
            id={id.fechaNacimiento}
            type="date"
            required
            value={fechaNacimiento}
            onChange={(e) => setFechaNacimiento(e.target.value)}
            className={CLASE_CAMPO}
          />
          <p className="text-[11px] font-mono font-bold text-primary">
            {calcularEdadAlumno(fechaNacimiento)} años
          </p>
        </div>
        <div className="space-y-1">
          <label htmlFor={id.modalidad} className="text-xs font-semibold text-muted-foreground">Modalidad</label>
          <select
            id={id.modalidad}
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as Modalidad)}
            className={CLASE_CAMPO}
          >
            <option value={Modalidad.PRESENCIAL}>Presencial</option>
            <option value={Modalidad.REMOTO}>Remoto</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor={id.telefono} className="text-xs font-semibold text-muted-foreground">Teléfono / WhatsApp</label>
        <input
          id={id.telefono}
          type="tel"
          inputMode="tel"
          required
          value={telefonoWhatsapp}
          onChange={(e) => setTelefonoWhatsapp(e.target.value)}
          placeholder="+584121234567"
          className={CLASE_CAMPO}
        />
      </div>
    </div>
  );
}
