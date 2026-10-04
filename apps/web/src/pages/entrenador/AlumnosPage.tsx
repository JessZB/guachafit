import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import {
  PerfilAlumnoDetalleDTO,
  PerfilEntrenadorDTO,
  AltaManualAlumnoResultadoDTO,
  DirectorioAlumnosDTO,
  Modalidad,
  TipoDocumento,
  EstadoAlumno,
} from '@guachafit/shared';
import {
  construirLinkActivacion,
  construirLinkOnboarding,
  mensajeCorreoBienvenida,
  VIGENCIA_ACTIVACION_TEXTO,
} from '../../lib/onboarding-links';
import {
  calcularResumenDirectorio,
  filtrarDirectorioDemo,
  ROSTER_DEMO_DIRECTORIO,
} from '../../lib/directorio-alumnos';
import { usePaginacionServidor } from '../../lib/use-paginacion-servidor';
import { useValorDebounced } from '../../lib/use-valor-debounced';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { rebanarPagina } from '../../lib/paginacion';
import {
  etiquetaEstadoActivacion,
  etiquetaSemaforoPago,
  formatearDocumento,
} from '../../lib/etiquetas-dominio';
import type { TonoSemaforo } from '../../lib/adherencia';
import { Paginacion } from '../../components/common/Paginacion';
import { CampoWhatsapp } from '../../components/common/CampoWhatsapp';
import { copiarAlPortapapeles, MENSAJE_COPIA_FALLIDA } from '../../lib/acceso-ui';
import {
  componerTelefonoWhatsapp,
  fechaLocalHoyISO,
  PREFIJO_PAIS_POR_DEFECTO,
  textoEdad,
  validarFechaNacimiento,
  validarTelefonoWhatsapp,
} from '../../lib/formulario-registro';
import {
  Users,
  UserPlus,
  Search,
  Lock,
  X,
  CheckCircle2,
  Trash2,
  PauseCircle,
  PlayCircle,
  Pencil,
  Dumbbell,
  AlertTriangle,
  MessageSquare,
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Check,
  Share2,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  DollarSign,
  Activity,
  CreditCard,
  Eye,
} from 'lucide-react';

type FilterEstado = 'todos' | 'activo' | 'pausado' | 'mora' | 'archivados';
type FilterModalidad = 'todas' | 'presencial' | 'remoto';
type ViewMode = 'cards' | 'table';

/** WU25a: página por defecto del directorio (el endpoint acepta hasta 100). */
const TAMANO_PAGINA_POR_DEFECTO = 25;

/**
 * §6: clases del semáforo de pago por tono semántico (DESIGN.md). `sin_cuota` es neutro:
 * no es deuda y nunca se pinta en rojo.
 */
const CLASES_TEXTO_SEMAFORO_PAGO: Record<TonoSemaforo, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-muted-foreground',
};

const CLASES_PUNTO_SEMAFORO_PAGO: Record<TonoSemaforo, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
};

export function AlumnosPage() {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();

  // WU25a: estado de la paginación numerada + filtros server-side.
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(TAMANO_PAGINA_POR_DEFECTO);
  const [search, setSearch] = useState('');
  const qDebounced = useValorDebounced(search);
  const [filterEstado, setFilterEstado] = useState<FilterEstado>('todos');
  const [filterModalidad, setFilterModalidad] = useState<FilterModalidad>('todas');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [isCopied, setIsCopied] = useState(false);
  const [errorCopiaCaptacion, setErrorCopiaCaptacion] = useState<string | null>(null);
  // D5: fallo de mutación visible; nunca éxito falso ni alumno fantasma.
  const [actionError, setActionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // New Athlete Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(TipoDocumento.V);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  // Sin datos precargados: fecha vacía y WhatsApp con prefijo de país editable.
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [prefijoWhatsapp, setPrefijoWhatsapp] = useState(PREFIJO_PAIS_POR_DEFECTO);
  const [numeroWhatsapp, setNumeroWhatsapp] = useState('');
  const [modalidad, setModalidad] = useState<Modalidad>(Modalidad.PRESENCIAL);
  const [fichaSaludPrivada, setFichaSaludPrivada] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // WU-E (RF-011 RN-05): resultado del alta con el enlace de activación que el coach comparte.
  const [alumnoCreado, setAlumnoCreado] = useState<{
    nombres: string;
    apellidos: string;
    linkActivacion: string;
    /** Solo si el servidor confirmó que el correo de bienvenida quedó en camino. */
    correoEnviado: boolean;
  } | null>(null);
  const [activacionCopiada, setActivacionCopiada] = useState(false);
  const [errorCopiaActivacion, setErrorCopiaActivacion] = useState<string | null>(null);

  // WU-E (RF-011 RN-06): el enlace de captación usa el coachCode REAL del entrenador
  // (GET /entrenador/perfil). Nunca un código hardcodeado; en modo demo no se consulta la API.
  const [coachCode, setCoachCode] = useState<string | null>(null);
  const [coachCodeError, setCoachCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      // Modo demo explícito: sin llamadas a la API real. El enlace se muestra solo con el
      // código real del entrenador; no se inventa una identidad de coach para la demo.
      setCoachCode(null);
      setCoachCodeError(null);
      return;
    }

    let cancelado = false;
    apiClient<PerfilEntrenadorDTO>('/entrenador/perfil')
      .then((perfil) => {
        if (cancelado) return;
        setCoachCode(perfil.coachCode);
        setCoachCodeError(null);
      })
      .catch(() => {
        if (cancelado) return;
        setCoachCode(null);
        setCoachCodeError('No se pudo cargar tu enlace de captación. Recarga la página.');
      });

    return () => {
      cancelado = true;
    };
  }, [isDemoMode]);

  const registrationUrl = coachCode
    ? construirLinkOnboarding(coachCode, window.location.origin)
    : null;

  /**
   * WU25a: carga de UNA página del directorio. Los filtros viajan al servidor (`q`, `estado`,
   * `modalidad`, `soloArchivados`/`incluirArchivados`, `semaforoPago`) y el `resumen` sigue
   * llegando completo en cada respuesta para los KPIs. En modo demo se filtra y se corta el
   * roster local con la MISMA semántica, sin llamadas API.
   */
  const cargarPagina = useCallback(
    async ({
      pagina: paginaSolicitada,
      tamano: tamanoSolicitado,
      signal,
    }: {
      pagina: number;
      tamano: number;
      signal: AbortSignal;
    }): Promise<DirectorioAlumnosDTO> => {
      const offset = (paginaSolicitada - 1) * tamanoSolicitado;

      if (isDemoMode) {
        const filtrados = filtrarDirectorioDemo(ROSTER_DEMO_DIRECTORIO, {
          q: qDebounced,
          estado: filterEstado,
          modalidad: filterModalidad,
        });
        return {
          items: rebanarPagina(filtrados, paginaSolicitada, tamanoSolicitado),
          total: filtrados.length,
          limit: tamanoSolicitado,
          offset,
          // Los KPIs demo siempre describen la cartera completa, como el servidor.
          resumen: calcularResumenDirectorio(ROSTER_DEMO_DIRECTORIO),
        };
      }

      const parametros = new URLSearchParams({
        limit: String(tamanoSolicitado),
        offset: String(offset),
      });
      if (qDebounced.trim().length > 0) parametros.set('q', qDebounced.trim());
      if (filterEstado === 'activo') parametros.set('estado', EstadoAlumno.ACTIVO);
      if (filterEstado === 'pausado') parametros.set('estado', EstadoAlumno.INACTIVO_PAUSADO);
      if (filterEstado === 'mora') parametros.set('semaforoPago', 'moroso');
      if (filterEstado === 'archivados') parametros.set('soloArchivados', 'true');
      // "Todos" = cartera completa (vigentes + archivados), coherente con el KPI "Total Cartera".
      if (filterEstado === 'todos') parametros.set('incluirArchivados', 'true');
      if (filterModalidad === 'presencial') parametros.set('modalidad', Modalidad.PRESENCIAL);
      if (filterModalidad === 'remoto') parametros.set('modalidad', Modalidad.REMOTO);

      return apiClient<DirectorioAlumnosDTO>(`/alumnos?${parametros.toString()}`, { signal });
    },
    [isDemoMode, qDebounced, filterEstado, filterModalidad]
  );

  const paginacion = usePaginacionServidor<PerfilAlumnoDetalleDTO, DirectorioAlumnosDTO>({
    // La clave incluye los filtros activos: cada combinación tiene su propia caché y su página.
    clave: [
      'directorio-alumnos',
      isDemoMode ? 'demo' : 'real',
      qDebounced.trim(),
      filterEstado,
      filterModalidad,
    ],
    pagina,
    tamano,
    cargar: cargarPagina,
    onAjustarPagina: setPagina,
  });

  const {
    items: alumnos,
    total,
    cargando,
    error: errorCarga,
    recargar,
    respuesta,
  } = paginacion;
  const resumen = respuesta?.resumen ?? null;
  // Solo la PRIMERA carga (sin datos en pantalla) muestra esqueletos; los cambios de página
  // conservan la lista anterior gracias a `keepPreviousData`.
  const isLoading = cargando && !respuesta;
  const error = errorCarga?.message ?? null;

  // WU25a: cualquier cambio de búsqueda/filtro/tamaño vuelve a la página 1 (el offset anterior
  // ya no aplica). El modo demo también reinicia para no arrastrar páginas del roster real.
  useEffect(() => {
    setPagina(1);
    setActionError(null);
  }, [qDebounced, filterEstado, filterModalidad, tamano, isDemoMode]);

  /**
   * WU-E: apertura limpia del modal de inscripción (nunca arrastra el enlace de un alta previa).
   */
  const abrirModalInscripcion = () => {
    setAlumnoCreado(null);
    setFormError(null);
    setActivacionCopiada(false);
    setErrorCopiaActivacion(null);
    setIsModalOpen(true);
  };

  // C5: el portapapeles puede fallar (permiso denegado, navegador sin API): aviso para copiar a mano.
  const handleCopyLink = async () => {
    if (!registrationUrl) return;
    const ok = await copiarAlPortapapeles(registrationUrl);
    setErrorCopiaCaptacion(ok ? null : MENSAJE_COPIA_FALLIDA);
    if (!ok) return;
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopyActivacionLink = async () => {
    if (!alumnoCreado) return;
    const ok = await copiarAlPortapapeles(alumnoCreado.linkActivacion);
    setErrorCopiaActivacion(ok ? null : MENSAJE_COPIA_FALLIDA);
    if (!ok) return;
    setActivacionCopiada(true);
    setTimeout(() => setActivacionCopiada(false), 2000);
  };

  /** Cierre limpio del modal: nunca deja a la vista el enlace de un alta anterior. */
  const cerrarModal = () => {
    setIsModalOpen(false);
    setAlumnoCreado(null);
    setFormError(null);
    setActivacionCopiada(false);
    setErrorCopiaActivacion(null);
  };

  // U3b: Escape, trampa de Tab, foco inicial y restore del foco al disparador.
  const refModalInscripcion = useDialogoAccesible({ abierto: isModalOpen, onCerrar: cerrarModal });

  const handleCrearAlumnoManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const errorValidacion =
      validarTelefonoWhatsapp(prefijoWhatsapp, numeroWhatsapp) ??
      validarFechaNacimiento(fechaNacimiento);
    if (errorValidacion) {
      setFormError(errorValidacion);
      return;
    }

    setIsSubmitting(true);

    try {
      const resultado = await apiClient<AltaManualAlumnoResultadoDTO>('/alumnos/manual', {
        method: 'POST',
        body: JSON.stringify({
          nombres,
          apellidos,
          email,
          tipoDocumento,
          numeroDocumento,
          fechaNacimiento,
          telefonoWhatsapp: componerTelefonoWhatsapp(prefijoWhatsapp, numeroWhatsapp),
          modalidad,
          fichaSaludPrivada: fichaSaludPrivada || undefined,
        }),
      });

      // WU-E (RF-011 RN-05): el servidor intenta enviar la bienvenida por correo y dice si quedó
      // en camino; el enlace visible y copiable es el respaldo (o la vía principal si no salió).
      setAlumnoCreado({
        nombres: resultado.nombres,
        apellidos: resultado.apellidos,
        correoEnviado: resultado.correoEnviado === true,
        linkActivacion: construirLinkActivacion(
          resultado.tokenInvitacion,
          window.location.origin
        ),
      });
      // WU25a: el alta vive en el servidor; se vuelve a la página 1 y se recarga la fuente de
      // verdad (nunca se inventa un alumno local ni se ajusta el resumen a mano).
      setPagina(1);
      recargar();
    } catch (err: any) {
      // D5: sin alumno fantasma; el alta solo existe si el servidor la aceptó.
      setFormError(
        err?.message || 'No se pudo registrar al alumno. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestaurarAlumno = async (alumnoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    try {
      await apiClient.patch(`/alumnos/${alumnoId}/restaurar`, {});
      // WU25a: la restauración mueve al alumno de pestaña; se recarga la página actual desde el
      // servidor en lugar de mutar la fila en memoria.
      recargar();
    } catch (err: any) {
      setActionError(err?.message || 'No se pudo restaurar al alumno. Inténtalo de nuevo.');
    }
  };

  // WU25a: KPIs reales de la cartera. Vienen del `resumen` del servidor (COUNT real, cartera
  // completa, independiente de la página y de los filtros); en demo se derivan del roster local
  // y sirven de respaldo si una respuesta no trae resumen.
  const kpis = useMemo(
    () => resumen ?? calcularResumenDirectorio(alumnos),
    [resumen, alumnos]
  );

  // WU25a: con paginación server-side la lista ya llega filtrada y recortada a la página actual.
  const hayFiltrosActivos =
    search.trim().length > 0 || filterEstado !== 'todos' || filterModalidad !== 'todas';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER PRINCIPAL */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Users className="h-4 w-4" />
              <span>Alumnos</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Gestión de Alumnos
            </h1>
            <p className="text-xs text-muted-foreground">
              Datos, planes y pagos de cada alumno.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle de Vista Cards / Tabla */}
            <div className="flex items-center p-1 rounded-xl bg-secondary/80 border border-border/80">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista en tarjetas"
                aria-label="Vista en tarjetas"
                aria-pressed={viewMode === 'cards'}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`min-h-11 min-w-11 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista en tabla"
                aria-label="Vista en tabla"
                aria-pressed={viewMode === 'table'}
              >
                <TableIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Inscribir Alumno */}
            <button
              onClick={abrirModalInscripcion}
              className="min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Inscribir Manual</span>
            </button>
          </div>
        </div>

        {/* KPIs EN CABECERA INTERACTIVOS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-2 border-t border-border/60 text-xs">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFilterEstado('todos');
              setFilterModalidad('todas');
            }}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 hover:scale-[1.02] active:scale-[0.98] ${
              filterEstado === 'todos' && filterModalidad === 'todas'
                ? 'bg-secondary/80 border-primary/50 shadow-xs ring-1 ring-primary/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
              Total Cartera
            </span>
            <p className="font-mono font-black text-xl sm:text-2xl text-foreground tracking-tight">
              {kpis.total}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFilterEstado('activo');
            }}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 hover:scale-[1.02] active:scale-[0.98] ${
              filterEstado === 'activo'
                ? 'bg-success/10 border-success/50 shadow-xs ring-1 ring-success/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
              Activos
            </span>
            <p className="font-mono font-black text-xl sm:text-2xl text-success tracking-tight">
              {kpis.activos}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFilterEstado('pausado');
            }}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 hover:scale-[1.02] active:scale-[0.98] ${
              filterEstado === 'pausado'
                ? 'bg-warning/10 border-warning/50 shadow-xs ring-1 ring-warning/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
              Pausados
            </span>
            <p className="font-mono font-black text-xl sm:text-2xl text-warning tracking-tight">
              {kpis.pausados}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFilterEstado('mora');
            }}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 hover:scale-[1.02] active:scale-[0.98] ${
              filterEstado === 'mora'
                ? 'bg-danger/10 border-danger/50 shadow-xs ring-1 ring-danger/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
                En Mora
              </span>
              {kpis.morosos > 0 && (
                <span className="h-2 w-2 rounded-full bg-danger animate-pulse" />
              )}
            </div>
            <p className="font-mono font-black text-xl sm:text-2xl text-danger tracking-tight">
              {kpis.morosos}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFilterModalidad('presencial');
            }}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 hover:scale-[1.02] active:scale-[0.98] ${
              filterModalidad === 'presencial'
                ? 'bg-primary/10 border-primary/50 shadow-xs ring-1 ring-primary/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
              Presenciales
            </span>
            <p className="font-mono font-black text-xl sm:text-2xl text-primary tracking-tight">
              {kpis.presenciales}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setFilterEstado('archivados');
            }}
            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 hover:scale-[1.02] active:scale-[0.98] ${
              filterEstado === 'archivados'
                ? 'bg-secondary/80 border-border shadow-xs ring-1 ring-border'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">
              Archivados
            </span>
            <p className="font-mono font-black text-xl sm:text-2xl text-muted-foreground tracking-tight">
              {kpis.archivados}
            </p>
          </button>
        </div>
      </div>

      {/* BANNER DE CAPTACIÓN / DEEP LINK (RF-011 Vía B) */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary font-bold text-xs">
            <Share2 className="h-4 w-4" />
            <span>Tu enlace de registro para alumnos</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {registrationUrl
              ? 'Comparte este enlace con tus prospectos para que se autorregistren y se vinculen automáticamente a tu cartera.'
              : coachCodeError ||
                (isDemoMode
                  ? 'En la demo no se muestra tu código real; inicia sesión con tu cuenta para ver tu enlace.'
                  : 'Cargando tu enlace personalizado...')}
          </p>
          {coachCode && (
            <p className="text-xs text-muted-foreground font-mono">
              Tu código: <span className="text-primary font-bold">{coachCode}</span>
            </p>
          )}
          {errorCopiaCaptacion && (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {errorCopiaCaptacion}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            disabled={!registrationUrl}
            className="min-h-11 py-2 px-3.5 rounded-xl bg-card hover:bg-secondary text-foreground text-xs font-bold border border-border flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-primary" />}
            <span>{isCopied ? '¡Enlace copiado!' : 'Copiar enlace'}</span>
          </button>

          {registrationUrl ? (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `¡Hola! Para inscribirte conmigo en Guachafit y comenzar tu planificación deportiva, completa tu registro aquí: ${registrationUrl}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 py-2 px-3.5 rounded-xl bg-success-strong hover:bg-success-strong/90 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-success-strong/20 transition-all active:scale-95 cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Compartir por WhatsApp</span>
            </a>
          ) : (
            <span className="py-2 px-3.5 rounded-xl bg-card/60 text-muted-foreground text-xs font-bold border border-border">
              Enlace no disponible
            </span>
          )}
        </div>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Chips de Estado */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterEstado('todos')}
              className={`min-h-11 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'todos'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos ({kpis.total})
            </button>
            <button
              onClick={() => setFilterEstado('activo')}
              className={`min-h-11 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'activo'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Activos ({kpis.activos})
            </button>
            <button
              onClick={() => setFilterEstado('pausado')}
              className={`min-h-11 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'pausado'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Pausados ({kpis.pausados})
            </button>
            <button
              onClick={() => setFilterEstado('mora')}
              className={`min-h-11 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'mora'
                  ? 'bg-danger-strong text-white shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              En Mora ({kpis.morosos})
            </button>
            <button
              onClick={() => setFilterEstado('archivados')}
              className={`min-h-11 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'archivados'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Archivados ({kpis.archivados})
            </button>
          </div>

          {/* Selector de Modalidad */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterModalidad('todas')}
              className={`min-h-11 py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterModalidad === 'todas'
                  ? 'bg-foreground text-background font-bold'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterModalidad('presencial')}
              className={`min-h-11 py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterModalidad === 'presencial'
                  ? 'bg-foreground text-background font-bold'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Presencial
            </button>
            <button
              onClick={() => setFilterModalidad('remoto')}
              className={`min-h-11 py-1 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterModalidad === 'remoto'
                  ? 'bg-foreground text-background font-bold'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Remoto
            </button>
          </div>
        </div>

        {/* Input de Búsqueda */}
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-3.5" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido, correo o documento..."
            aria-label="Buscar alumnos"
            className="w-full min-h-11 pl-10 pr-4 py-2.5 rounded-2xl bg-card border border-border text-xs text-foreground focus:outline-hidden focus:border-primary shadow-xs"
          />
        </div>
      </div>

      {/* WU25a: paginación numerada server-side (contador + filas por página 10/25/50/100).
          WU26: con total=0 no se pinta ("Página 1 de 1 · 0 registros" sobra junto al estado
          vacío, tenga o no filtros activos). */}
      {!isLoading && !error && total > 0 && (
        <div className="px-1">
          <Paginacion
            pagina={pagina}
            tamano={tamano}
            total={total}
            onCambiarPagina={setPagina}
            onCambiarTamano={setTamano}
            cargando={cargando}
          />
        </div>
      )}

      {/* D2: error de carga honesto con reintento (sin roster demo fuera del modo demo) */}
      {!isLoading && error && (
        <div className="p-6 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => recargar()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* D5: fallo visible de acciones (restaurar) sin mutación local silenciosa */}
      {!isLoading && !error && actionError && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* WU25a: estado vacío honesto — cartera sin alumnos o búsqueda/filtros sin coincidencias */}
      {!isLoading && !error && total === 0 && (
        <div className="p-8 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
          {hayFiltrosActivos ? (
            <>
              <Search className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
              <p className="text-xs font-bold text-foreground">Sin resultados</p>
              <p className="text-xs text-muted-foreground">
                Ningún alumno coincide con la búsqueda o los filtros aplicados.
              </p>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setSearch('');
                  setFilterEstado('todos');
                  setFilterModalidad('todas');
                }}
                className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <Users className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
              <p className="text-xs text-muted-foreground">
                Todavía no hay alumnos en tu cartera. Inscribe al primero o comparte tu enlace de
                registro.
              </p>
            </>
          )}
        </div>
      )}

      {/* VISTA 1: CARDS COMPACTAS DENSAS (~120px) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {alumnos.map((a) => {
            const estadoPago = etiquetaSemaforoPago(a.semaforoPago);
            const isArchived = Boolean(a.deletedAtUtc);

            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  triggerHaptic('light');
                  navigate(`/coach/alumnos/${a.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerHaptic('light');
                    navigate(`/coach/alumnos/${a.id}`);
                  }
                }}
                aria-label={`Ver expediente de ${a.nombres} ${a.apellidos}`}
                className="p-4 rounded-3xl bg-card border border-border/80 shadow-xs space-y-2.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary transition-all duration-200 cursor-pointer group flex flex-col justify-between"
              >
                {/* Top Row: Avatar, Nombre y Semáforo */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-xl bg-secondary/80 border border-border/70 flex items-center justify-center text-primary font-black text-sm shrink-0 group-hover:border-primary/40 group-hover:bg-primary/10 transition-colors">
                        {a.nombres[0]}
                        {a.apellidos[0]}
                      </div>
                      {/* Punto de Semáforo */}
                      <span
                        className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-card ${CLASES_PUNTO_SEMAFORO_PAGO[estadoPago.tono]}`}
                        title={`Estado de pago: ${estadoPago.texto}`}
                      />
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-black text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {a.nombres} {a.apellidos}
                      </h3>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {formatearDocumento(a.tipoDocumento, a.numeroDocumento) ?? '—'} •{' '}
                        {a.edadCalculada}a
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border uppercase shrink-0">
                    {a.modalidad}
                  </span>
                </div>

                {/* Middle Info: Plan y Estado */}
                <div className="flex items-center justify-between text-xs border-t border-border/40 pt-2 text-muted-foreground">
                  {/* D6: sin plan real se muestra "Sin plan asignado"; nunca un nombre inventado. */}
                  {a.planActivoNombre ? (
                    <span className="truncate">{a.planActivoNombre}</span>
                  ) : (
                    <span className="truncate italic">Sin plan asignado</span>
                  )}
                  <span
                    className={`font-mono font-bold uppercase text-xs ${CLASES_TEXTO_SEMAFORO_PAGO[estadoPago.tono]}`}
                  >
                    {estadoPago.texto}
                  </span>
                </div>

                {/* Bottom Row: Botón WhatsApp y Acción */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {a.telefonoWhatsapp}
                  </span>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`https://wa.me/${a.telefonoWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Hola ${a.nombres}, te contacto desde Guachafit.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-success/15 hover:bg-success/30 text-success border border-success/20 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-success"
                      title="Enviar mensaje por WhatsApp"
                      aria-label={`Enviar mensaje de WhatsApp a ${a.nombres}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </a>

                    {isArchived ? (
                      <button
                        type="button"
                        onClick={(e) => handleRestaurarAlumno(a.id, e)}
                        className="min-h-11 py-1 px-3 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
                        title="Restaurar alumno archivado"
                        aria-label={`Restaurar alumno ${a.nombres} ${a.apellidos}`}
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Restaurar</span>
                      </button>
                    ) : (
                      <div
                        className="p-1.5 rounded-lg bg-secondary/70 text-muted-foreground border border-border/60 group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground transition-all flex items-center justify-center group-hover:translate-x-0.5"
                        aria-hidden="true"
                      >
                        <ChevronRight className="h-3.5 w-3.5 transition-colors" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VISTA 2: VISTA TABLA */}
      {viewMode === 'table' && (
        <div className="p-4 rounded-3xl bg-card border border-border shadow-xs overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-border/80 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="py-3 px-3">Alumno</th>
                <th className="py-3 px-3">Documento</th>
                <th className="py-3 px-3">Modalidad</th>
                <th className="py-3 px-3">Estado</th>
                <th className="py-3 px-3">Semáforo de Pago</th>
                <th className="py-3 px-3">Contacto</th>
                <th className="py-3 px-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {alumnos.map((a) => {
                const estadoPago = etiquetaSemaforoPago(a.semaforoPago);
                const isArchived = Boolean(a.deletedAtUtc);

                return (
                  <tr
                    key={a.id}
                    onClick={() => navigate(`/coach/alumnos/${a.id}`)}
                    className="hover:bg-secondary/30 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                          {a.nombres[0]}
                          {a.apellidos[0]}
                        </div>
                        <div>
                          <p className="font-extrabold text-foreground group-hover:text-primary transition-colors">
                            {a.nombres} {a.apellidos}
                          </p>
                          <span className="text-xs text-muted-foreground">{a.email}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono">
                      {formatearDocumento(a.tipoDocumento, a.numeroDocumento) ?? '—'} (
                      {a.edadCalculada}a)
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border uppercase">
                        {a.modalidad}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${
                          isArchived
                            ? 'bg-muted text-muted-foreground border border-border'
                            : a.estadoActivacion === EstadoAlumno.ACTIVO
                            ? 'bg-success/15 text-success border border-success/20'
                            : 'bg-warning/15 text-warning border border-warning/20'
                        }`}
                      >
                        {isArchived ? 'Archivado' : etiquetaEstadoActivacion(a.estadoActivacion)}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono font-bold">
                      <span
                        className={`text-xs uppercase ${CLASES_TEXTO_SEMAFORO_PAGO[estadoPago.tono]}`}
                      >
                        ● {estadoPago.texto}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-muted-foreground">
                      {a.telefonoWhatsapp}
                    </td>

                    <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`https://wa.me/${a.telefonoWhatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer"
                          aria-label={`Contactar por WhatsApp a ${a.nombres}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-success" />
                        </a>

                        {isArchived ? (
                          <button
                            type="button"
                            onClick={(e) => handleRestaurarAlumno(a.id, e)}
                            className="min-h-11 py-1 px-3 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                            aria-label={`Restaurar alumno ${a.nombres} ${a.apellidos}`}
                          >
                            <RefreshCw className="h-3 w-3" />
                            <span>Restaurar</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              navigate(`/coach/alumnos/${a.id}`);
                            }}
                            className="min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-all cursor-pointer"
                            aria-label={`Ver expediente de ${a.nombres} ${a.apellidos}`}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: INSCRIPCIÓN MANUAL EN SALA */}
      {isModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModal();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            ref={refModalInscripcion}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-inscripcion-title"
            tabIndex={-1}
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 id="modal-inscripcion-title" className="font-bold text-base text-foreground">
                  Inscripción Manual en Sala
                </h3>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                aria-label="Cerrar"
                className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {alumnoCreado ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-success/10 border border-success/30 text-center space-y-1.5">
                  <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
                  <p className="text-sm font-bold text-foreground">
                    {alumnoCreado.nombres} {alumnoCreado.apellidos} fue registrado en tu cartera.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mensajeCorreoBienvenida(alumnoCreado.correoEnviado, 'alumno')}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="alta-enlace-activacion" className="text-xs font-semibold text-muted-foreground">
                    Enlace para crear su contraseña (se usa una vez y vence en {VIGENCIA_ACTIVACION_TEXTO})
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="alta-enlace-activacion"
                      type="text"
                      readOnly
                      value={alumnoCreado.linkActivacion}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border font-mono text-xs text-foreground focus:outline-hidden focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={handleCopyActivacionLink}
                      className="shrink-0 min-h-11 py-2 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                    >
                      {activacionCopiada ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>{activacionCopiada ? '¡Copiado!' : 'Copiar enlace'}</span>
                    </button>
                  </div>
                  {errorCopiaActivacion && (
                    <p role="alert" className="text-xs font-semibold text-destructive">
                      {errorCopiaActivacion}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={cerrarModal}
                  className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-secondary text-foreground font-bold text-sm border border-border hover:bg-secondary/80 active:scale-98 transition-all cursor-pointer"
                >
                  Listo
                </button>
              </div>
            ) : (
              <form onSubmit={handleCrearAlumnoManual} className="space-y-3">
                {formError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="alta-nombres" className="text-xs font-semibold text-muted-foreground">Nombres</label>
                    <input
                      id="alta-nombres"
                      autoComplete="off"
                      type="text"
                      required
                      value={nombres}
                      onChange={(e) => setNombres(e.target.value)}
                      placeholder="Carlos"
                      className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="alta-apellidos" className="text-xs font-semibold text-muted-foreground">Apellidos</label>
                    <input
                      id="alta-apellidos"
                      autoComplete="off"
                      type="text"
                      required
                      value={apellidos}
                      onChange={(e) => setApellidos(e.target.value)}
                      placeholder="Mendoza"
                      className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="alta-email" className="text-xs font-semibold text-muted-foreground">Correo electrónico</label>
                  <input
                    id="alta-email"
                    autoComplete="off"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="carlos@email.com"
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1 col-span-1">
                    <label htmlFor="alta-tipo-documento" className="text-xs font-semibold text-muted-foreground">Tipo de documento</label>
                    <select
                      id="alta-tipo-documento"
                      value={tipoDocumento}
                      onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                      className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    >
                      <option value={TipoDocumento.V}>V-</option>
                      <option value={TipoDocumento.E}>E-</option>
                      <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
                    </select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label htmlFor="alta-documento" className="text-xs font-semibold text-muted-foreground">Número de documento</label>
                    <input
                      id="alta-documento"
                      autoComplete="off"
                      type="text"
                      required
                      value={numeroDocumento}
                      onChange={(e) => setNumeroDocumento(e.target.value)}
                      placeholder="24123456"
                      className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="alta-nacimiento" className="text-xs font-semibold text-muted-foreground">Fecha de nacimiento</label>
                    <input
                      id="alta-nacimiento"
                      autoComplete="off"
                      type="date"
                      required
                      max={fechaLocalHoyISO()}
                      value={fechaNacimiento}
                      onChange={(e) => setFechaNacimiento(e.target.value)}
                      aria-describedby="alta-edad"
                      className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    />
                    <p id="alta-edad" aria-live="polite" className="text-xs font-mono font-bold text-primary min-h-4">
                      {textoEdad(fechaNacimiento) ?? ''}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="alta-modalidad" className="text-xs font-semibold text-muted-foreground">Modalidad</label>
                    <select
                      id="alta-modalidad"
                      value={modalidad}
                      onChange={(e) => setModalidad(e.target.value as Modalidad)}
                      className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    >
                      <option value={Modalidad.PRESENCIAL}>Presencial</option>
                      <option value={Modalidad.REMOTO}>Remoto</option>
                    </select>
                  </div>
                </div>

                <CampoWhatsapp
                  idBase="alta-whatsapp"
                  prefijo={prefijoWhatsapp}
                  numero={numeroWhatsapp}
                  onCambiarPrefijo={setPrefijoWhatsapp}
                  onCambiarNumero={setNumeroWhatsapp}
                  etiquetaClassName="text-xs font-semibold text-muted-foreground"
                  ayuda="Número sin el código de país; el prefijo va en la casilla de la izquierda."
                />

                <div className="space-y-1">
                  <label htmlFor="alta-ficha-salud" className="text-xs font-semibold text-muted-foreground">
                    Ficha médica confidencial (se guarda cifrada)
                  </label>
                  <textarea
                    id="alta-ficha-salud"
                    rows={2}
                    value={fichaSaludPrivada}
                    onChange={(e) => setFichaSaludPrivada(e.target.value)}
                    placeholder="Lesiones previas, dolor articular, recomendaciones..."
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 mt-2 cursor-pointer"
                >
                  {isSubmitting ? 'Inscribiendo alumno...' : 'Inscribir Alumno'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
