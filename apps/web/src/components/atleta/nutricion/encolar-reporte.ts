/**
 * Módulo 6 · Nutrición: encolado offline del reporte RF-002 §6/RN-03 (ayudante sin hooks).
 *
 * Extraído de `use-guardar-reporte.ts` (SL3, fase B) para que cada archivo tenga UNA
 * responsabilidad (R2): este módulo solo sabe guardar el reporte en la cola durable.
 * La evidencia con fotos NUNCA se pierde: si no hay red (o la subida falla por red/5xx),
 * el reporte completo —datos + blobs comprimidos— entra a la cola y se sincroniza solo.
 */
import {
  queueCheckinNutricionalConFotos,
  queueOfflineMutation,
  type FotoCheckinEnCola,
} from '../../../lib/offline-db';
import type { FotoPlatoSeleccionada } from '../../../lib/nutricion-fotos';
import type { CheckinNutricionalDTO } from '@guachafit/shared';
import type { ReporteHoy } from './use-reporte-hoy';

export interface EncolarReporteArgs {
  payload: CheckinNutricionalDTO;
  fotos: FotoPlatoSeleccionada[];
  clavesSubidas: Map<string, string>;
  alumnoId: string | undefined;
  capturadoEnMs: number;
  limpiarFormularioEncolado: () => void;
  despachar: ReporteHoy['despacharReporte'];
  sincronizarPendienteHoy: () => Promise<void>;
}

export function construirFotosEnCola(
  fotos: FotoPlatoSeleccionada[],
  clavesSubidas: Map<string, string>
): FotoCheckinEnCola[] {
  return fotos.map((foto) => ({
    tipoComida: foto.tipoComida,
    nombre: foto.archivo.name,
    contentType: foto.archivo.type,
    blob: foto.archivo,
    storageKey: clavesSubidas.get(foto.id) ?? null,
  }));
}

export async function encolarReporteNutricional(args: EncolarReporteArgs): Promise<void> {
  const {
    payload,
    fotos,
    clavesSubidas,
    alumnoId,
    capturadoEnMs,
    limpiarFormularioEncolado,
    despachar,
    sincronizarPendienteHoy,
  } = args;
  if (fotos.length > 0) {
    if (!alumnoId) {
      throw new Error('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
    }
    await queueCheckinNutricionalConFotos(
      payload,
      construirFotosEnCola(fotos, clavesSubidas),
      alumnoId,
      capturadoEnMs
    );
    limpiarFormularioEncolado();
  } else {
    await queueOfflineMutation(
      '/nutricion/checkin-diario',
      'POST',
      payload,
      'Reporte nutricional del día',
      undefined,
      { alumnoId, capturadoEnMs }
    );
  }
  despachar({ tipo: 'encolado', fotos: fotos.length });
  // Carrera: si la cola ya lo envió antes de este punto, la relectura lo deja en confirmación.
  void sincronizarPendienteHoy();
}
