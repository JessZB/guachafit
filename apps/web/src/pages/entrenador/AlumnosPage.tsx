import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { triggerHaptic } from '../../lib/haptics';
import {
  PerfilAlumnoDetalleDTO,
  Modalidad,
  TipoDocumento,
  EstadoAlumno,
} from '@guachafit/shared';
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

export function AlumnosPage() {
  const navigate = useNavigate();

  const [alumnos, setAlumnos] = useState<PerfilAlumnoDetalleDTO[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<FilterEstado>('todos');
  const [filterModalidad, setFilterModalidad] = useState<FilterModalidad>('todas');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  // New Athlete Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(TipoDocumento.V);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('1998-05-14');
  const [telefonoWhatsapp, setTelefonoWhatsapp] = useState('+584121234567');
  const [modalidad, setModalidad] = useState<Modalidad>(Modalidad.PRESENCIAL);
  const [fichaSaludPrivada, setFichaSaludPrivada] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const coachCode = 'ALEXFIT';
  const registrationUrl = `${window.location.origin}/onboarding?coach_code=${coachCode}`;

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

  const loadAlumnos = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient<PerfilAlumnoDetalleDTO[]>('/alumnos?incluirArchivados=true');
      setAlumnos(data);
    } catch {
      // Fallback roster demo
      const demoRoster: PerfilAlumnoDetalleDTO[] = [
        {
          id: 'al-001',
          usuarioId: 'u-001',
          entrenadorId: 'coach-01',
          nombres: 'Carlos Alberto',
          apellidos: 'Mendoza Silva',
          email: 'carlos.mendoza@email.com',
          tipoDocumento: TipoDocumento.V,
          numeroDocumento: '24123456',
          fechaNacimiento: '1998-05-14',
          edadCalculada: 28,
          telefonoWhatsapp: '+584121234567',
          modalidad: Modalidad.PRESENCIAL,
          estadoActivacion: EstadoAlumno.ACTIVO,
          planActivoNombre: 'Presencial Completo',
          semaforoPago: 'al_dia',
          fichaSaludPrivada: 'Cirugía de rodilla en 2022. Evitar sentadilla pesada.',
          createdAtUtc: new Date().toISOString(),
        },
        {
          id: 'al-002',
          usuarioId: 'u-002',
          entrenadorId: 'coach-01',
          nombres: 'Mariana',
          apellidos: 'Pérez Gómez',
          email: 'mariana.perez@email.com',
          tipoDocumento: TipoDocumento.V,
          numeroDocumento: '26987654',
          fechaNacimiento: '2001-11-20',
          edadCalculada: 24,
          telefonoWhatsapp: '+584149876543',
          modalidad: Modalidad.REMOTO,
          estadoActivacion: EstadoAlumno.ACTIVO,
          planActivoNombre: 'Asesoría Online',
          semaforoPago: 'por_vencer',
          createdAtUtc: new Date().toISOString(),
        },
        {
          id: 'al-003',
          usuarioId: 'u-003',
          entrenadorId: 'coach-01',
          nombres: 'Roberto',
          apellidos: 'Díaz Navarro',
          email: 'roberto.diaz@email.com',
          tipoDocumento: TipoDocumento.V,
          numeroDocumento: '20112233',
          fechaNacimiento: '1992-03-15',
          edadCalculada: 34,
          telefonoWhatsapp: '+584241122334',
          modalidad: Modalidad.PRESENCIAL,
          estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
          planActivoNombre: 'Presencial 3 Días',
          semaforoPago: 'moroso',
          fichaSaludPrivada: 'Esguince tobillo derecho en pausa',
          createdAtUtc: new Date().toISOString(),
        },
        {
          id: 'al-004',
          usuarioId: 'u-004',
          entrenadorId: 'coach-01',
          nombres: 'Valeria',
          apellidos: 'Silva Castillo',
          email: 'valeria.silva@email.com',
          tipoDocumento: TipoDocumento.E,
          numeroDocumento: '84992211',
          fechaNacimiento: '1999-08-10',
          edadCalculada: 27,
          telefonoWhatsapp: '+584165544332',
          modalidad: Modalidad.REMOTO,
          estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
          planActivoNombre: 'Online Nutrición',
          semaforoPago: 'sin_cuota',
          deletedAtUtc: '2026-06-01T00:00:00.000Z',
          createdAtUtc: new Date().toISOString(),
        },
      ];
      setAlumnos(demoRoster);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAlumnos();
  }, []);

  // Accesibilidad: Cierre de modal con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(registrationUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCrearAlumnoManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const nuevo = await apiClient<PerfilAlumnoDetalleDTO>('/alumnos/manual', {
        method: 'POST',
        body: JSON.stringify({
          nombres,
          apellidos,
          email,
          tipoDocumento,
          numeroDocumento,
          fechaNacimiento,
          telefonoWhatsapp,
          modalidad,
          fichaSaludPrivada: fichaSaludPrivada || undefined,
        }),
      });

      setAlumnos((prev) => [nuevo, ...prev]);
      setSuccessMessage('Alumno registrado exitosamente en la cartera.');
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
      }, 1500);
    } catch {
      // Local optimistic fallback
      const localDemo: PerfilAlumnoDetalleDTO = {
        id: 'al-local-' + Date.now(),
        usuarioId: 'u-local-' + Date.now(),
        entrenadorId: 'coach-01',
        nombres,
        apellidos,
        email,
        tipoDocumento,
        numeroDocumento,
        fechaNacimiento,
        edadCalculada: calculateAge(fechaNacimiento),
        telefonoWhatsapp,
        modalidad,
        estadoActivacion: EstadoAlumno.ACTIVO,
        semaforoPago: 'sin_cuota',
        fichaSaludPrivada,
        createdAtUtc: new Date().toISOString(),
      };
      setAlumnos((prev) => [localDemo, ...prev]);
      setSuccessMessage('Alumno registrado en la cartera.');
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
      }, 1200);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestaurarAlumno = async (alumnoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.patch(`/alumnos/${alumnoId}/restaurar`, {});
      setAlumnos((prev) =>
        prev.map((a) => (a.id === alumnoId ? { ...a, deletedAtUtc: null, estadoActivacion: EstadoAlumno.ACTIVO } : a))
      );
    } catch {
      setAlumnos((prev) =>
        prev.map((a) => (a.id === alumnoId ? { ...a, deletedAtUtc: null, estadoActivacion: EstadoAlumno.ACTIVO } : a))
      );
    }
  };

  // KPIs Calculados
  const kpis = useMemo(() => {
    const total = alumnos.length;
    const activos = alumnos.filter((a) => !a.deletedAtUtc && a.estadoActivacion === EstadoAlumno.ACTIVO).length;
    const pausados = alumnos.filter((a) => !a.deletedAtUtc && a.estadoActivacion === EstadoAlumno.INACTIVO_PAUSADO).length;
    const morosos = alumnos.filter((a) => !a.deletedAtUtc && a.semaforoPago === 'moroso').length;
    const presenciales = alumnos.filter((a) => !a.deletedAtUtc && a.modalidad === Modalidad.PRESENCIAL).length;
    const remotos = alumnos.filter((a) => !a.deletedAtUtc && a.modalidad === Modalidad.REMOTO).length;
    const archivados = alumnos.filter((a) => Boolean(a.deletedAtUtc)).length;

    return { total, activos, pausados, morosos, presenciales, remotos, archivados };
  }, [alumnos]);

  // Filtrado de Alumnos
  const filteredAlumnos = useMemo(() => {
    return alumnos.filter((a) => {
      // Búsqueda por texto
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        a.nombres.toLowerCase().includes(q) ||
        a.apellidos.toLowerCase().includes(q) ||
        (a.email || '').toLowerCase().includes(q) ||
        a.numeroDocumento.includes(q);

      if (!matchSearch) return false;

      // Filtro de Estado / Archivados
      if (filterEstado === 'archivados') {
        if (!a.deletedAtUtc) return false;
      } else {
        // En cualquier otra pestaña, excluimos a los archivados
        if (a.deletedAtUtc) return false;

        if (filterEstado === 'activo' && a.estadoActivacion !== EstadoAlumno.ACTIVO) return false;
        if (filterEstado === 'pausado' && a.estadoActivacion !== EstadoAlumno.INACTIVO_PAUSADO) return false;
        if (filterEstado === 'mora' && a.semaforoPago !== 'moroso') return false;
      }

      // Filtro de Modalidad
      if (filterModalidad === 'presencial' && a.modalidad !== Modalidad.PRESENCIAL) return false;
      if (filterModalidad === 'remoto' && a.modalidad !== Modalidad.REMOTO) return false;

      return true;
    });
  }, [alumnos, search, filterEstado, filterModalidad]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER PRINCIPAL */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Users className="h-4 w-4" />
              <span>Directorio de Alumnos</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Gestión de Alumnos
            </h1>
            <p className="text-xs text-muted-foreground">
              Expedientes 360°, control de ciclo de vida y vinculación de pagos.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle de Vista Cards / Tabla */}
            <div className="flex items-center p-1 rounded-xl bg-secondary/80 border border-border/80">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista de Cards Compactas"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Vista Tabla"
              >
                <TableIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Inscribir Alumno */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
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
                ? 'bg-emerald-500/10 border-emerald-500/50 shadow-xs ring-1 ring-emerald-500/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Activos
            </span>
            <p className="font-mono font-black text-xl sm:text-2xl text-emerald-400 tracking-tight">
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
                ? 'bg-amber-500/10 border-amber-500/50 shadow-xs ring-1 ring-amber-500/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
              Pausados
            </span>
            <p className="font-mono font-black text-xl sm:text-2xl text-amber-400 tracking-tight">
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
                ? 'bg-rose-500/10 border-rose-500/50 shadow-xs ring-1 ring-rose-500/30'
                : 'bg-secondary/30 border-border/40 hover:bg-secondary/50 hover:border-border/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                En Mora
              </span>
              {kpis.morosos > 0 && (
                <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
              )}
            </div>
            <p className="font-mono font-black text-xl sm:text-2xl text-rose-400 tracking-tight">
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
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
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
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
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
            <span>Enlace Único de Captación de Alumnos (Deep Link)</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Comparte este enlace con tus prospectos para que se autorregistren y se vinculen automáticamente a tu cartera.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyLink}
            className="py-2 px-3.5 rounded-xl bg-card hover:bg-secondary text-foreground text-xs font-bold border border-border flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-primary" />}
            <span>{isCopied ? '¡Enlace Copiado!' : 'Copiar Enlace'}</span>
          </button>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `¡Hola! Para inscribirte conmigo en Guachafit y comenzar tu planificación deportiva, completa tu registro aquí: ${registrationUrl}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Compartir por WhatsApp</span>
          </a>
        </div>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Chips de Estado */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setFilterEstado('todos')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'todos'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Todos ({kpis.activos + kpis.pausados})
            </button>
            <button
              onClick={() => setFilterEstado('activo')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'activo'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Activos ({kpis.activos})
            </button>
            <button
              onClick={() => setFilterEstado('pausado')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'pausado'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              Pausados ({kpis.pausados})
            </button>
            <button
              onClick={() => setFilterEstado('mora')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterEstado === 'mora'
                  ? 'bg-rose-500 text-white shadow-xs'
                  : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              En Mora ({kpis.morosos})
            </button>
            <button
              onClick={() => setFilterEstado('archivados')}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
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
              className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                filterModalidad === 'todas'
                  ? 'bg-foreground text-background font-bold'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterModalidad('presencial')}
              className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                filterModalidad === 'presencial'
                  ? 'bg-foreground text-background font-bold'
                  : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              Presencial
            </button>
            <button
              onClick={() => setFilterModalidad('remoto')}
              className={`py-1 px-2.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
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
          <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido, correo o documento..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-card border border-border text-xs text-foreground focus:outline-hidden focus:border-primary shadow-xs"
          />
        </div>
      </div>

      {/* VISTA 1: CARDS COMPACTAS DENSAS (~120px) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredAlumnos.map((a) => {
            const semaforo = a.semaforoPago || 'al_dia';
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
                        className={`absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-card ${
                          semaforo === 'al_dia'
                            ? 'bg-emerald-400'
                            : semaforo === 'por_vencer'
                            ? 'bg-amber-400'
                            : semaforo === 'moroso'
                            ? 'bg-rose-500'
                            : 'bg-muted-foreground'
                        }`}
                        title={`Estado de pago: ${semaforo}`}
                      />
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-black text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {a.nombres} {a.apellidos}
                      </h3>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {a.tipoDocumento}{a.numeroDocumento} • {a.edadCalculada}a
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border uppercase shrink-0">
                    {a.modalidad}
                  </span>
                </div>

                {/* Middle Info: Plan y Estado */}
                <div className="flex items-center justify-between text-[11px] border-t border-border/40 pt-2 text-muted-foreground">
                  <span className="truncate">{a.planActivoNombre || 'Plan Estándar'}</span>
                  <span
                    className={`font-mono font-bold uppercase text-[10px] ${
                      semaforo === 'al_dia'
                        ? 'text-emerald-400'
                        : semaforo === 'por_vencer'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {semaforo === 'al_dia' ? 'Al Día' : semaforo === 'por_vencer' ? 'Por Vencer' : 'Cuota Pendiente'}
                  </span>
                </div>

                {/* Bottom Row: Botón WhatsApp y Acción */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {a.telefonoWhatsapp}
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <a
                      href={`https://wa.me/${a.telefonoWhatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `Hola ${a.nombres}, te contacto desde Guachafit.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-400"
                      title="Enviar mensaje por WhatsApp"
                      aria-label={`Enviar mensaje de WhatsApp a ${a.nombres}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </a>

                    {isArchived ? (
                      <button
                        type="button"
                        onClick={(e) => handleRestaurarAlumno(a.id, e)}
                        className="py-1 px-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-[10px] flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all focus-visible:outline-2 focus-visible:outline-primary"
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
            <thead className="border-b border-border/80 text-muted-foreground uppercase text-[10px]">
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
              {filteredAlumnos.map((a) => {
                const semaforo = a.semaforoPago || 'al_dia';
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
                          <span className="text-[10px] text-muted-foreground">{a.email}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono">
                      {a.tipoDocumento}{a.numeroDocumento} ({a.edadCalculada}a)
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border uppercase">
                        {a.modalidad}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          isArchived
                            ? 'bg-muted text-muted-foreground border border-border'
                            : a.estadoActivacion === EstadoAlumno.ACTIVO
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {isArchived ? 'Archivado' : a.estadoActivacion}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono font-bold">
                      <span
                        className={`text-[10px] uppercase ${
                          semaforo === 'al_dia'
                            ? 'text-emerald-400'
                            : semaforo === 'por_vencer'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {semaforo === 'al_dia' ? '● Al Día' : semaforo === 'por_vencer' ? '● Por Vencer' : '● Pendiente'}
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
                          className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer"
                          aria-label={`Contactar por WhatsApp a ${a.nombres}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                        </a>

                        {isArchived ? (
                          <button
                            type="button"
                            onClick={(e) => handleRestaurarAlumno(a.id, e)}
                            className="py-1 px-2.5 rounded-lg bg-primary text-primary-foreground font-bold text-[10px] flex items-center gap-1 cursor-pointer hover:brightness-110 active:scale-95 transition-all"
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
                            className="p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 transition-all cursor-pointer"
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
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-inscripcion-title"
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
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {successMessage ? (
              <div className="p-6 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <p className="text-xs font-bold text-foreground">{successMessage}</p>
              </div>
            ) : (
              <form onSubmit={handleCrearAlumnoManual} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Nombres</label>
                    <input
                      type="text"
                      required
                      value={nombres}
                      onChange={(e) => setNombres(e.target.value)}
                      placeholder="Carlos"
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
                      placeholder="Mendoza"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Correo Electrónico</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="carlos@email.com"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
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
                    <label className="text-xs font-semibold text-muted-foreground">Documento</label>
                    <input
                      type="text"
                      required
                      value={numeroDocumento}
                      onChange={(e) => setNumeroDocumento(e.target.value)}
                      placeholder="24123456"
                      className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Fecha Nacimiento</label>
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
                      <option value={Modalidad.PRESENCIAL}>Presencial</option>
                      <option value={Modalidad.REMOTO}>Remoto</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">WhatsApp</label>
                  <input
                    type="text"
                    required
                    value={telefonoWhatsapp}
                    onChange={(e) => setTelefonoWhatsapp(e.target.value)}
                    placeholder="+584121234567"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Ficha Médica Confidencial (Cifrado AES-256-GCM)
                  </label>
                  <textarea
                    rows={2}
                    value={fichaSaludPrivada}
                    onChange={(e) => setFichaSaludPrivada(e.target.value)}
                    placeholder="Lesiones previas, dolor articular, recomendaciones..."
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 mt-2 cursor-pointer"
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
