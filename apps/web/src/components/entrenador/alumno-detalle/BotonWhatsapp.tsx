/**
 * Enlace WhatsApp 1-tap del alumno (abre el chat con saludo prellenado).
 *
 * CANDIDATO a `common/` (fase D): copias verificables en `pages/entrenador/AlumnosPage.tsx:904-915`,
 * `:1024-1032` y `CarteraPage.tsx:667-678` (R3.1). §6: `min-h-11` táctil, 11px mínimo.
 */
import { MessageSquare } from 'lucide-react';

interface BotonWhatsappProps {
  telefono: string;
  nombres: string;
}

export function BotonWhatsapp({ telefono, nombres }: BotonWhatsappProps) {
  return (
    <a
      href={`https://wa.me/${telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `¡Hola ${nombres}! Te contacto de Guachafit para coordinar tu planificación deportiva.`
      )}`}
      target="_blank"
      rel="noopener noreferrer"
      className="min-h-11 py-2 px-3.5 rounded-xl bg-success-strong hover:bg-success-strong/90 text-white font-bold text-xs shadow-md shadow-success-strong/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
    >
      <MessageSquare className="h-4 w-4" />
      <span>WhatsApp</span>
    </a>
  );
}
