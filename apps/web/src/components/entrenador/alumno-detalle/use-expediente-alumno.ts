/**
 * Hook del expediente del alumno: perfil, formulario de datos y catálogo de planes,
 * más la orquestación de la carga inicial de la ficha.
 *
 * Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-3). Los fixtures demo viven en
 * `lib/alumno-detalle-demo.ts`.
 *
 * La carga inicial carga primero el perfil (→ usuarioId) y luego los listados en paralelo;
 * cada dominio expone sus setters/cargadores y este hook los invoca. Los tipos de esas
 * dependencias se declaran aquí para que los hooks de dominio los implementen sin ciclos
 * de importación (los hooks de dominio importan estos tipos, nunca al revés).
 *
 * Recarga silenciosa (`recargarExpediente({ silencioso: true })`, tras un cobro): sin spinner ni
 * limpiar `error`. Si falla, conserva los datos y avisa con `plan.notificarAvisoCarga`. El formulario
 * de datos personales y de ficha de salud solo se rehidrata si NO está modificado (el calendario, igual).
 * El borrador de "Plan y tarifa" (plan, precio, tasa, fecha de inicio) NO está protegido: se rehidrata
 * desde el servidor en cada recarga (límite conocido, RF-011).
 *
 * Avisos por fallos silenciosos (también en la carga inicial): catálogo de planes y última sesión
 * (un 404 de última sesión = sin sesiones, sin aviso). La rutina distingue "sin rutina" (estado
 * vacío) de un fallo real (`errorRutina` con reintento).
 */
import { useEffect, useRef, useState } from 'react';
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
import { cargarListadosExpediente } from './cargar-listados-expediente';
import {
  datosPersonalesModificados,
  formularioModificado,
  MENSAJE_FICHA_DESACTUALIZADA,
  type ValoresFormularioExpediente,
} from './expediente-formulario';

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
  setErrorRutina: React.Dispatch<React.SetStateAction<string | null>>;
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

  // Valores VIGENTES (se refrescan en cada render) para decidir la rehidratación tras los `await`.
  const valoresFormulario: ValoresFormularioExpediente = {
    nombres, apellidos, tipoDocumento, numeroDocumento, fechaNacimiento, telefonoWhatsapp,
    modalidad, fichaSaludPrivada, periodicidadAntropometria, antropometriaInicio,
  };
  // Aviso de cambios sin guardar: solo los datos personales (el calendario se guarda aparte).
  const hayCambiosSinGuardar = alumno
    ? datosPersonalesModificados(alumno, valoresFormulario)
    : false;
  const formularioRef = useRef(valoresFormulario);
  formularioRef.current = valoresFormulario;
  const alumnoRef = useRef(alumno);
  alumnoRef.current = alumno;
  // Generación de la carga: una respuesta de una recarga ya superada no aplica su estado.
  const cargaIdRef = useRef(0);

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

  const cargarExpediente = async (opciones?: { silencioso?: boolean }) => {
    if (!alumnoId) return;
    const silencioso = opciones?.silencioso === true;
    const cargaId = ++cargaIdRef.current;
    const vigente = () => cargaId === cargaIdRef.current;
    plan.limpiarAvisoCarga();
    if (!silencioso) {
      setIsLoading(true);
      setError(null);
    }

    // MODO DEMO EXPLÍCITO (isDemoMode): fixtures locales y cero llamadas contra la API real.
    // Los datos de ejemplo SOLO pueden mostrarse con la bandera activa (banner global visible).
    if (isDemoMode) {
      const demoPerfil = crearPerfilDemoAlumno(alumnoId);
      const modificado = formularioModificado(alumnoRef.current, formularioRef.current);
      setAlumno(demoPerfil);
      if (!silencioso || !modificado) hidratarFormulario(demoPerfil);
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
      rutina.setErrorRutina(null);
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
      if (!vigente()) return;

      if (!perfilRes) {
        if (silencioso) {
          plan.notificarAvisoCarga(MENSAJE_FICHA_DESACTUALIZADA);
        } else {
          setError(
            'No se pudo cargar el expediente del alumno. Revisa tu conexión e inténtalo de nuevo.'
          );
        }
        return;
      }

      // Recarga silenciosa: el formulario solo se rehidrata si no hay cambios sin guardar. Se mira
      // ANTES de `setAlumno`, sobre la foto del último render confirmado.
      const modificado = formularioModificado(alumnoRef.current, formularioRef.current);
      setAlumno(perfilRes);
      if (!silencioso || !modificado) hidratarFormulario(perfilRes);
      plan.setTasaFijadaOverride(perfilRes.tasaFijadaOverride || '');

      // WU25b: cada listado paginado arranca en la página 1 y el total cacheado de controles se
      // invalida (el expediente puede haber cambiado entre cargas).
      sesiones.setPaginaHistorial(1);
      transacciones.setPaginaTx(1);
      controles.setPaginaControles(1);
      controles.invalidarTotalControles();

      // Pasos 2-8 en PARALELO tras el perfil (ver `cargar-listados-expediente.ts`). `isLoading` baja
      // en el `finally` cuando TODAS terminan; si alguna rechazara, se relanza al `catch` externo.
      await cargarListadosExpediente({
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
      });
    } catch {
      if (silencioso) {
        plan.notificarAvisoCarga(MENSAJE_FICHA_DESACTUALIZADA);
      } else {
        setError('Error al cargar la información del alumno.');
      }
    } finally {
      if (vigente()) setIsLoading(false);
    }
  };

  useEffect(() => {
    void cargarExpediente();
    // La recarga sigue a `alumnoId`/`isDemoMode` como en la vista original.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumnoId, isDemoMode]);

  /** Zona horaria guardada desde Perfil: solo si la ficha abierta sigue siendo ese perfil. */
  const actualizarZonaHoraria = (perfilId: string, zonaHoraria: string) => {
    setAlumno((prev) => (prev && prev.id === perfilId ? { ...prev, zonaHoraria } : prev));
  };

  return {
    alumno,
    setAlumno,
    actualizarZonaHoraria,
    hayCambiosSinGuardar,
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
