import { Rol, type TipoDocumento } from '@guachafit/shared';
import {
  TEXTO_IDENTIDAD_SOLO_LECTURA,
  camposEditablesPerfil,
  type CampoPerfil,
  type ErroresPerfil,
  type FormularioPerfil,
} from '../../lib/mi-perfil';
import { formatFechaLargaCalendario } from '../../lib/date-format';
import { formatearDocumento } from '../../lib/etiquetas-dominio';
import { AvisosAjustes, BotonAjustes, CampoAjustes } from './CampoAjustes';

const CONFIG_CAMPO: Record<
  CampoPerfil,
  { id: string; etiqueta: string; type?: 'tel'; autoComplete: string }
> = {
  nombres: { id: 'perfil-nombres', etiqueta: 'Nombres', autoComplete: 'given-name' },
  apellidos: { id: 'perfil-apellidos', etiqueta: 'Apellidos', autoComplete: 'family-name' },
  telefono: { id: 'perfil-telefono', etiqueta: 'Teléfono', type: 'tel', autoComplete: 'tel' },
  nombreComercial: {
    id: 'perfil-nombre-comercial',
    etiqueta: 'Nombre comercial (opcional)',
    autoComplete: 'organization',
  },
};

export interface IdentidadAlumno {
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  fechaNacimiento: string;
}

/**
 * RF-018 pestaña "Perfil": datos que el rol puede editar y, el alumno, su documento y fecha de
 * nacimiento solo de lectura (RN-01). Presentacional: el estado y el guardado viven en la página.
 */
export function FormularioDatosPerfil({
  rol,
  valores,
  errores,
  identidad,
  onCambiar,
  onGuardar,
  guardando = false,
  error = null,
  exito = null,
}: {
  rol: Rol | string;
  valores: FormularioPerfil;
  errores: ErroresPerfil;
  identidad?: IdentidadAlumno | null;
  onCambiar: (campo: CampoPerfil, valor: string) => void;
  onGuardar: () => void;
  guardando?: boolean;
  error?: string | null;
  exito?: string | null;
}) {
  const campos = camposEditablesPerfil(rol);

  if (campos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tu cuenta de administrador no tiene datos de perfil.
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {campos.map((campo) => {
          const config = CONFIG_CAMPO[campo];
          return (
            <CampoAjustes
              key={campo}
              id={config.id}
              etiqueta={config.etiqueta}
              type={config.type}
              autoComplete={config.autoComplete}
              inputMode={config.type === 'tel' ? 'tel' : undefined}
              valor={valores[campo]}
              onCambiar={(valor) => onCambiar(campo, valor)}
              error={errores[campo]}
              deshabilitado={guardando}
            />
          );
        })}
      </div>

      {rol === Rol.ALUMNO && identidad && (
        <div className="p-3 rounded-2xl bg-secondary/40 border border-border space-y-1">
          <dl className="grid gap-2 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Documento de identidad</dt>
              <dd className="text-foreground">
                {formatearDocumento(identidad.tipoDocumento, identidad.numeroDocumento) ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">Fecha de nacimiento</dt>
              <dd className="text-foreground">
                {formatFechaLargaCalendario(identidad.fechaNacimiento) ?? identidad.fechaNacimiento}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">{TEXTO_IDENTIDAD_SOLO_LECTURA}</p>
        </div>
      )}

      <AvisosAjustes error={error} exito={exito} />
      <BotonAjustes ocupado={guardando}>Guardar cambios</BotonAjustes>
    </form>
  );
}
