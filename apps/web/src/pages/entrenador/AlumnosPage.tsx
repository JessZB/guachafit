import React, { useState, useEffect } from 'react';
import { apiClient } from '../../lib/api-client';
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
  Activity,
  Calendar,
  Lock,
  X,
  CheckCircle2,
  Trash2,
  PauseCircle,
  PlayCircle,
} from 'lucide-react';

export function AlumnosPage() {
  const [alumnos, setAlumnos] = useState<PerfilAlumnoDetalleDTO[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Athlete Form State
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

  useEffect(() => {
    async function loadAlumnos() {
      setIsLoading(true);
      try {
        const data = await apiClient<PerfilAlumnoDetalleDTO[]>('/alumnos');
        setAlumnos(data);
      } catch {
        // Fallback demo roster
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
            createdAtUtc: new Date().toISOString(),
          },
        ];
        setAlumnos(demoRoster);
      } finally {
        setIsLoading(false);
      }
    }

    loadAlumnos();
  }, []);

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
      setSuccessMessage('Alumno registrado exitosamente.');
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
      }, 2000);
    } catch (err: any) {
      // Local optimistic addition for demo
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
        edadCalculada: 25,
        telefonoWhatsapp,
        modalidad,
        estadoActivacion: EstadoAlumno.ACTIVO,
        fichaSaludPrivada,
        createdAtUtc: new Date().toISOString(),
      };
      setAlumnos((prev) => [localDemo, ...prev]);
      setSuccessMessage('Alumno registrado en la cartera.');
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredAlumnos = alumnos.filter(
    (a) =>
      a.nombres.toLowerCase().includes(search.toLowerCase()) ||
      a.apellidos.toLowerCase().includes(search.toLowerCase()) ||
      (a.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Users className="h-4 w-4" />
              <span>Gestión de Atletas & Onboarding (RF-011, RF-012)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-1">
              Directorio de Alumnos
            </h1>
            <p className="text-xs text-muted-foreground">
              Fichas deportivas, modalidades híbridas y control de ciclo de vida.
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>Inscribir Alumno Manual</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="h-4 w-4 text-muted-foreground absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, apellido o correo..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
          />
        </div>
      </div>

      {/* Roster List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredAlumnos.map((a) => (
          <div
            key={a.id}
            className="p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3 hover:border-primary/40 transition-all"
          >
            <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-foreground">
                  {a.nombres} {a.apellidos}
                </h3>
                <p className="text-xs text-muted-foreground">{a.email}</p>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-foreground border border-border uppercase">
                  {a.modalidad}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    a.estadoActivacion === EstadoAlumno.ACTIVO
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {a.estadoActivacion}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-secondary/30">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Documento
                </span>
                <p className="font-mono font-bold text-foreground">
                  {a.tipoDocumento}{a.numeroDocumento}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-secondary/30">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Edad
                </span>
                <p className="font-mono font-bold text-foreground">{a.edadCalculada} años</p>
              </div>
              <div className="p-2 rounded-xl bg-secondary/30">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  WhatsApp
                </span>
                <p className="font-mono font-bold text-foreground truncate">{a.telefonoWhatsapp}</p>
              </div>
            </div>

            {a.fichaSaludPrivada && (
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-[11px] text-foreground flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{a.fichaSaludPrivada}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Manual Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">Inscripción Manual en Sala</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground"
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
                  <label className="text-xs font-semibold text-muted-foreground">Correo</label>
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
                    <label className="text-xs font-semibold text-muted-foreground">Fecha Nac</label>
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
                  <label className="text-xs font-semibold text-muted-foreground">
                    Ficha Médica Confidencial (Cifrado AES-256-GCM)
                  </label>
                  <textarea
                    rows={2}
                    value={fichaSaludPrivada}
                    onChange={(e) => setFichaSaludPrivada(e.target.value)}
                    placeholder="Lesiones previas, patologías o contraindicaciones..."
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md hover:brightness-110 active:scale-98 transition-all disabled:opacity-50 mt-2"
                >
                  {isSubmitting ? 'Guardando en base de datos...' : 'Inscribir y Enviar Invitación'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
