import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/auth-context';
import { triggerHaptic } from '../../lib/haptics';
import {
  formatDuracionMinutos,
  formatFechaCalendario,
  formatRangoHorasLocal,
} from '../../lib/date-format';
import {
  etiquetaEstadoSesion,
  parsearNotasAlumno,
  type TonoSemaforo,
} from '../../lib/adherencia';
import { normalizarPesoPrescritoTexto } from '../../lib/weight-unit';
import { construirPayloadCheckinAntropometrico } from '../../lib/antropometria-checkin';
import {
  NOMBRES_DIAS_SEMANA,
  OPCIONES_DIAS_SEMANA,
  actualizarConfiguracionBloque,
  crearBloqueEdicion,
  crearEjercicioEdicion,
  generarTituloBloque,
  parsearBloqueParaEdicion,
  type BloqueEdicion,
} from '../../lib/rutina-bloques';
import { CampoPesoPrescrito } from '../../components/entrenador/CampoPesoPrescrito';
import { SelectorPlantillaAsignacion } from '../../components/entrenador/SelectorPlantillaAsignacion';
import {
  PerfilAlumnoDetalleDTO,
  ResumenFinancieroAlumnoDTO,
  Modalidad,
  TipoDocumento,
  EstadoAlumno,
  EstadoSesion,
  MetodoPago,
  Moneda,
  PlanMembresiaDetalleDTO,
  SesionEntrenamientoDetalleDTO,
  EjercicioCatalogoDetalleDTO,
  GuardarRutinaSemanalDTO,
  RutinaSemanalDetalleDTO,
  BloqueDiaRutinaDTO,
  ControlAntropometricoDetalleDTO,
  EvolucionCorporalDTO,
  UUID_REGEX,
} from '@guachafit/shared';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  Scale,
  Dumbbell,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Minus,
  Plus,
  Trash2,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  FileText,
  MessageSquare,
  DollarSign,
  Activity,
  Check,
  X,
  Pencil,
  Eye,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  FolderPlus,
  History,
  ClipboardList,
} from 'lucide-react';

type TabType = 'resumen' | 'finanzas' | 'antropometria' | 'entrenamiento';


/** Clases de chip por tono del estado de sesión (comparten paleta con el resto del panel). */
const CLASES_TONO_SESION: Record<TonoSemaforo, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  danger: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  info: 'bg-primary/15 text-primary border-primary/30',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

/** Sesiones que cuentan como entrenamiento realizado (nunca una 'planificada'). */
function esSesionRealizada(sesion?: SesionEntrenamientoDetalleDTO | null): boolean {
  return (
    sesion?.estado === EstadoSesion.COMPLETADA || sesion?.estado === EstadoSesion.EN_PROGRESO
  );
}

/**
 * Feedback del alumno (WU5): RPE y notas con jerarquía — las etiquetas `[Título: valor]` del
 * cierre (RPE, molestias, descanso) se muestran como chips y el comentario libre como cuerpo.
 */
function FeedbackAlumno({ notas }: { notas?: string | null }) {
  const { etiquetas, textoLibre } = parsearNotasAlumno(notas);
  if (etiquetas.length === 0 && !textoLibre) return null;

  return (
    <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Feedback del Alumno
      </span>
      {etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((etiqueta, idx) => (
            <span
              key={`${etiqueta.titulo}-${idx}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-background/70 border border-amber-500/25 text-[11px]"
            >
              <span className="font-bold text-amber-400 uppercase tracking-wide text-[10px]">
                {etiqueta.titulo}
              </span>
              {etiqueta.valor && (
                <span className="font-mono font-black text-foreground">{etiqueta.valor}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {textoLibre && <p className="text-xs text-foreground leading-relaxed">{textoLibre}</p>}
    </div>
  );
}

export function AlumnoDetallePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('resumen');
  const [alumno, setAlumno] = useState<PerfilAlumnoDetalleDTO | null>(null);
  const [finanzas, setFinanzas] = useState<ResumenFinancieroAlumnoDTO | null>(null);
  const [planesCatalogo, setPlanesCatalogo] = useState<PlanMembresiaDetalleDTO[]>([]);
  const [ultimaSesion, setUltimaSesion] = useState<SesionEntrenamientoDetalleDTO | null>(null);
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
  const [tasaFijadaOverride, setTasaFijadaOverride] = useState('');
  const [fichaSaludPrivada, setFichaSaludPrivada] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [precioOverride, setPrecioOverride] = useState('');
  const [isSavingPerfil, setIsSavingPerfil] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  // D5: el éxito solo se declara con respuesta 2xx; el fallo se muestra y no muta estado local.
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [headerActionError, setHeaderActionError] = useState<string | null>(null);

  // Cobro Directo Modal State
  const [isCobroModalOpen, setIsCobroModalOpen] = useState(false);
  const [cobroMonto, setCobroMonto] = useState('40.00');
  const [cobroMoneda, setCobroMoneda] = useState<Moneda>(Moneda.USD);
  const [cobroMetodo, setCobroMetodo] = useState<MetodoPago>(MetodoPago.EFECTIVO_USD);
  const [cobroReferencia, setCobroReferencia] = useState('');
  const [cobroNotas, setCobroNotas] = useState('');
  const [isSubmittingCobro, setIsSubmittingCobro] = useState(false);
  const [cobroSuccessMsg, setCobroSuccessMsg] = useState<string | null>(null);
  const [cobroErrorMsg, setCobroErrorMsg] = useState<string | null>(null);

  // Nuevo Control Antropométrico Modal State
  const [isAntroModalOpen, setIsAntroModalOpen] = useState(false);
  const [antroPeso, setAntroPeso] = useState('78.50');
  const [antroGrasa, setAntroGrasa] = useState('16.2');
  const [antroCintura, setAntroCintura] = useState('82.0');
  const [antroBrazo, setAntroBrazo] = useState('37.5');
  const [antroPecho, setAntroPecho] = useState('102.0');
  const [antroMuslo, setAntroMuslo] = useState('58.0');
  const [antroNotas, setAntroNotas] = useState('');
  const [isSavingAntro, setIsSavingAntro] = useState(false);
  // N3: el control antropométrico solo se declara guardado con 2xx del endpoint real.
  const [antroErrorMsg, setAntroErrorMsg] = useState<string | null>(null);
  // N3: error honesto al re-consultar los controles reales del alumno (nunca lista "vaciada" en silencio).
  const [controlesErrorMsg, setControlesErrorMsg] = useState<string | null>(null);

  // Controles antropométricos reales del alumno. En modo demo se cargan fixtures locales;
  // en sesión real, sin dato => lista vacía (nunca mediciones inventadas). Los campos
  // opcionales pueden venir nulos de la API y la UI los muestra como "N/D".
  const [controlesAntro, setControlesAntro] = useState<Array<{
    id: string;
    fecha: string;
    pesoKg: string;
    grasaPorcentaje: string | null;
    cinturaCm: string | null;
    brazoCm: string | null;
    pechoCm: string | null;
    musloCm: string | null;
  }>>([]);

  // Planificación semanal de entrenamiento por bloques de días (vacía hasta cargar la real;
  // en modo demo se hidrata con fixtures locales).
  const [rutinaSemanal, setRutinaSemanal] = useState<BloqueDiaRutinaDTO[]>([]);

  // Workout & Routine Management State
  const [historialSesiones, setHistorialSesiones] = useState<SesionEntrenamientoDetalleDTO[]>([]);
  const [historialLimit, setHistorialLimit] = useState(30);
  const [isCargandoHistorial, setIsCargandoHistorial] = useState(false);
  // N4: "cargar más" del historial con manejo de error visible (sin tragarse el fallo).
  const [historialError, setHistorialError] = useState<string | null>(null);
  const [ejerciciosCatalogo, setEjerciciosCatalogo] = useState<EjercicioCatalogoDetalleDTO[]>([]);
  const [expandedSesionId, setExpandedSesionId] = useState<string | null>(null);

  // Modal Prescripción / Edición de Rutina
  const [isRutinaModalOpen, setIsRutinaModalOpen] = useState(false);
  const [bloquesRutinaEdit, setBloquesRutinaEdit] = useState<any[]>([]);
  const [activeDiaIdx, setActiveDiaIdx] = useState(0);
  const [selectedGrupoMuscular, setSelectedGrupoMuscular] = useState('Todos');
  const [filtroBusquedaEj, setFiltroBusquedaEj] = useState('');
  const [isCrearEjRapidoOpen, setIsCrearEjRapidoOpen] = useState(false);
  const [nuevoEjNombre, setNuevoEjNombre] = useState('');
  const [nuevoEjGrupo, setNuevoEjGrupo] = useState('Pecho');
  const [nuevoEjPatron, setNuevoEjPatron] = useState('Empuje');
  const [isSubmittingEj, setIsSubmittingEj] = useState(false);
  const [editingEjNombreIdx, setEditingEjNombreIdx] = useState<number | null>(null);
  const [rutinaSuccessMsg, setRutinaSuccessMsg] = useState<string | null>(null);
  const [isSavingRutina, setIsSavingRutina] = useState(false);
  const [rutinaErrorMsg, setRutinaErrorMsg] = useState<string | null>(null);

  // WU6b (RF-017): modal "Cargar desde Plantilla" del banco del coach
  const [isPlantillaModalOpen, setIsPlantillaModalOpen] = useState(false);

  const calculateAge = (fechaStr: string): number => {
    if (!fechaStr) return 0;
    const nacimiento = new Date(fechaStr);
    if (isNaN(nacimiento.getTime())) return 0;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad--;
    }
    return Math.max(0, edad);
  };

  const loadData = async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    // MODO DEMO EXPLÍCITO (isDemoMode): fixtures locales y cero llamadas contra la API real.
    // Los datos de ejemplo SOLO pueden mostrarse con la bandera activa (banner global visible).
    if (isDemoMode) {
      const demoPerfil: PerfilAlumnoDetalleDTO = {
        id,
        usuarioId: 'user-demo-' + id,
        entrenadorId: 'coach-01',
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: '24123456',
        nombres: 'Carlos Alberto',
        apellidos: 'Mendoza Silva',
        email: 'carlos.mendoza@email.com',
        fechaNacimiento: '1998-05-14',
        edadCalculada: 28,
        telefonoWhatsapp: '+584121234567',
        modalidad: Modalidad.PRESENCIAL,
        estadoActivacion: EstadoAlumno.ACTIVO,
        tasaFijadaOverride: null,
        fichaSaludPrivada:
          'Cirugía de rodilla en 2022. Rango controlado en prensa, evitar sentadilla libre pesada.',
        planActivoId: 'plan-presencial',
        planActivoNombre: 'Presencial Completo Sala',
        precioAcordadoOverride: '40.00',
        semaforoPago: 'al_dia',
        createdAtUtc: new Date().toISOString(),
      };
      setAlumno(demoPerfil);
      setNombres(demoPerfil.nombres);
      setApellidos(demoPerfil.apellidos);
      setTipoDocumento(demoPerfil.tipoDocumento);
      setNumeroDocumento(demoPerfil.numeroDocumento);
      setFechaNacimiento(demoPerfil.fechaNacimiento);
      setTelefonoWhatsapp(demoPerfil.telefonoWhatsapp);
      setModalidad(demoPerfil.modalidad);
      setFichaSaludPrivada(demoPerfil.fichaSaludPrivada || '');
      setSelectedPlanId(demoPerfil.planActivoId || '');
      setPrecioOverride('40.00');

      setFinanzas({
        alumnoId: id,
        usuarioId: 'user-demo-' + id,
        saldoPendienteTotalUsd: '0.00',
        totalPagadoHistoricoUsd: '320.00',
        totalPagadoMesActualUsd: '40.00',
        cuotaMesActual: {
          id: 'cuota-actual-' + id,
          periodo: '2026-09',
          montoTotalUsd: '40.00',
          montoPagadoUsd: '40.00',
          saldoPendienteUsd: '0.00',
          estado: 'al_dia',
          fechaVencimiento: '2026-09-30T23:59:59.000Z',
        },
        transacciones: [
          {
            id: 'tx-001',
            cuotaId: 'cuota-actual-' + id,
            montoUsd: '40.00',
            montoBs: '2600.00',
            metodoPago: 'pago_movil',
            referencia: 'REF-789456',
            estado: 'aprobado',
            createdAtUtc: '2026-09-02T14:30:00.000Z',
          },
          {
            id: 'tx-000',
            cuotaId: 'cuota-anterior-' + id,
            montoUsd: '40.00',
            montoBs: undefined,
            metodoPago: 'efectivo_usd',
            referencia: 'Cobro en Sala',
            estado: 'aprobado',
            createdAtUtc: '2026-08-01T10:15:00.000Z',
          },
        ],
      });

      setPlanesCatalogo([
        {
          id: 'plan-presencial',
          entrenadorId: 'coach-01',
          nombre: 'Presencial Completo Sala',
          descripcion: 'Acceso a sala de pesas, plan personalizado y asesoría en directo',
          precioBaseUsd: '40.00',
          duracionMeses: 1,
          beneficios: [
            'Rutina interactiva',
            'Monitoreo diario',
            '1 Check-in antropométrico quincenal',
          ],
          activo: true,
          createdAtUtc: new Date().toISOString(),
          updatedAtUtc: new Date().toISOString(),
        },
        {
          id: 'plan-online',
          entrenadorId: 'coach-01',
          nombre: 'Asesoría Online & Nutrición',
          descripcion: 'Plan a distancia con seguimiento por video y ajustes semanales',
          precioBaseUsd: '30.00',
          duracionMeses: 1,
          beneficios: ['Rutina en App', 'Macro-tracking', 'Check-in fotográfico quincenal'],
          activo: true,
          createdAtUtc: new Date().toISOString(),
          updatedAtUtc: new Date().toISOString(),
        },
      ]);

      const demoUltimaSesion: SesionEntrenamientoDetalleDTO = {
        id: 'sesion-last-' + id,
        alumnoId: id,
        fechaProgramada: '2026-09-12',
        estado: 'completada' as any,
        porcentajeCumplimiento: '100.00',
        timezoneCliente: 'America/Caracas',
        notasAlumno:
          '[RPE: 8.0/10] • [Molestia: Ninguna 👍] • Buen bombeo en cuadriceps, cuidando rango en rodilla.',
        createdAtUtc: new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
        ejercicios: [
          {
            id: 'ej-1',
            sesionId: 'sesion-last-' + id,
            ejercicioId: 'ej-prensa',
            orden: 1,
            notasCoach: 'Rango controlado',
            ejercicio: {
              id: 'ej-prensa',
              nombre: 'Prensa Inclinada 45°',
              grupoMuscular: 'Cuádriceps',
              activo: true,
              createdAtUtc: new Date().toISOString(),
            },
            series: [
              { id: 's-1', ejercicioSesionId: 'ej-1', numeroSerie: 1, repsObjetivo: 12, repsLogradas: 12, pesoKg: '120.00', rpe: '7.5', completada: true },
              { id: 's-2', ejercicioSesionId: 'ej-1', numeroSerie: 2, repsObjetivo: 10, repsLogradas: 10, pesoKg: '140.00', rpe: '8.0', completada: true },
            ],
          },
        ],
      };
      setUltimaSesion(demoUltimaSesion);
      setHistorialSesiones([demoUltimaSesion]);

      setEjerciciosCatalogo([
        { id: '11111111-1111-4111-8111-111111111c01', nombre: 'Press Plano con Mancuernas', grupoMuscular: 'Pecho', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c02', nombre: 'Press Inclinado en Multipower', grupoMuscular: 'Pecho', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c03', nombre: 'Fondos en Paralelas Asistidos', grupoMuscular: 'Pecho', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c04', nombre: 'Extensiones de Tríceps en Polea', grupoMuscular: 'Brazos', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c05', nombre: 'Jalón al Pecho Agarre Neutro', grupoMuscular: 'Espalda', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c06', nombre: 'Remo con Barra T apoyado', grupoMuscular: 'Espalda', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c07', nombre: 'Prensa Inclinada 45°', grupoMuscular: 'Piernas', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c08', nombre: 'Curl Femoral Tumbado', grupoMuscular: 'Piernas', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c09', nombre: 'Elevaciones Laterales con Mancuerna', grupoMuscular: 'Hombros', activo: true, createdAtUtc: new Date().toISOString() },
        { id: '11111111-1111-4111-8111-111111111c10', nombre: 'Plancha Abdominal Isométrica', grupoMuscular: 'Core', activo: true, createdAtUtc: new Date().toISOString() },
      ]);

      setRutinaSemanal([
        {
          diaId: 'd1',
          diaSugerido: 1,
          titulo: 'Día 1 (Lunes): Empuje & Pectoral / Tríceps',
          enfoque: 'Hipertrofia e Intensidad RPE 8',
          ejercicios: [
            { id: 'e1', nombre: 'Press Plano con Mancuernas', series: 4, reps: '8-10', peso: '28kg', rpe: '8.0', descansoSegundos: 90 },
            { id: 'e2', nombre: 'Press Inclinado en Multipower', series: 3, reps: '10-12', peso: '60kg', rpe: '8.5', descansoSegundos: 90 },
            { id: 'e3', nombre: 'Fondos en Paralelas Asistidos', series: 3, reps: '12', peso: 'Corporal', rpe: '8.0', descansoSegundos: 90 },
            { id: 'e4', nombre: 'Extensiones de Tríceps en Polea', series: 4, reps: '12-15', peso: '25kg', rpe: '9.0', descansoSegundos: 60 },
          ],
        },
        {
          diaId: 'd2',
          diaSugerido: 3,
          titulo: 'Día 2 (Miércoles): Tracción & Espalda / Bíceps',
          enfoque: 'Volumen y Control Escapular',
          ejercicios: [
            { id: 'e5', nombre: 'Jalón al Pecho Agarre Neutro', series: 4, reps: '10-12', peso: '65kg', rpe: '8.0', descansoSegundos: 90 },
            { id: 'e6', nombre: 'Remo con Barra T apoyado', series: 4, reps: '8-10', peso: '50kg', rpe: '8.5', descansoSegundos: 90 },
            { id: 'e7', nombre: 'Face Pulls en Polea Alta', series: 3, reps: '15', peso: '20kg', rpe: '7.5', descansoSegundos: 60 },
            { id: 'e8', nombre: 'Curl con Barra Z de Pie', series: 3, reps: '10-12', peso: '30kg', rpe: '8.5', descansoSegundos: 60 },
          ],
        },
        {
          diaId: 'd3',
          diaSugerido: 5,
          titulo: 'Día 3 (Viernes): Pierna & Enfoque Cuádriceps / Isquios',
          enfoque: 'Fuerza Controlada (Cuidar Rodilla)',
          ejercicios: [
            { id: 'e9', nombre: 'Prensa Inclinada 45°', series: 4, reps: '10-12', peso: '140kg', rpe: '8.0', descansoSegundos: 120 },
            { id: 'e10', nombre: 'Curl Femoral Tumbado', series: 4, reps: '12', peso: '45kg', rpe: '8.5', descansoSegundos: 90 },
            { id: 'e11', nombre: 'Extensión de Cuádriceps en Máquina', series: 3, reps: '15', peso: '50kg', rpe: '9.0', descansoSegundos: 60 },
            { id: 'e12', nombre: 'Elevación de Gemelos en Máquina', series: 4, reps: '15', peso: '60kg', rpe: '8.0', descansoSegundos: 60 },
          ],
        },
      ]);

      setControlesAntro([
        {
          id: 'antro-1',
          fecha: '2026-09-01',
          pesoKg: '78.50',
          grasaPorcentaje: '16.2',
          cinturaCm: '82.0',
          brazoCm: '37.5',
          pechoCm: '102.0',
          musloCm: '58.0',
        },
        {
          id: 'antro-0',
          fecha: '2026-08-01',
          pesoKg: '80.80',
          grasaPorcentaje: '17.8',
          cinturaCm: '84.5',
          brazoCm: '37.0',
          pechoCm: '101.0',
          musloCm: '57.5',
        },
      ]);

      setIsLoading(false);
      return;
    }

    try {
      // 1. Perfil del Alumno — sin perfil real no hay expediente: error honesto con reintento.
      const perfilRes = await apiClient<PerfilAlumnoDetalleDTO>(`/alumnos/${id}`).catch(() => null);

      if (!perfilRes) {
        setError(
          'No se pudo cargar el expediente del alumno. Revisa tu conexión e inténtalo de nuevo.'
        );
        return;
      }

      setAlumno(perfilRes);
      setNombres(perfilRes.nombres);
      setApellidos(perfilRes.apellidos);
      setTipoDocumento(perfilRes.tipoDocumento);
      setNumeroDocumento(perfilRes.numeroDocumento);
      setFechaNacimiento(perfilRes.fechaNacimiento);
      setTelefonoWhatsapp(perfilRes.telefonoWhatsapp);
      setModalidad(perfilRes.modalidad);
      setTasaFijadaOverride(perfilRes.tasaFijadaOverride || '');
      setFichaSaludPrivada(perfilRes.fichaSaludPrivada || '');
      setSelectedPlanId(perfilRes.planActivoId || '');
      setPrecioOverride(perfilRes.precioAcordadoOverride || '');

      // 2. Historial financiero (null = fallo: la pestaña lo advierte, no inventa cifras)
      const finanzasRes = await apiClient<ResumenFinancieroAlumnoDTO>(
        `/finanzas/clientes/${id}/historial`
      ).catch(() => null);
      setFinanzas(finanzasRes ?? null);

      // 3. Catálogo de planes (vacío real = sin planes, nunca planes inventados)
      const planesRes = await apiClient<PlanMembresiaDetalleDTO[]>('/finanzas/planes').catch(
        () => []
      );
      setPlanesCatalogo(Array.isArray(planesRes) ? planesRes : []);

      // 4. Última sesión: sin dato => sin tarjeta de "último entrenamiento" (nunca fabricada).
      const sesionRes = await apiClient<SesionEntrenamientoDetalleDTO>(
        `/sesiones/alumno/${id}/ultima`
      ).catch(() => null);
      setUltimaSesion(sesionRes ?? null);

      // 5. Historial completo de sesiones (la API acepta limit 1..100; default 30)
      const historialRes = await apiClient<SesionEntrenamientoDetalleDTO[]>(
        `/sesiones/alumno/${id}/historial?limit=${historialLimit}`
      ).catch(() => []);
      if (Array.isArray(historialRes) && historialRes.length > 0) {
        setHistorialSesiones(historialRes);
      } else if (sesionRes) {
        setHistorialSesiones([sesionRes]);
      } else {
        setHistorialSesiones([]);
      }

      // 6. Catálogo de ejercicios (vacío real => estado vacío explícito en el modal)
      const catalogoRes = await apiClient<EjercicioCatalogoDetalleDTO[]>(
        '/ejercicios/catalogo'
      ).catch(() => []);
      setEjerciciosCatalogo(Array.isArray(catalogoRes) ? catalogoRes : []);

      // 7. Rutina semanal activa persistida (sin rutina => estado vacío honesto)
      const rutinaActivaRes = await apiClient<RutinaSemanalDetalleDTO>(
        `/rutinas/alumno/${id}/activa`
      ).catch(() => null);
      setRutinaSemanal(
        rutinaActivaRes &&
          Array.isArray(rutinaActivaRes.bloques) &&
          rutinaActivaRes.bloques.length > 0
          ? rutinaActivaRes.bloques
          : []
      );

      // 8. N3: controles antropométricos reales del alumno (vacío real => estado vacío explícito;
      // fallo de carga => aviso visible, nunca una tabla vacía pasando por "sin registros").
      const controlesOk = await refrescarControlesAntro(perfilRes.usuarioId);
      setControlesErrorMsg(
        controlesOk ? null : 'No se pudieron cargar los controles antropométricos.'
      );
    } catch {
      setError('Error al cargar la información del alumno.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, isDemoMode]);

  /**
   * WU5: "cargar más" del historial. La API acepta `limit` (máx. 100) y re-consulta la página
   * completa con un techo mayor; no hay offset, así que se reemplaza la lista.
   * N4: el fallo de red se muestra en la sección (el historial previo permanece intacto).
   */
  const verMasHistorial = async () => {
    if (!id || isCargandoHistorial || historialLimit >= 100) return;
    const nuevoLimite = Math.min(historialLimit + 30, 100);
    setIsCargandoHistorial(true);
    setHistorialError(null);
    try {
      const res = await apiClient<SesionEntrenamientoDetalleDTO[]>(
        `/sesiones/alumno/${id}/historial?limit=${nuevoLimite}`
      );
      setHistorialSesiones(Array.isArray(res) ? res : []);
      setHistorialLimit(nuevoLimite);
    } catch (err: any) {
      // N4: sin inventar datos ni vaciar lo ya cargado; el error queda visible con reintento manual.
      setHistorialError(
        err?.message || 'No se pudo cargar más historial. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsCargandoHistorial(false);
    }
  };

  // Accesibilidad: Cierre de modales con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCobroModalOpen) setIsCobroModalOpen(false);
        if (isAntroModalOpen) setIsAntroModalOpen(false);
        if (isRutinaModalOpen) setIsRutinaModalOpen(false);
        if (isPlantillaModalOpen) setIsPlantillaModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCobroModalOpen, isAntroModalOpen, isRutinaModalOpen, isPlantillaModalOpen]);

  /**
   * WU6b: refresca solo la rutina activa tras asignar una plantilla, sin disparar el
   * estado de carga global (que desmontaría el modal de asignación antes de ver el resultado).
   */
  const refrescarRutinaActiva = async () => {
    if (!id) return;
    const res = await apiClient<RutinaSemanalDetalleDTO>(`/rutinas/alumno/${id}/activa`).catch(
      () => null
    );
    if (res && Array.isArray(res.bloques) && res.bloques.length > 0) {
      setRutinaSemanal(res.bloques);
    }
  };

  /**
   * N3: normaliza un control antropométrico real de la API a la fila de la tabla del expediente.
   * Los perímetros opcionales sin dato quedan en null y la tabla los muestra como "N/D".
   */
  const mapearControlAntro = (control: ControlAntropometricoDetalleDTO) => ({
    id: control.id,
    fecha: control.fechaEvaluacion,
    pesoKg: control.pesoKg,
    grasaPorcentaje: control.porcentajeGrasa ?? null,
    cinturaCm: control.perimetros?.cinturaCm ?? null,
    brazoCm: control.perimetros?.brazoCm ?? null,
    pechoCm: control.perimetros?.pechoCm ?? null,
    musloCm: control.perimetros?.musloCm ?? null,
  });

  /**
   * N3: re-consulta los controles reales del alumno (solo aprobados; el registro presencial del
   * coach se aprueba de inmediato) y reemplaza la tabla, más reciente primero. Devuelve false si
   * la llamada falla: el llamador decide si conservar lo que ya tenía; nunca se inventan medidas.
   */
  const refrescarControlesAntro = async (alumnoUsuarioId: string): Promise<boolean> => {
    const res = await apiClient<EvolucionCorporalDTO>(
      `/antropometria/evolucion/${alumnoUsuarioId}`
    ).catch(() => null);
    if (!res || !Array.isArray(res.evaluaciones)) return false;
    setControlesAntro(res.evaluaciones.map(mapearControlAntro).reverse());
    return true;
  };

  // Guardar Cambios de Perfil & Ficha Médica
  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setIsSavingPerfil(true);
    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);

    const payload = {
      nombres: nombres.trim(),
      apellidos: apellidos.trim(),
      tipoDocumento,
      numeroDocumento: numeroDocumento.trim(),
      fechaNacimiento,
      telefonoWhatsapp: telefonoWhatsapp.trim(),
      modalidad,
      tasaFijadaOverride: tasaFijadaOverride.trim() ? tasaFijadaOverride.trim() : null,
      fichaSaludPrivada: fichaSaludPrivada.trim() ? fichaSaludPrivada.trim() : null,
    };

    try {
      const res = await apiClient.patch<PerfilAlumnoDetalleDTO>(`/alumnos/${id}`, payload);
      setAlumno((prev) => (prev ? { ...prev, ...res } : res));
      setSaveSuccessMsg('Expediente y ficha médica actualizados con éxito.');
      setTimeout(() => setSaveSuccessMsg(null), 2500);
    } catch (err: any) {
      // D5: el expediente solo cambia con respuesta OK; nunca éxito falso ni mutación local.
      setSaveErrorMsg(
        err?.message || 'No se pudo guardar el expediente. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSavingPerfil(false);
    }
  };

  // Cambio de Estado de Activación (Pausar / Reactivar / Suspender)
  const handleCambiarEstado = async (nuevoEstado: EstadoAlumno) => {
    if (!id || !alumno) return;
    setHeaderActionError(null);

    try {
      await apiClient.patch(`/alumnos/${id}/estado`, { nuevoEstado });
      setAlumno((prev) => (prev ? { ...prev, estadoActivacion: nuevoEstado } : null));
    } catch (err: any) {
      setHeaderActionError(
        err?.message || 'No se pudo cambiar el estado del alumno. Inténtalo de nuevo.'
      );
    }
  };

  // Dar de Baja Lógica (Soft Delete)
  const handleSoftDelete = async () => {
    if (!id || !alumno) return;
    const confirm = window.confirm(
      `¿Estás seguro de dar de baja a ${alumno.nombres} ${alumno.apellidos}?\n\nEsta acción archivará al alumno. Su historial deportivo, antropométrico y financiero permanecerá 100% protegido y podrás restaurarlo cuando regrese.`
    );
    if (!confirm) return;
    setHeaderActionError(null);

    try {
      await apiClient.delete(`/alumnos/${id}`);
      setAlumno((prev) =>
        prev ? { ...prev, deletedAtUtc: new Date().toISOString(), estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO } : null
      );
    } catch (err: any) {
      setHeaderActionError(err?.message || 'No se pudo archivar al alumno. Inténtalo de nuevo.');
    }
  };

  // Restaurar Alumno Archivado
  const handleRestaurar = async () => {
    if (!id || !alumno) return;
    setHeaderActionError(null);

    try {
      await apiClient.patch(`/alumnos/${id}/restaurar`, {});
      setAlumno((prev) =>
        prev ? { ...prev, deletedAtUtc: null, estadoActivacion: EstadoAlumno.ACTIVO } : null
      );
    } catch (err: any) {
      setHeaderActionError(err?.message || 'No se pudo restaurar al alumno. Inténtalo de nuevo.');
    }
  };

  // Enviar Cobro Directo Inteligente en Sala
  const handleRegistrarCobro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setIsSubmittingCobro(true);
    setCobroSuccessMsg(null);
    setCobroErrorMsg(null);

    const payload = {
      montoOriginal: cobroMonto,
      monedaOriginal: cobroMoneda,
      metodoPago: cobroMetodo,
      fechaOperacion: new Date().toISOString().split('T')[0],
      referenciaBancaria: cobroReferencia.trim() || undefined,
      notas: cobroNotas.trim() || undefined,
    };

    try {
      await apiClient.post(`/finanzas/clientes/${id}/cobro-directo-inteligente`, payload);
      setCobroSuccessMsg('Cobro directo registrado y liquidado con éxito.');
      setTimeout(() => {
        setIsCobroModalOpen(false);
        setCobroSuccessMsg(null);
        loadData();
      }, 1500);
    } catch (err: any) {
      // D5: sin éxito falso ni transacción optimista; el cobro solo existe si el server lo aceptó.
      setCobroErrorMsg(
        err?.message || 'No se pudo registrar el cobro. Verifica los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmittingCobro(false);
    }
  };

  // N3: "Registrar Control en Sala" persiste en la API real (POST /antropometria/checkin,
  // rol ENTRENADOR => presencial_verificado aprobado de inmediato). En modo demo se conserva
  // el comportamiento local con gate explícito; nunca un éxito falso.
  const handleGuardarAntro = async (e: React.FormEvent) => {
    e.preventDefault();
    setAntroErrorMsg(null);

    // MODO DEMO EXPLÍCITO: alta local simulada, solo con la bandera activa.
    if (isDemoMode) {
      const nuevo = {
        id: 'antro-' + Date.now(),
        fecha: new Date().toISOString().split('T')[0],
        pesoKg: antroPeso,
        grasaPorcentaje: antroGrasa,
        cinturaCm: antroCintura,
        brazoCm: antroBrazo,
        pechoCm: antroPecho,
        musloCm: antroMuslo,
      };
      setControlesAntro([nuevo, ...controlesAntro]);
      setIsAntroModalOpen(false);
      return;
    }

    // El service resuelve el alumno por `perfiles_alumno.usuario_id`: se envía el usuarioId real.
    if (!alumno?.usuarioId) {
      setAntroErrorMsg(
        'No se pudo identificar al alumno del expediente. Recarga la página e inténtalo de nuevo.'
      );
      return;
    }

    setIsSavingAntro(true);
    try {
      const payload = construirPayloadCheckinAntropometrico(alumno.usuarioId, {
        pesoKg: antroPeso,
        porcentajeGrasa: antroGrasa,
        cinturaCm: antroCintura,
        brazoCm: antroBrazo,
        pechoCm: antroPecho,
        musloCm: antroMuslo,
      });
      const creado = await apiClient<ControlAntropometricoDetalleDTO>('/antropometria/checkin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Refresco real de la lista; si falla, se conserva el control confirmado por el server.
      const refrescado = await refrescarControlesAntro(alumno.usuarioId);
      if (!refrescado) {
        setControlesAntro((prev) => [
          mapearControlAntro(creado),
          ...prev.filter((c) => c.id !== creado.id),
        ]);
      }
      setControlesErrorMsg(null);
      setIsAntroModalOpen(false);
      triggerHaptic('success');
    } catch (err: any) {
      // Sin éxito falso: el modal queda abierto y el error del contrato/API se muestra inline.
      setAntroErrorMsg(
        err?.message ||
          'No se pudo registrar el control antropométrico. Revisa los datos e inténtalo de nuevo.'
      );
    } finally {
      setIsSavingAntro(false);
    }
  };

  // Rutina & Prescripción Handlers
  const abrirModalPrescribirRutina = () => {
    triggerHaptic('light');
    const bloquesNormalizados = rutinaSemanal.map((b, idx) => parsearBloqueParaEdicion(b, idx));
    setBloquesRutinaEdit(bloquesNormalizados);
    setActiveDiaIdx(0);
    setFiltroBusquedaEj('');
    setSelectedGrupoMuscular('Todos');
    setIsCrearEjRapidoOpen(false);
    setEditingEjNombreIdx(null);
    setRutinaSuccessMsg(null);
    setIsRutinaModalOpen(true);
  };

  const handleCrearEjercicioRapido = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoEjNombre.trim()) return;
    setIsSubmittingEj(true);
    try {
      const res = await apiClient<EjercicioCatalogoDetalleDTO>('/ejercicios/catalogo', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nuevoEjNombre.trim(),
          grupoMuscular: nuevoEjGrupo,
          patronMovimiento: nuevoEjPatron,
        }),
      });
      setEjerciciosCatalogo((prev) => [res, ...prev]);
      agregarEjercicioADia(res.nombre, res.id);
      setNuevoEjNombre('');
      setIsCrearEjRapidoOpen(false);
      triggerHaptic('success');
    } catch (err: any) {
      // D4: sin ejercicios fantasma con IDs no-UUID; el fallo se muestra y el formulario queda abierto.
      triggerHaptic('warning');
      setRutinaErrorMsg(
        err?.message ||
          'No se pudo crear el ejercicio en el catálogo. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsSubmittingEj(false);
    }
  };

  const agregarEjercicioADia = (nombreEj: string, ejercicioId?: string) => {
    triggerHaptic('selection');
    setBloquesRutinaEdit((prev) => {
      const updated = [...prev];
      if (!updated[activeDiaIdx]) return prev;
      updated[activeDiaIdx] = {
        ...updated[activeDiaIdx],
        // WU5: carga vacía = prescripción cualitativa; nunca '0.00' por defecto.
        ejercicios: [...updated[activeDiaIdx].ejercicios, crearEjercicioEdicion(nombreEj, ejercicioId)],
      };
      return updated;
    });
  };

  const removerEjercicioDeDia = (ejIdx: number) => {
    triggerHaptic('selection');
    setBloquesRutinaEdit((prev) => {
      const updated = [...prev];
      if (!updated[activeDiaIdx]) return prev;
      const filteredEjercicios = updated[activeDiaIdx].ejercicios.filter(
        (_: any, idx: number) => idx !== ejIdx
      );
      updated[activeDiaIdx] = {
        ...updated[activeDiaIdx],
        ejercicios: filteredEjercicios,
      };
      return updated;
    });
  };

  const actualizarCampoEjercicio = (ejIdx: number, campo: string, valor: any) => {
    setBloquesRutinaEdit((prev) => {
      const updated = [...prev];
      if (!updated[activeDiaIdx] || !updated[activeDiaIdx].ejercicios[ejIdx]) return prev;
      const ejerciciosActualizados = [...updated[activeDiaIdx].ejercicios];
      ejerciciosActualizados[ejIdx] = {
        ...ejerciciosActualizados[ejIdx],
        [campo]: valor,
      };
      updated[activeDiaIdx] = {
        ...updated[activeDiaIdx],
        ejercicios: ejerciciosActualizados,
      };
      return updated;
    });
  };

  const handleStepSeries = (ejIdx: number, delta: number) => {
    triggerHaptic('selection');
    setBloquesRutinaEdit((prev) => {
      const updated = [...prev];
      if (!updated[activeDiaIdx] || !updated[activeDiaIdx].ejercicios[ejIdx]) return prev;
      const current = updated[activeDiaIdx].ejercicios[ejIdx].series || 1;
      const nextVal = Math.max(1, Math.min(20, current + delta));
      const ejerciciosActualizados = [...updated[activeDiaIdx].ejercicios];
      ejerciciosActualizados[ejIdx] = {
        ...ejerciciosActualizados[ejIdx],
        series: nextVal,
      };
      updated[activeDiaIdx] = {
        ...updated[activeDiaIdx],
        ejercicios: ejerciciosActualizados,
      };
      return updated;
    });
  };

  const actualizarConfiguracionDiaActivo = (cambios: {
    diaNumero?: number;
    diaSugerido?: number | null;
    anotacion?: string;
    enfoque?: string;
  }) => {
    // WU6b: lógica compartida con el editor de plantillas (lib/rutina-bloques).
    setBloquesRutinaEdit((prev) =>
      actualizarConfiguracionBloque(prev as BloqueEdicion[], activeDiaIdx, cambios)
    );
  };

  const agregarNuevoDiaRutina = () => {
    if (bloquesRutinaEdit.length >= 7) return;
    triggerHaptic('light');
    setBloquesRutinaEdit([...bloquesRutinaEdit, crearBloqueEdicion(bloquesRutinaEdit.length + 1)]);
    setActiveDiaIdx(bloquesRutinaEdit.length);
  };

  const removerDiaRutina = (diaIdx: number) => {
    if (bloquesRutinaEdit.length <= 1) return;
    triggerHaptic('light');
    const updated = bloquesRutinaEdit.filter((_, idx) => idx !== diaIdx);
    setBloquesRutinaEdit(updated);
    setActiveDiaIdx(Math.max(0, diaIdx - 1));
  };

  const guardarRutinaPrescrita = async () => {
    if (!alumno) return;

    // WU5: normaliza la carga prescrita (coma → punto, vacío cualitativo) y valida inline
    // antes de que el payload viaje a la API; nunca se materializa '0.00' por defecto.
    const erroresPeso: string[] = [];
    // D4: los ejercicios vinculados al catálogo deben llevar un UUID real; un ID inválido se
    // reporta con nombre y causa en vez de reventar en una validación Zod opaca del servidor.
    const erroresCatalogo: string[] = [];
    const bloquesNormalizados: BloqueDiaRutinaDTO[] = bloquesRutinaEdit.map((b, idx) => {
      const diaNumero = b.diaNumero || idx + 1;
      const diaSugerido = b.diaSugerido;
      const titulo = b.titulo || generarTituloBloque(diaNumero, diaSugerido, b.anotacion);
      const ejerciciosNormalizados = (b.ejercicios || []).map((ej: any) => {
        if (ej.ejercicioId && !UUID_REGEX.test(String(ej.ejercicioId))) {
          erroresCatalogo.push(
            `"${ej.nombre || `Ejercicio ${idx + 1}`}" no está vinculado al catálogo (ID inválido). Elimínalo y agrégalo de nuevo desde el catálogo.`
          );
        }
        const resultadoPeso = normalizarPesoPrescritoTexto(ej.peso);
        if (resultadoPeso.error) {
          erroresPeso.push(`${ej.nombre || `Ejercicio ${idx + 1}`}: ${resultadoPeso.error}`);
        }
        return { ...ej, peso: resultadoPeso.valor };
      });
      return {
        diaId: b.diaId || `d${idx + 1}`,
        diaSugerido,
        titulo,
        enfoque: b.enfoque,
        ejercicios: ejerciciosNormalizados,
      };
    });

    if (erroresCatalogo.length > 0) {
      triggerHaptic('warning');
      setRutinaErrorMsg(`Revisa los ejercicios — ${erroresCatalogo[0]}`);
      return;
    }

    if (erroresPeso.length > 0) {
      triggerHaptic('warning');
      setRutinaErrorMsg(`Revisa la carga prescrita — ${erroresPeso[0]}`);
      return;
    }

    try {
      setIsSavingRutina(true);
      setRutinaErrorMsg(null);

      const payload: GuardarRutinaSemanalDTO = {
        alumnoId: alumno.id,
        nombreRutina: 'Planificación Semanal Activa',
        bloques: bloquesNormalizados,
      };
      await apiClient(`/rutinas/alumno/${alumno.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      triggerHaptic('success');
      setRutinaSemanal(bloquesNormalizados);
      // WU5: el mensaje de éxito persiste inline hasta que el coach cierre el modal.
      setRutinaSuccessMsg('Planificación semanal guardada y activada. El monitor ya calcula con ella.');
    } catch (err: any) {
      triggerHaptic('warning');
      setRutinaErrorMsg(err?.message || 'Error al guardar la planificación en el servidor.');
    } finally {
      setIsSavingRutina(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="h-10 w-10 rounded-full border-3 border-primary border-t-transparent animate-spin" />
        <span className="text-xs font-mono font-medium text-muted-foreground animate-pulse">
          Cargando Expediente Deportivo 360°...
        </span>
      </div>
    );
  }

  if (error || !alumno) {
    return (
      <div className="p-8 rounded-3xl bg-card border border-border text-center space-y-4 max-w-lg mx-auto mt-10">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
        <h3 className="text-lg font-bold text-foreground">Expediente no encontrado</h3>
        <p className="text-xs text-muted-foreground">
          {error || 'El alumno no existe o no tienes autorización para acceder a sus datos.'}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => loadData()}
            className="py-2.5 px-4 rounded-xl bg-secondary text-foreground font-bold text-xs border border-border hover:bg-secondary/80 transition-colors cursor-pointer"
          >
            Reintentar
          </button>
          <button
            onClick={() => navigate('/coach/alumnos')}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
          >
            Volver al Directorio
          </button>
        </div>
      </div>
    );
  }

  const isArchived = Boolean(alumno.deletedAtUtc);
  // D2: sin resumen financiero real no se inventa un semáforo (nada de "moroso" por fallo de red).
  const semaforo: 'al_dia' | 'por_vencer' | 'moroso' | null = alumno.semaforoPago
    ? (alumno.semaforoPago as 'al_dia' | 'por_vencer' | 'moroso')
    : finanzas
    ? Number(finanzas.saldoPendienteTotalUsd) > 0
      ? 'moroso'
      : 'al_dia'
    : null;

  // WU5: "Último Entrenamiento Realizado" solo considera sesiones completadas o en progreso.
  const ultimoEntrenamiento =
    historialSesiones.find((ses) => esSesionRealizada(ses)) ??
    (esSesionRealizada(ultimaSesion) ? ultimaSesion : null);
  const etiquetaUltimoEntrenamiento = ultimoEntrenamiento
    ? etiquetaEstadoSesion(ultimoEntrenamiento.estado, ultimoEntrenamiento.motivoOmision)
    : null;

  // WU5: filtro del catálogo del modal de prescripción (con estado vacío explícito).
  const catalogoFiltrado = ejerciciosCatalogo.filter((ej) => {
    const matchGrupo =
      selectedGrupoMuscular === 'Todos' ||
      ej.grupoMuscular.toLowerCase().includes(selectedGrupoMuscular.toLowerCase());
    const matchText =
      !filtroBusquedaEj.trim() ||
      ej.nombre.toLowerCase().includes(filtroBusquedaEj.toLowerCase());
    return matchGrupo && matchText;
  });
  const hayFiltroCatalogo =
    selectedGrupoMuscular !== 'Todos' || filtroBusquedaEj.trim() !== '';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Top Breadcrumb & Back */}
      <div className="flex items-center justify-between">
        <Link
          to="/coach/alumnos"
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al Directorio de Alumnos</span>
        </Link>
        <span className="text-[11px] font-mono text-muted-foreground">
          ID: {alumno.id.slice(0, 12)}...
        </span>
      </div>

      {/* CABECERA FIJA: IDENTIDAD 360 DEL ALUMNO */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Avatar e Identidad */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-secondary/80 border-2 border-primary/30 flex items-center justify-center text-primary font-black text-xl shadow-xs shrink-0">
              {alumno.nombres[0]}
              {alumno.apellidos[0]}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                  {alumno.nombres} {alumno.apellidos}
                </h1>
                {/* Semáforo de Pago */}
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase border flex items-center gap-1.5 shadow-2xs ${
                    semaforo === 'al_dia'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : semaforo === 'por_vencer'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : semaforo === 'moroso'
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      : 'bg-secondary text-muted-foreground border-border'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      semaforo === 'al_dia'
                        ? 'bg-emerald-400'
                        : semaforo === 'por_vencer'
                        ? 'bg-amber-400'
                        : semaforo === 'moroso'
                        ? 'bg-rose-400 animate-pulse'
                        : 'bg-muted-foreground'
                    }`}
                  />
                  {semaforo === 'al_dia'
                    ? 'Al Día'
                    : semaforo === 'por_vencer'
                    ? 'Por Vencer'
                    : semaforo === 'moroso'
                    ? 'Cuota Pendiente'
                    : 'Sin dato'}
                </span>

                {/* Badge Estado de Activación */}
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase border flex items-center gap-1.5 shadow-2xs ${
                    isArchived
                      ? 'bg-secondary text-muted-foreground border-border/80'
                      : alumno.estadoActivacion === EstadoAlumno.ACTIVO
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isArchived
                        ? 'bg-muted-foreground'
                        : alumno.estadoActivacion === EstadoAlumno.ACTIVO
                        ? 'bg-primary'
                        : 'bg-amber-400'
                    }`}
                  />
                  {isArchived ? 'Archivado' : alumno.estadoActivacion}
                </span>

                {/* Badge Modalidad */}
                <span className="px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wide uppercase bg-secondary/80 text-foreground border border-border/70 flex items-center gap-1.5 shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/50" />
                  {alumno.modalidad}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <User className="h-3.5 w-3.5 text-primary" />
                  {alumno.tipoDocumento}{alumno.numeroDocumento} • {alumno.edadCalculada} años
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  {alumno.email || 'Sin correo'}
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Phone className="h-3.5 w-3.5 text-primary" />
                  {alumno.telefonoWhatsapp}
                </span>
              </div>
            </div>
          </div>

          {/* Acciones Rápidas */}
          <div className="flex flex-wrap items-center gap-2">
            {/* WhatsApp 1-Tap */}
            <a
              href={`https://wa.me/${alumno.telefonoWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                `¡Hola ${alumno.nombres}! Te contacto de Guachafit para coordinar tu planificación deportiva.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" />
              <span>WhatsApp</span>
            </a>

            {/* Ciclo de Vida: Pausar / Reactivar */}
            {!isArchived && (
              <>
                {alumno.estadoActivacion === EstadoAlumno.ACTIVO ? (
                  <button
                    onClick={() => handleCambiarEstado(EstadoAlumno.INACTIVO_PAUSADO)}
                    className="py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    title="Pausar alumno temporalmente por viaje o lesión"
                  >
                    <PauseCircle className="h-4 w-4 text-amber-400" />
                    <span>Pausar</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleCambiarEstado(EstadoAlumno.ACTIVO)}
                    className="py-2 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs border border-border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    title="Reactivar alumno"
                  >
                    <PlayCircle className="h-4 w-4 text-emerald-400" />
                    <span>Reactivar</span>
                  </button>
                )}

                {/* Baja Lógica (Soft Delete) */}
                <button
                  onClick={handleSoftDelete}
                  className="py-2 px-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-semibold text-xs border border-destructive/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  title="Dar de baja lógica con preservación de datos"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Archivar</span>
                </button>
              </>
            )}

            {/* Si está archivado: Restaurar */}
            {isArchived && (
              <button
                onClick={handleRestaurar}
                className="py-2 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Restaurar Alumno</span>
              </button>
            )}
          </div>
        </div>

        {/* D5: errores de acciones del ciclo de vida (pausar/reactivar/archivar/restaurar) */}
        {headerActionError && (
          <div
            role="alert"
            className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{headerActionError}</span>
          </div>
        )}

        {/* ALERTA: Ficha médica confidencial resumen en cabecera si existe */}
        {alumno.fichaSaludPrivada && (
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs flex items-center justify-between gap-3 text-amber-300">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="font-semibold text-foreground">Alerta Médica:</span>
              <span className="truncate">{alumno.fichaSaludPrivada}</span>
            </div>
            <button
              onClick={() => setActiveTab('resumen')}
              className="text-[11px] font-bold text-primary underline hover:text-primary/80 cursor-pointer"
            >
              Ver Ficha Completa
            </button>
          </div>
        )}
      </div>

      {/* BARRA DE PESTAÑAS (TABS 360) */}
      <div
        role="tablist"
        aria-label="Pestañas de expediente del alumno"
        className="flex items-center gap-2 border-b border-border/80 pb-2 overflow-x-auto"
      >
        <button
          type="button"
          role="tab"
          id="tab-resumen"
          aria-controls="panel-resumen"
          aria-selected={activeTab === 'resumen'}
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('resumen');
          }}
          className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary ${
            activeTab === 'resumen'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          <User className="h-4 w-4" />
          <span>Resumen & Ficha Médica</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-finanzas"
          aria-controls="panel-finanzas"
          aria-selected={activeTab === 'finanzas'}
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('finanzas');
          }}
          className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary ${
            activeTab === 'finanzas'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          <DollarSign className="h-4 w-4" />
          <span>Finanzas & Pagos</span>
          {finanzas && Number(finanzas.saldoPendienteTotalUsd) > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-rose-500 text-white font-black font-mono">
              ${finanzas.saldoPendienteTotalUsd}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          id="tab-antropometria"
          aria-controls="panel-antropometria"
          aria-selected={activeTab === 'antropometria'}
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('antropometria');
          }}
          className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary ${
            activeTab === 'antropometria'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          <Scale className="h-4 w-4" />
          <span>Antropometría & Medidas</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-entrenamiento"
          aria-controls="panel-entrenamiento"
          aria-selected={activeTab === 'entrenamiento'}
          onClick={() => {
            triggerHaptic('light');
            setActiveTab('entrenamiento');
          }}
          className={`py-2 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary ${
            activeTab === 'entrenamiento'
              ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
              : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
          }`}
        >
          <Dumbbell className="h-4 w-4" />
          <span>Entrenamiento & Rutinas</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: RESUMEN, FICHA MÉDICA & PLAN ASIGNADO                          */}
      {/* ===================================================================== */}
      {activeTab === 'resumen' && (
        <div
          role="tabpanel"
          id="panel-resumen"
          aria-labelledby="tab-resumen"
          className="animate-in fade-in-50 duration-200 slide-in-from-bottom-1"
        >
          <form onSubmit={handleGuardarPerfil} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Columna Izquierda: Datos Personales y Deportivos */}
            <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-border/80 pb-3">
                <User className="h-4 w-4 text-primary" />
                <h3 className="font-extrabold text-sm text-foreground">Ficha Deportiva & Personal</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Nombres</label>
                  <input
                    type="text"
                    required
                    value={nombres}
                    onChange={(e) => setNombres(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Apellidos</label>
                  <input
                    type="text"
                    required
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo Doc</label>
                  <select
                    value={tipoDocumento}
                    onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={TipoDocumento.V}>V-</option>
                    <option value={TipoDocumento.E}>E-</option>
                    <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Número de Documento</label>
                  <input
                    type="text"
                    required
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground">Fecha Nacimiento</label>
                    <span className="text-[11px] font-mono font-bold text-primary">
                      {calculateAge(fechaNacimiento)} años
                    </span>
                  </div>
                  <input
                    type="date"
                    required
                    value={fechaNacimiento}
                    onChange={(e) => setFechaNacimiento(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Modalidad</label>
                  <select
                    value={modalidad}
                    onChange={(e) => setModalidad(e.target.value as Modalidad)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={Modalidad.PRESENCIAL}>Presencial en Sala</option>
                    <option value={Modalidad.REMOTO}>Online / Asesoría Remota</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Teléfono / WhatsApp</label>
                <input
                  type="text"
                  required
                  value={telefonoWhatsapp}
                  onChange={(e) => setTelefonoWhatsapp(e.target.value)}
                  placeholder="+584121234567"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>
            </div>

            {/* Columna Derecha: Ficha Médica y Asignación de Plan */}
            <div className="space-y-6">
              {/* Plan y Tarifa Acordada (RF-005) */}
              <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-border/80 pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <h3 className="font-extrabold text-sm text-foreground">Plan Comercial & Tarifa (RF-005)</h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
                    Override Activo
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Plan Asignado del Catálogo</label>
                    <select
                      value={selectedPlanId}
                      onChange={(e) => {
                        setSelectedPlanId(e.target.value);
                        const planSel = planesCatalogo.find((p) => p.id === e.target.value);
                        if (planSel && !precioOverride) {
                          setPrecioOverride(planSel.precioBaseUsd);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    >
                      <option value="">Seleccionar Plan Comercial...</option>
                      {planesCatalogo.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} (${p.precioBaseUsd} USD)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Precio Acordado ($ USD)
                      </label>
                      <input
                        type="text"
                        value={precioOverride}
                        onChange={(e) => setPrecioOverride(e.target.value)}
                        placeholder="ej. 35.00"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground font-mono font-bold focus:outline-hidden focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Tasa Especial Override (VES)
                      </label>
                      <input
                        type="text"
                        value={tasaFijadaOverride}
                        onChange={(e) => setTasaFijadaOverride(e.target.value)}
                        placeholder="ej. 65.0000"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground font-mono focus:outline-hidden focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Ficha Médica Confidencial */}
              <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-border/80 pb-3">
                  <div className="flex items-center gap-2 text-primary">
                    <Lock className="h-4 w-4" />
                    <h3 className="font-extrabold text-sm text-foreground">Ficha Médica Confidencial</h3>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">Cifrado AES-256-GCM</span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Anotaciones privadas sobre patologías, hernias, cirugías previas y limitaciones biomecánicas.
                  Este campo es <strong className="text-foreground">estrictamente invisible</strong> para el alumno.
                </p>

                <textarea
                  rows={4}
                  value={fichaSaludPrivada}
                  onChange={(e) => setFichaSaludPrivada(e.target.value)}
                  placeholder="Lesiones previas, dolor lumbar, contraindicaciones específicas..."
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
                />
              </div>
            </div>
          </div>

          {/* Botón Guardar Cambios */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {saveSuccessMsg && (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4" />
                {saveSuccessMsg}
              </span>
            )}
            {saveErrorMsg && (
              <span
                role="alert"
                className="text-xs font-bold text-destructive flex items-center gap-1.5 animate-in fade-in max-w-md text-right"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {saveErrorMsg}
              </span>
            )}
            <button
              type="submit"
              disabled={isSavingPerfil}
              className="py-3 px-6 rounded-2xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSavingPerfil ? 'Guardando expediente...' : 'Guardar Cambios de Ficha & Plan'}
            </button>
          </div>
        </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: FINANZAS & PAGOS CENTRALIZADOS                                 */}
      {/* ===================================================================== */}
      {activeTab === 'finanzas' && (
        <div
          role="tabpanel"
          id="panel-finanzas"
          aria-labelledby="tab-finanzas"
          className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1"
        >
          {/* D2: sin resumen financiero real no se muestran cifras inventadas */}
          {!finanzas && (
            <div
              role="status"
              className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                No se pudo cargar el historial financiero del alumno. Las cifras no están
                disponibles; reintenta recargando el expediente.
              </span>
            </div>
          )}

          {/* Métricas Financieras del Alumno */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Saldo Pendiente Actual
                </span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    !finanzas
                      ? 'bg-muted-foreground'
                      : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
                      ? 'bg-rose-400 animate-pulse'
                      : 'bg-emerald-400'
                  }`}
                  title={
                    !finanzas
                      ? 'Dato no disponible'
                      : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
                      ? 'Cuota en mora/pendiente'
                      : 'Solvente'
                  }
                />
              </div>
              <p
                className={`text-2xl font-black font-mono tracking-tight ${
                  !finanzas
                    ? 'text-muted-foreground'
                    : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                ${finanzas ? finanzas.saldoPendienteTotalUsd || '0.00' : '—'}{' '}
                <span className="text-xs font-bold text-muted-foreground">USD</span>
              </p>
              <span className="text-[11px] text-muted-foreground block">
                {!finanzas
                  ? 'Dato no disponible'
                  : Number(finanzas.saldoPendienteTotalUsd || 0) > 0
                  ? 'Cuota pendiente de liquidar'
                  : 'Sin deudas activas'}
              </span>
            </div>

            <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                Pagado en Mes en Curso
              </span>
              <p className="text-2xl font-black font-mono tracking-tight text-foreground">
                ${finanzas ? finanzas.totalPagadoMesActualUsd || '0.00' : '—'}{' '}
                <span className="text-xs font-bold text-muted-foreground">USD</span>
              </p>
              <span className="text-[11px] text-muted-foreground block">Abonos recibidos este periodo</span>
            </div>

            <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1.5">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                Histórico Total Acumulado
              </span>
              <p className="text-2xl font-black font-mono tracking-tight text-primary">
                ${finanzas ? finanzas.totalPagadoHistoricoUsd || '0.00' : '—'}{' '}
                <span className="text-xs font-bold text-muted-foreground">USD</span>
              </p>
              <span className="text-[11px] text-muted-foreground block">Total abonado por este alumno</span>
            </div>
          </div>

          {/* Cuota del Mes y Botón de Cobro Directo */}
          <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase">
                  <CreditCard className="h-4 w-4" />
                  <span>Estado de la Cuota Mensual</span>
                </div>
                <div className="flex items-center gap-2.5 mt-0.5">
                  <h3 className="text-lg font-black text-foreground">
                    Periodo:{' '}
                    {finanzas?.cuotaMesActual?.periodo || (finanzas ? 'Sin cuota emitida' : '—')}
                  </h3>
                  {finanzas?.cuotaMesActual && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase border flex items-center gap-1.5 shadow-2xs ${
                        Number(finanzas.cuotaMesActual.saldoPendienteUsd) <= 0
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          Number(finanzas.cuotaMesActual.saldoPendienteUsd) <= 0
                            ? 'bg-emerald-400'
                            : 'bg-rose-400 animate-pulse'
                        }`}
                      />
                      {Number(finanzas.cuotaMesActual.saldoPendienteUsd) <= 0 ? 'Liquidada' : 'Pendiente'}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setIsCobroModalOpen(true);
                }}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-400"
              >
                <DollarSign className="h-4 w-4" />
                <span>Registrar Cobro Directo en Sala</span>
              </button>
            </div>

            {finanzas?.cuotaMesActual ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Cuota</span>
                  <p className="font-mono font-black text-sm text-foreground mt-0.5">
                    ${finanzas.cuotaMesActual.montoTotalUsd} USD
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Monto Abonado</span>
                  <p className="font-mono font-black text-sm text-emerald-400 mt-0.5">
                    ${finanzas.cuotaMesActual.montoPagadoUsd} USD
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Saldo Restante</span>
                  <p className="font-mono font-black text-sm text-rose-400 mt-0.5">
                    ${finanzas.cuotaMesActual.saldoPendienteUsd} USD
                  </p>
                </div>
                <div className="p-3 rounded-2xl bg-secondary/30 border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">Vencimiento</span>
                  <p className="font-mono font-bold text-xs text-foreground mt-0.5 truncate">
                    {finanzas.cuotaMesActual.fechaVencimiento.split('T')[0]}
                  </p>
                </div>
              </div>
            ) : !finanzas ? (
              <p className="text-xs text-muted-foreground py-2">
                El estado de la cuota no está disponible porque no se pudo cargar el historial
                financiero.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                No hay cuota emitida para este periodo. Al pulsar <strong>"Registrar Cobro Directo en Sala"</strong>, el sistema emitirá la cuota y liquidará el pago en 1 solo paso.
              </p>
            )}
          </div>

          {/* Historial de Transacciones y Comprobantes */}
          <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <h4 className="font-bold text-sm text-foreground">Historial de Transacciones & Abonos</h4>
              <span className="text-xs text-muted-foreground font-mono">
                {finanzas ? `${finanzas.transacciones.length} operaciones` : '—'}
              </span>
            </div>

            {finanzas && finanzas.transacciones.length > 0 ? (
              <div className="space-y-2.5">
                {finanzas.transacciones.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3.5 rounded-2xl bg-secondary/20 border border-border/60 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground capitalize">
                          {tx.metodoPago.replace('_', ' ')}
                        </span>
                        {tx.referencia && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            • Ref: {tx.referencia}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {tx.createdAtUtc.split('T')[0]} • {tx.createdAtUtc.split('T')[1]?.slice(0, 5)}
                      </span>
                    </div>

                    <div className="text-right">
                      <p className="font-mono font-black text-sm text-emerald-400">
                        +${tx.montoUsd} USD
                      </p>
                      {tx.montoBs && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          ({tx.montoBs} VES)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No se han registrado pagos o abonos para este alumno.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ANTROPOMETRÍA & MEDIDAS                                        */}
      {/* ===================================================================== */}
      {activeTab === 'antropometria' && (
        <div
          role="tabpanel"
          id="panel-antropometria"
          aria-labelledby="tab-antropometria"
          className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1"
        >
          {/* Header con botón de nuevo control */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 rounded-3xl bg-card border border-border shadow-xs">
            <div>
              <h3 className="text-lg font-black text-foreground">Evolución Corporal & Medidas</h3>
              <p className="text-xs text-muted-foreground">
                Control antropométrico multieje, porcentaje graso y registros de pesaje.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setAntroErrorMsg(null);
                setIsAntroModalOpen(true);
              }}
              className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 active:scale-95 hover:brightness-110 transition-all flex items-center justify-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Plus className="h-4 w-4" />
              <span>Registrar Control en Sala</span>
            </button>
          </div>

          {/* Métricas Actuales con Deltas */}
          {controlesAntro.length > 0 && (() => {
            const actual = controlesAntro[0];
            const anterior = controlesAntro[1];

            const deltaPeso = anterior ? (Number(actual.pesoKg) - Number(anterior.pesoKg)).toFixed(1) : null;
            // N3: con datos reales los perímetros/% grasa pueden faltar en cualquiera de los dos
            // controles; sin ambos valores no hay delta (nunca NaN).
            const deltaGrasa =
              anterior && actual.grasaPorcentaje && anterior.grasaPorcentaje
                ? (Number(actual.grasaPorcentaje) - Number(anterior.grasaPorcentaje)).toFixed(1)
                : null;
            const deltaCintura =
              anterior && actual.cinturaCm && anterior.cinturaCm
                ? (Number(actual.cinturaCm) - Number(anterior.cinturaCm)).toFixed(1)
                : null;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Peso Actual</span>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-foreground">{actual.pesoKg} kg</p>
                    {deltaPeso && (
                      <span
                        className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                          Number(deltaPeso) <= 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {Number(deltaPeso) > 0 ? `+${deltaPeso}` : deltaPeso} kg
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">% Grasa Estimada</span>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-foreground">
                      {actual.grasaPorcentaje ? `${actual.grasaPorcentaje}%` : 'N/D'}
                    </p>
                    {deltaGrasa && (
                      <span
                        className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                          Number(deltaGrasa) <= 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {Number(deltaGrasa) > 0 ? `+${deltaGrasa}` : deltaGrasa}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Cintura</span>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-black font-mono text-foreground">
                      {actual.cinturaCm ? `${actual.cinturaCm} cm` : 'N/D'}
                    </p>
                    {deltaCintura && (
                      <span
                        className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                          Number(deltaCintura) <= 0
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {Number(deltaCintura) > 0 ? `+${deltaCintura}` : deltaCintura} cm
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">Brazo / Pecho</span>
                  <p className="text-2xl font-black font-mono text-primary">
                    {actual.brazoCm ?? 'N/D'} / {actual.pechoCm ?? 'N/D'} cm
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Historial Tabular */}
          <div className="p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
            <h4 className="font-bold text-sm text-foreground">Historial Cronológico de Controles</h4>
            {/* N3: fallo de carga honesto; la tabla nunca finge "sin registros" si la consulta falló. */}
            {controlesErrorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{controlesErrorMsg}</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border/80 text-muted-foreground uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Fecha</th>
                    <th className="py-2.5 px-3">Peso (kg)</th>
                    <th className="py-2.5 px-3">% Grasa</th>
                    <th className="py-2.5 px-3">Cintura</th>
                    <th className="py-2.5 px-3">Brazo</th>
                    <th className="py-2.5 px-3">Pecho</th>
                    <th className="py-2.5 px-3">Muslo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 font-mono">
                  {controlesAntro.length === 0 && !controlesErrorMsg && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-6 px-3 text-center text-muted-foreground font-sans"
                      >
                        Sin controles antropométricos registrados para este alumno.
                      </td>
                    </tr>
                  )}
                  {controlesAntro.map((c) => (
                    <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="py-3 px-3 font-sans font-bold text-foreground">{c.fecha}</td>
                      <td className="py-3 px-3 font-bold">{c.pesoKg} kg</td>
                      <td className="py-3 px-3">
                        {c.grasaPorcentaje ? `${c.grasaPorcentaje}%` : 'N/D'}
                      </td>
                      <td className="py-3 px-3">{c.cinturaCm ? `${c.cinturaCm} cm` : 'N/D'}</td>
                      <td className="py-3 px-3">{c.brazoCm ? `${c.brazoCm} cm` : 'N/D'}</td>
                      <td className="py-3 px-3">{c.pechoCm ? `${c.pechoCm} cm` : 'N/D'}</td>
                      <td className="py-3 px-3">{c.musloCm ? `${c.musloCm} cm` : 'N/D'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: ENTRENAMIENTO & RUTINAS                                        */}
      {/* ===================================================================== */}
      {activeTab === 'entrenamiento' && (
        <div
          role="tabpanel"
          id="panel-entrenamiento"
          aria-labelledby="tab-entrenamiento"
          className="space-y-6 animate-in fade-in-50 duration-200 slide-in-from-bottom-1"
        >
          {/* Auditoría del Último Entrenamiento del Alumno (solo sesiones realizadas) */}
          {ultimoEntrenamiento && etiquetaUltimoEntrenamiento && (
            <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  <h3 className="font-extrabold text-sm text-foreground">
                    {ultimoEntrenamiento.estado === EstadoSesion.EN_PROGRESO
                      ? 'Entrenamiento en Progreso'
                      : 'Último Entrenamiento Realizado'}{' '}
                    (
                    {formatFechaCalendario(ultimoEntrenamiento.fechaProgramada) ||
                      ultimoEntrenamiento.fechaProgramada}
                    )
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                      CLASES_TONO_SESION[etiquetaUltimoEntrenamiento.tono]
                    }`}
                  >
                    {etiquetaUltimoEntrenamiento.texto}
                  </span>
                  {ultimoEntrenamiento.estado === EstadoSesion.COMPLETADA && (
                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      {ultimoEntrenamiento.porcentajeCumplimiento}% cumplido
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground font-mono">
                {formatRangoHorasLocal(
                  ultimoEntrenamiento.fechaInicioUtc,
                  ultimoEntrenamiento.fechaFinUtc
                ) ? (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    {formatRangoHorasLocal(
                      ultimoEntrenamiento.fechaInicioUtc,
                      ultimoEntrenamiento.fechaFinUtc
                    )}{' '}
                    (hora local)
                  </span>
                ) : (
                  ultimoEntrenamiento.estado === EstadoSesion.COMPLETADA && (
                    <span>Sin horas de inicio/fin registradas</span>
                  )
                )}
                {formatDuracionMinutos(ultimoEntrenamiento.duracionMinutos) && (
                  <span>Duración: {formatDuracionMinutos(ultimoEntrenamiento.duracionMinutos)}</span>
                )}
                {ultimoEntrenamiento.volumenTotalKg &&
                  ultimoEntrenamiento.volumenTotalKg !== '0.00' && (
                    <span>Volumen: {ultimoEntrenamiento.volumenTotalKg} kg</span>
                  )}
              </div>

              <FeedbackAlumno notas={ultimoEntrenamiento.notasAlumno} />
            </div>
          )}

          {/* 1. Subsección: Rutina Semanal Asignada */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-foreground">Rutina Semanal Asignada</h3>
                <p className="text-xs text-muted-foreground">
                  Estructura de días, ejercicios, series, repeticiones y cargas asignadas al alumno.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {/* WU6b: RF-017 Escenario 2 — clonar una plantilla del banco con ajuste de cargas */}
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setIsPlantillaModalOpen(true);
                  }}
                  disabled={isArchived}
                  title={
                    isArchived
                      ? 'Restaura al alumno para asignarle una plantilla'
                      : 'Selecciona una plantilla del banco y ajusta cargas antes de confirmar'
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground font-bold text-xs border border-border transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                  <span>Cargar desde Plantilla</span>
                </button>

                <button
                  type="button"
                  onClick={abrirModalPrescribirRutina}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Editar / Asignar Rutina</span>
                </button>
              </div>
            </div>

            {rutinaSemanal.length === 0 ? (
              <div className="p-8 rounded-2xl bg-card border border-dashed border-border/70 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground">
                  Este alumno aún no tiene una rutina semanal activa. Usa «Editar / Asignar
                  Rutina» para crear su planificación.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
              {rutinaSemanal.map((bloque) => (
                <div
                  key={bloque.diaId}
                  className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div>
                      <h4 className="font-extrabold text-sm text-foreground">{bloque.titulo}</h4>
                      <p className="text-[11px] text-muted-foreground">{bloque.enfoque}</p>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border">
                      {bloque.ejercicios.length} ejercicios
                    </span>
                  </div>

                  <div className="space-y-2">
                    {bloque.ejercicios.map((ej: any, ejIdx: number) => (
                      <div
                        key={ej.id}
                        className="p-3 rounded-2xl bg-secondary/20 hover:bg-secondary/35 transition-colors border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="h-5 w-5 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-[10px] shrink-0">
                            {ejIdx + 1}
                          </span>
                          <span className="font-bold text-foreground break-words">{ej.nombre}</span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground self-end sm:self-center">
                          <span className="px-2 py-0.5 rounded-md bg-secondary border border-border/60 font-bold text-foreground">
                            {ej.series} series × {ej.reps}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20 font-bold text-primary">
                            {ej.peso}
                          </span>
                          <span className="text-[10px]">RPE {ej.rpe}</span>
                          <span className="px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-mono font-bold text-[10px] border border-border/60 flex items-center gap-1">
                            ⏱️ {ej.descansoSegundos || 90}s
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              </div>
            )}
          </div>

          {/* 2. Subsección: Historial Cronológico de Entrenamientos Realizados */}
          <div className="pt-6 border-t border-border/70 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                <h3 className="text-base font-black text-foreground">
                  Historial de Sesiones ({historialSesiones.length})
                </h3>
              </div>
            </div>

            {historialSesiones.length === 0 ? (
              <div className="p-8 rounded-2xl bg-card border border-dashed border-border/70 text-center">
                <Dumbbell className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-xs text-muted-foreground">
                  El alumno aún no registra entrenamientos completados.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {historialSesiones.map((ses) => {
                  const bloqueEncontrado = rutinaSemanal.find((b) => b.diaId === ses.bloqueId);
                  const diaSemanaNombre = (() => {
                    if (!ses.fechaProgramada) return '';
                    try {
                      const [y, m, d] = ses.fechaProgramada.split('-').map(Number);
                      const fecha = new Date(Date.UTC(y, m - 1, d));
                      return new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(fecha);
                    } catch {
                      return '';
                    }
                  })();
                  const diaSemanaCapitalizado = diaSemanaNombre
                    ? diaSemanaNombre.charAt(0).toUpperCase() + diaSemanaNombre.slice(1)
                    : '';
                  const etiquetaEstado = etiquetaEstadoSesion(ses.estado, ses.motivoOmision);
                  const rangoHorasLocal = formatRangoHorasLocal(ses.fechaInicioUtc, ses.fechaFinUtc);
                  const duracionSesion = formatDuracionMinutos(ses.duracionMinutos);
                  const fechaLocal = formatFechaCalendario(ses.fechaProgramada);

                  return (
                    <div key={ses.id} className="p-4 rounded-2xl bg-card border border-border shadow-xs space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-mono font-bold text-xs shrink-0">
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-extrabold text-sm text-foreground">
                                {bloqueEncontrado ? bloqueEncontrado.titulo : `Entrenamiento: ${ses.fechaProgramada}`}
                              </h4>
                              {ses.esDiaDescansoOriginal && (
                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                  ⏱️ Recuperada en {diaSemanaCapitalizado || 'Descanso'} (Día de descanso)
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {fechaLocal || ses.fechaProgramada}
                              {rangoHorasLocal ? ` · ${rangoHorasLocal} (hora local)` : ''}
                              {duracionSesion ? ` · ${duracionSesion} de duración` : ''}
                            </p>
                          </div>
                        </div>

                      <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                        {ses.volumenTotalKg && ses.volumenTotalKg !== '0.00' && (
                          <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
                            <Dumbbell className="h-3 w-3" />
                            <span>{ses.volumenTotalKg} kg</span>
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                            CLASES_TONO_SESION[etiquetaEstado.tono]
                          }`}
                        >
                          {etiquetaEstado.texto}
                        </span>
                        {ses.estado === EstadoSesion.COMPLETADA && (
                          <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            {ses.porcentajeCumplimiento}% cumplido
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            setExpandedSesionId(expandedSesionId === ses.id ? null : ses.id);
                          }}
                          aria-expanded={expandedSesionId === ses.id}
                          aria-controls={`sesion-accordion-${ses.id}`}
                          className="px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          <span>{expandedSesionId === ses.id ? 'Ocultar Series' : 'Ver Series'}</span>
                          <ChevronDown
                            className={`h-3.5 w-3.5 text-primary transition-transform duration-300 ease-out ${
                              expandedSesionId === ses.id ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    <FeedbackAlumno notas={ses.notasAlumno} />

                    {expandedSesionId === ses.id && (
                      <div
                        id={`sesion-accordion-${ses.id}`}
                        role="region"
                        aria-label={`Detalle de series del entrenamiento del ${ses.fechaProgramada}`}
                        className="pt-3 border-t border-border/50 space-y-2.5 animate-in fade-in-50 slide-in-from-top-2 duration-300 ease-out"
                      >
                        {ses.ejercicios && ses.ejercicios.length > 0 ? (
                          ses.ejercicios.map((ej, ejIdx) => (
                            <div
                              key={ej.id || ejIdx}
                              className="p-3.5 rounded-2xl bg-secondary/20 hover:bg-secondary/30 transition-colors border border-border/50 text-xs space-y-2.5"
                            >
                              <div className="font-bold text-foreground flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="h-5 w-5 rounded-lg bg-primary/10 text-primary text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                                    {ejIdx + 1}
                                  </span>
                                  <span className="font-bold text-foreground">{ej.ejercicio?.nombre || 'Ejercicio prescrito'}</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-mono font-bold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/60">
                                    ⏱️ Prescrito: {ej.descansoPrescritoSegundos || 90}s
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded-md border border-border/60">
                                    {ej.ejercicio?.grupoMuscular || 'Musculación'}
                                  </span>
                                </div>
                              </div>

                              {ej.series && ej.series.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 font-mono text-[11px]">
                                  {ej.series.map((s) => {
                                    const prescrito = ej.descansoPrescritoSegundos || 90;
                                    const descansoReal = s.descansoSegundos;
                                    const delta = descansoReal != null ? descansoReal - prescrito : 0;
                                    const isExcessive = delta > 15;
                                    const isRushed = delta < -15;
                                    const pesoPrescrito =
                                      s.pesoPrescritoKg && Number(s.pesoPrescritoKg) > 0
                                        ? s.pesoPrescritoKg
                                        : null;

                                    return (
                                      <div
                                        key={s.id}
                                        className={`p-2.5 rounded-xl border space-y-1.5 transition-colors ${
                                          s.completada
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-foreground'
                                            : 'bg-card border-border/60 text-foreground'
                                        }`}
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-muted-foreground font-bold">
                                            S{s.numeroSerie}
                                          </span>
                                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                            {s.rpe && (
                                              <span
                                                className="text-[10px] text-amber-400 font-bold"
                                                title="RPE real registrado por el alumno"
                                              >
                                                @{s.rpe}
                                              </span>
                                            )}
                                            {descansoReal != null && (
                                              <span
                                                title={`Descanso tomado: ${descansoReal}s (prescrito: ${prescrito}s, desviación: ${delta > 0 ? `+${delta}s` : `${delta}s`})`}
                                                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border whitespace-nowrap ${
                                                  isExcessive
                                                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                                    : isRushed
                                                    ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                                    : 'bg-secondary text-muted-foreground border-border/60'
                                                }`}
                                              >
                                                ⏱️ {descansoReal}s{' '}
                                                {isExcessive
                                                  ? `(+${delta}s)`
                                                  : isRushed
                                                  ? `(${delta}s)`
                                                  : '(en meta)'}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Real registrado por el alumno (sin fallback que oculte la falta de dato) */}
                                        <div className="flex items-baseline justify-between gap-2">
                                          <span
                                            className={`font-bold ${
                                              s.repsLogradas == null
                                                ? 'text-muted-foreground italic'
                                                : 'text-foreground'
                                            }`}
                                            title={
                                              s.repsLogradas == null
                                                ? 'Sin repeticiones reales registradas'
                                                : 'Repeticiones logradas'
                                            }
                                          >
                                            {s.repsLogradas == null
                                              ? 'Sin reps'
                                              : `${s.repsLogradas} reps`}
                                          </span>
                                          <span
                                            className={`font-black ${
                                              s.pesoKg
                                                ? 'text-primary'
                                                : 'text-muted-foreground italic'
                                            }`}
                                            title={
                                              s.pesoKg
                                                ? 'Peso real levantado'
                                                : 'Sin peso real registrado'
                                            }
                                          >
                                            {s.pesoKg ? `${s.pesoKg} kg` : 'Sin peso'}
                                          </span>
                                        </div>

                                        {/* Prescrito por el coach */}
                                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
                                          <span className="font-mono">
                                            Presc: {s.repsObjetivo} reps ·{' '}
                                            {pesoPrescrito ? `${pesoPrescrito} kg` : 'sin carga'}
                                          </span>
                                          {!s.completada && (
                                            <span className="font-bold text-amber-400 whitespace-nowrap">
                                              No completada
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">Sin series detalladas.</p>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">Sin detalle de ejercicios registrado en esta sesión.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
                {historialError && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold flex items-center gap-2"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{historialError}</span>
                  </div>
                )}
                {historialSesiones.length >= historialLimit && historialLimit < 100 && (
                  <div className="flex flex-col items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={verMasHistorial}
                      disabled={isCargandoHistorial}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-bold text-xs border border-border transition-all active:scale-95 disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isCargandoHistorial ? 'animate-spin' : ''}`} />
                      <span>{isCargandoHistorial ? 'Cargando historial…' : 'Cargar más sesiones'}</span>
                    </button>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      Mostrando {historialSesiones.length} · máximo 100
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: COBRO DIRECTO INTELIGENTE EN SALA                              */}
      {/* ===================================================================== */}
      {isCobroModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCobroModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-cobro-title"
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-500" />
                <h3 id="modal-cobro-title" className="font-bold text-base text-foreground">
                  Cobro Directo en Sala
                </h3>
              </div>
              <button
                onClick={() => setIsCobroModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {cobroSuccessMsg ? (
              <div className="p-6 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-foreground">{cobroSuccessMsg}</p>
              </div>
            ) : (
              <>
                {cobroErrorMsg && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{cobroErrorMsg}</span>
                  </div>
                )}
                <form onSubmit={handleRegistrarCobro} className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Registra un cobro de cuota recibido en sala. El pago se marcará como <strong>auto-aprobado</strong> y se liquidará inmediatamente.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Monto Recibido</label>
                    <input
                      type="text"
                      required
                      value={cobroMonto}
                      onChange={(e) => setCobroMonto(e.target.value)}
                      placeholder="40.00"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Moneda</label>
                    <select
                      value={cobroMoneda}
                      onChange={(e) => setCobroMoneda(e.target.value as Moneda)}
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    >
                      <option value={Moneda.USD}>USD ($)</option>
                      <option value={Moneda.VES}>VES (Bs)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Método de Pago</label>
                  <select
                    value={cobroMetodo}
                    onChange={(e) => setCobroMetodo(e.target.value as MetodoPago)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={MetodoPago.EFECTIVO_USD}>Efectivo USD</option>
                    <option value={MetodoPago.PAGO_MOVIL}>Pago Móvil (VES)</option>
                    <option value={MetodoPago.EFECTIVO_VES}>Efectivo VES</option>
                    <option value={MetodoPago.ZELLE}>Zelle</option>
                    <option value={MetodoPago.TRANSFERENCIA_BANCARIA}>Transferencia Bancaria</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Referencia / Comprobante (Opcional)
                  </label>
                  <input
                    type="text"
                    value={cobroReferencia}
                    onChange={(e) => setCobroReferencia(e.target.value)}
                    placeholder="ej. 6 últimos dígitos o 'Efectivo en mostrador'"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Notas Internas</label>
                  <input
                    type="text"
                    value={cobroNotas}
                    onChange={(e) => setCobroNotas(e.target.value)}
                    placeholder="ej. Pago completo del mes acordado"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingCobro}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm tracking-wide shadow-md shadow-emerald-600/20 active:scale-98 transition-all disabled:opacity-50 mt-2 cursor-pointer"
                >
                  {isSubmittingCobro ? 'Procesando cobro en BD...' : 'Registrar y Liquidar Cobro'}
                </button>
              </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: NUEVO CONTROL ANTROPOMÉTRICO EN SALA                           */}
      {/* ===================================================================== */}
      {isAntroModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAntroModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-antro-title"
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                <h3 id="modal-antro-title" className="font-bold text-base text-foreground">
                  Nuevo Control Antropométrico
                </h3>
              </div>
              <button
                onClick={() => setIsAntroModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* N3: error visible del contrato/API; el modal queda abierto y nada se declara guardado. */}
            {antroErrorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{antroErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleGuardarAntro} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Peso (kg)</label>
                  <input
                    type="text"
                    required
                    value={antroPeso}
                    onChange={(e) => setAntroPeso(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">% Grasa Corporal</label>
                  <input
                    type="text"
                    required
                    value={antroGrasa}
                    onChange={(e) => setAntroGrasa(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono font-bold text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Cintura (cm)</label>
                  <input
                    type="text"
                    value={antroCintura}
                    onChange={(e) => setAntroCintura(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Brazo Relajado (cm)</label>
                  <input
                    type="text"
                    value={antroBrazo}
                    onChange={(e) => setAntroBrazo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Pecho (cm)</label>
                  <input
                    type="text"
                    value={antroPecho}
                    onChange={(e) => setAntroPecho(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Muslo Medio (cm)</label>
                  <input
                    type="text"
                    value={antroMuslo}
                    onChange={(e) => setAntroMuslo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingAntro}
                className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/20 active:scale-98 transition-all disabled:opacity-50 mt-2 cursor-pointer"
              >
                {isSavingAntro ? 'Guardando medidas...' : 'Guardar Control Antropométrico'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: PRESCRIBIR / EDITAR RUTINA SEMANAL DEL ALUMNO                  */}
      {/* ===================================================================== */}
      {isRutinaModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsRutinaModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-rutina-title"
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-3xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            {/* Header del modal */}
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <Dumbbell className="h-5 w-5 text-primary" />
                <div>
                  <h3 id="modal-rutina-title" className="font-black text-base text-foreground">
                    Asignar & Editar Rutina Semanal
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Estructura los bloques de entrenamiento y asigna ejercicios del catálogo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRutinaModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {rutinaSuccessMsg && (
              <div
                role="status"
                aria-live="polite"
                className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="block font-bold">{rutinaSuccessMsg}</span>
                  <span className="block text-[11px] text-emerald-400/80">
                    Puedes seguir ajustando el plan o cerrar este panel cuando quieras.
                  </span>
                </div>
              </div>
            )}

            {/* Pestañas de Días de la Rutina */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border/60">
              {bloquesRutinaEdit.map((bloque, idx) => {
                const diaNum = bloque.diaNumero || idx + 1;
                const diaSugeridoNombre = bloque.diaSugerido ? NOMBRES_DIAS_SEMANA[bloque.diaSugerido] : undefined;
                const tabLabel = diaSugeridoNombre ? `Día ${diaNum} (${diaSugeridoNombre})` : `Día ${diaNum}`;
                return (
                  <button
                    key={bloque.diaId || idx}
                    type="button"
                    onClick={() => {
                      triggerHaptic('selection');
                      setActiveDiaIdx(idx);
                      setEditingEjNombreIdx(null);
                    }}
                    className={`py-1.5 px-3 rounded-xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
                      activeDiaIdx === idx
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tabLabel}
                  </button>
                );
              })}

              {bloquesRutinaEdit.length < 7 && (
                <button
                  type="button"
                  onClick={agregarNuevoDiaRutina}
                  className="py-1.5 px-3 rounded-xl bg-secondary/80 hover:bg-secondary text-primary font-bold text-xs flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Añadir Día</span>
                </button>
              )}
            </div>

            {/* Configuración del Día Activo */}
            {bloquesRutinaEdit[activeDiaIdx] && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/60 space-y-3.5">
                  {/* Fila 1: Selectores Estructurados para Evitar Falla Humana */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* 1. Selector de Número de Día / Bloque */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Número de Bloque / Día
                      </label>
                      <select
                        value={bloquesRutinaEdit[activeDiaIdx].diaNumero || activeDiaIdx + 1}
                        onChange={(e) => {
                          triggerHaptic('selection');
                          actualizarConfiguracionDiaActivo({ diaNumero: parseInt(e.target.value, 10) });
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
                      >
                        {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                          <option key={num} value={num}>
                            Día {num}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 2. Selector de Día Sugerido de la Semana */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Día Sugerido (Calendario)
                      </label>
                      <select
                        value={bloquesRutinaEdit[activeDiaIdx].diaSugerido || 0}
                        onChange={(e) => {
                          triggerHaptic('selection');
                          const val = parseInt(e.target.value, 10);
                          actualizarConfiguracionDiaActivo({ diaSugerido: val === 0 ? null : val });
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
                      >
                        {OPCIONES_DIAS_SEMANA.map((d) => (
                          <option key={d.valor} value={d.valor}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 3. Acción de Eliminar Bloque */}
                    <div className="flex items-end justify-between sm:justify-start gap-2">
                      <div className="flex-1 sm:flex-none">
                        <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Acción
                        </label>
                        {bloquesRutinaEdit.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removerDiaRutina(activeDiaIdx)}
                            title="Eliminar este bloque de la rutina"
                            className="px-3 py-2 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Eliminar Bloque</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic py-2 block">
                            Mínimo 1 bloque
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fila 2: Anotaciones y Enfoque del Día */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Anotaciones en el Título
                      </label>
                      <input
                        type="text"
                        value={bloquesRutinaEdit[activeDiaIdx].anotacion ?? ''}
                        onChange={(e) => {
                          actualizarConfiguracionDiaActivo({ anotacion: e.target.value });
                        }}
                        placeholder="ej. Empuje & Pectoral / Tríceps"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors"
                      />
                      <span className="text-[10px] text-muted-foreground block">
                        Se añade al título tras el día seleccionado para evitar errores manuales.
                      </span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                        Enfoque o Indicaciones (Opcional)
                      </label>
                      <input
                        type="text"
                        value={bloquesRutinaEdit[activeDiaIdx].enfoque || ''}
                        onChange={(e) => {
                          actualizarConfiguracionDiaActivo({ enfoque: e.target.value });
                        }}
                        placeholder="ej. Hipertrofia e Intensidad RPE 8"
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
                      />
                      <span className="text-[10px] text-muted-foreground block">
                        Instrucciones de esfuerzo o técnica para el alumno.
                      </span>
                    </div>
                  </div>

                  {/* Previsualización del Título Resultante */}
                  <div className="px-3 py-2 rounded-xl bg-background/80 border border-border/70 flex items-center gap-2 text-xs">
                    <span className="text-[11px] font-bold text-primary uppercase tracking-wider shrink-0">
                      🏷️ Título generado:
                    </span>
                    <span className="font-extrabold text-foreground truncate">
                      {bloquesRutinaEdit[activeDiaIdx].titulo}
                    </span>
                  </div>
                </div>

                {/* Lista de Ejercicios del Día Activo */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-foreground block">
                    Ejercicios Asignados a este Día ({bloquesRutinaEdit[activeDiaIdx].ejercicios.length}):
                  </span>

                  {bloquesRutinaEdit[activeDiaIdx].ejercicios.length === 0 ? (
                    <div className="p-4 rounded-xl bg-secondary/15 border border-dashed border-border text-center text-xs text-muted-foreground">
                      Aún no has agregado ejercicios a este bloque. Elige uno del catálogo abajo.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {bloquesRutinaEdit[activeDiaIdx].ejercicios.map((ej: any, ejIdx: number) => (
                        <div
                          key={ej.id || ejIdx}
                          className="p-3.5 rounded-2xl bg-card border border-border/80 text-xs shadow-2xs hover:border-primary/40 transition-all space-y-2.5"
                        >
                          {/* Fila Superior: Número de orden, Nombre completo (sin truncar), Edición inline y Eliminar */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <span className="h-6 w-6 rounded-lg bg-primary/10 text-primary font-mono font-black flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                                {ejIdx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                {editingEjNombreIdx === ejIdx ? (
                                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input
                                      type="text"
                                      value={ej.nombre}
                                      onChange={(e) => actualizarCampoEjercicio(ejIdx, 'nombre', e.target.value)}
                                      onBlur={() => setEditingEjNombreIdx(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingEjNombreIdx(null)}
                                      autoFocus
                                      className="w-full px-2 py-1 rounded-lg bg-background border border-primary text-xs font-bold text-foreground focus:outline-hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setEditingEjNombreIdx(null)}
                                      className="p-1 rounded-md text-primary hover:bg-primary/10 cursor-pointer"
                                      title="Confirmar nombre"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 group/name flex-wrap">
                                    <h4
                                      title={ej.nombre}
                                      className="font-bold text-foreground text-sm sm:text-base leading-snug break-words"
                                    >
                                      {ej.nombre}
                                    </h4>
                                    <button
                                      type="button"
                                      onClick={() => setEditingEjNombreIdx(ejIdx)}
                                      title="Editar o personalizar nombre del ejercicio"
                                      className="opacity-0 group-hover/name:opacity-100 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-opacity cursor-pointer shrink-0"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                triggerHaptic('light');
                                removerEjercicioDeDia(ejIdx);
                              }}
                              title="Eliminar este ejercicio"
                              className="p-1.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Fila Inferior: Pods de Carga (Series, Reps, Peso, RPE, Descanso) */}
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap pt-2 border-t border-border/40">
                            {/* Bloque A: Volumen & Cargas */}
                            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-secondary/30 border border-border/50">
                              {/* Series Stepper */}
                              <div className="flex flex-col items-center">
                                <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                  Series
                                </label>
                                <div className="flex items-center h-8 rounded-lg bg-background border border-border p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleStepSeries(ejIdx, -1)}
                                    disabled={(ej.series || 1) <= 1}
                                    title="Reducir series"
                                    className="h-7 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="w-6 text-center font-mono font-black text-xs text-foreground select-none">
                                    {ej.series || 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleStepSeries(ejIdx, 1)}
                                    disabled={(ej.series || 1) >= 20}
                                    title="Aumentar series"
                                    className="h-7 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Reps */}
                              <div className="flex flex-col items-center">
                                <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                  Reps
                                </label>
                                <input
                                  type="text"
                                  value={ej.reps}
                                  onChange={(e) => actualizarCampoEjercicio(ejIdx, 'reps', e.target.value)}
                                  placeholder="8-12"
                                  className="h-8 w-16 sm:w-20 px-2 rounded-lg bg-background border border-border text-center font-mono font-bold text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
                                />
                              </div>

                              {/* Peso */}
                              <CampoPesoPrescrito
                                valor={ej.peso ?? ''}
                                onChange={(nuevoValor) =>
                                  actualizarCampoEjercicio(ejIdx, 'peso', nuevoValor)
                                }
                              />
                            </div>

                            {/* Bloque B: Intensidad & Descanso */}
                            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-secondary/30 border border-border/50">
                              {/* RPE */}
                              <div className="flex flex-col items-center">
                                <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                  RPE
                                </label>
                                <input
                                  type="text"
                                  value={ej.rpe || ''}
                                  onChange={(e) => actualizarCampoEjercicio(ejIdx, 'rpe', e.target.value)}
                                  placeholder="8"
                                  className="h-8 w-12 sm:w-14 px-1.5 rounded-lg bg-background border border-border text-center font-mono font-bold text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors"
                                />
                              </div>

                              {/* Descanso */}
                              <div className="flex flex-col items-center">
                                <label className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-0.5">
                                  Descanso
                                </label>
                                <select
                                  value={ej.descansoSegundos || 90}
                                  onChange={(e) => actualizarCampoEjercicio(ejIdx, 'descansoSegundos', parseInt(e.target.value, 10))}
                                  className="h-8 px-2 rounded-lg bg-background border border-border text-center font-mono font-bold text-xs text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
                                >
                                  <option value={30}>30s</option>
                                  <option value={45}>45s</option>
                                  <option value={60}>60s (1m)</option>
                                  <option value={90}>90s (1.5m)</option>
                                  <option value={120}>120s (2m)</option>
                                  <option value={150}>150s (2.5m)</option>
                                  <option value={180}>180s (3m)</option>
                                  <option value={240}>240s (4m)</option>
                                  <option value={300}>300s (5m)</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sección: Añadir Ejercicio desde Catálogo con Filtro & Creación Rápida */}
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <FolderPlus className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-foreground">
                        Añadir Ejercicio desde Catálogo
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCrearEjRapidoOpen(!isCrearEjRapidoOpen)}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1 self-start sm:self-auto"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isCrearEjRapidoOpen ? 'Ocultar Creador Rápido' : 'Crear Ejercicio Nuevo'}</span>
                    </button>
                  </div>

                  {/* Formulario Inline de Creación Rápida */}
                  {isCrearEjRapidoOpen && (
                    <form
                      onSubmit={handleCrearEjercicioRapido}
                      className="p-3 rounded-xl bg-card border border-primary/30 space-y-3 animate-in zoom-in-95 duration-150"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
                          Nuevo Ejercicio en Catálogo
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Nombre (ej. Hip Thrust Mancuerna)"
                          value={nuevoEjNombre}
                          onChange={(e) => setNuevoEjNombre(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                        />
                        <select
                          value={nuevoEjGrupo}
                          onChange={(e) => setNuevoEjGrupo(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                        >
                          <option value="Pecho">Pecho</option>
                          <option value="Espalda">Espalda</option>
                          <option value="Piernas">Piernas</option>
                          <option value="Hombros">Hombros</option>
                          <option value="Brazos">Brazos</option>
                          <option value="Core">Core</option>
                        </select>
                        <select
                          value={nuevoEjPatron}
                          onChange={(e) => setNuevoEjPatron(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                        >
                          <option value="Empuje">Empuje</option>
                          <option value="Tracción">Tracción</option>
                          <option value="Bisagra de Cadera">Bisagra de Cadera</option>
                          <option value="Dominante de Rodilla">Dominante de Rodilla</option>
                          <option value="Aislamiento">Aislamiento</option>
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setIsCrearEjRapidoOpen(false)}
                          className="px-3 py-1 rounded-lg bg-secondary text-muted-foreground text-xs"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingEj}
                          className="px-3 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
                        >
                          {isSubmittingEj ? 'Guardando...' : 'Crear y Asignar a este Día'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Filtro por Grupos y Búsqueda */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                      {['Todos', 'Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core'].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            triggerHaptic('selection');
                            setSelectedGrupoMuscular(g);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                            selectedGrupoMuscular === g
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'bg-background hover:bg-secondary text-muted-foreground'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar en catálogo..."
                        value={filtroBusquedaEj}
                        onChange={(e) => setFiltroBusquedaEj(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* Lista de Coincidencias del Catálogo */}
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {catalogoFiltrado.length === 0 ? (
                      <div className="p-5 rounded-2xl bg-card border border-dashed border-border text-center space-y-2">
                        <Search className="h-5 w-5 text-muted-foreground mx-auto opacity-50" />
                        <p className="text-xs font-bold text-foreground">
                          Sin resultados en el catálogo
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {hayFiltroCatalogo
                            ? 'Ajusta el grupo muscular o el término de búsqueda, o crea el ejercicio que falta.'
                            : 'Tu catálogo está vacío: crea tu primer ejercicio para asignarlo.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsCrearEjRapidoOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-[11px] transition-all cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          <span>
                            {filtroBusquedaEj.trim()
                              ? `Crear «${filtroBusquedaEj.trim()}»`
                              : 'Crear Ejercicio Nuevo'}
                          </span>
                        </button>
                      </div>
                    ) : (
                      catalogoFiltrado.map((ej) => (
                        <div
                          key={ej.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 hover:border-primary/40 transition-colors text-xs gap-2"
                        >
                          <div className="min-w-0 flex-1 pr-1">
                            <span className="font-bold text-foreground break-words block">{ej.nombre}</span>
                            <span className="text-[10px] text-muted-foreground">
                              • {ej.grupoMuscular}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => agregarEjercicioADia(ej.nombre, ej.id)}
                            className="px-2.5 py-1 rounded-lg bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Añadir</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {rutinaErrorMsg && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{rutinaErrorMsg}</span>
              </div>
            )}

            {/* Footer de Acciones del Modal */}
            <div className="pt-3 border-t border-border/80 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {bloquesRutinaEdit.length} días configurados
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isSavingRutina}
                  onClick={() => {
                    setIsRutinaModalOpen(false);
                    setRutinaSuccessMsg(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={isSavingRutina}
                  onClick={guardarRutinaPrescrita}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingRutina ? (
                    <>
                      <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar Planificación Activa</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CARGAR DESDE PLANTILLA (RF-017 Escenario 2 / RN-03)            */}
      {/* ===================================================================== */}
      {isPlantillaModalOpen && alumno && (
        <SelectorPlantillaAsignacion
          alumnoId={alumno.id}
          alumnoNombre={`${alumno.nombres} ${alumno.apellidos}`}
          onCerrar={() => setIsPlantillaModalOpen(false)}
          onAsignada={() => {
            refrescarRutinaActiva();
          }}
        />
      )}
    </div>
  );
}
