import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Rol } from '@guachafit/shared';
import { useAuth } from '../../context/auth-context';
import { obtenerTimezoneDispositivo } from '../../lib/date-format';
import { rutaAjustes } from '../../lib/ajustes';
import { almacenDeSesion } from '../../lib/sesion-estado';
import { claveAvisoZona, hayDiscrepanciaZona, nombreZonaHoraria } from '../../lib/zona-horaria';

/** ¿Ya se descartó el aviso de esta pareja de zonas en esta sesión? Un almacén bloqueado cuenta como "no". */
function estaDescartado(clave: string): boolean {
  try {
    return almacenDeSesion()?.getItem(clave) === '1';
  } catch {
    return false;
  }
}

function recordarDescarte(clave: string): void {
  try {
    almacenDeSesion()?.setItem(clave, '1');
  } catch {
    // Sin almacenamiento el aviso solo se oculta en memoria, hasta recargar.
  }
}

const CLASE_ACCION =
  'inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-bold text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * ZH-1 (ADR-025): aviso discreto al final del contenido del alumno cuando la zona del dispositivo
 * y la del perfil tienen un desfase UTC distinto ahora. No cambia nada por sí solo: enlaza a
 * Ajustes y se puede descartar durante la sesión (por pareja de zonas).
 */
export function AvisoZonaDiscrepante({ zonaDispositivo }: { zonaDispositivo?: string }) {
  const { user, isDemoMode } = useAuth();
  // Clave descartada en memoria; el aviso se oculta solo si coincide con la pareja actual.
  const [claveDescartada, setClaveDescartada] = useState<string | null>(null);

  const zonaPerfil = user?.zonaHoraria;
  if (!user || user.rol !== Rol.ALUMNO || isDemoMode || !zonaPerfil) return null;

  const zonaEquipo = zonaDispositivo ?? obtenerTimezoneDispositivo();
  if (!hayDiscrepanciaZona(zonaPerfil, zonaEquipo)) return null;

  const clave = claveAvisoZona(user.id, zonaPerfil, zonaEquipo);
  if (claveDescartada === clave || estaDescartado(clave)) return null;

  const descartar = () => {
    recordarDescarte(clave);
    setClaveDescartada(clave);
  };

  return (
    <aside
      aria-label="Aviso de zona horaria"
      className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground"
    >
      <p className="min-w-0 flex-1 basis-60">
        Zona de tu dispositivo: {nombreZonaHoraria(zonaEquipo)}. Zona de tu perfil:{' '}
        {nombreZonaHoraria(zonaPerfil)}.
      </p>
      <Link
        to={rutaAjustes(Rol.ALUMNO, 'zona-horaria') ?? '/app/ajustes?tab=zona-horaria'}
        className={CLASE_ACCION}
      >
        Cambiar zona horaria
      </Link>
      <button type="button" onClick={descartar} className={CLASE_ACCION}>
        Entendido
      </button>
    </aside>
  );
}
