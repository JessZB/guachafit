/**
 * Onboarding: alerta del error de registro, con acceso a iniciar sesion cuando el
 * correo ya esta registrado (C8).
 *
 * Presentacional (R1/ADR-022): recibe props; recorte verbatim del contenedor (mismo
 * `role="alert"`, textos y clases).
 */
import { Link } from 'react-router-dom';

export interface AlertaErrorRegistroProps {
  error: string;
  correoYaRegistrado: boolean;
}

export function AlertaErrorRegistro({ error, correoYaRegistrado }: AlertaErrorRegistroProps) {
  return (
    <div
      role="alert"
      className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold space-y-1"
    >
      <p>{error}</p>
      {correoYaRegistrado && (
        <Link
          to="/login"
          className="inline-flex items-center min-h-11 font-bold text-primary underline"
        >
          Iniciar sesión
        </Link>
      )}
    </div>
  );
}
