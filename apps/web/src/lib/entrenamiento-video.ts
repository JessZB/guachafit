/**
 * Detecta si una URL de video es embebible (YouTube/Vimeo) y devuelve su URL de embed.
 * Cualquier otro formato se ofrece como enlace externo en el modal.
 */
export function obtenerUrlVideoEmbebible(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      const partes = parsed.pathname.split('/').filter(Boolean);
      if (partes[0] === 'embed' && partes[1]) {
        return `https://www.youtube-nocookie.com/embed/${partes[1]}`;
      }
      if (partes[0] === 'shorts' && partes[1]) {
        return `https://www.youtube-nocookie.com/embed/${partes[1]}`;
      }
      return null;
    }
    if (host === 'vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
