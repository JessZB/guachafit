/**
 * Miniatura del comprobante de la cartera (tabla y tarjetas móviles).
 *
 * Si la imagen no carga (URL caducada, red), muestra un aviso en vez de un icono roto. El `key`
 * por URL en el padre reinicia el fallo cuando llega otro comprobante.
 */
import { useState } from 'react';

export function MiniaturaComprobante({ url, alumnoNombre }: { url: string | null; alumnoNombre: string }) {
  const [fallo, setFallo] = useState(false);

  if (!url) {
    return <span className="text-[11px] text-muted-foreground">Sin captura digital</span>;
  }

  if (fallo) {
    return <span className="text-[11px] text-muted-foreground">Comprobante no disponible</span>;
  }

  return (
    <img
      src={url}
      alt={`Comprobante de ${alumnoNombre}`}
      loading="lazy"
      onError={() => setFallo(true)}
      className="mt-1 h-10 w-16 rounded-md object-cover border border-border"
    />
  );
}
