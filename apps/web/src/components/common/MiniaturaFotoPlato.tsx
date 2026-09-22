/**
 * RF-002 RN-03: miniatura de una foto de plato con estado honesto de enlace.
 *
 * Las fotos de platos se sirven con URLs firmadas de 15 minutos: si el enlace no llegó (bóveda sin
 * configurar) o venció, la miniatura lo declara en vez de mostrar una imagen rota en silencio.
 * Compartida por la vista del alumno (galería del día) y la del coach (calendario de check-ins).
 */
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { FotoComidaDetalleDTO } from '@guachafit/shared';
import { etiquetaTipoComida } from '../../lib/nutricion-metas';

export interface MiniaturaFotoPlatoProps {
  foto: FotoComidaDetalleDTO;
  /** Abre el visor accesible de la foto. */
  onAbrir: () => void;
  /** Fecha larga de la toma para el `aria-label` (ej. "21 de septiembre de 2026"). */
  fechaTexto?: string;
}

export function MiniaturaFotoPlato({ foto, onAbrir, fechaTexto }: MiniaturaFotoPlatoProps) {
  const [fallo, setFallo] = useState(false);
  const etiqueta = etiquetaTipoComida(foto.tipoComida);
  const conImagen = Boolean(foto.fotoUrl) && !fallo;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Ver foto de ${etiqueta}${fechaTexto ? ` del ${fechaTexto}` : ''}`}
      className="group space-y-1 cursor-pointer"
    >
      {conImagen ? (
        <img
          src={foto.fotoUrl ?? undefined}
          alt={`Foto de ${etiqueta}`}
          onError={() => setFallo(true)}
          className="h-20 w-16 rounded-xl object-cover border border-border group-hover:border-primary/60 transition-colors"
        />
      ) : (
        <span className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-1">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-[11px] text-muted-foreground text-center leading-tight">
            {fallo ? 'Enlace vencido' : 'Sin enlace'}
          </span>
        </span>
      )}
      <span className="block text-[11px] text-muted-foreground text-center">{etiqueta}</span>
    </button>
  );
}
