import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient, ApiError, generateIdempotencyKey } from '../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../lib/acceso-alumno';
import { queueOfflineMutation, offlineDb, getLatestCachedRutina } from '../../lib/offline-db';
import { subscribeToSyncStatus, type SyncStatusState } from '../../lib/offline-sync';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { SyncQueuePanel } from '../../components/common/SyncQueuePanel';
import { RestTimer } from '../../components/common/RestTimer';
import { triggerHaptic } from '../../lib/haptics';
import { pluralizar } from '../../lib/pluralizar';
import {
  SesionEntrenamientoDetalleDTO,
  EjercicioSesionDetalleDTO,
  SerieRegistroDetalleDTO,
  EstadoSesion,
  MotivoOmision,
  TipoCierreSesion,
  FinalizarSesionResponseDTO,
  SemanaEntrenamientoProgresoDTO,
} from '@guachafit/shared';
import {
  convertirEntradaPesoAKg,
  formatearPesoConUnidad,
  formatearPesoDesdeKg,
  guardarUnidadPesoPreferida,
  leerUnidadPesoPreferida,
  normalizarEntradaDecimal,
  normalizarKgParaContrato,
  pasoPesoEnKg,
  pasoPesoEnUnidad,
  redondearDecimal,
  validarReps,
  validarRpe,
  type UnidadPeso,
} from '../../lib/weight-unit';
import {
  Dumbbell,
  Play,
  CheckCircle2,
  Flame,
  Clock,
  Timer,
  Info,
  Check,
  Award,
  X,
  MessageSquare,
  AlertTriangle,
  Calendar,
  Zap,
  RotateCcw,
  Sparkles,
  Coffee,
  ArrowRight,
  WifiOff,
  RefreshCw,
  Video,
  ExternalLink,
  ClipboardList,
  ChevronRight,
} from 'lucide-react';
import {
  formatDuracionMinutos,
  formatFechaCalendario,
  formatFechaHoraLocal,
  formatFechaLocal,
  formatRangoHorasLocal,
} from '../../lib/date-format';
import { estimarCumpleRachaPorVolumen } from '../../lib/racha';
import {
  descansosRealesEntreSeries,
  formatearDeltaSegundos,
  formatearSegundos,
  marcarInicioSerieReal,
} from '../../lib/sesion-tiempos';

const DEMO_BLOQUES_CATALOGO = [
  {
    bloqueId: 'd1',
    titulo: 'Día 1 (Lunes): Empuje & Pectoral / Tríceps',
    enfoque: 'Hipertrofia e Intensidad RPE 8',
    diaSugerido: 1,
    completado: true,
    ejercicios: [
      {
        nombre: 'Press Plano con Mancuernas',
        grupoMuscular: 'Pectoral / Deltoides',
        series: 4,
        reps: '8-10',
        peso: '28.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Press Inclinado en Multipower',
        grupoMuscular: 'Pectoral Superior',
        series: 3,
        reps: '10-12',
        peso: '60.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Fondos en Paralelas Asistidos',
        grupoMuscular: 'Tríceps / Pecho',
        series: 3,
        reps: '12',
        peso: '0.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Extensiones de Tríceps en Polea',
        grupoMuscular: 'Tríceps',
        series: 4,
        reps: '12-15',
        peso: '25.00',
        rpe: '9.0',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd2',
    titulo: 'Día 2 (Miércoles): Tracción & Espalda / Bíceps',
    enfoque: 'Volumen y Control Escapular',
    diaSugerido: 3,
    completado: false,
    ejercicios: [
      {
        nombre: 'Jalón al Pecho Agarre Neutro',
        grupoMuscular: 'Dorsal Ancho',
        series: 4,
        reps: '10-12',
        peso: '65.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Remo con Barra T apoyado',
        grupoMuscular: 'Espalda Media',
        series: 4,
        reps: '8-10',
        peso: '50.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Face Pulls en Polea Alta',
        grupoMuscular: 'Deltoides Posterior',
        series: 3,
        reps: '15',
        peso: '20.00',
        rpe: '7.5',
        descansoSegundos: 60,
      },
      {
        nombre: 'Curl con Barra Z de Pie',
        grupoMuscular: 'Bíceps',
        series: 3,
        reps: '10-12',
        peso: '30.00',
        rpe: '8.5',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd3',
    titulo: 'Día 3 (Viernes): Pierna & Enfoque Cuádriceps / Isquios',
    enfoque: 'Fuerza Controlada (Cuidar Rodilla)',
    diaSugerido: 5,
    completado: false,
    ejercicios: [
      {
        nombre: 'Sentadilla Trasera con Barra',
        grupoMuscular: 'Cuádriceps / Glúteos',
        series: 4,
        reps: '8-10',
        peso: '85.00',
        rpe: '8.0',
        descansoSegundos: 120,
      },
      {
        nombre: 'Prensa Inclinada 45°',
        grupoMuscular: 'Cuádriceps',
        series: 4,
        reps: '10-12',
        peso: '140.00',
        rpe: '8.0',
        descansoSegundos: 120,
      },
      {
        nombre: 'Curl Femoral Tumbado',
        grupoMuscular: 'Isquiosurales',
        series: 4,
        reps: '12',
        peso: '45.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Elevación de Gemelos en Máquina',
        grupoMuscular: 'Pantorrillas',
        series: 4,
        reps: '15',
        peso: '60.00',
        rpe: '8.0',
        descansoSegundos: 60,
      },
    ],
  },
  {
    bloqueId: 'd4',
    titulo: 'Día 4 (Sábado): Full Body & Core',
    enfoque: 'Acondicionamiento y Estabilidad',
    diaSugerido: 6,
    completado: false,
    ejercicios: [
      {
        nombre: 'Peso Muerto Rumano con Mancuernas',
        grupoMuscular: 'Cadena Posterior',
        series: 4,
        reps: '10-12',
        peso: '32.00',
        rpe: '8.0',
        descansoSegundos: 90,
      },
      {
        nombre: 'Press Militar con Mancuernas',
        grupoMuscular: 'Hombros',
        series: 3,
        reps: '10-12',
        peso: '20.00',
        rpe: '8.5',
        descansoSegundos: 90,
      },
      {
        nombre: 'Plancha Abdominal Isométrica',
        grupoMuscular: 'Core',
        series: 3,
        reps: '45s',
        peso: '0.00',
        rpe: '8.0',
        descansoSegundos: 60,
      },
    ],
  },
];

export function buildDemoSemanaProgreso(selectedBloqueId?: string): SemanaEntrenamientoProgresoDTO {
  const activoId = selectedBloqueId || 'd2';
  return {
    semanaIso: '2026-W38',
    inicioSemana: '14 sep',
    finSemana: '20 sep',
    totalBloques: 4,
    bloquesCompletados: 1,
    porcentajeCumplimiento: '25.00',
    siguienteBloqueSugeridoId: 'd2',
    esDiaDescansoHoy: false,
    rachaDias: 3,
    bloques: DEMO_BLOQUES_CATALOGO.map((b) => ({
      bloqueId: b.bloqueId,
      titulo: b.titulo,
      enfoque: b.enfoque,
      diaSugerido: b.diaSugerido,
      totalEjercicios: b.ejercicios.length,
      completado: b.bloqueId === 'd1',
      esSugeridoHoy: b.bloqueId === activoId,
      estadoSesion: b.bloqueId === 'd1' ? EstadoSesion.COMPLETADA : null,
      motivoOmision: null,
    })),
  };
}

function buildDemoSesion(bloqueId: string = 'd2', alumnoId: string = 'demo-alumno'): SesionEntrenamientoDetalleDTO {
  const b = DEMO_BLOQUES_CATALOGO.find((x) => x.bloqueId === bloqueId) || DEMO_BLOQUES_CATALOGO[1];
  const fechaHoy = new Date().toISOString().split('T')[0];

  return {
    id: `sesion-demo-${b.bloqueId}`,
    alumnoId,
    bloqueId: b.bloqueId,
    esDiaDescansoOriginal: b.diaSugerido === 6,
    fechaProgramada: fechaHoy,
    estado: b.completado ? EstadoSesion.COMPLETADA : EstadoSesion.PLANIFICADA,
    timezoneCliente: 'America/Caracas',
    porcentajeCumplimiento: b.completado ? '100.00' : '0.00',
    volumenTotalKg: b.completado ? '3420.00' : '0.00',
    ejercicios: b.ejercicios.map((ej, ejIdx) => ({
      id: `es-demo-${b.bloqueId}-${ejIdx}`,
      sesionId: `sesion-demo-${b.bloqueId}`,
      ejercicioId: `ej-demo-${b.bloqueId}-${ejIdx}`,
      orden: ejIdx + 1,
      notasCoach: `Enfoque técnico: ${ej.nombre} (${b.enfoque})`,
      descansoPrescritoSegundos: ej.descansoSegundos,
      ejercicio: {
        id: `ej-demo-${b.bloqueId}-${ejIdx}`,
        nombre: ej.nombre,
        grupoMuscular: ej.grupoMuscular,
        activo: true,
        createdAtUtc: new Date().toISOString(),
      },
      series: Array.from({ length: ej.series }, (_, sIdx) => ({
        id: `s-demo-${b.bloqueId}-${ejIdx}-${sIdx}`,
        ejercicioSesionId: `es-demo-${b.bloqueId}-${ejIdx}`,
        numeroSerie: sIdx + 1,
        repsObjetivo: parseInt(ej.reps.split('-')[0], 10) || 10,
        repsLogradas: b.completado ? parseInt(ej.reps.split('-')[0], 10) || 10 : null,
        // WU3b: la prescripción vive aparte del peso real (el backend nunca pre-rellena `pesoKg`).
        pesoKg: b.completado ? ej.peso : null,
        pesoPrescritoKg: ej.peso,
        rpe: ej.rpe,
        completada: b.completado,
        descansoSegundos: ej.descansoSegundos,
      })),
    })),
    createdAtUtc: new Date().toISOString(),
    updatedAtUtc: new Date().toISOString(),
  };
}

// =============================================================================
// WU3b: PRESCRITO vs REAL, UNIDADES kg/lb, VALIDACIÓN INLINE Y VIDEO (RF-001 RN-01)
// =============================================================================

/**
 * Una serie "intacta" conserva los valores prefijados por la API al crear la sesión:
 * el RPE que trae es la referencia prescrita (el backend no persiste `rpeObjetivo` aparte).
 * En cuanto el alumno registra datos reales deja de contar como referencia.
 */
function serieSinDatosReales(serie: SerieRegistroDetalleDTO): boolean {
  return (
    !serie.completada &&
    !serie.timestampCompletadaUtc &&
    (serie.pesoKg === null || serie.pesoKg === undefined || serie.pesoKg === '') &&
    (serie.repsLogradas === null || serie.repsLogradas === undefined)
  );
}

/**
 * Captura el RPE sugerido de la sesión recién cargada (solo series intactas y uniformes).
 * Se congela al cargar para que editar el RPE real durante el checklist no borre la
 * referencia prescrita: el badge "Prescrito" permanece visible.
 */
function capturarRpeSugerido(ejercicios: EjercicioSesionDetalleDTO[]): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const ejercicioSesion of ejercicios) {
    const intactas = ejercicioSesion.series.filter(serieSinDatosReales);
    const primero = intactas[0]?.rpe;
    if (primero && intactas.every((s) => s.rpe === primero)) {
      snapshot[ejercicioSesion.id] = primero;
    }
  }
  return snapshot;
}

interface ResumenPrescripcion {
  totalSeries: number;
  repsTexto: string | null;
  pesosKg: number[];
}

/** n series × reps objetivo × peso prescrito (cuando exista) para el badge de prescripción. */
function calcularResumenPrescripcion(ejercicioSesion: EjercicioSesionDetalleDTO): ResumenPrescripcion {
  const series = ejercicioSesion.series;
  const repsUnicas = Array.from(new Set(series.map((s) => s.repsObjetivo))).sort((a, b) => a - b);
  const pesosKg = Array.from(
    new Set(
      series
        .map((s) => {
          const valor =
            s.pesoPrescritoKg === null || s.pesoPrescritoKg === undefined
              ? NaN
              : Number(s.pesoPrescritoKg);
          return Number.isFinite(valor) && valor > 0 ? valor : NaN;
        })
        .filter((v) => Number.isFinite(v))
    )
  ).sort((a, b) => a - b);

  return {
    totalSeries: series.length,
    repsTexto:
      repsUnicas.length === 0
        ? null
        : repsUnicas.length === 1
        ? `${repsUnicas[0]}`
        : `${repsUnicas[0]}–${repsUnicas[repsUnicas.length - 1]}`,
    pesosKg,
  };
}

/** Traduce el resumen prescrito a la unidad visible: '4 series × 8–10 reps · 28 kg'. */
function formatearPrescripcion(resumen: ResumenPrescripcion, unidad: UnidadPeso): string {
  const partes: string[] = [
    `${resumen.totalSeries} ${resumen.totalSeries === 1 ? 'serie' : 'series'}`,
  ];
  if (resumen.repsTexto) partes.push(`× ${resumen.repsTexto} reps`);
  if (resumen.pesosKg.length === 1) {
    partes.push(`· ${formatearPesoConUnidad(resumen.pesosKg[0], unidad)}`);
  } else if (resumen.pesosKg.length > 1) {
    const minimo = formatearPesoDesdeKg(resumen.pesosKg[0], unidad);
    const maximo = formatearPesoConUnidad(resumen.pesosKg[resumen.pesosKg.length - 1], unidad);
    if (minimo && maximo) partes.push(`· ${minimo}–${maximo}`);
  }
  return partes.join(' ');
}

/** Peso prescrito con carga para una serie (null cuando la prescripción es cualitativa). */
function pesoPrescritoConCarga(serie: SerieRegistroDetalleDTO): string | null {
  const valor = serie.pesoPrescritoKg;
  if (valor === null || valor === undefined) return null;
  const numerico = Number(valor);
  return Number.isFinite(numerico) && numerico > 0 ? valor : null;
}

/** Valida una serie completa antes de enviarla/encolarla (contrato RegistrarSerieSchema). */
function validarSerieParaEnviar(
  serie: SerieRegistroDetalleDTO
): { campo: 'pesoKg' | 'rpe' | 'repsLogradas'; mensaje: string } | null {
  const pesoNormalizado = normalizarKgParaContrato(serie.pesoKg);
  if (pesoNormalizado === null) {
    return { campo: 'pesoKg', mensaje: 'Peso inválido: corrige el valor (ej. 28.5)' };
  }
  const errorReps = validarReps(serie.repsLogradas ?? serie.repsObjetivo);
  if (errorReps) return { campo: 'repsLogradas', mensaje: errorReps };
  if (serie.rpe) {
    const resultado = validarRpe(serie.rpe);
    if (!resultado.ok) {
      return { campo: 'rpe', mensaje: resultado.error ?? 'RPE inválido' };
    }
  }
  return null;
}

/**
 * Detecta si una URL de video es embebible (YouTube/Vimeo) y devuelve su URL de embed.
 * Cualquier otro formato se ofrece como enlace externo en el modal.
 */
function obtenerUrlVideoEmbebible(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v');
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      const partes = parsed.pathname.split('/').filter(Boolean);
      if (partes[0] === 'embed' && partes[1]) {
        return `https://www.youtube-nocookie.com/embed/${partes[1]}`;
      }
      if (partes[0] === 'shorts' && partes[1]) {
        return `https://www.youtube-nocookie.com/embed/${partes[1]}`;
      }
      return null;
    }
    if (host === 'vimeo.com') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function EntrenamientoPage() {
  const { user, isDemoMode } = useAuth();
  const [sesion, setSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
  const [semanaProgreso, setSemanaProgreso] = useState<SemanaEntrenamientoProgresoDTO | null>(null);
  const [selectedBloqueId, setSelectedBloqueId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingBloque, setIsSwitchingBloque] = useState(false);
  const [isRestTimerOpen, setIsRestTimerOpen] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [activeSerieKey, setActiveSerieKey] = useState<{ ejercicioIndex: number; serieIndex: number } | null>(null);

  // WU3b (RN-01): unidad de peso preferida, borradores de texto en edición y errores inline por campo
  const [unidadPeso, setUnidadPeso] = useState<UnidadPeso>(() => leerUnidadPesoPreferida());
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string>>({});

  // WU3b (Escenario 1): modal de video demostrativo del catálogo
  const [videoModal, setVideoModal] = useState<{ url: string; nombre: string } | null>(null);

  // Estados honestos de carga: error de red, offline sin cache y errores de acción explícita
  const [loadError, setLoadError] = useState(false);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [actionError, setActionError] = useState<string | null>(null);

  // RF-012: bloqueo por ciclo de vida (pausado / suspendido por pago / archivado). Cuando la API
  // responde 403 ALUMNO_BLOQUEADO, la pantalla informativa sustituye al checklist.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);

  // Modal de Finalización y Feedback al Coach
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);
  const [rpeSesion, setRpeSesion] = useState(8);
  const [molestia, setMolestia] = useState('Ninguna 👍');
  const [notasCoachInput, setNotasCoachInput] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);

  // RF-001 Escenario 5: cierre de sesión vacía (descansado / incompleto)
  const [isEmptyCloseModalOpen, setIsEmptyCloseModalOpen] = useState(false);

  // U3b: los tres modales comparten el mismo contrato de diálogo accesible (Escape, trampa de
  // Tab, foco inicial y restore del foco al disparador).
  const refModalFinalizar = useDialogoAccesible({
    abierto: isFinishModalOpen,
    onCerrar: () => setIsFinishModalOpen(false),
  });
  const refModalCierreVacio = useDialogoAccesible({
    abierto: isEmptyCloseModalOpen,
    onCerrar: () => setIsEmptyCloseModalOpen(false),
  });
  const refModalVideo = useDialogoAccesible({
    abierto: videoModal !== null,
    onCerrar: () => setVideoModal(null),
  });

  // RN-02: feedback real de la finalización (nunca afirmar racha sin respaldo de la API)
  const [finishFeedback, setFinishFeedback] = useState<{
    cumpleRacha: boolean;
    nuevaRacha: number;
    duracionMinutos: number | null;
  } | null>(null);
  const [pendienteSync, setPendienteSync] = useState(false);

  // WU4: visibilidad de la cola offline (pendientes/fallidas/rechazadas) con acceso al panel
  const [syncState, setSyncState] = useState<SyncStatusState>({
    isSyncing: false,
    summary: { pending: 0, failed: 0, rejected: 0 },
  });
  const [isSyncPanelOpen, setIsSyncPanelOpen] = useState(false);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Caracas';

  // WU3b: la prescripción (RPE sugerido) se captura al cargar la sesión; editar el RPE real
  // durante el checklist no debe borrar la referencia prescrita en pantalla.
  const rpeSugeridoPorEjercicio = useMemo(
    () => capturarRpeSugerido(sesion?.ejercicios ?? []),
    [sesion?.id]
  );

  const cacheSesion = useCallback(
    async (data: SesionEntrenamientoDetalleDTO) => {
      if (isDemoMode || !data?.id) return;
      try {
        await offlineDb.rutinaHoy.put({
          id: data.id,
          alumnoId: user?.id || '',
          fechaProgramada: data.fechaProgramada,
          sesion: data,
          updatedAt: Date.now(),
        });
      } catch {
        // La caché local nunca debe romper la experiencia
      }
    },
    [isDemoMode, user]
  );

  const refreshSemana = useCallback(async () => {
    if (isDemoMode) return;
    try {
      const progreso = await apiClient<SemanaEntrenamientoProgresoDTO>(
        `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
      );
      if (progreso) setSemanaProgreso(progreso);
    } catch (err) {
      // Refresco best-effort: no rompe la vista actual. Un bloqueo de ciclo de vida sí se muestra.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) setBloqueo(bloqueoDetectado);
    }
  }, [isDemoMode, tz]);

  const getRpeDescription = (val: number): string => {
    if (val <= 3) return 'Descarga / Muy ligero';
    if (val <= 5) return 'Ligero / Cómodo';
    if (val === 6) return 'Exigencia media';
    if (val === 7) return 'Esfuerzo notable';
    if (val === 8) return 'Óptimo (RIR 2)';
    if (val === 9) return 'Casi al límite (RIR 1-0)';
    return 'Fallo muscular (10/10)';
  };

  // Accesibilidad (U3b): Escape, trampa de foco y restore viven en `useDialogoAccesible`.

  // Cargar sesión de hoy y progreso semanal.
  // - Sin argumento: trae la sesión de hoy más reciente del alumno (cualquier bloque).
  // - Con bloqueId: consulta READ-ONLY la sesión de hoy de ese bloque (no instancia nada).
  // Los datos demo SOLO se usan con la bandera explícita isDemoMode.
  const loadSessionAndProgress = useCallback(
    async (bloqueId?: string) => {
      setIsLoading(true);
      setLoadError(false);
      setActionError(null);
      // Cada carga real re-evalúa el ciclo de vida: si el alumno fue reactivado, la pantalla de
      // bloqueo desaparece sola con el siguiente intento.
      setBloqueo(null);
      // El feedback de finalización pertenece a la sesión finalizada, no a la recién cargada
      setFinishFeedback(null);
      setPendienteSync(false);
      // Los borradores de edición pertenecen a la sesión anterior
      setInputDrafts({});
      setInputErrors({});

      // MODO DEMO EXPLÍCITO: datos de ejemplo y cero llamadas/mutaciones contra la API real.
      if (isDemoMode) {
        const demoProgreso = buildDemoSemanaProgreso(bloqueId);
        const demoBloqueId = bloqueId || demoProgreso.siguienteBloqueSugeridoId || 'd2';
        setSemanaProgreso(demoProgreso);
        setSelectedBloqueId(demoBloqueId);
        setSesion(buildDemoSesion(demoBloqueId, user?.id));
        setIsOffline(false);
        setIsLoading(false);
        setIsSwitchingBloque(false);
        return;
      }

      // OFFLINE: solo cache local; sin cache => estado offline vacío (nunca demo).
      if (!navigator.onLine) {
        try {
          // WU4: la sesión más reciente por fechaProgramada/updatedAt (no el orden de UUID).
          const cached = await getLatestCachedRutina(user?.id);
          setSesion(cached?.sesion ?? null);
        } catch {
          setSesion(null);
        }
        setIsOffline(true);
        setIsLoading(false);
        setIsSwitchingBloque(false);
        return;
      }

      try {
        // 1. Progreso semanal (incluye racha efectiva y estados de omisión)
        const progresoRes = await apiClient<SemanaEntrenamientoProgresoDTO>(
          `/alumnos/me/rutina/semana-actual?timezone=${encodeURIComponent(tz)}`
        );
        setSemanaProgreso(progresoRes);

        // 2. Sesión de hoy: del bloque consultado o la más reciente del alumno
        const url = bloqueId
          ? `/alumnos/me/sesiones/hoy?timezone=${encodeURIComponent(tz)}&bloqueId=${encodeURIComponent(bloqueId)}`
          : `/alumnos/me/sesiones/hoy?timezone=${encodeURIComponent(tz)}`;

        const data = await apiClient<SesionEntrenamientoDetalleDTO | null>(url);
        setSesion(data ?? null);
        if (data?.bloqueId) setSelectedBloqueId(data.bloqueId);
        else if (bloqueId) setSelectedBloqueId(bloqueId);
        else setSelectedBloqueId(progresoRes.siguienteBloqueSugeridoId ?? null);

        if (data?.id) await cacheSesion(data);
        setIsOffline(false);
      } catch (err) {
        // RF-012: el bloqueo por ciclo de vida tiene su propia pantalla; cualquier otro error de
        // red/servidor conserva el estado de error con retry (jamás datos demo).
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          setSesion(null);
          setSemanaProgreso(null);
          return;
        }
        console.warn('No se pudo cargar la sesión del alumno:', err);
        setLoadError(true);
      } finally {
        setIsLoading(false);
        setIsSwitchingBloque(false);
      }
    },
    [cacheSesion, isDemoMode, tz, user]
  );

  useEffect(() => {
    loadSessionAndProgress();
  }, [loadSessionAndProgress]);

  // WU4: contadores de la cola offline para el indicador de esta pantalla
  useEffect(() => subscribeToSyncStatus(setSyncState), []);

  // Consulta READ-ONLY de un bloque (chip de la semana): NO instancia ni elimina nada.
  const handleSelectBloque = async (bloqueId: string) => {
    if (!bloqueId) return;
    triggerHaptic('selection');
    setIsSwitchingBloque(true);
    setSelectedBloqueId(bloqueId);
    await loadSessionAndProgress(bloqueId);
  };

  // Acción EXPLÍCITA: "Entrenar este bloque hoy" (RN-04). Única vía para instanciar/cambiar sesión.
  const handleEntrenarBloqueHoy = async (bloqueId: string, iniciarInmediato = false) => {
    if (!bloqueId) return;
    setActionError(null);
    setIsSwitchingBloque(true);
    triggerHaptic('selection');
    // Los borradores de edición pertenecen a la sesión anterior
    setInputDrafts({});
    setInputErrors({});

    // Modo demo: cambio local, sin API ni cola offline.
    if (isDemoMode) {
      const demo = buildDemoSesion(bloqueId, user?.id);
      setSesion(
        iniciarInmediato
          ? {
              ...demo,
              id: `sesion-demo-${bloqueId}-${Date.now()}`,
              estado: EstadoSesion.EN_PROGRESO,
              fechaInicioUtc: new Date().toISOString(),
            }
          : demo
      );
      setSelectedBloqueId(bloqueId);
      setFinishFeedback(null);
      setPendienteSync(false);
      setIsSwitchingBloque(false);
      return;
    }

    try {
      const nueva = await apiClient<SesionEntrenamientoDetalleDTO>(
        `/alumnos/me/sesiones/bloques/${encodeURIComponent(bloqueId)}/entrenar-hoy`,
        {
          method: 'POST',
          body: JSON.stringify({ timezoneCliente: tz, iniciarInmediato }),
        }
      );
      setSesion(nueva);
      setSelectedBloqueId(nueva.bloqueId || bloqueId);
      setFinishFeedback(null);
      setPendienteSync(false);
      await cacheSesion(nueva);
      await refreshSemana();
    } catch (err) {
      // RF-012: si el estado cambió en medio de la sesión, el bloqueo sustituye al error genérico.
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
      } else {
        setActionError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos iniciar el bloque. Revisa tu conexión e inténtalo de nuevo.'
        );
      }
    } finally {
      setIsSwitchingBloque(false);
    }
  };

  // "Repetir entrenamiento": nueva sesión en progreso del bloque ya completado (historial intacto)
  const handleRepetirBloque = async () => {
    if (!sesion?.bloqueId) return;
    await handleEntrenarBloqueHoy(sesion.bloqueId, true);
  };

  // Start workout session
  const handleStartSession = async () => {
    if (!sesion) return;
    const nowUtc = new Date().toISOString();
    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.EN_PROGRESO,
      fechaInicioUtc: nowUtc,
    };
    setSesion(updated);

    // Modo demo: transición local sin llamadas reales ni cola offline.
    if (isDemoMode) return;

    const initPayload = { timezoneCliente: tz, fechaInicioUtc: nowUtc };
    // WU4: una sola key por mutación lógica; se reutiliza si el intento directo cae y se encola.
    const idempotencyKey = generateIdempotencyKey();

    if (navigator.onLine) {
      try {
        await apiClient(`/sesiones/${sesion.id}/iniciar`, {
          method: 'POST',
          body: JSON.stringify(initPayload),
          idempotencyKey,
        });
      } catch (err) {
        // RF-012: un bloqueo nunca se encola offline (reintentaría contra un 403 para siempre).
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          setSesion(sesion);
          return;
        }
        await queueOfflineMutation(
          `/sesiones/${sesion.id}/iniciar`,
          'POST',
          initPayload,
          'Iniciar sesión',
          idempotencyKey
        );
      }
    } else {
      await queueOfflineMutation(
        `/sesiones/${sesion.id}/iniciar`,
        'POST',
        initPayload,
        'Iniciar sesión',
        idempotencyKey
      );
    }
  };

  // WU3b: helpers de errores inline, unidad de peso y video demostrativo
  const marcarErrorInline = useCallback((clave: string, mensaje: string) => {
    setInputErrors((prev) => ({ ...prev, [clave]: mensaje }));
  }, []);

  const limpiarErrorInline = useCallback((clave: string) => {
    setInputErrors((prev) => {
      if (!prev[clave]) return prev;
      const next = { ...prev };
      delete next[clave];
      return next;
    });
  }, []);

  const limpiarBorrador = useCallback((clave: string) => {
    setInputDrafts((prev) => {
      if (!(clave in prev)) return prev;
      const next = { ...prev };
      delete next[clave];
      return next;
    });
  }, []);

  /** RN-01: alterna kg/lb y persiste la preferencia; los textos se reformatean desde kg. */
  const handleCambiarUnidad = (unidad: UnidadPeso) => {
    if (unidad === unidadPeso) return;
    triggerHaptic('selection');
    setUnidadPeso(unidad);
    guardarUnidadPesoPreferida(unidad);
    setInputDrafts({});
    setInputErrors({});
  };

  /** Escenario 1: abre el video demostrativo del catálogo para este ejercicio. */
  const handleAbrirVideo = (ejercicioSesion: EjercicioSesionDetalleDTO) => {
    const url = ejercicioSesion.ejercicio?.videoUrl;
    if (!url) return;
    triggerHaptic('selection');
    setVideoModal({ url, nombre: ejercicioSesion.ejercicio?.nombre || 'Ejercicio' });
  };

  /** Al salir del campo, el borrador válido se descarta y la UI muestra el valor canónico. */
  const handleBlurPeso = (serieId: string) => {
    const clave = `${serieId}:pesoKg`;
    if (inputErrors[clave]) return; // conserva el texto inválido visible para corregirlo
    limpiarBorrador(clave);
  };

  const handleBlurRpe = (serieId: string) => {
    const clave = `${serieId}:rpe`;
    if (inputErrors[clave]) return;
    limpiarBorrador(clave);
  };

  // ===========================================================================
  // WU17: CAPTURA DEL INICIO REAL DE LA SERIE (medición del descanso)
  // ===========================================================================
  //
  // Semántica: `timestampInicioUtc` es la marca del momento en que el alumno EMPIEZA una
  // serie concreta. Se fija UNA sola vez y solo en series pendientes de una sesión
  // EnProgreso; el prefill programático (heredar peso/reps de la serie anterior) NO la
  // dispara porque no pasa por estos handlers. El descanso real se deriva luego:
  //   descanso real = inicio(serie N) − completada(serie N−1)
  // Sin marca no se inventa medición (la UI muestra '—').

  /**
   * Fija el inicio real sobre la serie indicada (mutando el objeto serie que los handlers ya
   * clonaron en el estado optimista). Devuelve `true` solo si la marca cambió. No marca series
   * completadas ni sobrescribe una marca existente.
   */
  const marcarInicioEnSerie = useCallback(
    (serie: SerieRegistroDetalleDTO): boolean => {
      if (!sesion || sesion.estado !== EstadoSesion.EN_PROGRESO) return false;
      const conMarca = marcarInicioSerieReal(serie, new Date().toISOString());
      if (!conMarca) return false;
      serie.timestampInicioUtc = conMarca.timestampInicioUtc;
      return true;
    },
    [sesion]
  );

  /**
   * Afordancia explícita "Iniciar serie" (▶) para la serie pendiente que aún no tiene marca.
   * El envío viaja después dentro del MISMO batch de la serie (al completarla o ajustar el
   * temporizador): no se crean endpoints ni mutaciones parciales nuevas.
   */
  const handleIniciarSerie = (ejercicioIndex: number, serieIndex: number) => {
    if (!sesion || sesion.estado !== EstadoSesion.EN_PROGRESO) return;
    const original = sesion.ejercicios[ejercicioIndex]?.series[serieIndex];
    if (!original) return;
    const serie = { ...original };
    if (!marcarInicioEnSerie(serie)) return;
    triggerHaptic('selection');

    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      ejercicios: sesion.ejercicios.map((ejercicio, indice) =>
        indice === ejercicioIndex
          ? {
              ...ejercicio,
              series: ejercicio.series.map((s, indiceSerie) =>
                indiceSerie === serieIndex ? serie : s
              ),
            }
          : ejercicio
      ),
    };
    setSesion(updated);

    // Modo demo: interacción local sin cache ni mutaciones reales.
    if (isDemoMode) return;

    offlineDb.rutinaHoy
      .put({
        id: updated.id,
        alumnoId: user?.id || '',
        fechaProgramada: updated.fechaProgramada,
        sesion: updated,
        updatedAt: Date.now(),
      })
      .catch(() => {});
  };

  // Notificación de cambio de duración en el temporizador (Alumno ajusta descanso)
  const handleRestDurationChange = useCallback(
    async (newSeconds: number) => {
      setTimerSeconds(newSeconds);
      if (!activeSerieKey || !sesion) return;
      const { ejercicioIndex, serieIndex } = activeSerieKey;
      const ejercicio = sesion.ejercicios[ejercicioIndex];
      if (!ejercicio) return;
      const serie = ejercicio.series[serieIndex];
      if (!serie) return;

      if (serie.descansoSegundos === newSeconds) return;

      const updated = { ...sesion };
      updated.ejercicios[ejercicioIndex].series[serieIndex].descansoSegundos = newSeconds;
      setSesion(updated);

      // Modo demo: interacción local sin cache ni mutaciones reales.
      if (isDemoMode) return;

      offlineDb.rutinaHoy.put({
        id: updated.id,
        alumnoId: user?.id || '',
        fechaProgramada: updated.fechaProgramada,
        sesion: updated,
        updatedAt: Date.now(),
      }).catch(() => {});

      // WU3b: un valor inválido jamás se envía a la API (validación contra el contrato).
      const errorSerie = validarSerieParaEnviar(serie);
      if (errorSerie) {
        marcarErrorInline(`${serie.id}:${errorSerie.campo}`, errorSerie.mensaje);
        return;
      }

      if (navigator.onLine) {
        try {
          await apiClient(`/sesiones/${sesion.id}/series`, {
            method: 'PUT',
            body: JSON.stringify({
              series: [
                {
                  serieId: serie.id,
                  repsLogradas: serie.repsLogradas ?? serie.repsObjetivo,
                  pesoKg: normalizarKgParaContrato(serie.pesoKg),
                  rpe: serie.rpe,
                  descansoSegundos: newSeconds,
                  completada: serie.completada,
                  // WU17: la marca de inicio viaja en el mismo batch (undefined = no se envía).
                  timestampInicioUtc: serie.timestampInicioUtc ?? undefined,
                  timestampCompletadaUtc: serie.timestampCompletadaUtc,
                },
              ],
            }),
          });
        } catch {}
      }
    },
    [activeSerieKey, sesion, user, isDemoMode]
  );

  // Toggle set completion and trigger rest timer
  const handleToggleSet = async (ejercicioIndex: number, serieIndex: number) => {
    if (!sesion) return;
    const updated = { ...sesion };
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];
    const willBeCompleted = !serie.completada;

    // WU3b: sin valores válidos no se marca ni se envía/encola nada (error inline visible).
    const errorSerie = validarSerieParaEnviar(serie);
    if (errorSerie) {
      marcarErrorInline(`${serie.id}:${errorSerie.campo}`, errorSerie.mensaje);
      triggerHaptic('warning');
      return;
    }
    const pesoNormalizado = normalizarKgParaContrato(serie.pesoKg);

    serie.completada = willBeCompleted;
    if (willBeCompleted) {
      serie.timestampCompletadaUtc = new Date().toISOString();
      triggerHaptic('success');

      // Pre-rellenado inteligente: si la siguiente serie del ejercicio no tiene peso asignado,
      // hereda automáticamente el peso y repeticiones de la serie que se acaba de completar
      const seriesDelEjercicio = updated.ejercicios[ejercicioIndex].series;
      const nextSerie = seriesDelEjercicio[serieIndex + 1];
      if (
        nextSerie &&
        !nextSerie.completada &&
        (!nextSerie.pesoKg || nextSerie.pesoKg === '0.00' || nextSerie.pesoKg === '')
      ) {
        if (serie.pesoKg && serie.pesoKg !== '0.00') {
          nextSerie.pesoKg = serie.pesoKg;
        }
        if (serie.repsLogradas !== null && serie.repsLogradas !== undefined) {
          nextSerie.repsLogradas = serie.repsLogradas;
        }
      }

      // Descanso prescrito para este ejercicio (o 90s por defecto)
      const prescrito = updated.ejercicios[ejercicioIndex].descansoPrescritoSegundos || 90;
      serie.descansoSegundos = serie.descansoSegundos ?? prescrito;

      // Iniciar el temporizador con el tiempo del ejercicio
      setTimerSeconds(serie.descansoSegundos);
      setActiveSerieKey({ ejercicioIndex, serieIndex });
      setIsRestTimerOpen(true);
    } else {
      triggerHaptic('light');
    }

    // Recompute compliance percentage
    let totalSeries = 0;
    let completedSeries = 0;
    updated.ejercicios.forEach((e) => {
      e.series.forEach((s) => {
        totalSeries++;
        if (s.completada) completedSeries++;
      });
    });
    const pct = totalSeries > 0 ? ((completedSeries / totalSeries) * 100).toFixed(2) : '0.00';
    updated.porcentajeCumplimiento = pct;
    // D8 (RN-02): la estimación local usa la MISMA regla que el servidor (volumen ponderado
    // con fallback a series), no un simple % de series; el servidor sigue siendo la autoridad.
    updated.cumpleReglaRacha = estimarCumpleRachaPorVolumen(
      updated.ejercicios.flatMap((e) => e.series)
    );

    setSesion(updated);

    // WU3b: al marcar la serie, el texto en edición se reemplaza por el valor canónico persistido.
    limpiarBorrador(`${serie.id}:pesoKg`);
    limpiarBorrador(`${serie.id}:rpe`);

    // Modo demo: interacción local sin cache ni mutaciones reales.
    if (isDemoMode) return;

    // Save to IndexedDB
    await offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    });

    // Sync or queue outbox batch
    const payload = {
      series: [
        {
          serieId: serie.id,
          repsLogradas: serie.repsLogradas ?? serie.repsObjetivo,
          pesoKg: pesoNormalizado,
          rpe: serie.rpe,
          descansoSegundos: serie.descansoSegundos ?? null,
          completada: willBeCompleted,
          // WU17: marca de inicio real capturada en esta sesión (si existe) en el mismo batch.
          timestampInicioUtc: serie.timestampInicioUtc ?? undefined,
          timestampCompletadaUtc: serie.timestampCompletadaUtc,
        },
      ],
    };

    // WU4: misma key para el intento directo y un eventual encolado (defensa de idempotencia).
    const idempotencyKey = generateIdempotencyKey();

    if (navigator.onLine) {
      try {
        await apiClient(`/sesiones/${sesion.id}/series`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          idempotencyKey,
        });
      } catch (err) {
        // RF-012: un bloqueo no se encola; se muestra la pantalla informativa.
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          return;
        }
        await queueOfflineMutation(
          `/sesiones/${sesion.id}/series`,
          'PUT',
          payload,
          `Sync serie ${serie.numeroSerie}`,
          idempotencyKey
        );
      }
    } else {
      await queueOfflineMutation(
        `/sesiones/${sesion.id}/series`,
        'PUT',
        payload,
        `Sync serie ${serie.numeroSerie}`,
        idempotencyKey
      );
    }
  };

  // Update set values (weight, reps, rpe)
  const handleUpdateSerieValue = (
    ejercicioIndex: number,
    serieIndex: number,
    field: 'pesoKg' | 'repsLogradas' | 'rpe',
    value: string
  ) => {
    if (!sesion) return;
    const updated = { ...sesion };
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];

    // WU17: editar pesos/reps/RPE es interacción real => marca el inicio si aún no existe.
    marcarInicioEnSerie(serie);

    if (field === 'pesoKg') {
      // RN-01: el alumno escribe en su unidad; se valida y se persiste SIEMPRE en kg.
      const clave = `${serie.id}:pesoKg`;
      setInputDrafts((prev) => ({ ...prev, [clave]: value }));
      const resultado = convertirEntradaPesoAKg(value, unidadPeso);
      if (!resultado.ok) {
        marcarErrorInline(clave, resultado.error ?? 'Peso inválido');
        return; // nunca persistir ni encolar un peso inválido
      }
      limpiarErrorInline(clave);
      serie.pesoKg = resultado.kg; // '' = sin peso (válido: el peso es opcional, RN-01)
    } else if (field === 'rpe') {
      const clave = `${serie.id}:rpe`;
      setInputDrafts((prev) => ({ ...prev, [clave]: value }));
      const resultado = validarRpe(value);
      if (!resultado.ok) {
        marcarErrorInline(clave, resultado.error ?? 'RPE inválido');
        return;
      }
      limpiarErrorInline(clave);
      serie.rpe = resultado.rpe;
    } else {
      const clave = `${serie.id}:repsLogradas`;
      const numerico = Number(value);
      const errorReps = validarReps(numerico);
      if (errorReps) {
        marcarErrorInline(clave, errorReps);
        return;
      }
      limpiarErrorInline(clave);
      serie.repsLogradas = numerico;
    }

    setSesion(updated);

    // Modo demo: edición local sin cache ni mutaciones reales.
    if (isDemoMode) return;

    // Auto-guardado inmediato en IndexedDB
    offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    }).catch(() => {});
  };

  // Step set value (+ / -) for weight and reps with haptic feedback
  const handleStepSerieValue = (
    ejercicioIndex: number,
    serieIndex: number,
    field: 'pesoKg' | 'repsLogradas',
    delta: number
  ) => {
    if (!sesion) return;
    triggerHaptic('light');
    const updated = { ...sesion };
    const serie = updated.ejercicios[ejercicioIndex].series[serieIndex];

    // WU17: tocar los steppers de peso/reps es interacción real => marca el inicio si falta.
    marcarInicioEnSerie(serie);

    if (field === 'pesoKg') {
      // RN-01: el stepper avanza en la unidad visible (±2.5 kg / ±5 lb) sin deriva decimal.
      const clave = `${serie.id}:pesoKg`;
      const pasoKg = pasoPesoEnKg(unidadPeso) * (delta < 0 ? -1 : 1);
      const baseNumerica = serie.pesoKg
        ? Number(normalizarEntradaDecimal(String(serie.pesoKg)))
        : 0;
      const actualKg = Number.isFinite(baseNumerica) ? baseNumerica : 0;
      const siguienteKg = Math.max(0, actualKg + pasoKg);
      serie.pesoKg = siguienteKg > 0 ? redondearDecimal(siguienteKg, 2).toFixed(2) : '';
      limpiarBorrador(clave); // el valor canónico reemplaza cualquier texto en edición
      limpiarErrorInline(clave);
    } else if (field === 'repsLogradas') {
      const current = serie.repsLogradas ?? serie.repsObjetivo ?? 0;
      const next = Math.max(0, Math.min(200, current + delta));
      serie.repsLogradas = next;
      limpiarErrorInline(`${serie.id}:repsLogradas`);
    }
    setSesion(updated);

    // Modo demo: edición local sin cache ni mutaciones reales.
    if (isDemoMode) return;

    // Auto-guardado inmediato en IndexedDB
    offlineDb.rutinaHoy.put({
      id: updated.id,
      alumnoId: user?.id || '',
      fechaProgramada: updated.fechaProgramada,
      sesion: updated,
      updatedAt: Date.now(),
    }).catch(() => {});
  };

  // Finish session handlers (Modal de Feedback)
  const handleOpenFinishModal = () => {
    if (!sesion) return;
    // RF-001 Escenario 5: sin ninguna serie completada se pide decisión explícita primero
    const seriesCompletadas = sesion.ejercicios.reduce(
      (acc, ej) => acc + ej.series.filter((s) => s.completada).length,
      0
    );
    if (seriesCompletadas === 0) {
      setActionError(null);
      setIsEmptyCloseModalOpen(true);
      return;
    }
    setIsFinishModalOpen(true);
  };

  const confirmFinishSession = async () => {
    if (!sesion) return;
    setIsFinishing(true);

    // Cálculo comparativo de descansos (Prescrito vs. Real)
    let totalDescansoReal = 0;
    let countSeriesDescanso = 0;
    let totalDescansoPrescrito = 0;

    sesion.ejercicios.forEach((ej) => {
      const prescrito = ej.descansoPrescritoSegundos || 90;
      ej.series.forEach((s) => {
        if (s.completada && s.descansoSegundos) {
          totalDescansoReal += s.descansoSegundos;
          totalDescansoPrescrito += prescrito;
          countSeriesDescanso++;
        }
      });
    });

    let descansoTag: string | null = null;
    if (countSeriesDescanso > 0) {
      const avgReal = Math.round(totalDescansoReal / countSeriesDescanso);
      const avgPrescrito = Math.round(totalDescansoPrescrito / countSeriesDescanso);
      const diff = avgReal - avgPrescrito;
      const diffStr =
        diff > 0
          ? `+${formatearSegundos(diff)}`
          : diff < 0
          ? `${formatearSegundos(-diff)} menos`
          : 'exacto';
      // Separador interno "·" (no "•") para que parsearNotasAlumno lo trate
      // como una sola etiqueta y no parta el tag en dos.
      descansoTag = `[Descanso promedio: ${formatearSegundos(avgReal)} (planificado: ${formatearSegundos(avgPrescrito)} · ${diffStr})]`;
    }

    const notasCompletas = [
      `[RPE: ${rpeSesion}/10]`,
      molestia !== 'Ninguna 👍' ? `[Molestia: ${molestia}]` : null,
      descansoTag,
      notasCoachInput.trim() ? notasCoachInput.trim() : null,
    ]
      .filter(Boolean)
      .join(' • ');

    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.COMPLETADA,
      fechaFinUtc: new Date().toISOString(),
      notasAlumno: notasCompletas,
    };
    setSesion(updated);

    const payload = {
      notasAlumno: notasCompletas,
      fechaFinUtc: new Date().toISOString(),
    };

    // Modo demo: cierre local sin llamadas reales ni cola offline.
    if (isDemoMode) {
      setFinishFeedback({
        cumpleRacha: estimarCumpleRachaPorVolumen(updated.ejercicios.flatMap((e) => e.series)),
        nuevaRacha: (semanaProgreso?.rachaDias ?? 0) + 1,
        duracionMinutos: null,
      });
      setPendienteSync(false);
      setIsFinishing(false);
      setIsFinishModalOpen(false);
      triggerHaptic('success');
      return;
    }

    let finalUpdated = updated;
    // WU4: idempotencia persistente también en la finalización (misma key en reintentos).
    const idempotencyKey = generateIdempotencyKey();
    if (navigator.onLine) {
      try {
        const res = await apiClient<FinalizarSesionResponseDTO>(`/sesiones/${sesion.id}/finalizar`, {
          method: 'POST',
          body: JSON.stringify(payload),
          idempotencyKey,
        });
        if (res?.sesion) {
          finalUpdated = res.sesion;
          setSesion(res.sesion);
        }
        if (res) {
          setFinishFeedback({
            cumpleRacha: res.cumpleRacha,
            nuevaRacha: res.nuevaRacha,
            duracionMinutos: res.duracionMinutos ?? res.sesion?.duracionMinutos ?? null,
          });
          setPendienteSync(false);
        }
      } catch (err) {
        // RF-012: bloqueo por ciclo de vida en pleno cierre → pantalla informativa, sin encolar.
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          setIsFinishing(false);
          setIsFinishModalOpen(false);
          return;
        }
        // Defensa (RF-001 Escenario 5): SOLO el 400 con código máquina estable `SESION_VACIA`
        // abre el modal de cierre vacío; cualquier otro 400 es un error normal visible.
        if (err instanceof ApiError && err.status === 400) {
          setSesion(sesion); // revertir el estado optimista
          setIsFinishing(false);
          if (err.problem?.code === 'SESION_VACIA') {
            setIsFinishModalOpen(false);
            setIsEmptyCloseModalOpen(true);
            return;
          }
          setActionError(
            err.problem?.message || err.message || 'No se pudo finalizar la sesión.'
          );
          return;
        }
        await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', payload, 'Finalizar sesión con feedback', idempotencyKey);
        setPendienteSync(true);
        setFinishFeedback(null);
      }
    } else {
      await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', payload, 'Finalizar sesión con feedback', idempotencyKey);
      setPendienteSync(true);
      setFinishFeedback(null);
    }

    if (sesion.id) {
      await cacheSesion(finalUpdated);
    }

    // Actualizar progreso semanal reactivo (incluye racha efectiva)
    await refreshSemana();

    setIsFinishing(false);
    setIsFinishModalOpen(false);
    triggerHaptic('success');
  };

  /**
   * RF-001 Escenario 5: cierre explícito de una sesión sin series completadas.
   * DESCANSADA/INCOMPLETA marcan la sesión como OMITIDA (sin racha) y conservan el historial.
   */
  const confirmEmptyClose = async (tipoCierre: TipoCierreSesion) => {
    if (!sesion) return;
    setIsFinishing(true);

    const fechaFinUtc = new Date().toISOString();
    const motivoOmision =
      tipoCierre === TipoCierreSesion.DESCANSADA ? MotivoOmision.DESCANSO : MotivoOmision.INCOMPLETO;
    const updated: SesionEntrenamientoDetalleDTO = {
      ...sesion,
      estado: EstadoSesion.OMITIDA,
      motivoOmision,
      fechaFinUtc,
      porcentajeCumplimiento: '0.00',
    };
    setSesion(updated);
    setFinishFeedback(null);
    setPendienteSync(false);

    // Modo demo: cierre local sin llamadas reales.
    if (isDemoMode) {
      setIsFinishing(false);
      setIsEmptyCloseModalOpen(false);
      triggerHaptic('success');
      return;
    }

    const payload = { tipoCierre, fechaFinUtc };
    const descripcion =
      tipoCierre === TipoCierreSesion.DESCANSADA ? 'Registrar día descansado' : 'Registrar día incompleto';
    let finalUpdated = updated;
    // WU4: idempotencia persistente también en el cierre vacío (descansado/incompleto).
    const idempotencyKey = generateIdempotencyKey();

    if (navigator.onLine) {
      try {
        const res = await apiClient<FinalizarSesionResponseDTO>(`/sesiones/${sesion.id}/finalizar`, {
          method: 'POST',
          body: JSON.stringify(payload),
          idempotencyKey,
        });
        if (res?.sesion) {
          finalUpdated = res.sesion;
          setSesion(res.sesion);
        }
      } catch (err) {
        // RF-012: bloqueo por ciclo de vida en pleno cierre → pantalla informativa, sin encolar.
        const bloqueoDetectado = resolverBloqueoAlumno(err);
        if (bloqueoDetectado) {
          setBloqueo(bloqueoDetectado);
          setSesion(sesion);
          setIsFinishing(false);
          setIsEmptyCloseModalOpen(false);
          return;
        }
        if (err instanceof ApiError && err.status === 400) {
          setActionError(err.problem?.message || err.message);
          setSesion(sesion); // revertir
          setIsFinishing(false);
          return;
        }
        await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', payload, descripcion, idempotencyKey);
        setPendienteSync(true);
      }
    } else {
      await queueOfflineMutation(`/sesiones/${sesion.id}/finalizar`, 'POST', payload, descripcion, idempotencyKey);
      setPendienteSync(true);
    }

    await cacheSesion(finalUpdated);
    await refreshSemana();

    setIsFinishing(false);
    setIsEmptyCloseModalOpen(false);
    triggerHaptic('success');
  };

  if (isLoading && !sesion && !semanaProgreso) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
      </div>
    );
  }

  // RF-012: pantalla de bloqueo informativa (pausado / suspendido por pago / archivado) en la
  // pantalla principal de entrenamiento. En modo demo jamás se bloquea: los fixtures no
  // representan estados de ciclo de vida reales.
  if (bloqueo && !isDemoMode) {
    return (
      <BloqueoAlumnoPanel bloqueo={bloqueo} onReintentar={() => loadSessionAndProgress()} />
    );
  }

  const isCompleted = sesion?.estado === EstadoSesion.COMPLETADA;
  const isInProgress = sesion?.estado === EstadoSesion.EN_PROGRESO;
  const isPlanned = sesion?.estado === EstadoSesion.PLANIFICADA;
  const isOmitted = sesion?.estado === EstadoSesion.OMITIDA;
  const isReadOnly = isCompleted || isPlanned || isOmitted;
  const selectedBloque = semanaProgreso?.bloques.find((b) => b.bloqueId === selectedBloqueId) ?? null;

  // WU4: resumen de la cola offline para el indicador (nada visible si todo está sincronizado)
  const syncRejected = syncState.summary.rejected;
  const syncUnsynced = syncState.summary.pending + syncState.summary.failed;
  const syncLabelParts: string[] = [];
  if (syncRejected > 0) {
    syncLabelParts.push(
      `${syncRejected} cambio${syncRejected > 1 ? 's' : ''} rechazado${syncRejected > 1 ? 's' : ''}`
    );
  }
  if (syncUnsynced > 0) {
    syncLabelParts.push(
      `${syncUnsynced} cambio${syncUnsynced > 1 ? 's' : ''} sin sincronizar`
    );
  }
  const syncSummaryLabel = syncLabelParts.join(' · ');

  return (
    <div className="space-y-6">
      {/* Errores de acciones explícitas (conflictos, red): visibles y accionables */}
      {actionError && (
        <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* WU4: indicador discreto de la cola offline; ausente cuando todo está sincronizado */}
      {syncSummaryLabel && (
        <button
          type="button"
          onClick={() => setIsSyncPanelOpen(true)}
          title={`${syncSummaryLabel}. Clic para revisar la sincronización.`}
          className={`w-full p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer active:scale-[0.99] ${
            syncRejected > 0
              ? 'bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/15'
              : 'bg-warning/10 border-warning/30 text-warning hover:bg-warning/15'
          }`}
        >
          {syncRejected > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <RefreshCw className={`h-4 w-4 shrink-0 ${syncState.isSyncing ? 'animate-spin' : ''}`} />
          )}
          <span>{syncSummaryLabel}</span>
          <span className="ml-auto text-[11px] uppercase tracking-wider font-bold opacity-80">
            Ver detalles
          </span>
        </button>
      )}

      {/* Barra de Progreso Semanal Interactiva */}
      {semanaProgreso && semanaProgreso.totalBloques > 0 && (
        <div className="p-4 sm:p-5 rounded-3xl bg-card border border-border/80 shadow-md space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary/10 text-primary">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-foreground">
                  Planificación Semanal · {semanaProgreso.semanaIso}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Lunes {semanaProgreso.inicioSemana} al Domingo {semanaProgreso.finSemana}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end sm:self-center">
              <div className="text-right">
                <span className="text-xs font-black font-mono text-foreground">
                  {semanaProgreso.bloquesCompletados}/{semanaProgreso.totalBloques} Bloques
                </span>
                <span className="text-[11px] text-muted-foreground ml-1.5 font-bold">
                  ({semanaProgreso.porcentajeCumplimiento}%)
                </span>
              </div>
              <div className="w-20 sm:w-24 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, parseFloat(semanaProgreso.porcentajeCumplimiento)))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Chips de Bloques de la Semana */}
          {/* Móvil: scroll horizontal con degradado + chevron que insinúan que se puede deslizar */}
          <div className="relative">
            <div
              className="flex items-center gap-2 overflow-x-auto pb-1 pr-10 sm:pr-2 scrollbar-thin"
              aria-label="Bloques de la semana"
              role="group"
            >
            {semanaProgreso.bloques.map((b) => {
              const esActivo = sesion?.bloqueId === b.bloqueId;
              const esCompletado = b.completado;
              const esOmitido = !esCompletado && b.estadoSesion === EstadoSesion.OMITIDA;
              const esSugerido = b.esSugeridoHoy;
              const etiquetaOmision =
                b.motivoOmision === MotivoOmision.DESCANSO ? 'Descansado' : 'Incompleto';
              const detalleFecha = b.fechaCompletadaUtc
                ? `Completado: ${formatFechaHoraLocal(b.fechaCompletadaUtc) ?? ''}`
                : b.fechaProgramada
                ? `Programado: ${formatFechaCalendario(b.fechaProgramada) ?? ''}`
                : null;
              // RN-05: fecha local visible en la tarjeta del bloque (UTC -> Intl del dispositivo)
              const fechaVisible = b.fechaCompletadaUtc
                ? formatFechaLocal(b.fechaCompletadaUtc)
                : formatFechaCalendario(b.fechaProgramada);

              let badgeStyle =
                'bg-secondary/60 text-muted-foreground border-border hover:bg-secondary hover:text-foreground';
              if (esCompletado) {
                badgeStyle = esActivo
                  ? 'bg-success/20 text-success border-success/40 ring-2 ring-success/30 font-extrabold'
                  : 'bg-success/10 text-success border-success/30 hover:bg-success/20 font-bold';
              } else if (esOmitido) {
                badgeStyle =
                  'bg-warning/10 text-warning border-warning/30 hover:bg-warning/20 font-bold';
              } else if (esActivo) {
                badgeStyle =
                  'bg-primary text-primary-foreground border-primary font-black shadow-md shadow-primary/25 ring-2 ring-primary/30';
              } else if (esSugerido) {
                badgeStyle =
                  'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25 font-extrabold';
              }

              return (
                <button
                  key={b.bloqueId}
                  type="button"
                  disabled={isSwitchingBloque}
                  onClick={() => handleSelectBloque(b.bloqueId)}
                  className={`py-2 px-3.5 rounded-2xl border text-xs whitespace-nowrap transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 ${badgeStyle}`}
                  title={
                    detalleFecha ? `Consultar ${b.titulo} · ${detalleFecha}` : `Consultar ${b.titulo}`
                  }
                >
                  {esCompletado ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  ) : esOmitido ? (
                    b.motivoOmision === MotivoOmision.DESCANSO ? (
                      <Coffee className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    )
                  ) : esActivo ? (
                    <Zap className="h-3.5 w-3.5 shrink-0 fill-current" />
                  ) : esSugerido ? (
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  )}
                  <span className="font-semibold">{b.titulo.split(':')[0]}</span>
                  {esCompletado && <span className="text-[11px] font-bold opacity-80">✓</span>}
                  {esOmitido && (
                    <span className="text-[11px] font-bold opacity-90">{etiquetaOmision}</span>
                  )}
                  {fechaVisible && (esCompletado || esOmitido) && (
                    <span className="text-[11px] font-medium opacity-70">{fechaVisible}</span>
                  )}
                  {esActivo && <span className="text-[11px] font-mono uppercase tracking-wider ml-0.5">Hoy</span>}
                  {!esCompletado && !esOmitido && !esActivo && esSugerido && (
                    <span className="text-[11px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                      Sugerido
                    </span>
                  )}
                </button>
              );
            })}
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end pr-0.5 bg-gradient-to-l from-card via-card/70 to-transparent sm:hidden"
              aria-hidden="true"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
            </div>
          </div>
        </div>
      )}

      {/* Error real de red/servidor: estado explícito con retry (nunca datos demo) */}
      {!sesion && loadError && (
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-md text-center space-y-4">
          <div className="h-16 w-16 rounded-3xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-xl font-black text-foreground">No pudimos cargar tu entrenamiento</h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Revisa tu conexión e inténtalo de nuevo. Tu historial no se ha perdido.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadSessionAndProgress(selectedBloqueId ?? undefined)}
            className="mx-auto py-2.5 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/25 hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {/* Offline sin cache: estado vacío honesto (nunca datos demo) */}
      {!sesion && !loadError && isOffline && (
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-md text-center space-y-4">
          <div className="h-16 w-16 rounded-3xl bg-secondary text-muted-foreground flex items-center justify-center mx-auto">
            <WifiOff className="h-8 w-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-xl font-black text-foreground">Sin conexión</h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              No hay datos de entrenamiento guardados en este dispositivo. Cuando recuperes conexión
              podrás cargar tu rutina.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadSessionAndProgress(selectedBloqueId ?? undefined)}
            className="mx-auto py-2.5 px-5 rounded-xl bg-secondary text-foreground border border-border font-bold text-xs hover:bg-secondary/80 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {/* Sin sesión activa: sin rutina, día de descanso o bloque pendiente de instanciar */}
      {!sesion && !loadError && !isOffline && (
        <div className="p-6 sm:p-8 rounded-3xl bg-card border border-border/80 shadow-md text-center space-y-5">
          <div className="h-16 w-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
            {semanaProgreso?.esDiaDescansoHoy ? (
              <Coffee className="h-8 w-8" />
            ) : (
              <Dumbbell className="h-8 w-8" />
            )}
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-xl font-black text-foreground">
              {!semanaProgreso || semanaProgreso.totalBloques === 0
                ? 'Aún no tienes rutina asignada para hoy'
                : semanaProgreso.bloquesCompletados === semanaProgreso.totalBloques
                ? '¡Semana completada!'
                : semanaProgreso.esDiaDescansoHoy
                ? 'Día de descanso según tu plan'
                : selectedBloque
                ? selectedBloque.titulo
                : 'No hay sesión activa seleccionada'}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {!semanaProgreso || semanaProgreso.totalBloques === 0
                ? 'Tu entrenador aún no ha prescrito tu rutina semanal. Cuando la asignes, aparecerá aquí.'
                : semanaProgreso.bloquesCompletados === semanaProgreso.totalBloques
                ? '¡Excelente trabajo! Has completado el 100% de tus bloques semanales. Disfruta tu recuperación o repite un bloque si te queda energía.'
                : semanaProgreso.esDiaDescansoHoy
                ? 'Hoy toca recuperación. Si quieres adelantar o recuperar trabajo, elige un bloque pendiente e inícialo de forma explícita.'
                : 'Elige un bloque pendiente y pulsa "Entrenar este bloque hoy". Consultar la rutina no altera tus sesiones.'}
            </p>
          </div>

          {/* CTA informativo cuando aún no hay rutina publicada */}
          {(!semanaProgreso || semanaProgreso.totalBloques === 0) && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-secondary border border-border text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Tu entrenador aún no ha publicado tu plan semanal
            </span>
          )}

          {/* CTA explícita del bloque seleccionado (acción, no consulta) */}
          {selectedBloque && !selectedBloque.completado && (
            <div className="max-w-lg mx-auto pt-1">
              <button
                type="button"
                disabled={isSwitchingBloque}
                onClick={() => handleEntrenarBloqueHoy(selectedBloque.bloqueId)}
                className="w-full py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-lg shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play className="h-5 w-5 fill-primary-foreground" />
                <span>Entrenar este bloque hoy</span>
              </button>
              {selectedBloque.enfoque && (
                <p className="text-[11px] text-muted-foreground mt-2">{selectedBloque.enfoque}</p>
              )}
            </div>
          )}

          {/* Bloques Pendientes con acción explícita (excluye el ya seleccionado) */}
          {semanaProgreso && semanaProgreso.bloques.filter((b) => !b.completado).length > 0 && (
            <div className="pt-3 border-t border-border/60 max-w-lg mx-auto space-y-2.5">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Otros bloques pendientes de esta semana
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {semanaProgreso.bloques
                  .filter((b) => !b.completado && b.bloqueId !== selectedBloque?.bloqueId)
                  .map((b) => (
                    <button
                      key={b.bloqueId}
                      type="button"
                      disabled={isSwitchingBloque}
                      onClick={() => handleEntrenarBloqueHoy(b.bloqueId)}
                      className="p-3.5 rounded-2xl bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/50 text-left transition-all duration-200 active:scale-98 cursor-pointer flex flex-col justify-between group disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                          {b.titulo}
                        </span>
                        {b.esSugeridoHoy && (
                          <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-primary/20 text-primary">
                            Sugerido
                          </span>
                        )}
                      </div>
                      {b.enfoque && (
                        <span className="text-[11px] text-muted-foreground line-clamp-1">
                          {b.enfoque}
                        </span>
                      )}
                      {b.fechaProgramada && (
                        <span className="text-[11px] text-muted-foreground font-medium">
                          Programado: {formatFechaCalendario(b.fechaProgramada)}
                        </span>
                      )}
                      <div className="mt-2.5 flex items-center justify-between text-[11px] font-bold text-primary">
                        <span>Entrenar este bloque hoy</span>
                        <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Si HAY sesión cargada */}
      {sesion && (
        <>
          {/* Session Hero Banner */}
          <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border/80 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      isCompleted
                        ? 'bg-success/15 text-success border border-success/20'
                        : isInProgress
                        ? 'bg-primary/15 text-primary border border-primary/20'
                        : isOmitted
                        ? 'bg-warning/15 text-warning border border-warning/25'
                        : 'bg-secondary text-muted-foreground border border-border'
                    }`}
                  >
                    {isCompleted
                      ? 'Completada'
                      : isInProgress
                      ? 'En Progreso'
                      : isOmitted
                      ? sesion.motivoOmision === MotivoOmision.DESCANSO
                        ? 'Descansado'
                        : 'Incompleto'
                      : 'Planificada'}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatFechaCalendario(sesion.fechaProgramada) ?? sesion.fechaProgramada}
                  </span>
                  {formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc) && (
                    <span className="text-xs text-muted-foreground">
                      · {formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc)} h local
                    </span>
                  )}
                  {sesion.esDiaDescansoOriginal && (
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-warning/15 text-warning border border-warning/25 flex items-center gap-1">
                      ⏱️ Recuperada en Descanso
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
                  Checklist de Entrenamiento
                </h1>
              </div>

          {/* Compliance & Streak Badge */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
              <Flame
                className={`h-6 w-6 ${
                  sesion.cumpleReglaRacha ? 'text-warning fill-warning animate-pulse' : 'text-muted-foreground'
                }`}
              />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                  Progreso
                </span>
                <span className="text-base sm:text-lg font-black font-mono">
                  {isOmitted ? '—' : `${sesion.porcentajeCumplimiento}%`}
                </span>
              </div>
            </div>

            {sesion.volumenTotalKg && sesion.volumenTotalKg !== '0.00' && (
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
                <Dumbbell className="h-6 w-6 text-primary" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                    Volumen
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-foreground">
                    {formatearPesoConUnidad(sesion.volumenTotalKg, unidadPeso) ??
                      `${sesion.volumenTotalKg} ${unidadPeso}`}
                  </span>
                </div>
              </div>
            )}

            {/* RN-05: duración real de la sesión (UTC -> formato humano local) */}
            {formatDuracionMinutos(sesion.duracionMinutos) && (
              <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-secondary/60 border border-border">
                <Clock className="h-6 w-6 text-primary" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
                    Duración
                  </span>
                  <span className="text-base sm:text-lg font-black font-mono text-foreground">
                    {formatDuracionMinutos(sesion.duracionMinutos)}
                  </span>
                </div>
              </div>
            )}

            {/* Quick Rest Timer Trigger */}
            <button
              onClick={() => setIsRestTimerOpen(!isRestTimerOpen)}
              className="p-3 rounded-2xl bg-secondary/60 border border-border hover:border-primary/50 text-foreground transition-colors flex items-center gap-2 cursor-pointer"
              title="Abrir cronómetro de descanso"
            >
              <Timer className="h-6 w-6 text-primary" />
              <span className="text-xs font-bold hidden sm:inline">Descanso</span>
            </button>

            {/* RN-01: preferencia de unidad de peso (kg/lb) persistida en el dispositivo */}
            <div
              role="group"
              aria-label="Unidad de peso del checklist"
              className="p-1 rounded-2xl bg-secondary/60 border border-border flex items-center gap-1"
            >
              {(['kg', 'lb'] as UnidadPeso[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unidadPeso === u}
                  onClick={() => handleCambiarUnidad(u)}
                  title={`Mostrar y registrar pesos en ${u === 'kg' ? 'kilogramos' : 'libras'}`}
                  className={`min-h-11 px-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 ${
                    unidadPeso === u
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button: Start or Finish */}
        {isPlanned && (
          <button
            onClick={handleStartSession}
            className="w-full py-3.5 px-4 rounded-2xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-lg shadow-primary/25 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="h-5 w-5 fill-primary-foreground" />
            <span>COMENZAR ENTRENAMIENTO</span>
          </button>
        )}

        {isInProgress && (
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <div className="relative flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
                <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
              </div>
              <span>Entrenamiento activo. Marca tus series y pesos al completarlas.</span>
            </div>
            <button
              onClick={handleOpenFinishModal}
              className="py-2.5 px-5 rounded-xl bg-primary hover:brightness-110 text-primary-foreground font-bold text-xs shadow-md shadow-primary/25 active:scale-95 transition-all cursor-pointer"
            >
              Finalizar Entrenamiento
            </button>
          </div>
        )}

        {(isCompleted || isOmitted) && (
          <div className="space-y-3">
            <div
              className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                isOmitted
                  ? 'bg-warning/10 border-warning/25 text-warning'
                  : 'bg-success/10 border-success/20 text-success'
              }`}
            >
              {isOmitted ? (
                <AlertTriangle className="h-6 w-6 shrink-0" />
              ) : (
                <Award className="h-6 w-6 shrink-0" />
              )}
              <div>
                <p className="text-xs font-bold">
                  {isOmitted
                    ? sesion.motivoOmision === MotivoOmision.DESCANSO
                      ? 'Día registrado como descansado'
                      : 'Día registrado como incompleto'
                    : '¡Sesión de entrenamiento finalizada con éxito!'}
                </p>
                <p className={`text-[11px] ${isOmitted ? 'text-warning/90' : 'text-success/80'}`}>
                  {isOmitted
                    ? 'No suma racha. Puedes repetir el entrenamiento cuando quieras: el historial de este día se conserva.'
                    : pendienteSync
                    ? 'Sesión guardada localmente. Se sincronizará con tu coach al recuperar conexión.'
                    : finishFeedback
                    ? finishFeedback.cumpleRacha
                      ? `Sumaste un día a tu racha. Racha: ${pluralizar(finishFeedback.nuevaRacha, 'día', 'días')}.`
                      : 'Sesión guardada. Completa al menos el 70% del plan para sumar racha.'
                    : 'Sesión guardada en tu historial.'}
                </p>
                {(formatDuracionMinutos(sesion.duracionMinutos) ||
                  formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc)) && (
                  <p
                    className={`text-[11px] mt-0.5 font-medium ${
                      isOmitted ? 'text-warning/80' : 'text-success/80'
                    }`}
                  >
                    {formatDuracionMinutos(sesion.duracionMinutos)
                      ? `Duración: ${formatDuracionMinutos(sesion.duracionMinutos)}`
                      : ''}
                    {formatDuracionMinutos(sesion.duracionMinutos) &&
                    formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc)
                      ? ' · '
                      : ''}
                    {formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc)
                      ? `Horario local: ${formatRangoHorasLocal(sesion.fechaInicioUtc, sesion.fechaFinUtc)}`
                      : ''}
                  </p>
                )}
              </div>
            </div>

            {sesion.notasAlumno && (
              <div className="p-3.5 rounded-2xl bg-secondary/50 border border-border/80 text-xs space-y-1">
                <span className="font-bold text-muted-foreground text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 text-primary" />
                  Sensaciones y notas enviadas a tu coach:
                </span>
                <p className="text-foreground font-medium">{sesion.notasAlumno}</p>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                disabled={isSwitchingBloque || !sesion.bloqueId}
                onClick={handleRepetirBloque}
                className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 py-1.5 px-3.5 rounded-xl bg-secondary/80 hover:bg-secondary border border-border/60 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5 text-primary" />
                <span>Repetir entrenamiento</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exercises List */}
      <div className="space-y-4">
        {sesion.ejercicios.map((ejercicioSesion, ejIdx) => {
          const prescripcion = calcularResumenPrescripcion(ejercicioSesion);
          // WU17: descanso real derivado por serie (inicio N − completada N−1); null sin marcas.
          const descansosReales = descansosRealesEntreSeries(ejercicioSesion.series);
          const rpeSugerido = rpeSugeridoPorEjercicio[ejercicioSesion.id] ?? null;
          const pesoPrescritoTexto =
            prescripcion.pesosKg.length === 0
              ? null
              : prescripcion.pesosKg.length === 1
              ? formatearPesoConUnidad(prescripcion.pesosKg[0], unidadPeso)
              : `${formatearPesoDesdeKg(prescripcion.pesosKg[0], unidadPeso)}–${formatearPesoConUnidad(
                  prescripcion.pesosKg[prescripcion.pesosKg.length - 1],
                  unidadPeso
                )}`;
          const pasoVisible = pasoPesoEnUnidad(unidadPeso);
          const nombreEjercicio = ejercicioSesion.ejercicio?.nombre || `Ejercicio #${ejIdx + 1}`;
          const videoUrl = ejercicioSesion.ejercicio?.videoUrl || null;

          return (
          <div
            key={ejercicioSesion.id}
            className="p-4 sm:p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3"
          >
            {/* Exercise Header */}
            <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-3">
              <div>
                <span className="text-xs font-black text-primary uppercase tracking-wider">
                  Ejercicio {ejIdx + 1}
                </span>
                <h3 className="font-black text-lg sm:text-xl text-foreground tracking-tight mt-0.5">
                  {nombreEjercicio}
                </h3>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs sm:text-sm text-muted-foreground font-semibold">
                    {ejercicioSesion.ejercicio?.grupoMuscular}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border">
                    <Timer className="h-3 w-3 text-primary" />
                    <span>Descanso: {formatearSegundos(ejercicioSesion.descansoPrescritoSegundos || 90)}</span>
                  </span>
                  {/* Escenario 1: video demostrativo del catálogo (si existe) */}
                  {videoUrl && (
                    <button
                      type="button"
                      onClick={() => handleAbrirVideo(ejercicioSesion)}
                      aria-label={`Ver video demostrativo de ${nombreEjercicio}`}
                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors cursor-pointer active:scale-95"
                    >
                      <Video className="h-3 w-3" />
                      <span>Ver técnica</span>
                    </button>
                  )}
                </div>
              </div>
              {ejercicioSesion.notasCoach && (
                <div className="p-2.5 rounded-2xl bg-secondary/60 text-muted-foreground flex items-center gap-2 max-w-xs text-xs">
                  <Info className="h-4 w-4 text-primary shrink-0" />
                  <span className="truncate">{ejercicioSesion.notasCoach}</span>
                </div>
              )}
            </div>

            {/* WU3b: Referencia PRESCRITA (solo lectura) — nunca se edita desde el checklist */}
            <div className="flex items-start gap-2 p-2.5 rounded-2xl bg-primary/5 border border-primary/15">
              <ClipboardList className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-primary block leading-none mb-1">
                  Prescrito por tu coach
                </span>
                <p className="text-[11px] sm:text-xs font-bold text-foreground leading-snug">
                  {formatearPrescripcion(prescripcion, unidadPeso)}
                  {rpeSugerido && (
                    <span className="text-muted-foreground font-semibold">
                      {` · RPE sugerido ${rpeSugerido}/10`}
                    </span>
                  )}
                  {!pesoPrescritoTexto && !rpeSugerido && (
                    <span className="text-muted-foreground font-semibold">
                      {` · ${ejercicioSesion.notasCoach ? 'referencia en las notas del coach' : 'sin carga prescrita'}`}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Sets Grid */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Registrado (real)
                </span>
                <span className="h-px flex-1 bg-border/60" aria-hidden="true" />
              </div>
              {/* Cabecera de columnas: solo desde sm; en móvil cada campo lleva su propio label */}
              <div className="hidden sm:grid grid-cols-12 gap-1.5 sm:gap-2.5 text-xs font-black text-muted-foreground uppercase tracking-wider px-2">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-4 text-center">Peso ({unidadPeso})</span>
                <span className="col-span-3 text-center">Reps</span>
                <span className="col-span-2 text-center" title="Nivel de esfuerzo percibido (0 a 10)">RPE</span>
                <span className="col-span-2 text-center">Listo</span>
              </div>

              {ejercicioSesion.series.map((serie, sIdx) => {
                const clavePeso = `${serie.id}:pesoKg`;
                const claveRpe = `${serie.id}:rpe`;
                const claveReps = `${serie.id}:repsLogradas`;
                const borradorPeso = inputDrafts[clavePeso];
                const borradorRpe = inputDrafts[claveRpe];
                const errorPeso = inputErrors[clavePeso];
                const errorRpe = inputErrors[claveRpe];
                const errorReps = inputErrors[claveReps];
                const errorSerie = errorPeso ?? errorRpe ?? errorReps ?? null;
                const pesoMostrado =
                  borradorPeso !== undefined
                    ? borradorPeso
                    : formatearPesoDesdeKg(serie.pesoKg, unidadPeso) ?? '';
                const rpeMostrado = borradorRpe !== undefined ? borradorRpe : serie.rpe || '';
                const prescritoSerie = pesoPrescritoConCarga(serie);

                return (
                <div
                  key={serie.id}
                  className={`p-2 sm:p-2.5 rounded-2xl border transition-all ${
                    serie.completada
                      ? 'bg-success/10 border-success/30'
                      : 'bg-secondary/30 border-border hover:border-primary/40'
                  }`}
                >
                  {/* Móvil: una columna por campo (input legible + steppers táctiles). Desktop: grid de 12. */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:gap-2.5 sm:items-start">
                  <span className="col-span-2 sm:col-span-1 self-center text-left sm:text-center font-mono font-black text-sm sm:text-base text-foreground">
                    #{serie.numeroSerie}
                  </span>

                  {/* Weight Input with Steppers (unidad visible: kg/lb, contrato siempre kg) */}
                  <div className="col-span-2 sm:col-span-4">
                    <span className="sm:hidden mb-1 block text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Peso ({unidadPeso})
                    </span>
                    <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 overflow-hidden transition-colors h-12 sm:h-11 shadow-2xs">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'pesoKg', -1)}
                        aria-label={`Restar ${pasoVisible} ${unidadPeso}`}
                        className="h-full w-11 sm:w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-black shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
                      >
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={isReadOnly}
                        value={pesoMostrado}
                        onChange={(e) =>
                          handleUpdateSerieValue(ejIdx, sIdx, 'pesoKg', e.target.value)
                        }
                        onBlur={() => handleBlurPeso(serie.id)}
                        placeholder={unidadPeso}
                        aria-label={`Peso real en ${unidadPeso}, serie ${serie.numeroSerie}`}
                        aria-invalid={Boolean(errorPeso)}
                        className={`w-full min-w-0 text-center py-2 px-1 bg-transparent text-base font-mono font-black text-foreground focus:outline-hidden ${
                          errorPeso ? 'text-destructive' : ''
                        }`}
                      />
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'pesoKg', 1)}
                        aria-label={`Sumar ${pasoVisible} ${unidadPeso}`}
                        className="h-full w-11 sm:w-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-black shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
                      >
                        +
                      </button>
                    </div>
                    {/* Referencia prescrita por serie: permanece visible mientras el alumno edita */}
                    {prescritoSerie && (
                      <span
                        className="block text-center text-[11px] font-bold text-muted-foreground leading-tight mt-1 sm:mt-0.5 truncate"
                        title={`Plan: ${formatearPesoConUnidad(prescritoSerie, unidadPeso)}`}
                      >
                        Plan: {formatearPesoConUnidad(prescritoSerie, unidadPeso)}
                      </span>
                    )}
                  </div>

                  {/* Reps Input with Steppers (- / + 1 rep) */}
                  <div className="col-span-2 sm:col-span-3">
                    <span className="sm:hidden mb-1 block text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Reps
                    </span>
                    <div className="flex items-center rounded-xl bg-background border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 overflow-hidden transition-colors h-12 sm:h-11 shadow-2xs">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'repsLogradas', -1)}
                        aria-label="Restar 1 repetición"
                        className="h-full w-11 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-black shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        disabled={isReadOnly}
                        value={serie.repsLogradas ?? serie.repsObjetivo}
                        onChange={(e) =>
                          handleUpdateSerieValue(ejIdx, sIdx, 'repsLogradas', e.target.value)
                        }
                        aria-label={`Reps logradas, serie ${serie.numeroSerie}`}
                        aria-invalid={Boolean(errorReps)}
                        className={`w-full min-w-0 text-center py-2 px-1 bg-transparent text-base font-mono font-black text-foreground focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          errorReps ? 'text-destructive' : ''
                        }`}
                      />
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleStepSerieValue(ejIdx, sIdx, 'repsLogradas', 1)}
                        aria-label="Sumar 1 repetición"
                        className="h-full w-11 sm:w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 active:bg-secondary transition-colors cursor-pointer text-base font-black shrink-0 select-none disabled:opacity-30 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-visible:text-primary"
                      >
                        +
                      </button>
                    </div>
                    <span className="block text-center text-[11px] font-bold text-muted-foreground leading-tight mt-1 sm:mt-0.5">
                      Objetivo: {serie.repsObjetivo} reps
                    </span>
                  </div>

                  {/* RPE Input (0-10 validado contra el contrato) */}
                  <div className="col-span-1 sm:col-span-2">
                    <span className="sm:hidden mb-1 block text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      RPE
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={isReadOnly}
                      value={rpeMostrado}
                      onChange={(e) =>
                        handleUpdateSerieValue(ejIdx, sIdx, 'rpe', e.target.value)
                      }
                      onBlur={() => handleBlurRpe(serie.id)}
                      placeholder="8.5"
                      aria-label={`RPE real, serie ${serie.numeroSerie}`}
                      aria-invalid={Boolean(errorRpe)}
                      className={`w-full text-center py-2 px-1 rounded-xl bg-background border text-base sm:text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/25 h-12 sm:h-11 shadow-2xs ${
                        errorRpe ? 'border-destructive text-destructive' : 'border-border'
                      }`}
                    />
                  </div>

                  {/* Complete Checkbox */}
                  <div className="col-span-1 sm:col-span-2">
                    <span className="sm:hidden mb-1 block text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Listo
                    </span>
                    <div className="flex sm:justify-center">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleToggleSet(ejIdx, sIdx)}
                        aria-label={`Marcar serie ${serie.numeroSerie} como ${serie.completada ? 'pendiente' : 'completada'}`}
                        className={`h-12 w-12 sm:h-11 sm:w-11 rounded-2xl flex items-center justify-center transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary ${
                          serie.completada
                            ? 'bg-success-strong text-white shadow-md shadow-success-strong/25 scale-105'
                            : 'bg-background border-2 border-border text-muted-foreground hover:border-primary'
                        }`}
                      >
                        {serie.completada && <Check className="h-5 w-5 sm:h-6 sm:w-6 stroke-[3.5]" />}
                      </button>
                    </div>
                  </div>
                  </div>

                  {/* WU17: captura sin fricción del inicio real (mide el descanso de la próxima serie) */}
                  {!isReadOnly && !serie.completada && !serie.timestampInicioUtc && (
                    <button
                      type="button"
                      onClick={() => handleIniciarSerie(ejIdx, sIdx)}
                      title="Marca el inicio de esta serie para medir tu descanso real"
                      className="mt-1.5 w-full py-1.5 rounded-lg inline-flex items-center justify-center gap-1 text-[11px] font-bold bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20 transition-colors cursor-pointer active:scale-95"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>Iniciar serie</span>
                    </button>
                  )}
                  {!isReadOnly && !serie.completada && serie.timestampInicioUtc && (
                    <p className="mt-1.5 px-1 text-[11px] font-mono font-bold text-primary">
                      Iniciada {formatFechaHoraLocal(serie.timestampInicioUtc) ?? ''}
                    </p>
                  )}
                  {/* WU17: feedback inmediato del descanso real al cerrar la serie */}
                  {serie.completada && descansosReales[sIdx] !== null && (
                    <p className="mt-1.5 px-1 text-[11px] font-mono font-bold text-primary flex items-center gap-1">
                      <Zap className="h-3 w-3 shrink-0" />
                      <span>Descanso real: {formatearDeltaSegundos(descansosReales[sIdx])}</span>
                    </p>
                  )}

                  {/* WU3b: error inline, nunca silencioso */}
                  {errorSerie && (
                    <p
                      role="alert"
                      className="mt-1.5 px-1 text-[11px] font-bold text-destructive flex items-center gap-1"
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>{errorSerie}</span>
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Modal de Finalización y Feedback al Coach */}
      {isFinishModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFinishModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            ref={refModalFinalizar}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-finish-title"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/15 text-primary">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 id="modal-finish-title" className="font-bold text-base text-foreground leading-tight">
                    Finalizar Entrenamiento
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Feedback directo para tu entrenador</p>
                </div>
              </div>
              <button
                onClick={() => setIsFinishModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* RPE Global de la Sesión (Escala completa 1-10) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground">
                  Esfuerzo Percibido Global (RPE)
                </label>
                <span className="text-primary font-mono font-black text-sm">
                  {rpeSesion} / 10 · <span className="text-[11px] font-semibold text-muted-foreground">{getRpeDescription(rpeSesion)}</span>
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setRpeSesion(val);
                    }}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      rpeSesion === val
                        ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 scale-105'
                        : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {val === 1 ? '1 (Bajo)' : val === 8 ? '8 (Ideal)' : val === 10 ? '10 (Max)' : val}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground px-1 font-medium">
                <span>1-4: Descarga / Ligero</span>
                <span>5-6: Moderado</span>
                <span>7-8: Óptimo</span>
                <span>9-10: Al límite</span>
              </div>
            </div>

            {/* Molestias o dolores articulares */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground">
                ¿Sentiste alguna molestia articular o dolor?
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Ninguna 👍', 'Hombro', 'Rodilla', 'Lumbar', 'Codo', 'Muñeca', 'Otra'].map((zona) => (
                  <button
                    key={zona}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setMolestia(zona);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      molestia === zona
                        ? 'bg-warning/20 text-warning border border-warning/40 shadow-xs'
                        : 'bg-secondary/40 text-muted-foreground hover:text-foreground border border-transparent'
                    }`}
                  >
                    {zona}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas para el coach */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Notas u observaciones para tu coach</span>
                <span className="text-[11px] text-muted-foreground font-normal">Opcional</span>
              </label>
              <textarea
                rows={3}
                value={notasCoachInput}
                onChange={(e) => setNotasCoachInput(e.target.value)}
                placeholder="Ej: Tuve que usar mancuernas porque la barra estaba ocupada. Sentí buena energía en sentadillas..."
                className="w-full p-3 rounded-2xl bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary resize-none"
              />
            </div>

            {/* Resumen comparativo de descansos */}
            {(() => {
              if (!sesion) return null;
              let totalReal = 0;
              let totalPresc = 0;
              let count = 0;
              sesion.ejercicios.forEach((ej) => {
                const prescrito = ej.descansoPrescritoSegundos || 90;
                ej.series.forEach((s) => {
                  if (s.completada && s.descansoSegundos) {
                    totalReal += s.descansoSegundos;
                    totalPresc += prescrito;
                    count++;
                  }
                });
              });
              if (count === 0) return null;
              const avgReal = Math.round(totalReal / count);
              const avgPresc = Math.round(totalPresc / count);
              const diff = avgReal - avgPresc;

              return (
                <div className="p-3 rounded-2xl bg-secondary/40 border border-border/70 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Timer className="h-4 w-4 text-primary" />
                    <div>
                      <span className="font-bold text-foreground block">Descanso Promedio</span>
                      <span className="text-[11px] text-muted-foreground">Planificado: {formatearSegundos(avgPresc)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-sm text-foreground">{formatearSegundos(avgReal)}</span>
                    <span
                      className={`text-[11px] font-bold block ${
                        diff > 15
                          ? 'text-warning'
                          : diff < -15
                          ? 'text-info'
                          : 'text-success'
                      }`}
                    >
                      {diff > 0
                        ? `+${formatearSegundos(diff)} extra`
                        : diff < 0
                        ? `${formatearSegundos(-diff)} menos`
                        : 'Adherido al plan'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Botón de Enviar */}
            <button
              onClick={confirmFinishSession}
              disabled={isFinishing}
              className="w-full py-3 px-4 rounded-2xl bg-primary hover:brightness-110 text-primary-foreground font-bold text-xs tracking-wide shadow-md shadow-primary/25 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{isFinishing ? 'Guardando entrenamiento...' : 'Guardar y Enviar al Coach'}</span>
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Modal RF-001 Escenario 5: cierre de sesión sin series completadas */}
      {isEmptyCloseModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEmptyCloseModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            ref={refModalCierreVacio}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-empty-close-title"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-md space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-warning/15 text-warning">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="modal-empty-close-title"
                    className="font-bold text-base text-foreground leading-tight"
                  >
                    No has marcado ninguna serie
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    ¿Deseas registrar este día como descansado o incompleto?
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEmptyCloseModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Ninguna opción suma racha. Si registras el día como descansado o incompleto, la sesión
              queda en tu historial y puedes repetir el entrenamiento más tarde.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isFinishing}
                onClick={() => confirmEmptyClose(TipoCierreSesion.DESCANSADA)}
                className="py-3 px-4 rounded-2xl bg-secondary hover:bg-secondary/80 border border-border font-bold text-xs text-foreground transition-all active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Coffee className="h-4 w-4 text-warning" />
                <span>Registrar como descansado</span>
              </button>
              <button
                type="button"
                disabled={isFinishing}
                onClick={() => confirmEmptyClose(TipoCierreSesion.INCOMPLETA)}
                className="py-3 px-4 rounded-2xl bg-secondary hover:bg-secondary/80 border border-border font-bold text-xs text-foreground transition-all active:scale-98 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span>Registrar como incompleto</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsEmptyCloseModalOpen(false)}
              className="w-full py-2.5 rounded-2xl bg-transparent text-muted-foreground hover:text-foreground text-xs font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* WU3b (Escenario 1): modal de video demostrativo con cierre por Escape y foco accesible */}
      {videoModal &&
        (() => {
          const embedUrl = obtenerUrlVideoEmbebible(videoModal.url);
          return (
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) setVideoModal(null);
              }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
            >
              <div
                ref={refModalVideo}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-video-title"
                tabIndex={-1}
                className="p-5 rounded-3xl bg-card border border-border/80 shadow-2xl w-full max-w-2xl space-y-4"
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 rounded-xl bg-primary/15 text-primary">
                      <Video className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3
                        id="modal-video-title"
                        className="font-bold text-base text-foreground leading-tight"
                      >
                        Técnica del ejercicio
                      </h3>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {videoModal.nombre}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVideoModal(null)}
                    aria-label="Cerrar video demostrativo"
                    className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {embedUrl ? (
                  <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
                    <iframe
                      src={embedUrl}
                      title={`Video demostrativo: ${videoModal.nombre}`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-secondary/50 border border-border space-y-3">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Este video no se puede reproducir embebido. Ábrelo en una pestaña nueva para
                      revisar la técnica completa.
                    </p>
                    <a
                      href={videoModal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/25 hover:brightness-110 active:scale-95 transition-all"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Abrir video</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* WU4: panel compartido de la cola offline (reintentar / descartar rechazadas) */}
      <SyncQueuePanel open={isSyncPanelOpen} onClose={() => setIsSyncPanelOpen(false)} />

      {/* Floating Rest Timer */}
      <RestTimer
        isOpen={isRestTimerOpen}
        initialSeconds={timerSeconds}
        onDurationChange={handleRestDurationChange}
        onClose={() => {
          setIsRestTimerOpen(false);
          setActiveSerieKey(null);
        }}
      />
    </div>
  );
}
