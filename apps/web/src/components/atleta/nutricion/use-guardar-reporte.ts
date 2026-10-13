/**
 * Módulo 6 · Nutrición: guardado del reporte RF-002/RN-03 (hook de datos, R9).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (`handleSaveCheckin` + ayudantes, SL3, fase B)
 * sin cambiar el orden de ramas ni los textos. Orquesta payload, cola offline, fotos y errores;
 * recibe sus dependencias de los otros hooks del módulo. §6: sin éxito fabricado (solo el 2xx
 * cuenta), encolado ≠ registrado, demo explícito sin llamadas a la API.
 */
import { useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { resolverBloqueoAlumno } from '../../../lib/acceso-alumno';
import { encolarReporteNutricional } from './encolar-reporte';
import {
  construirPayloadCheckinNutricional,
  cuerpoCheckinParaEnviar,
  decidirAccionErrorCheckinNutricional,
  obtenerStatusError,
  MENSAJE_ELIGE_SEMAFORO,
} from '../../../lib/nutricion-checkin';
import { construirCheckinDemo } from '../../../lib/nutricion-checkin-demo';
import type {
  CheckinNutricionalDetalleDTO,
  FotoComidaInputDTO,
  SemaforoNutricional,
  ToleranciaNutricionalDTO,
} from '@guachafit/shared';
import type { ReporteHoy } from './use-reporte-hoy';
import type { FotosPlatos } from './use-fotos-platos';

/** Respuesta real del POST: el check-in hidratado + la tolerancia contra las metas del coach. */
interface RespuestaCheckinNutricional extends ToleranciaNutricionalDTO {
  checkin: CheckinNutricionalDetalleDTO;
}

export interface FormularioReporte {
  semaforo: SemaforoNutricional | null;
  aguaLitros: string;
  calorias: string;
  proteina: string;
  notas: string;
  /** Limpia los campos opcionales tras encolar (la evidencia ya está a salvo en la cola). */
  limpiarCampos: () => void;
}

export interface ContextoGuardado {
  hoyLocal: string;
  timezoneCliente: string;
  ahora: Date;
  isDemoMode: boolean;
  alumnoId: string | undefined;
  puedeReportar: boolean;
  formularioBloqueado: boolean;
}

export interface GuardarReporte {
  isLoading: boolean;
  handleSaveCheckin: () => Promise<void>;
}

export function useGuardarReporte(
  formulario: FormularioReporte,
  reporte: ReporteHoy,
  fotos: Pick<FotosPlatos, 'fotos' | 'setFotosError' | 'vaciarFotos' | 'subirFotosDePlatos'>,
  contexto: ContextoGuardado
): GuardarReporte {
  const [isLoading, setIsLoading] = useState(false);

  const { semaforo, aguaLitros, calorias, proteina, notas, limpiarCampos } = formulario;
  const { setExistingCheckin, despacharReporte, sincronizarPendienteHoy, setAvisoReporte } = reporte;
  const { setErrorSemaforo, grupoSemaforoRef, setBloqueo } = reporte;
  const { hoyLocal, timezoneCliente, ahora, isDemoMode, alumnoId, puedeReportar, formularioBloqueado } =
    contexto;

  const handleSaveCheckin = async () => {
    // Defensivo: los controles ya están deshabilitados en estos estados.
    if (formularioBloqueado || !puedeReportar) return;
    if (!semaforo) {
      setErrorSemaforo(MENSAJE_ELIGE_SEMAFORO);
      grupoSemaforoRef.current?.focus();
      return;
    }

    // LOTE API-N2: instante del toque en Guardar. Viaja como `segundosDesdeCaptura`, calculado al
    // enviar (ahora o desde la cola), para que el servidor no dependa del reloj del teléfono.
    const capturadoEnMs = Date.now();

    setIsLoading(true);
    setAvisoReporte(null);
    fotos.setFotosError(null);

    // Validación de contrato ANTES de cualquier llamada: nada inválido viaja a la API ni a la cola.
    let payload;
    try {
      payload = construirPayloadCheckinNutricional(
        { semaforo, fecha: hoyLocal, timezoneCliente, aguaLitros, calorias, proteina, notas },
        ahora
      );
    } catch (err: unknown) {
      setIsLoading(false);
      despacharReporte({ tipo: 'rechazado' });
      setAvisoReporte({
        tono: 'error',
        texto: err instanceof Error && err.message ? err.message : 'Revisa los datos del reporte.',
      });
      return;
    }

    // MODO DEMO EXPLÍCITO (isDemoMode): éxito local simulado con la bandera demo visible, sin
    // llamar a la API real (el token demo es simbólico). La tolerancia del día se calcula contra
    // las metas demo con el mismo evaluador que usa el servidor.
    if (isDemoMode) {
      setExistingCheckin(
        construirCheckinDemo({ semaforo, fotos: fotos.fotos, hoyLocal, ahora, alumnoId: alumnoId || 'demo-alumno', calorias, proteina, aguaLitros, notas })
      );
      despacharReporte({ tipo: 'guardado' });
      setIsLoading(false);
      return;
    }

    // RF-002 §6/RN-03: la evidencia con fotos NUNCA se pierde (ver `encolar-reporte.ts`).
    const clavesSubidas = new Map<string, string>();

    /** La evidencia ya está a salvo en la cola: se limpia el formulario y su memoria de previews. */
    const limpiarFormularioEncolado = () => {
      fotos.vaciarFotos();
      limpiarCampos();
    };

    const encolar = () =>
      encolarReporteNutricional({
        payload,
        fotos: fotos.fotos,
        clavesSubidas,
        alumnoId,
        capturadoEnMs,
        limpiarFormularioEncolado,
        despachar: despacharReporte,
        sincronizarPendienteHoy,
      });

    // Sin conexión: el reporte (con o sin fotos) va directo a la cola; nada toca la red.
    if (!navigator.onLine) {
      try {
        await encolar();
      } catch (err: unknown) {
        despacharReporte({ tipo: 'rechazado' });
        setAvisoReporte({
          tono: 'error',
          texto:
            err instanceof Error && err.message
              ? err.message
              : 'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // RN-03: con conexión, las fotos se suben ANTES del check-in.
    if (fotos.fotos.length > 0) {
      try {
        await fotos.subirFotosDePlatos(fotos.fotos, clavesSubidas);
      } catch (err: unknown) {
        const status = obtenerStatusError(err);
        if (status >= 400 && status < 500) {
          // Rechazo de contrato del presign: reintentar no ayuda y encolar sería mentir.
          setIsLoading(false);
          fotos.setFotosError(
            err instanceof Error && err.message
              ? err.message
              : 'No se pudieron subir las fotos. Inténtalo de nuevo.'
          );
          return;
        }
        // Fallo de red/5xx: la evidencia (con el progreso ya subido) se encola para reintento.
        try {
          await encolar();
        } catch {
          despacharReporte({ tipo: 'rechazado' });
          setAvisoReporte({
            tono: 'error',
            texto: 'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
          });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    const fotosPlatosSubidas: FotoComidaInputDTO[] = fotos.fotos
      .map((foto) => {
        const storageKey = clavesSubidas.get(foto.id);
        return storageKey ? { tipoComida: foto.tipoComida, storageKey } : null;
      })
      .filter((foto): foto is FotoComidaInputDTO => foto !== null);

    const payloadConFotos =
      fotosPlatosSubidas.length > 0 ? { ...payload, fotosPlatos: fotosPlatosSubidas } : payload;

    try {
      // 2xx es el ÚNICO resultado que cuenta como éxito (RF-002: sin éxito fabricado).
      await apiClient<RespuestaCheckinNutricional>('/nutricion/checkin-diario', {
        method: 'POST',
        body: JSON.stringify(cuerpoCheckinParaEnviar(payloadConFotos, capturadoEnMs)),
      });
      await reporte.cargarReporteHoy();
      despacharReporte({ tipo: 'guardado' });
    } catch (err) {
      // RF-012: el bloqueo de ciclo de vida tiene su propia pantalla (no es un error de datos).
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        return;
      }
      const decision = decidirAccionErrorCheckinNutricional(err, true);
      if (decision.accion === 'encolar') {
        // Fallo de red/5xx: la cola offline reintenta; nunca se declara "registrado".
        try {
          await encolar();
        } catch {
          despacharReporte({ tipo: 'rechazado' });
          setAvisoReporte({
            tono: 'error',
            texto: 'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
          });
        }
      } else if (decision.accion === 'refrescar') {
        // 409: el reporte de hoy ya existía; se refleja el estado real del servidor.
        await reporte.cargarReporteHoy();
        setAvisoReporte({ tono: 'info', texto: decision.mensaje });
      } else {
        despacharReporte({ tipo: 'rechazado' });
        setAvisoReporte({ tono: 'error', texto: decision.mensaje });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { isLoading, handleSaveCheckin };
}
