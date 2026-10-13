/**
 * Hook del expediente del alumno: perfil, formulario de datos y catálogo de planes,
 * más la orquestación de la carga inicial de la ficha.
 *
 * Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-3). Los fixtures demo viven en
 * `lib/alumno-detalle-demo.ts`.
 *
 * La carga inicial secuencia los dominios (perfil → usuarioId → listados) igual que antes;
 * cada dominio expone sus setters/cargadores y este hook los invoca. Los tipos de esas
 * dependencias se declaran aquí para que los hooks de dominio los implementen sin ciclos
 * de importación (los hooks de dominio importan estos tipos, nunca al revés).
 */
import { useEffect, useState } from 'react';
import type React from 'react';
import {
  Modalidad,
  PeriodicidadAntropometria,
  TipoDocumento,
  type BloqueDiaRutinaDTO,
  type EjercicioCatalogoDetalleDTO,
  type PerfilAlumnoDetalleDTO,
  type PlanMembresiaDetalleDTO,
  type ResumenFinancieroAlumnoDTO,
  type RutinaSemanalDetalleDTO,
  type SesionEntrenamientoDetalleDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { rebanarPagina } from '../../../lib/paginacion';
import { sesionesDemoAlumno } from '../../../lib/demo-sesiones';
import { esSesionRealizada } from '../../../lib/alumno-detalle-metricas';
import {
  controlesDemoAlumno,
  type ControlAntroFila,
} from '../../../lib/alumno-detalle-controles';
import {
  crearCatalogoDemo,
  crearFinanzasDemoAlumno,
  crearOverridesDemoAlumno,
  crearPerfilDemoAlumno,
  crearPlanesDemo,
  crearRutinaDemoAlumno,
  crearSuscripcionDemoAlumno,
} from '../../../lib/alumno-detalle-demo';
import type { RetornoPlanSuscripcion } from './use-plan-suscripcion-alumno';

/** Lo que la carga inicial necesita del dominio de transacciones. */
export interface CargaTransaccionesDeps {
  setFinanzas: React.Dispatch<React.SetStateAction<ResumenFinancieroAlumnoDTO | null>>;
  setPaginaTx: React.Dispatch<React.SetStateAction<number>>;
  cargarTransacciones: (pagina: number, tamano: number, reintento?: boolean) => Promise<void>;
}

/** Lo que la carga inicial necesita del dominio de sesiones/entrenamiento. */
export interface CargaSesionesDeps {
  setUltimaSesion: React.Dispatch<React.SetStateAction<SesionEntrenamientoDetalleDTO | null>>;
  setPaginaHistorial: React.Dispatch<React.SetStateAction<number>>;
  cargarHistorial: (pagina: number, tamano: number, reintento?: boolean) => Promise<void>;
}

/** Lo que la carga inicial necesita del dominio antropométrico. */
export interface CargaControlesDeps {
  setControlesDemo: React.Dispatch<React.SetStateAction<ControlAntroFila[]>>;
  setControlesTotal: React.Dispatch<React.SetStateAction<number>>;
  setControlesAntro: React.Dispatch<React.SetStateAction<ControlAntroFila[]>>;
  setControlesErrorMsg: React.Dispatch<React.SetStateAction<string | null>>;
  setPaginaControles: React.Dispatch<React.SetStateAction<number>>;
  invalidarTotalControles: () => void;
  cargarControles: (
    pagina: number,
    tamano: number,
    usuarioId: string,
    reintento?: boolean
  ) => Promise<boolean>;
}

/** Lo que la carga inicial necesita del dominio de rutina/catálogo. */
export interface CargaRutinaDeps {
  setEjerciciosCatalogo: React.Dispatch<React.SetStateAction<EjercicioCatalogoDetalleDTO[]>>;
  setRutinaSemanal: React.Dispatch<React.SetStateAction<BloqueDiaRutinaDTO[]>>;
}

export interface ParametrosExpediente {
  alumnoId: string | undefined;
  isDemoMode: boolean;
  tamanoHistorial: number;
  tamanoTx: number;
  tamanoControles: number;
  plan: RetornoPlanSuscripcion;
  transacciones: CargaTransaccionesDeps;
  sesiones: CargaSesionesDeps;
  controles: CargaControlesDeps;
  rutina: CargaRutinaDeps;
}

export function useExpedienteAlumno({
  alumnoId,
  isDemoMode,
  tamanoHistorial,
  tamanoTx,
  tamanoControles,
  plan,
  transacciones,
  sesiones,
  controles,
  rutina,
}: ParametrosExpediente) {
  const [alumno, setAlumno] = useState<PerfilAlumnoDetalleDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Personal / Medical Form State
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(TipoDocumento.V);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [telefonoWhatsapp, setTelefonoWhatsapp] = useState('');
  const [modalidad, setModalidad] = useState<Modalidad>(Modalidad.PRESENCIAL);
  const [fichaSaludPrivada, setFichaSaludPrivada] = useState('');

  // RF-003 RN-01 (WU RF-003b): calendario antropométrico configurable del alumno. Vive en el tab
  // Antropometría (no en el formulario del expediente) porque es un ajuste del control de medidas;
  // se persiste con un PATCH parcial a `/alumnos/:id` sin tocar el resto de la ficha.
  const [periodicidadAntropometria, setPeriodicidadAntropometria] = useState<
    PeriodicidadAntropometria | ''
  >('');
  const [antropometriaInicio, setAntropometriaInicio] = useState('');

  const [planesCatalogo, setPlanesCatalogo] = useState<PlanMembresiaDetalleDTO[]>([]);

  const hidratarFormulario = (perfil: PerfilAlumnoDetalleDTO) => {
    setNombres(perfil.nombres);
    setApellidos(perfil.apellidos);
    setTipoDocumento(perfil.tipoDocumento);
    setNumeroDocumento(perfil.numeroDocumento);
    setFechaNacimiento(perfil.fechaNacimiento);
    setTelefonoWhatsapp(perfil.telefonoWhatsapp);
    setModalidad(perfil.modalidad);
    setFichaSaludPrivada(perfil.fichaSaludPrivada || '');
    setPeriodicidadAntropometria(perfil.periodicidadAntropometria ?? '');
    setAntropometriaInicio(perfil.antropometriaInicio ?? '');
  };

  const cargarExpediente = async () => {
    if (!alumnoId) return;
    setIsLoading(true);
    setError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): fixtures locales y cero llamadas contra la API real.
    // Los datos de ejemplo SOLO pueden mostrarse con la bandera activa (banner global visible).
    if (isDemoMode) {
      const demoPerfil = crearPerfilDemoAlumno(alumnoId);
      setAlumno(demoPerfil);
      hidratarFormulario(demoPerfil);
      plan.setSelectedPlanId(demoPerfil.planActivoId || '');
      plan.setSuscripcion(crearSuscripcionDemoAlumno());
      plan.setSuscripcionError(null);
      plan.setPrecioOverride('35.00');
      plan.setTasaFijadaOverride('65.0000');
      plan.setOverridesAlumno(crearOverridesDemoAlumno());
      plan.setOverrideError(null);

      transacciones.setFinanzas(crearFinanzasDemoAlumno(alumnoId));
      void transacciones.cargarTransacciones(1, tamanoTx);

      setPlanesCatalogo(crearPlanesDemo());

      // WU15: historial demo enriquecido y relativo a hoy (mismo fixture que el modal del
      // monitor, en `lib/demo-sesiones.ts`), para que la ficha muestre series, cargas y tiempos.
      const demoHistorial = sesionesDemoAlumno(alumnoId);
      sesiones.setUltimaSesion(demoHistorial.find((sesion) => esSesionRealizada(sesion)) ?? null);
      // WU25b: cada listado paginado arranca en la página 1 con el slice del fixture.
      sesiones.setPaginaHistorial(1);
      transacciones.setPaginaTx(1);
      controles.setPaginaControles(1);
      controles.invalidarTotalControles();
      void sesiones.cargarHistorial(1, tamanoHistorial);

      rutina.setEjerciciosCatalogo(crearCatalogoDemo());
      rutina.setRutinaSemanal(crearRutinaDemoAlumno());

      const demoControles = controlesDemoAlumno();
      controles.setControlesDemo(demoControles);
      controles.setControlesTotal(demoControles.length);
      controles.setControlesAntro(rebanarPagina(demoControles, 1, tamanoControles));
      controles.setControlesErrorMsg(null);

      setIsLoading(false);
      return;
    }

    try {
      // 1. Perfil del Alumno — sin perfil real no hay expediente: error honesto con reintento.
      const perfilRes = await apiClient<PerfilAlumnoDetalleDTO>(`/alumnos/${alumnoId}`).catch(
        () => null
      );

      if (!perfilRes) {
        setError(
          'No se pudo cargar el expediente del alumno. Revisa tu conexión e inténtalo de nuevo.'
        );
        return;
      }

      setAlumno(perfilRes);
      hidratarFormulario(perfilRes);
      plan.setTasaFijadaOverride(perfilRes.tasaFijadaOverride || '');

      // WU25b: cada listado paginado arranca en la página 1 y el total cacheado de controles se
      // invalida (el expediente puede haber cambiado entre cargas).
      sesiones.setPaginaHistorial(1);
      transacciones.setPaginaTx(1);
      controles.setPaginaControles(1);
      controles.invalidarTotalControles();

      // 2. WU25b: historial financiero paginado con `txLimit`/`txOffset`; la respuesta trae el
      // resumen completo y la página 1 de transacciones (un fallo deja el aviso de la pestaña,
      // nunca cifras inventadas).
      await transacciones.cargarTransacciones(1, tamanoTx);

      // 3. Catálogo de planes (vacío real = sin planes, nunca planes inventados)
      const planesRes = await apiClient<PlanMembresiaDetalleDTO[]>('/finanzas/planes').catch(
        () => []
      );
      setPlanesCatalogo(Array.isArray(planesRes) ? planesRes : []);

      // 3b. WU-J (RF-005): override vigente real del alumno (precio/tasa pactados).
      const overridesCargados = await plan.cargarOverrides(perfilRes.usuarioId);

      // 3c. M5-L1B: plan asignado (suscripción). El selector parte de ella, nunca del plan
      // deducido del override: así guardar el expediente no asigna un plan sin querer.
      await plan.cargarSuscripcion(perfilRes.usuarioId, overridesCargados, perfilRes.zonaHoraria);

      // 4. Última sesión: sin dato => sin tarjeta de "último entrenamiento" (nunca fabricada).
      const sesionRes = await apiClient<SesionEntrenamientoDetalleDTO>(
        `/sesiones/alumno/${alumnoId}/ultima`
      ).catch(() => null);
      sesiones.setUltimaSesion(sesionRes ?? null);

      // 5. WU25b: historial de sesiones paginado (envelope `{ items, total, limit, offset }`);
      // la página 1 son las sesiones más recientes y el total es el COUNT real del alumno.
      await sesiones.cargarHistorial(1, tamanoHistorial);

      // 6. Catálogo de ejercicios (vacío real => estado vacío explícito en el modal)
      const catalogoRes = await apiClient<EjercicioCatalogoDetalleDTO[]>(
        '/ejercicios/catalogo'
      ).catch(() => []);
      rutina.setEjerciciosCatalogo(Array.isArray(catalogoRes) ? catalogoRes : []);

      // 7. Rutina semanal activa persistida (sin rutina => estado vacío honesto)
      const rutinaActivaRes = await apiClient<RutinaSemanalDetalleDTO>(
        `/rutinas/alumno/${alumnoId}/activa`
      ).catch(() => null);
      rutina.setRutinaSemanal(
        rutinaActivaRes &&
          Array.isArray(rutinaActivaRes.bloques) &&
          rutinaActivaRes.bloques.length > 0
          ? rutinaActivaRes.bloques
          : []
      );

      // 8. N3/WU25b: controles antropométricos reales paginados (la página 1 son los más
      // recientes); un fallo muestra aviso visible, nunca una tabla vacía pasando por
      // "sin registros".
      await controles.cargarControles(1, tamanoControles, perfilRes.usuarioId);
    } catch {
      setError('Error al cargar la información del alumno.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void cargarExpediente();
    // La recarga sigue a `alumnoId`/`isDemoMode` como en la vista original.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoId, isDemoMode]);

  return {
    alumno,
    setAlumno,
    isLoading,
    error,
    formulario: {
      nombres,
      apellidos,
      tipoDocumento,
      numeroDocumento,
      fechaNacimiento,
      telefonoWhatsapp,
      modalidad,
      fichaSaludPrivada,
      setNombres,
      setApellidos,
      setTipoDocumento,
      setNumeroDocumento,
      setFechaNacimiento,
      setTelefonoWhatsapp,
      setModalidad,
      setFichaSaludPrivada,
    },
    periodicidadAntropometria,
    antropometriaInicio,
    setPeriodicidadAntropometria,
    setAntropometriaInicio,
    planesCatalogo,
    recargarExpediente: cargarExpediente,
  };
}

export type RetornoExpediente = ReturnType<typeof useExpedienteAlumno>;
