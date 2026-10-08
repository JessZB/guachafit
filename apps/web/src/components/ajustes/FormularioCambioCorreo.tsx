import { AVISO_CAMBIO_CORREO } from '../../lib/mi-perfil';
import { AvisosAjustes, BotonAjustes, CampoAjustes } from './CampoAjustes';

export interface ValoresCambioCorreo {
  correoNuevo: string;
  passwordActual: string;
}

/**
 * RF-018 RN-03..RN-05: cambio del correo de acceso. Avisa ANTES de enviar que llegará un correo
 * de confirmación a la dirección nueva; con un cambio pendiente ofrece reenviar o cancelar.
 */
export function FormularioCambioCorreo({
  correoActual,
  correoPendiente,
  valores,
  onCambiar,
  onEnviar,
  onReenviar,
  onCancelarPendiente,
  enviando = false,
  error = null,
  exito = null,
  enlaceConfirmacion,
}: {
  correoActual: string;
  correoPendiente: string | null;
  valores: ValoresCambioCorreo;
  onCambiar: (campo: keyof ValoresCambioCorreo, valor: string) => void;
  onEnviar: () => void;
  onReenviar: () => void;
  onCancelarPendiente: () => void;
  enviando?: boolean;
  error?: string | null;
  exito?: string | null;
  enlaceConfirmacion?: string;
}) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
      className="space-y-4"
    >
      <p className="text-sm text-muted-foreground">
        Correo de acceso actual: <span className="font-semibold text-foreground">{correoActual}</span>
      </p>

      {correoPendiente && (
        <div className="p-3 rounded-2xl bg-warning/10 border border-warning/30 space-y-2">
          <p className="text-sm text-foreground">Pendiente de confirmar: {correoPendiente}</p>
          <p className="text-xs text-muted-foreground">
            Para reenviar el correo, escribe abajo tu contraseña actual.
          </p>
          <div className="flex flex-wrap gap-2">
            <BotonAjustes type="button" variante="secundario" ocupado={enviando} onClick={onReenviar}>
              Reenviar correo
            </BotonAjustes>
            <BotonAjustes
              type="button"
              variante="secundario"
              ocupado={enviando}
              onClick={onCancelarPendiente}
            >
              Cancelar cambio
            </BotonAjustes>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoAjustes
          id="correo-nuevo"
          etiqueta="Correo nuevo"
          type="email"
          inputMode="email"
          autoComplete="email"
          valor={valores.correoNuevo}
          onCambiar={(valor) => onCambiar('correoNuevo', valor)}
          deshabilitado={enviando}
        />
        <CampoAjustes
          id="correo-password-actual"
          etiqueta="Tu contraseña actual"
          type="password"
          autoComplete="current-password"
          valor={valores.passwordActual}
          onCambiar={(valor) => onCambiar('passwordActual', valor)}
          deshabilitado={enviando}
        />
      </div>

      <p className="text-xs text-muted-foreground">{AVISO_CAMBIO_CORREO}</p>

      {enlaceConfirmacion && (
        <p className="text-xs text-muted-foreground break-all">
          Sin servicio de correo (solo en desarrollo):{' '}
          <a href={enlaceConfirmacion} className="font-semibold text-primary underline">
            abrir el enlace de confirmación
          </a>
        </p>
      )}

      <AvisosAjustes error={error} exito={exito} />
      <BotonAjustes ocupado={enviando}>Enviar correo de confirmación</BotonAjustes>
    </form>
  );
}
