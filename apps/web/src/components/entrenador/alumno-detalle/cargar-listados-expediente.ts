/**
 * Carga en paralelo de los listados de la ficha del alumno, una vez cargado el perfil.
 *
 * Extraído de `cargarExpediente` (`use-expediente-alumno.ts`) para mantener ese hook bajo el
 * límite de tamaño. Los tipos de las dependencias se importan de ese hook (`import type`, sin
 * ciclo de valores).
 */
import type React from 'react';
import type {
  EjercicioCatalogoDetalleDTO,
  PerfilAlumnoDetalleDTO,
  PlanMembresiaDetalleDTO,
  RutinaSemanalDetalleDTO,
  SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { ApiError, apiClient } from '../../../lib/api-client';
import type { RetornoPlanSuscripcion } from './use-plan-suscripcion-alumno';
import type {
  CargaControlesDeps,
  CargaRutinaDeps,
  CargaSesionesDeps,
  CargaTransaccionesDeps,
} from './use-expediente-alumno';

export interface ParametrosCargaListados {
  perfilRes: PerfilAlumnoDetalleDTO;
  alumnoId: string;
  /** Devuelve `false` si una recarga posterior ya superó esta carga (no aplica su estado). */
  vigente: () => boolean;
  tamanoTx: number;
  tamanoHistorial: number;
  tamanoControles: number;
  plan: RetornoPlanSuscripcion;
  transacciones: CargaTransaccionesDeps;
  sesiones: CargaSesionesDeps;
  controles: CargaControlesDeps;
  rutina: CargaRutinaDeps;
  setPlanesCatalogo: React.Dispatch<React.SetStateAction<PlanMembresiaDetalleDTO[]>>;
}

export async function cargarListadosExpediente({
  perfilRes,
  alumnoId,
  vigente,
  tamanoTx,
  tamanoHistorial,
  tamanoControles,
  plan,
  transacciones,
  sesiones,
  controles,
  rutina,
  setPlanesCatalogo,
}: ParametrosCargaListados): Promise<void> {
  // Pasos 2-8 en PARALELO: son independientes entre sí (cada dominio escribe su propio estado) y
  // solo dependen del perfil ya cargado. `isLoading` baja en el `finally` cuando TODAS terminan,
  // así el esqueleto dura lo que la petición más lenta, no la suma. Cada dominio captura sus
  // propios fallos; `allSettled` evita que una rechazada cancele u oculte a las demás.
  // Único estado compartido: el aviso de carga (`plan.notificarAvisoCarga`) es un solo texto,
  // el último en notificar gana (antes lo decidía el orden secuencial; ahora, el de llegada).

  // 2. WU25b: historial financiero paginado con `txLimit`/`txOffset`; la respuesta trae el
  // resumen completo y la página 1 de transacciones (un fallo deja el aviso de la pestaña,
  // nunca cifras inventadas).
  const cargarTransaccionesIniciales = () => transacciones.cargarTransacciones(1, tamanoTx);

  // 3. Catálogo de planes (vacío real = sin planes, nunca planes inventados)
  const cargarPlanesCatalogo = async () => {
    const planesRes = await apiClient<PlanMembresiaDetalleDTO[]>('/finanzas/planes').catch(
      () => {
        if (vigente()) plan.notificarAvisoCarga('No se pudo cargar el catálogo de planes.');
        return [];
      }
    );
    if (vigente()) setPlanesCatalogo(Array.isArray(planesRes) ? planesRes : []);
  };

  // 3b + 3c. EN ORDEN: la suscripción necesita los overrides ya cargados.
  // WU-J (RF-005): override vigente real del alumno (precio/tasa pactados).
  // M5-L1B: plan asignado (suscripción). El selector parte de ella, nunca del plan
  // deducido del override: así guardar el expediente no asigna un plan sin querer.
  const cargarOverridesYSuscripcion = async () => {
    const overridesCargados = await plan.cargarOverrides(perfilRes.usuarioId);
    await plan.cargarSuscripcion(perfilRes.usuarioId, overridesCargados, perfilRes.zonaHoraria);
  };

  // 4 + 5. Última sesión y luego historial (el mismo dominio, en el orden de siempre).
  // Sin dato => sin tarjeta de "último entrenamiento" (nunca fabricada).
  const cargarUltimaSesionEHistorial = async () => {
    const sesionRes = await apiClient<SesionEntrenamientoDetalleDTO>(
      `/sesiones/alumno/${alumnoId}/ultima`
    ).catch((err: unknown) => {
      // 404 = sin sesiones (no es un fallo): solo cualquier otro error avisa.
      if (vigente() && !(err instanceof ApiError && err.status === 404)) plan.notificarAvisoCarga('No se pudo cargar el último entrenamiento.');
      return null;
    });
    if (vigente()) sesiones.setUltimaSesion(sesionRes ?? null);

    // WU25b: historial de sesiones paginado (envelope `{ items, total, limit, offset }`);
    // la página 1 son las sesiones más recientes y el total es el COUNT real del alumno.
    await sesiones.cargarHistorial(1, tamanoHistorial);
  };

  // 6. Catálogo de ejercicios (vacío real => estado vacío explícito en el modal)
  const cargarCatalogoEjercicios = async () => {
    const catalogoRes = await apiClient<EjercicioCatalogoDetalleDTO[]>(
      '/ejercicios/catalogo'
    ).catch(() => []);
    if (vigente()) rutina.setEjerciciosCatalogo(Array.isArray(catalogoRes) ? catalogoRes : []);
  };

  // 7. Rutina semanal activa persistida: sin rutina (vacía o sin bloques) => estado vacío;
  // un fallo real (red/5xx) => aviso con reintento, nunca el estado vacío.
  const cargarRutinaActiva = async () => {
    try {
      const rutinaActivaRes = await apiClient<RutinaSemanalDetalleDTO>(
        `/rutinas/alumno/${alumnoId}/activa`
      );
      if (!vigente()) return;
      rutina.setErrorRutina(null);
      rutina.setRutinaSemanal(
        rutinaActivaRes &&
          Array.isArray(rutinaActivaRes.bloques) &&
          rutinaActivaRes.bloques.length > 0
          ? rutinaActivaRes.bloques
          : []
      );
    } catch {
      if (vigente()) rutina.setErrorRutina('No se pudo cargar la rutina semanal');
    }
  };

  // 8. N3/WU25b: controles antropométricos reales paginados (la página 1 son los más
  // recientes); un fallo muestra aviso visible, nunca una tabla vacía pasando por
  // "sin registros".
  const cargarControlesIniciales = () =>
    controles.cargarControles(1, tamanoControles, perfilRes.usuarioId);

  const resultados = await Promise.allSettled([
    cargarTransaccionesIniciales(),
    cargarPlanesCatalogo(),
    cargarOverridesYSuscripcion(),
    cargarUltimaSesionEHistorial(),
    cargarCatalogoEjercicios(),
    cargarRutinaActiva(),
    cargarControlesIniciales(),
  ]);
  // Red de seguridad: los dominios capturan sus fallos, pero si alguno rechazara igualmente se
  // relanza (tras esperar a todas) para conservar el aviso del `catch` externo de siempre.
  const rechazada = resultados.find(
    (resultado): resultado is PromiseRejectedResult => resultado.status === 'rejected'
  );
  if (rechazada) throw rechazada.reason;
}
