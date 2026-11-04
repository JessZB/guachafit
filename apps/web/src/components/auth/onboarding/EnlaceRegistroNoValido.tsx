/**
 * Onboarding (D17, RF-011): página de «enlace de registro no válido».
 *
 * Se muestra cuando `/onboarding` llega sin código de entrenador o con un código que la API
 * no resuelve (rotado, pausado, cupo lleno, inexistente). No hay formulario ni campo manual
 * de código: el alumno debe pedirle un enlace nuevo a su entrenador. Es contenido de página
 * (no un `role="alert"`).
 *
 * Presentacional (R1/ADR-022): solo props. §6: controles de 44px (`min-h-11`), texto ≥ 12px.
 */
import { Link } from 'react-router-dom';
import { LinkIcon } from 'lucide-react';

export type MotivoEnlaceNoValido = 'sin-codigo' | 'invalido';

export interface EnlaceRegistroNoValidoProps {
  motivo: MotivoEnlaceNoValido;
}

const TEXTO_POR_MOTIVO: Record<MotivoEnlaceNoValido, string> = {
  'sin-codigo':
    'Al enlace le falta el código de tu entrenador. Pídele que te comparta su enlace de registro completo.',
  invalido:
    'El enlace venció, se reemplazó por uno nuevo o no está disponible. Pídele a tu entrenador un enlace nuevo.',
};

export function EnlaceRegistroNoValido({ motivo }: EnlaceRegistroNoValidoProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <section className="w-full max-w-lg p-6 rounded-2xl bg-card border border-border shadow-md space-y-4 text-center">
        <div className="h-12 w-12 mx-auto rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
          <LinkIcon className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="font-bold text-lg text-foreground">Este enlace de registro no es válido</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{TEXTO_POR_MOTIVO[motivo]}</p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 active:scale-95 transition-all"
        >
          Ya tengo cuenta · Iniciar sesión
        </Link>
      </section>
    </main>
  );
}
