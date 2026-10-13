import { useState } from 'react';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import { triggerHaptic } from '../../../lib/haptics';
import type { EjercicioSesionDetalleDTO } from '@guachafit/shared';

/** WU3b (Escenario 1): modal de video demostrativo del catálogo. */
export function useVideoTecnica() {
  const [videoModal, setVideoModal] = useState<{ url: string; nombre: string } | null>(null);

  // U3b: el modal comparte el contrato de diálogo accesible (Escape, trampa de
  // Tab, foco inicial y restore del foco al disparador).
  const refModalVideo = useDialogoAccesible({
    abierto: videoModal !== null,
    onCerrar: () => setVideoModal(null),
  });

  /** Escenario 1: abre el video demostrativo del catálogo para este ejercicio. */
  const handleAbrirVideo = (ejercicioSesion: EjercicioSesionDetalleDTO) => {
    const url = ejercicioSesion.ejercicio?.videoUrl;
    if (!url) return;
    triggerHaptic('selection');
    setVideoModal({ url, nombre: ejercicioSesion.ejercicio?.nombre || 'Ejercicio' });
  };

  return { videoModal, setVideoModal, handleAbrirVideo, refModalVideo };
}
