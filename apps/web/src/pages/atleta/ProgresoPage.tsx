import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient, resolverUrlApi } from '../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../lib/acceso-alumno';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import {
  construirPayloadCheckinAntropometrico,
  fechaLocalHoy,
  obtenerUltimaMedicionReal,
  validarMedidasCheckinAntropometrico,
  type CampoMedidaCheckinAntropometrico,
} from '../../lib/antropometria-checkin';
import { calcularEstadoVentanaCheckinAntropometrico } from '../../lib/antropometria-ventana';
import {
  contextoDemoAntropometria,
  ESCENARIOS_DEMO_ANTROPOMETRIA,
  ETIQUETAS_ESCENARIO_DEMO_ANTROPOMETRIA,
  type EscenarioDemoAntropometria,
} from '../../lib/demo-antropometria';
import { fechaCalendarioLocal, formatFechaCalendario } from '../../lib/date-format';
import { crearEvolucionDemo } from '../../lib/demo-evolucion';
import { etiquetaAngulo } from '../../lib/comparador-fotos';
import {
  etiquetaEstadoMedicion,
  etiquetaOrigenAntropometria,
} from '../../lib/etiquetas-dominio';
import type { TonoSemaforo } from '../../lib/adherencia';
import { GraficoEvolucion } from '../../components/common/GraficoEvolucion';
import { VisorFoto } from '../../components/common/VisorFoto';
import {
  AuthUserDTO,
  EvolucionCorporalDTO,
  ControlAntropometricoDetalleDTO,
  FotoAntropometriaDetalleDTO,
  type FotoAntropometriaInputDTO,
  Modalidad,
} from '@guachafit/shared';
import { SelectorFotosCheckin } from '../../components/antropometria/SelectorFotosCheckin';
import {
  TrendingUp,
  Camera,
  Scale,
  Calendar,
  CheckCircle2,
  Lock,
  Plus,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  ArrowUpRight,
  AlertTriangle,
  Eye,
  Images,
  ImageOff,
  CalendarClock,
  CalendarX,
  ShieldCheck,
} from 'lucide-react';

/** Clases del badge de estado del control antropométrico por tono semántico (DESIGN.md). */
const CLASES_BADGE_ESTADO_MEDICION: Record<TonoSemaforo, string> = {
  success: 'bg-success/15 text-success border-success/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
  danger: 'bg-destructive/15 text-destructive border-destructive/20',
  info: 'bg-info/15 text-info border-info/20',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

/** Clases base de los inputs de medida (foco y tipografía mono de datos, DESIGN.md). */
const CLASES_INPUT_MEDIDA =
  'w-full px-3.5 py-2.5 rounded-2xl bg-background border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary';

export function ProgresoPage() {
  const { user, isDemoMode } = useAuth();
  const [evolucion, setEvolucion] = useState<EvolucionCorporalDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // D2: fallo de carga honesto (sin evolución demo fuera del modo demo).
  const [error, setError] = useState<string | null>(null);
  // D5: fallo de envío visible; el check-in no se declara exitoso si el server no lo aceptó.
  const [submitError, setSubmitError] = useState<string | null>(null);
  // RF-012: alumno pausado no puede enviar el check-in remoto; el panel informativo lo declara.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);
  // RF-004: visor accesible de una foto de progreso (Escape y trampa de foco en `VisorFoto`).
  const [fotoVisor, setFotoVisor] = useState<{
    foto: FotoAntropometriaDetalleDTO;
    fecha: string;
  } | null>(null);
  // Miniaturas cuyo enlace temporal falló: se rotulan en vez de dejar una imagen rota.
  const [fotosConError, setFotosConError] = useState<string[]>([]);

  // U4: URL del GET de evolución, para datar la copia cacheada cuando no hay conexión.
  const urlEvolucion = user?.id ? resolverUrlApi(`/antropometria/evolucion/${user.id}`) : null;

  // Progressive Disclosure: 'hub' (selector) | 'nuevo' | 'evolucion'
  const [vistaActiva, setVistaActiva] = useState<'hub' | 'nuevo' | 'evolucion'>('hub');

  /**
   * RF-003 RN-03/RN-04 (WU RF-003b): sesión fresca de `/auth/me`. La modalidad y el calendario
   * antropométrico se re-resuelven del perfil para que un cambio del coach se refleje sin esperar
   * la rotación del token. Si la consulta falla se conserva el snapshot del login (dato real) y
   * sin calendario la ventana no aplica, igual que en el servidor.
   */
  const [sesionFresca, setSesionFresca] = useState<AuthUserDTO | null>(null);
  // Escenario demo conmutable (solo con isDemoMode): remoto en ventana / fuera / presencial.
  const [escenarioDemo, setEscenarioDemo] =
    useState<EscenarioDemoAntropometria>('remoto-ventana');
  // Mensaje real del 403 del servidor si la modalidad cambió y el formulario ya no es válido.
  const [accesoPresencialServidor, setAccesoPresencialServidor] = useState<string | null>(null);

  // Form for remote athlete check-in.
  // D6: en sesión real los campos arrancan VACÍOS (los fixtures solo viven tras isDemoMode);
  // al abrir el formulario se precargan con la última medición real de la evolución cargada.
  const [pesoKg, setPesoKg] = useState(() => (isDemoMode ? '74.50' : ''));
  const [porcentajeGrasa, setPorcentajeGrasa] = useState(() => (isDemoMode ? '14.80' : ''));
  const [cinturaCm, setCinturaCm] = useState(() => (isDemoMode ? '81.00' : ''));
  // RN-02: brazo relajado (el alias legado `brazoCm` se resuelve en el helper del payload).
  const [brazoRelajadoCm, setBrazoRelajadoCm] = useState(() => (isDemoMode ? '37.50' : ''));
  const [brazoContraidoCm, setBrazoContraidoCm] = useState(() => (isDemoMode ? '40.10' : ''));
  const [musloMedioCm, setMusloMedioCm] = useState(() => (isDemoMode ? '58.20' : ''));
  const [tricepsMm, setTricepsMm] = useState(() => (isDemoMode ? '12.00' : ''));
  const [subescapularMm, setSubescapularMm] = useState(() => (isDemoMode ? '11.50' : ''));
  const [suprailiacoMm, setSuprailiacoMm] = useState(() => (isDemoMode ? '9.80' : ''));
  const [abdominalMm, setAbdominalMm] = useState(() => (isDemoMode ? '14.20' : ''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  // RF-003 RN-02: fotos del check-in (opcionales). `claveFotos` vuelve a montar el selector vacío.
  const [fotosCheckin, setFotosCheckin] = useState<{
    fotos: FotoAntropometriaInputDTO[];
    subiendo: boolean;
  }>({ fotos: [], subiendo: false });
  const [claveFotos, setClaveFotos] = useState(0);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  // Validación inline: los mensajes por campo se muestran al escribir o tras intentar enviar.
  const [intentoEnvio, setIntentoEnvio] = useState(false);

  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setSesionFresca(null);
      return;
    }
    let cancelado = false;
    apiClient<{ usuario: AuthUserDTO }>('/auth/me')
      .then((respuesta) => {
        if (!cancelado) setSesionFresca(respuesta?.usuario ?? null);
      })
      .catch(() => {
        // Best-effort: el snapshot del login sigue siendo dato real y el servidor es la red de
        // seguridad (403 presencial / 400 de ventana). No se fabrica estado.
        if (!cancelado) setSesionFresca(null);
      });
    return () => {
      cancelado = true;
    };
  }, [isDemoMode, user?.id]);

  /**
   * Contexto antropométrico efectivo del alumno:
   * - Demo: lo define el escenario conmutable (fixture relativo a hoy).
   * - Real: `/auth/me` (perfil fresco) con el snapshot del login como respaldo.
   */
  const contextoAntropometrico = useMemo(() => {
    if (isDemoMode) return contextoDemoAntropometria(escenarioDemo);
    return {
      modalidad: sesionFresca?.modalidad ?? user?.modalidad ?? null,
      periodicidadAntropometria: sesionFresca?.periodicidadAntropometria ?? null,
      antropometriaInicio: sesionFresca?.antropometriaInicio ?? null,
    };
  }, [isDemoMode, escenarioDemo, sesionFresca, user?.modalidad]);

  /** RN-03: con modalidad presencial el alumno tiene solo lectura (el servidor responde 403). */
  const esSoloLectura = contextoAntropometrico.modalidad === Modalidad.PRESENCIAL;

  /** RN-04/§6: estado del calendario y de la ventana de check-in en el día local. */
  const estadoVentana = useMemo(
    () =>
      calcularEstadoVentanaCheckinAntropometrico({
        periodicidad: contextoAntropometrico.periodicidadAntropometria,
        antropometriaInicio: contextoAntropometrico.antropometriaInicio,
        hoyLocal: fechaCalendarioLocal(),
      }),
    [contextoAntropometrico]
  );

  /** Motivo por el que el registro remoto no está disponible ahora mismo (o null). */
  const motivoRegistroBloqueado = esSoloLectura
    ? 'Tus medidas las registra tu entrenador en sala.'
    : estadoVentana.permiteRegistrar
      ? null
      : estadoVentana.motivoBloqueo;

  const erroresMedidas = useMemo(
    () =>
      validarMedidasCheckinAntropometrico(user?.id ?? '', {
        pesoKg,
        porcentajeGrasa,
        cinturaCm,
        brazoRelajadoCm,
        brazoContraidoCm,
        musloMedioCm,
        tricepsMm,
        subescapularMm,
        suprailiacoMm,
        abdominalMm,
      }),
    [
      user?.id,
      pesoKg,
      porcentajeGrasa,
      cinturaCm,
      brazoRelajadoCm,
      brazoContraidoCm,
      musloMedioCm,
      tricepsMm,
      subescapularMm,
      suprailiacoMm,
      abdominalMm,
    ]
  );

  /**
   * Error inline de un campo: se muestra si el campo ya tiene texto (el usuario está escribiendo)
   * o si ya se intentó enviar. Nunca se pinta un error sobre un campo vacío opcional.
   */
  const errorInline = (campo: CampoMedidaCheckinAntropometrico, valor: string) => {
    const mensaje = erroresMedidas[campo];
    if (!mensaje) return null;
    if (!intentoEnvio && valor.trim() === '') return null;
    return (
      <p role="alert" className="text-[11px] font-semibold text-destructive">
        {mensaje}
      </p>
    );
  };

  /**
   * Abre el formulario de check-in. En sesión real precarga la última medición real disponible
   * (sin pisar lo que el alumno ya haya escrito); sin evolución, los campos quedan vacíos.
   * Con la ventana cerrada o en solo lectura no se abre: el botón queda deshabilitado con motivo.
   */
  const abrirFormularioCheckin = () => {
    if (esSoloLectura || !estadoVentana.permiteRegistrar) return;
    if (!isDemoMode) {
      const ultima = obtenerUltimaMedicionReal(evolucion);
      if (ultima) {
        setPesoKg((prev) => prev || ultima.pesoKg);
        setPorcentajeGrasa((prev) => prev || ultima.porcentajeGrasa);
        setCinturaCm((prev) => prev || ultima.cinturaCm);
        setBrazoRelajadoCm((prev) => prev || ultima.brazoRelajadoCm);
        setBrazoContraidoCm((prev) => prev || ultima.brazoContraidoCm);
        setMusloMedioCm((prev) => prev || ultima.musloMedioCm);
        setTricepsMm((prev) => prev || ultima.tricepsMm);
        setSubescapularMm((prev) => prev || ultima.subescapularMm);
        setSuprailiacoMm((prev) => prev || ultima.suprailiacoMm);
        setAbdominalMm((prev) => prev || ultima.abdominalMm);
      }
    }
    setIntentoEnvio(false);
    setVistaActiva('nuevo');
  };

  const cargarEvolucion = async () => {
    setIsLoading(true);
    setError(null);
    // Al recargar la serie se obtienen enlaces presignados nuevos: las miniaturas que habían
    // fallado vuelven a intentar (no quedan marcadas "Sin imagen" para siempre).
    setFotosConError([]);

    // MODO DEMO EXPLÍCITO (isDemoMode): evolución de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setEvolucion(crearEvolucionDemo(user?.id || 'demo-alumno'));
      setIsLoading(false);
      return;
    }

    try {
      if (!user?.id) {
        setEvolucion(null);
        return;
      }
      const data = await apiClient<EvolucionCorporalDTO>(`/antropometria/evolucion/${user.id}`);
      setEvolucion(data);
    } catch (err: any) {
      // D2: sin evolución demo en sesión real; error visible con reintento.
      setEvolucion(null);
      setError(
        err?.message || 'No se pudo cargar tu evolución corporal. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    cargarEvolucion();
  }, [user, isDemoMode]);

  const handleSubmitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      setSubmitError('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
      return;
    }
    // Defensa en profundidad: la ventana y el solo lectura se validan antes de llamar a la API.
    if (esSoloLectura) {
      setSubmitError('Tus medidas las registra tu entrenador en sala: no puedes enviar el check-in.');
      return;
    }
    if (!estadoVentana.permiteRegistrar) {
      setSubmitError(
        estadoVentana.motivoBloqueo ??
          'Tu check-in está fuera de la ventana activa. Contacta a tu entrenador.'
      );
      return;
    }
    if (fotosCheckin.subiendo) {
      setSubmitError('Espera a que terminen de subirse las fotos.');
      return;
    }
    setIntentoEnvio(true);
    if (Object.keys(erroresMedidas).length > 0) {
      setSubmitError('Revisa los campos marcados antes de enviar tu check-in.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Endpoint real (POST /antropometria/checkin, rol ALUMNO): exige `alumnoId` (usuarioId)
      // y `fechaEvaluacion` (YYYY-MM-DD local). El helper valida contra el contrato compartido
      // para que un valor fuera de rango nunca se traduzca en un 400 opaco del servidor.
      const payload = construirPayloadCheckinAntropometrico(user.id, {
        pesoKg,
        porcentajeGrasa,
        cinturaCm,
        brazoRelajadoCm,
        brazoContraidoCm,
        musloMedioCm,
        tricepsMm,
        subescapularMm,
        suprailiacoMm,
        abdominalMm,
      }, fechaLocalHoy(), fotosCheckin.fotos);
      await apiClient<ControlAntropometricoDetalleDTO>('/antropometria/checkin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Refresco real (sin tirar el estado de éxito): el check-in remoto queda PENDIENTE de
      // aprobación, así que la curva de evolución puede no cambiar todavía; se re-consulta
      // igualmente para no mostrar datos obsoletos si el coach ya aprobó otros controles.
      const evolucionActualizada = await apiClient<EvolucionCorporalDTO>(
        `/antropometria/evolucion/${user.id}`
      ).catch(() => null);
      if (evolucionActualizada) setEvolucion(evolucionActualizada);

      setClaveFotos((clave) => clave + 1);
      setSubmitSuccess(true);
      setTimeout(() => {
        setSubmitSuccess(false);
        setVistaActiva('evolucion');
      }, 1800);
    } catch (err: any) {
      // RF-012: bloqueo de ciclo de vida (pausado) → panel informativo; el historial sigue visible.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        setSubmitError(null);
        return;
      }
      // RN-03: si el perfil cambió a presencial después de cargar la página, el 403 del servidor
      // se muestra tal cual y la vista pasa al estado de solo lectura (nunca un error genérico).
      if (err?.status === 403) {
        setAccesoPresencialServidor(
          err?.message ||
            'Los alumnos en modalidad presencial no registran sus propias medidas: las toma tu entrenador y quedan verificadas.'
        );
        setSubmitError(null);
        return;
      }
      // D5: sin éxito falso; el check-in solo queda enviado si el servidor lo aceptó (2xx).
      setSubmitError(
        err?.message || 'No se pudo enviar tu check-in. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  /** RN-03: panel de solo lectura del alumno presencial (con acceso a su historial/evolución). */
  const panelSoloLectura = (mensajeServidor?: string | null) => (
    <div className="p-6 rounded-3xl bg-card border border-primary/30 shadow-md space-y-3">
      <div className="flex items-start gap-3">
        <div className="p-3 rounded-2xl bg-primary/15 text-primary shrink-0">
          <Lock className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-foreground">
            Tus medidas las registra tu entrenador
          </h3>
          <p className="text-xs text-muted-foreground">
            En modalidad presencial tus medidas se toman en sala y quedan verificadas por tu
            entrenador. Puedes consultar tu historial y tu evolución cuando quieras.
          </p>
          {mensajeServidor && (
            <p
              role="alert"
              className="text-[11px] font-semibold text-warning flex items-start gap-1.5 pt-1"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{mensajeServidor}</span>
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVistaActiva('evolucion')}
        className="w-full min-h-11 py-3 px-4 rounded-2xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
      >
        <TrendingUp className="h-4 w-4 text-primary" />
        <span>Ver mi historial y evolución</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12 animate-in fade-in duration-200">
      {/* Cabecera Principal */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Scale className="h-3.5 w-3.5" />
            <span>Fisiología y Métricas</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-0.5">
            Mi Progreso Físico
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Registro de medidas corporales y evolución física a lo largo del tiempo.
          </p>
        </div>
      </div>

      {/* U4: evolución servida desde la caché del SW (sin conexión), con su antigüedad. */}
      {!isDemoMode && evolucion && <AvisoDatosOffline url={urlEvolucion} />}

      {/* DEMO (solo isDemoMode): escenarios conmutables para ejercitar RN-03/RN-04 sin red. */}
      {isDemoMode && (
        <div className="p-4 rounded-3xl bg-secondary/40 border border-border space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Escenario demo (datos sintéticos)
          </span>
          <div className="flex flex-wrap gap-2">
            {ESCENARIOS_DEMO_ANTROPOMETRIA.map((escenario) => {
              const activo = escenarioDemo === escenario;
              return (
                <button
                  key={escenario}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => {
                    setEscenarioDemo(escenario);
                    setVistaActiva('hub');
                    setSubmitError(null);
                    setAccesoPresencialServidor(null);
                  }}
                  className={`min-h-11 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
                    activo
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:text-foreground'
                  }`}
                >
                  {ETIQUETAS_ESCENARIO_DEMO_ANTROPOMETRIA[escenario]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* D2: error de carga honesto con reintento (sin evolución demo fuera del modo demo) */}
      {error && (
        <div className="p-5 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertTriangle className="h-7 w-7 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => cargarEvolucion()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* RF-012: aviso de bloqueo del check-in remoto (el historial sigue en modo lectura) */}
      {bloqueo && !isDemoMode && (
        <BloqueoAlumnoPanel
          bloqueo={bloqueo}
          onReintentar={() => setBloqueo(null)}
          className="max-w-none"
        />
      )}

      {/* RN-04/§6: estado visible de la ventana de check-in (solo alumnos remotos con calendario) */}
      {!esSoloLectura && estadoVentana.aplica && (
        <div
          role="status"
          className={`p-4 rounded-3xl border text-xs font-semibold flex items-start gap-2.5 ${
            estadoVentana.estado === 'abierta'
              ? 'bg-success/10 border-success/30 text-success'
              : estadoVentana.estado === 'cerrada'
                ? 'bg-warning/10 border-warning/30 text-warning'
                : 'bg-info/10 border-info/30 text-info'
          }`}
        >
          {estadoVentana.estado === 'abierta' ? (
            <CalendarClock className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <CalendarX className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{estadoVentana.mensaje}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: HUB PRINCIPAL (Selector de 2 Caminos)                             */}
      {/* ========================================================================= */}
      {vistaActiva === 'hub' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          {/* Tarjeta de Métricas Netas */}
          {evolucion && (
            <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-3">
              <span className="text-xs font-bold text-primary uppercase tracking-wider block">
                Resumen de Evolución
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Cambio de Peso
                  </span>
                  <p className="text-xl font-black font-mono text-success mt-0.5">
                    {evolucion.cambioNetoPesoKg} kg
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Grasa Corporal
                  </span>
                  <p className="text-xl font-black font-mono text-success mt-0.5">
                    {evolucion.cambioNetoGrasaPorcentaje}%
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Evaluaciones
                  </span>
                  <p className="text-xl font-black font-mono text-foreground mt-0.5">
                    {evolucion.totalEvaluaciones} aprobadas
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Selector de Acciones */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
              Selecciona qué deseas hacer:
            </h2>

            {/* Opción A: Actualizar Medidas — solo lectura (presencial) o ventana cerrada */}
            {esSoloLectura || accesoPresencialServidor ? (
              panelSoloLectura(accesoPresencialServidor)
            ) : estadoVentana.permiteRegistrar ? (
              <div
                onClick={abrirFormularioCheckin}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && abrirFormularioCheckin()}
                className="group p-5 rounded-3xl bg-gradient-to-br from-card to-info/10 border-2 border-info/30 hover:border-info/70 transition-all duration-200 cursor-pointer shadow-md hover:shadow-info/5 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3.5 rounded-2xl bg-info text-info-foreground shadow-md shadow-info/20">
                      <Camera className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground group-hover:text-info transition-colors flex items-center gap-1.5">
                        Actualizar mis medidas y fotos
                        <ArrowUpRight className="h-4 w-4 text-info opacity-80" />
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                        Registra tu peso actual, perímetros de cintura o brazo y envía tu check-in al coach.
                      </p>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-info group-hover:bg-info/15 transition-colors">
                    <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            ) : (
              <div
                aria-disabled="true"
                className="p-5 rounded-3xl bg-card border border-border/60 opacity-80"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <div className="p-3.5 rounded-2xl bg-secondary text-muted-foreground">
                      <CalendarX className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-foreground">
                        Actualizar mis medidas y fotos
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                        {estadoVentana.motivoBloqueo ??
                          'Tu check-in está fuera de la ventana activa.'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-warning/15 text-warning border border-warning/25 uppercase shrink-0">
                    Cerrada
                  </span>
                </div>
              </div>
            )}

            {/* Opción B: Ver Evolución e Historial */}
            <div
              onClick={() => setVistaActiva('evolucion')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setVistaActiva('evolucion')}
              className="group p-5 rounded-3xl bg-card/60 hover:bg-card/90 border border-border/80 hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-xs active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 rounded-2xl bg-secondary text-foreground">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                      Ver mi antes y después
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
                      Consulta tu registro cronológico de mediciones corporales y evolución en el tiempo.
                    </p>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-secondary/80 text-foreground group-hover:text-primary transition-colors">
                  <ChevronRight className="h-5 w-5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: FORMULARIO DE CHECK-IN ENFOCADO                                    */}
      {/* ========================================================================= */}
      {vistaActiva === 'nuevo' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <button
              onClick={() => setVistaActiva('hub')}
              className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a opciones de progreso</span>
            </button>
            <span className="text-xs font-semibold text-muted-foreground">Registro de Check-in</span>
          </div>

          {esSoloLectura || accesoPresencialServidor ? (
            panelSoloLectura(accesoPresencialServidor)
          ) : (
            <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">Registro de Medición Corporal</h2>
                <p className="text-xs text-muted-foreground">
                  Tus datos quedarán guardados y asociados a tu historial de evolución.
                </p>
              </div>

              {submitSuccess ? (
                <div className="p-8 text-center space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
                  <h4 className="font-bold text-base text-foreground">¡Mediciones Guardadas!</h4>
                  <p className="text-xs text-muted-foreground">
                    Tus datos fueron enviados a tu entrenador para auditoría y validación.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitCheckin} className="space-y-4" noValidate>
                  {!estadoVentana.permiteRegistrar && (
                    <div
                      role="status"
                      className="p-3.5 rounded-2xl bg-warning/10 border border-warning/30 text-warning text-xs font-bold flex items-start gap-2"
                    >
                      <CalendarX className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {estadoVentana.mensaje ||
                          'Tu check-in está fuera de la ventana activa. Contacta a tu entrenador.'}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground" htmlFor="checkin-peso">
                        Peso (kg)
                      </label>
                      <input
                        id="checkin-peso"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={pesoKg}
                        onChange={(e) => setPesoKg(e.target.value)}
                        aria-invalid={Boolean(erroresMedidas.pesoKg)}
                        className={`${CLASES_INPUT_MEDIDA} ${
                          erroresMedidas.pesoKg ? 'border-destructive' : 'border-border'
                        }`}
                      />
                      {errorInline('pesoKg', pesoKg)}
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground" htmlFor="checkin-grasa">
                        % Grasa estimado
                      </label>
                      <input
                        id="checkin-grasa"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={porcentajeGrasa}
                        onChange={(e) => setPorcentajeGrasa(e.target.value)}
                        aria-invalid={Boolean(erroresMedidas.porcentajeGrasa)}
                        className={`${CLASES_INPUT_MEDIDA} ${
                          erroresMedidas.porcentajeGrasa ? 'border-destructive' : 'border-border'
                        }`}
                      />
                      {errorInline('porcentajeGrasa', porcentajeGrasa)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground" htmlFor="checkin-cintura">
                        Cintura (cm)
                      </label>
                      <input
                        id="checkin-cintura"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={cinturaCm}
                        onChange={(e) => setCinturaCm(e.target.value)}
                        aria-invalid={Boolean(erroresMedidas.cinturaCm)}
                        className={`${CLASES_INPUT_MEDIDA} ${
                          erroresMedidas.cinturaCm ? 'border-destructive' : 'border-border'
                        }`}
                      />
                      {errorInline('cinturaCm', cinturaCm)}
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-semibold text-muted-foreground"
                        htmlFor="checkin-brazo-relajado"
                      >
                        Brazo relajado (cm)
                      </label>
                      <input
                        id="checkin-brazo-relajado"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={brazoRelajadoCm}
                        onChange={(e) => setBrazoRelajadoCm(e.target.value)}
                        aria-invalid={Boolean(erroresMedidas.brazoRelajadoCm)}
                        className={`${CLASES_INPUT_MEDIDA} ${
                          erroresMedidas.brazoRelajadoCm ? 'border-destructive' : 'border-border'
                        }`}
                      />
                      {errorInline('brazoRelajadoCm', brazoRelajadoCm)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-semibold text-muted-foreground"
                        htmlFor="checkin-brazo-contraido"
                      >
                        Brazo contraído (cm)
                      </label>
                      <input
                        id="checkin-brazo-contraido"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={brazoContraidoCm}
                        onChange={(e) => setBrazoContraidoCm(e.target.value)}
                        aria-invalid={Boolean(erroresMedidas.brazoContraidoCm)}
                        className={`${CLASES_INPUT_MEDIDA} ${
                          erroresMedidas.brazoContraidoCm ? 'border-destructive' : 'border-border'
                        }`}
                      />
                      {errorInline('brazoContraidoCm', brazoContraidoCm)}
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="text-xs font-semibold text-muted-foreground"
                        htmlFor="checkin-muslo-medio"
                      >
                        Muslo medio (cm)
                      </label>
                      <input
                        id="checkin-muslo-medio"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={musloMedioCm}
                        onChange={(e) => setMusloMedioCm(e.target.value)}
                        aria-invalid={Boolean(erroresMedidas.musloMedioCm)}
                        className={`${CLASES_INPUT_MEDIDA} ${
                          erroresMedidas.musloMedioCm ? 'border-destructive' : 'border-border'
                        }`}
                      />
                      {errorInline('musloMedioCm', musloMedioCm)}
                    </div>
                  </div>

                  {/* RN-02: pliegues cutáneos (mm), alternativa/complemento del % de grasa. */}
                  <div className="p-4 rounded-2xl bg-secondary/30 border border-border/70 space-y-3">
                    <div>
                      <span className="text-xs font-bold text-foreground block">
                        Pliegues cutáneos (mm) — opcional
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        Si tu coach te los mide, regístralos junto al % de grasa estimado.
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground" htmlFor="checkin-pliegue-triceps">
                          Tríceps (mm)
                        </label>
                        <input
                          id="checkin-pliegue-triceps"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={tricepsMm}
                          onChange={(e) => setTricepsMm(e.target.value)}
                          aria-invalid={Boolean(erroresMedidas.tricepsMm)}
                          className={`${CLASES_INPUT_MEDIDA} ${
                            erroresMedidas.tricepsMm ? 'border-destructive' : 'border-border'
                          }`}
                        />
                        {errorInline('tricepsMm', tricepsMm)}
                      </div>
                      <div className="space-y-1.5">
                        <label
                          className="text-xs font-semibold text-muted-foreground"
                          htmlFor="checkin-pliegue-subescapular"
                        >
                          Subescapular (mm)
                        </label>
                        <input
                          id="checkin-pliegue-subescapular"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={subescapularMm}
                          onChange={(e) => setSubescapularMm(e.target.value)}
                          aria-invalid={Boolean(erroresMedidas.subescapularMm)}
                          className={`${CLASES_INPUT_MEDIDA} ${
                            erroresMedidas.subescapularMm ? 'border-destructive' : 'border-border'
                          }`}
                        />
                        {errorInline('subescapularMm', subescapularMm)}
                      </div>
                      <div className="space-y-1.5">
                        <label
                          className="text-xs font-semibold text-muted-foreground"
                          htmlFor="checkin-pliegue-suprailiaco"
                        >
                          Suprailíaco (mm)
                        </label>
                        <input
                          id="checkin-pliegue-suprailiaco"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={suprailiacoMm}
                          onChange={(e) => setSuprailiacoMm(e.target.value)}
                          aria-invalid={Boolean(erroresMedidas.suprailiacoMm)}
                          className={`${CLASES_INPUT_MEDIDA} ${
                            erroresMedidas.suprailiacoMm ? 'border-destructive' : 'border-border'
                          }`}
                        />
                        {errorInline('suprailiacoMm', suprailiacoMm)}
                      </div>
                      <div className="space-y-1.5">
                        <label
                          className="text-xs font-semibold text-muted-foreground"
                          htmlFor="checkin-pliegue-abdominal"
                        >
                          Abdominal (mm)
                        </label>
                        <input
                          id="checkin-pliegue-abdominal"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={abdominalMm}
                          onChange={(e) => setAbdominalMm(e.target.value)}
                          aria-invalid={Boolean(erroresMedidas.abdominalMm)}
                          className={`${CLASES_INPUT_MEDIDA} ${
                            erroresMedidas.abdominalMm ? 'border-destructive' : 'border-border'
                          }`}
                        />
                        {errorInline('abdominalMm', abdominalMm)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-bold text-foreground">Fotos de progreso (opcionales)</p>
                    {isDemoMode && (
                      <p className="text-[11px] text-muted-foreground">
                        En la demostración no se suben fotos.
                      </p>
                    )}
                    <SelectorFotosCheckin
                      key={claveFotos}
                      alumnoId={user?.id ?? ''}
                      onCambio={setFotosCheckin}
                      deshabilitado={isDemoMode || isSubmitting || !user?.id}
                    />
                  </div>

                  <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/80 text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <Lock className="h-3.5 w-3.5 text-primary" />
                      <span>Revisión de tu coach</span>
                    </div>
                    <p className="text-[11px]">
                      Tu reporte queda registrado como remoto y tu coach lo revisa en su bandeja antes de consolidarlo en tus curvas.
                    </p>
                  </div>

                  {submitError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || fotosCheckin.subiendo || !estadoVentana.permiteRegistrar}
                    className="w-full min-h-11 py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
                  >
                    <span>{isSubmitting ? 'Enviando...' : 'Enviar Evaluación al Coach'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  {!estadoVentana.permiteRegistrar && (
                    <p className="text-[11px] text-muted-foreground text-center">
                      {estadoVentana.motivoBloqueo}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 3: HISTORIAL Y EVOLUCIÓN CRONOLÓGICA                                */}
      {/* ========================================================================= */}
      {vistaActiva === 'evolucion' && (
        <div className="space-y-5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-border/80 pb-3">
            <button
              onClick={() => setVistaActiva('hub')}
              className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a opciones de progreso</span>
            </button>
            {!esSoloLectura && !accesoPresencialServidor && (
              <button
                onClick={abrirFormularioCheckin}
                disabled={!estadoVentana.permiteRegistrar}
                title={motivoRegistroBloqueado ?? undefined}
                className="inline-flex items-center gap-1 min-h-11 px-3 py-1.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Nuevo Check-in</span>
              </button>
            )}
          </div>

          {/* RF-004 RN-01: gráfico multieje con filtros de rango sobre la serie real. */}
          {evolucion && evolucion.evaluaciones.length > 0 && (
            <GraficoEvolucion evaluaciones={evolucion.evaluaciones} />
          )}

          {/* RF-004 RN-02/RN-03: sin fotos adjuntas todavía, vacío honesto (no se simula galería). */}
          {evolucion &&
            evolucion.evaluaciones.length > 0 &&
            evolucion.evaluaciones.every((item) => item.fotos.length === 0) && (
              <div className="p-6 rounded-3xl bg-card border border-dashed border-border text-center space-y-2">
                <Images className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
                <p className="text-xs font-bold text-foreground">Aún no tienes fotos de progreso</p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  Las fotos se adjuntan al registrar tu check-in (frontal, lateral o posterior) y
                  quedan privadas con enlaces temporales.
                </p>
              </div>
            )}

          <div className="space-y-3">
            <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground px-1">
              Registro Histórico Cronológico
            </h3>

            {evolucion?.evaluaciones && evolucion.evaluaciones.length > 0 ? (
              evolucion.evaluaciones.map((item) => {
                const estadoMedicion = etiquetaEstadoMedicion(item.estado);
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-border/50 pb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span className="font-bold text-sm text-foreground">
                          {formatFechaCalendario(item.fechaEvaluacion) ?? item.fechaEvaluacion}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase ${CLASES_BADGE_ESTADO_MEDICION[estadoMedicion.tono]}`}
                        >
                          {estadoMedicion.texto}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {etiquetaOrigenAntropometria(item.origen)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          Peso
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.pesoKg} kg
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          % Grasa
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.porcentajeGrasa ? `${item.porcentajeGrasa}%` : '—'}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          Cintura
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.perimetros?.cinturaCm ? `${item.perimetros.cinturaCm} cm` : '—'}
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-secondary/30">
                        <span className="text-[11px] text-muted-foreground uppercase font-semibold">
                          Brazo relajado
                        </span>
                        <p className="font-mono font-bold text-sm text-foreground">
                          {item.perimetros?.brazoRelajadoCm ?? item.perimetros?.brazoCm
                            ? `${item.perimetros?.brazoRelajadoCm ?? item.perimetros?.brazoCm} cm`
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {/* RF-004 RN-02/RN-03: fotos propias de la toma, con visor accesible. */}
                    {item.fotos.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Fotos de esta toma
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {item.fotos.map((foto) => {
                            const fallo = fotosConError.includes(foto.id);
                            const fechaCorta =
                              formatFechaCalendario(item.fechaEvaluacion) ?? item.fechaEvaluacion;
                            return (
                              <button
                                key={foto.id}
                                type="button"
                                onClick={() =>
                                  setFotoVisor({ foto, fecha: item.fechaEvaluacion })
                                }
                                aria-label={`Ver foto ${etiquetaAngulo(foto.angulo)} del ${fechaCorta}`}
                                className="relative w-20 sm:w-24 aspect-3/4 rounded-2xl overflow-hidden border border-border bg-secondary/40 hover:border-primary/60 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                              >
                                {foto.presignedGetUrl && !fallo ? (
                                  <img
                                    src={foto.presignedGetUrl}
                                    alt=""
                                    loading="lazy"
                                    onError={() =>
                                      setFotosConError((prev) =>
                                        prev.includes(foto.id) ? prev : [...prev, foto.id]
                                      )
                                    }
                                    className="absolute inset-0 h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                                    <ImageOff className="h-4 w-4" />
                                    <span className="text-[11px] font-semibold">Sin imagen</span>
                                  </span>
                                )}
                                <span className="absolute bottom-0 inset-x-0 bg-background/80 backdrop-blur px-1.5 py-1 text-[11px] font-bold text-foreground flex items-center justify-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {etiquetaAngulo(foto.angulo)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No hay evaluaciones registradas aún.
              </p>
            )}
          </div>
        </div>
      )}

      {/* RF-004: visor de foto de progreso (solo montado con una foto elegida). */}
      {fotoVisor && (
        <VisorFoto
          foto={fotoVisor.foto}
          fecha={fotoVisor.fecha}
          onCerrar={() => setFotoVisor(null)}
        />
      )}
    </div>
  );
}
