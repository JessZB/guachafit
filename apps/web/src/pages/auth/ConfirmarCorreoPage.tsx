/**
 * RF-018 RN-05: pantalla pública `/confirmar-correo?token=…`, destino del enlace enviado al correo
 * nuevo. Confirma una sola vez al abrirse (el enlace es de un solo uso) y muestra el resultado.
 *
 * El token se guarda en memoria y se quita de la URL al leerlo: no queda en el historial ni viaja
 * en el Referer. El resultado se guarda en `sessionStorage`, así recargar la pestaña muestra lo que
 * pasó en vez de volver a canjear un enlace ya usado (que el API respondería como vencido).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { estadoConfirmacionCorreo } from '../../lib/mi-perfil';
import {
  EstadoConfirmacionCorreo,
  type EstadoPantallaConfirmacionCorreo,
} from '../../components/ajustes/EstadoConfirmacionCorreo';

interface ResultadoConfirmacion {
  estado: EstadoPantallaConfirmacionCorreo;
  mensaje?: string;
}

const CLAVE_RESULTADO = 'guachafit:confirmar-correo';

function leerResultadoGuardado(): ResultadoConfirmacion | null {
  try {
    const guardado = sessionStorage.getItem(CLAVE_RESULTADO);
    return guardado ? (JSON.parse(guardado) as ResultadoConfirmacion) : null;
  } catch {
    return null;
  }
}

function guardarResultado(resultado: ResultadoConfirmacion): void {
  try {
    sessionStorage.setItem(CLAVE_RESULTADO, JSON.stringify(resultado));
  } catch {
    // Sin almacenamiento disponible: la pantalla funciona igual, solo no recuerda el resultado.
  }
}

export function ConfirmarCorreoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokenUrl = searchParams.get('token') ?? '';
  const tokenRef = useRef(tokenUrl);
  // En desarrollo React monta dos veces: el canje se pide una sola vez por token.
  const tokenEnviadoRef = useRef<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoConfirmacion>(() =>
    tokenUrl ? { estado: 'confirmando' } : (leerResultadoGuardado() ?? { estado: 'invalido' })
  );

  const confirmar = useCallback(() => {
    const token = tokenRef.current;
    if (!token) return;
    setResultado({ estado: 'confirmando' });
    apiClient
      .post<{ mensaje: string }>('/auth/confirmar-cambio-correo', { token }, { skipAuth: true })
      .then((respuesta) => ({ estado: 'confirmado' as const, mensaje: respuesta?.mensaje }))
      .catch((error: unknown) => ({ estado: estadoConfirmacionCorreo(error) }))
      .then((final: ResultadoConfirmacion) => {
        guardarResultado(final);
        setResultado(final);
      });
  }, []);

  useEffect(() => {
    if (!tokenUrl) return;
    tokenRef.current = tokenUrl;
    setSearchParams({}, { replace: true });
    if (tokenEnviadoRef.current === tokenUrl) return;
    tokenEnviadoRef.current = tokenUrl;
    confirmar();
  }, [tokenUrl, setSearchParams, confirmar]);

  // Un fallo de red o del servidor no consume el enlace: se puede reintentar sin salir.
  const puedeReintentar =
    Boolean(tokenRef.current) &&
    (resultado.estado === 'sin-conexion' || resultado.estado === 'error');

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-primary/15 text-primary shrink-0">
            <MailCheck className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-black tracking-tight text-foreground">Confirmar tu correo</h1>
        </div>
        <EstadoConfirmacionCorreo
          estado={resultado.estado}
          mensaje={resultado.mensaje}
          onReintentar={puedeReintentar ? confirmar : undefined}
        />
      </div>
    </main>
  );
}
