import { useState } from 'react';
import { triggerHaptic } from '../../../lib/haptics';
import type { EjercicioSesionDetalleDTO } from '@guachafit/shared';

/** WU3b (Escenario 1): modal de video demostrativo del catálogo. */
export function useVideoTecnica() {
  const [videoModal, setVideoModal] = useState<{ url: string; nombre: string } | null>(null);

  /** Escenario 1: abre el video demostrativo del catálogo para este ejercicio. */
  const handleAbrirVideo = (ejercicioSesion: EjercicioSesionDetalleDTO) => {
    const url = ejercicioSesion.ejercicio?.videoUrl;
    if (!url) return;
    triggerHaptic('selection');
    setVideoModal({ url, nombre: ejercicioSesion.ejercicio?.nombre || 'Ejercicio' });
  };

  return { videoModal, setVideoModal, handleAbrirVideo };
}
