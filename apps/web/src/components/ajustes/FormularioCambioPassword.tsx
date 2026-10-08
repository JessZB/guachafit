import type { ErroresPassword, FormularioPassword } from '../../lib/mi-perfil';
import { AvisosAjustes, BotonAjustes, CampoAjustes } from './CampoAjustes';

/** RF-018 RN-08: cambio de contraseña con la actual; la nueva se escribe dos veces. */
export function FormularioCambioPassword({
  valores,
  errores,
  onCambiar,
  onGuardar,
  guardando = false,
  error = null,
  exito = null,
}: {
  valores: FormularioPassword;
  errores: ErroresPassword;
  onCambiar: (campo: keyof FormularioPassword, valor: string) => void;
  onGuardar: () => void;
  guardando?: boolean;
  error?: string | null;
  exito?: string | null;
}) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar();
      }}
      className="space-y-4"
    >
      <CampoAjustes
        id="password-actual"
        etiqueta="Contraseña actual"
        type="password"
        autoComplete="current-password"
        valor={valores.actual}
        onCambiar={(valor) => onCambiar('actual', valor)}
        error={errores.actual}
        deshabilitado={guardando}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoAjustes
          id="password-nueva"
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          valor={valores.nueva}
          onCambiar={(valor) => onCambiar('nueva', valor)}
          error={errores.nueva}
          deshabilitado={guardando}
        />
        <CampoAjustes
          id="password-confirmacion"
          etiqueta="Repite la contraseña nueva"
          type="password"
          autoComplete="new-password"
          valor={valores.confirmacion}
          onCambiar={(valor) => onCambiar('confirmacion', valor)}
          error={errores.confirmacion}
          deshabilitado={guardando}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Usa al menos 8 caracteres. Al cambiarla, tus otros dispositivos tendrán que volver a iniciar
        sesión en los próximos minutos.
      </p>
      <AvisosAjustes error={error} exito={exito} />
      <BotonAjustes ocupado={guardando}>Cambiar contraseña</BotonAjustes>
    </form>
  );
}
