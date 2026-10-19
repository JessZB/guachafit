/**
 * ER1 (prompt 54): pantalla de error de ruta (`errorElement` de la raíz de `router.tsx`).
 *
 * Se muestra cuando un módulo perezoso no se descarga o una página falla al renderizar.
 * Se renderiza sin `AppLayout`, así que usa solo tokens semánticos y átomos de `ui/`.
 *
 * - Nunca muestra el mensaje ni el stack del error: se registran en consola.
 * - Nunca recarga sin una acción del usuario (ADR-014).
 */
import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate, useRouteError } from 'react-router-dom';
import { describirErrorRuta } from '../../lib/errores-ruta';
import { BotonTactil } from '../ui/BotonTactil';

function recargarPagina(): void {
  window.location.reload();
}

export function ErrorRuta() {
  const error = useRouteError();
  const navigate = useNavigate();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const descripcion = describirErrorRuta(error, navigator.onLine);

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    tituloRef.current?.focus();
  }, []);

  const esVersionNueva = descripcion.tipo === 'version-nueva';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div
        role="alert"
        className="w-full max-w-sm space-y-4 rounded-3xl border border-destructive/30 bg-card p-6 text-center"
      >
        <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-destructive" />
        <h1
          ref={tituloRef}
          tabIndex={-1}
          className="text-base font-bold text-foreground outline-none"
        >
          {descripcion.titulo}
        </h1>
        <p className="text-xs text-muted-foreground">{descripcion.detalle}</p>
        <div className="flex flex-col gap-2">
          <BotonTactil onClick={recargarPagina}>
            {esVersionNueva ? 'Recargar' : 'Reintentar'}
          </BotonTactil>
          {descripcion.tipo === 'inesperado' ? (
            <BotonTactil variante="secundaria" onClick={() => navigate('/')}>
              Ir al inicio
            </BotonTactil>
          ) : null}
        </div>
      </div>
    </div>
  );
}
