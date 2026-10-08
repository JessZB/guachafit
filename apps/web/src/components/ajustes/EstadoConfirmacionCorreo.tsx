import {
  mensajeConfirmacionCorreo,
  type EstadoErrorConfirmacionCorreo,
} from '../../lib/mi-perfil';

export type EstadoPantallaConfirmacionCorreo =
  | 'confirmando'
  | 'confirmado'
  | EstadoErrorConfirmacionCorreo;

/**
 * RF-018 RN-05: resultado de abrir el enlace de confirmación del correo nuevo. Pantalla pública:
 * la salida es un enlace normal a `/login` (no depende de la sesión ni del router). Con
 * `onReintentar` (fallo de red o del servidor) ofrece además repetir la confirmación.
 */
export function EstadoConfirmacionCorreo({
  estado,
  mensaje,
  onReintentar,
}: {
  estado: EstadoPantallaConfirmacionCorreo;
  mensaje?: string;
  onReintentar?: () => void;
}) {
  const irAlLogin = (
    <a
      href="/login"
      className="inline-flex items-center justify-center min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90"
    >
      Ir a iniciar sesión
    </a>
  );

  if (estado === 'confirmando') {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Confirmando tu correo…
      </p>
    );
  }

  if (estado === 'confirmado') {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm font-semibold text-success">
          {mensaje ?? 'Tu correo de acceso se actualizó.'}
        </p>
        {irAlLogin}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p role="alert" className="text-sm font-semibold text-destructive">
        {mensajeConfirmacionCorreo(estado)}
      </p>
      <div className="flex flex-wrap gap-2">
        {onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            className="min-h-11 px-4 rounded-xl bg-secondary text-foreground text-sm font-bold hover:bg-secondary/80 cursor-pointer"
          >
            Reintentar
          </button>
        )}
        {irAlLogin}
      </div>
    </div>
  );
}
