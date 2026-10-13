/**
 * Onboarding: panel de exito tras el alta, con acceso a iniciar sesion.
 *
 * Presentacional (R1/ADR-022): sin props ni datos; recorte verbatim del contenedor
 * (mismos textos y clases).
 */
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export function ExitoRegistro() {
  return (
    <div className="p-6 text-center space-y-3">
      <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
      <h2 className="font-bold text-base text-foreground">¡Registro exitoso!</h2>
      <p className="text-xs text-muted-foreground">
        Tu cuenta quedó vinculada con tu entrenador. En unos segundos te llevamos a
        iniciar sesión.
      </p>
      <Link
        to="/login"
        className="inline-flex items-center justify-center min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 active:scale-95 transition-all"
      >
        Ir a iniciar sesión
      </Link>
    </div>
  );
}
