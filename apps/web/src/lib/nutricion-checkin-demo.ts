/**
 * Módulo 6 · Nutrición: check-in demo local (lógica pura).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (`construirCheckinDemo`, SL3, fase B) sin
 * cambiar valores. No se edita `lib/demo-nutricion.ts` (R6): esta función mezcla el formulario
 * con las vistas previas elegidas y solo tiene sentido para esta vista.
 */
import type {
  CheckinNutricionalDetalleDTO,
  FotoComidaDetalleDTO,
  SemaforoNutricional,
} from '@guachafit/shared';
import type { FotoPlatoSeleccionada } from './nutricion-fotos';

export interface EntradaCheckinDemo {
  semaforo: SemaforoNutricional;
  fotos: FotoPlatoSeleccionada[];
  hoyLocal: string;
  ahora: Date;
  alumnoId: string;
  calorias: string;
  proteina: string;
  aguaLitros: string;
  notas: string;
}

/** Galería local del día en modo demo: las vistas previas elegidas son la evidencia visible. */
export function construirCheckinDemo(entrada: EntradaCheckinDemo): CheckinNutricionalDetalleDTO {
  const fotos: FotoComidaDetalleDTO[] = entrada.fotos.map((foto, indice) => ({
    id: `demo-foto-hoy-${indice}`,
    checkinId: 'demo-checkin-hoy',
    tipoComida: foto.tipoComida,
    storageKey: `comidas/demo/${entrada.hoyLocal}/demo-${indice}.webp`,
    fotoUrl: foto.previewUrl,
    createdAtUtc: entrada.ahora.toISOString(),
  }));
  return {
    id: 'demo-checkin-hoy',
    alumnoId: entrada.alumnoId,
    fecha: entrada.hoyLocal,
    semaforo: entrada.semaforo,
    caloriasReportadas: entrada.calorias ? Number(entrada.calorias) : null,
    proteinaGramosReportada: entrada.proteina ? Number(entrada.proteina) : null,
    aguaLitros: entrada.aguaLitros || null,
    notasAlumno: entrada.notas || null,
    fotosPlatos: fotos,
    createdAtUtc: entrada.ahora.toISOString(),
    updatedAtUtc: entrada.ahora.toISOString(),
  };
}
