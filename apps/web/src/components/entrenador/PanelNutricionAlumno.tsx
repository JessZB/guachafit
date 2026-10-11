/**
 * RF-002 · vista del coach dentro del expediente del alumno (pestaña "Nutrición").
 *
 * Muestra:
 * - RN-01: metas del alumno (calorías, macros, agua y recursos educativos: enlace externo o
 *   PDF subido al almacenamiento privado con presign+PUT reales, con estado de subida y
 *   previsualización por el enlace firmado) con editor y estado honesto "Sin metas
 *   configuradas" (204 real, nunca un 0 fabricado). La lógica del editor (validación sin
 *   truncar, cambios sin guardar, PDFs que se borrarán) vive en `lib/editor-metas-nutricion`.
 * - Reportes nutricionales de los últimos 30 días: estado de cada día
 *   (`cumplido`/`parcial`/`no_cumplido`/`No reportado` derivado), totales vs metas, margen de
 *   tolerancia ±10 % y galería de fotos de platos con el visor accesible compartido.
 * - El editor de metas solo se abre con las metas ya cargadas: guardar reemplaza la lista de
 *   PDFs y, sin conocerla, un PUT podría borrar archivos sin avisar.
 *
 * El listado del endpoint no es paginado server-side (no hay envelope): se consulta una ventana
 * declarada de 30 días y se pagina en cliente con `Paginacion`, cuyo copy declara el alcance.
 * Los datos demo solo se consumen con `isDemoMode` (ADR-012).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../lib/api-client';
import { Paginacion } from '../common/Paginacion';
import { VisorFoto } from '../common/VisorFoto';
import { MiniaturaFotoPlato } from '../common/MiniaturaFotoPlato';
import { useDialogoAccesible } from '../../lib/use-dialogo-accesible';
import { rebanarPagina } from '../../lib/paginacion';
import {
  clasificarTolerancia,
  crearCalendarioNutricional,
  contarNoReportados,
  etiquetaEstadoDia,
  etiquetaTipoComida,
  describirComparacionMeta,
  describirRegistroCheckin,
  evaluarToleranciaDia,
  formatearDesviacionPct,
  notaBaseTolerancia,
  metasConfiguradas,
  resumenMetas,
  type DiaCalendarioNutricional,
} from '../../lib/nutricion-metas';
import {
  esFilaRecursoVacia,
  filaRecursoVacia,
  LIMITE_RECURSOS_EDUCATIVOS,
  tieneFirmaPdf,
  validarArchivoPdf,
  type FilaRecursoFormulario,
} from '../../lib/recursos-pdf';
import {
  MENSAJE_ESPERA_SUBIDA,
  MENSAJE_SUBIDA_PDF_FALLIDA,
  decidirAlCerrar,
  decidirAlGuardar,
  estadoEdicionMetas,
  formularioDesdeMetas,
  mensajeErrorGuardarMetas,
  mensajeErrorSubidaPdf,
  pdfsQueSeEliminaran,
  textosConfirmacionBorrado,
  validarFormularioMetas,
  type FormularioMetas,
} from '../../lib/editor-metas-nutricion';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import { CampoMeta } from './CampoMeta';
import { FilaRecursoEditor } from './FilaRecursoEditor';
import { AvisosEditorMetas } from './AvisosEditorMetas';
import { ZonaHorariaPerfil } from '../common/ZonaHorariaPerfil';
import { horaDeZona, partesEnZona } from '../../lib/zona-horaria';
import { HORARIO_VENTANA_CHECKIN, zonaPerfilEfectiva } from '../../lib/nutricion-checkin';
import { checkinsNutricionalesDemo, crearMetasNutricionalesDemo } from '../../lib/demo-nutricion';
import { formatFechaLargaCalendario, sumarDiasCalendario, ultimosDiasCalendario } from '../../lib/date-format';
import { pluralizar } from '../../lib/pluralizar';
import {
  EstadoDiaNutricional,
  type CheckinNutricionalDetalleDTO,
  type FotoComidaDetalleDTO,
  type MetasNutricionalesDTO,
  type MetasNutricionalesDetalleDTO,
  type PresignedUploadUrlResponseDTO,
  type RecursoNutricionalDetalleDTO,
} from '@guachafit/shared';
import {
  Activity,
  AlertTriangle,
  Camera,
  Clock,
  ExternalLink,
  FileText,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  X,
} from 'lucide-react';

export interface PanelNutricionAlumnoProps {
  /** `usuarios.id` del alumno: clave real de check-ins y del presign (no el id del perfil). */
  alumnoUsuarioId: string;
  /** Id del perfil (`PATCH /alumnos/:id`); sin él no se ofrece cambiar la zona horaria. */
  alumnoPerfilId?: string;
  alumnoNombre?: string | null;
  /** ADR-019: zona horaria del perfil del alumno. */
  zonaHoraria?: string | null;
  onZonaHorariaGuardada?: (zonaHoraria: string) => void;
  isDemoMode: boolean;
}

/** Ventana de consulta del calendario (días hacia atrás desde hoy, inclusive). */
const DIAS_VENTANA = 30;

const CLASES_TONO: Record<string, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-destructive/15 text-destructive border-destructive/30',
  info: 'bg-info/15 text-info border-info/30',
  neutral: 'bg-secondary text-muted-foreground border-border',
};

const tonoDe = (tono: string): string => CLASES_TONO[tono] ?? CLASES_TONO.neutral;

export function PanelNutricionAlumno({
  alumnoUsuarioId,
  alumnoPerfilId,
  alumnoNombre,
  zonaHoraria,
  onZonaHorariaGuardada,
  isDemoMode,
}: PanelNutricionAlumnoProps) {
  // ADR-019: "hoy" del alumno, el calendario y las horas de registro se cuentan en la zona de su
  // perfil (resuelta como en el servidor), no en la del entrenador.
  const zonaHorariaAlumno = zonaPerfilEfectiva(zonaHoraria);
  const hoyLocal = partesEnZona(new Date(), zonaHorariaAlumno).fecha;

  const [metas, setMetas] = useState<MetasNutricionalesDetalleDTO | null>(null);
  /** `true` tras una carga exitosa (incluido "sin metas"): sin ella no se conoce qué PDFs hay. */
  const [isMetasCargadas, setIsMetasCargadas] = useState(false);
  const [isCargandoMetas, setIsCargandoMetas] = useState(false);
  const [metasError, setMetasError] = useState<string | null>(null);

  const [checkins, setCheckins] = useState<CheckinNutricionalDetalleDTO[]>([]);
  const [isCargandoCheckins, setIsCargandoCheckins] = useState(false);
  const [checkinsError, setCheckinsError] = useState<string | null>(null);

  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(10);

  const [isModalMetasOpen, setIsModalMetasOpen] = useState(false);
  const [calorias, setCalorias] = useState('');
  const [proteina, setProteina] = useState('');
  const [carbohidratos, setCarbohidratos] = useState('');
  const [grasas, setGrasas] = useState('');
  const [agua, setAgua] = useState('');
  const [recursos, setRecursos] = useState<FilaRecursoFormulario[]>([]);
  const [isGuardandoMetas, setIsGuardandoMetas] = useState(false);
  const [metasFormError, setMetasFormError] = useState<string | null>(null);
  const [metasFormExito, setMetasFormExito] = useState<string | null>(null);
  /** Foto del formulario al abrirlo (o tras guardar): base para detectar cambios sin guardar. */
  const [formularioInicial, setFormularioInicial] = useState<FormularioMetas>(() =>
    formularioDesdeMetas(null)
  );
  const [isConfirmandoDescartar, setIsConfirmandoDescartar] = useState(false);
  /** Guardado en espera de confirmar el borrado permanente de PDFs ya subidos. */
  const [guardadoPendiente, setGuardadoPendiente] = useState<{
    datos: MetasNutricionalesDTO;
    formulario: FormularioMetas;
    pdfs: Array<{ titulo: string; storageKey: string }>;
  } | null>(null);

  const [fotoVisor, setFotoVisor] = useState<{ foto: FotoComidaDetalleDTO; fecha: string } | null>(
    null
  );

  const formularioActual: FormularioMetas = {
    calorias,
    proteina,
    carbohidratos,
    grasas,
    agua,
    recursos,
  };

  const edicionMetas = estadoEdicionMetas({
    cargando: isCargandoMetas,
    error: metasError,
    cargadas: isMetasCargadas,
  });

  /** Cerrar con cambios sin guardar pide confirmación; sin cambios, cierra directo. */
  const solicitarCerrarEditor = () => {
    if (decidirAlCerrar(formularioInicial, formularioActual) === 'confirmar-descarte') {
      setIsConfirmandoDescartar(true);
      return;
    }
    setIsModalMetasOpen(false);
  };

  // U3b: el editor de metas es un diálogo accesible (Escape, trampa de Tab, restore de foco).
  const refModal = useDialogoAccesible({
    abierto: isModalMetasOpen,
    onCerrar: solicitarCerrarEditor,
  });

  // Solo la carga más reciente escribe el estado: al cambiar de alumno con una carga en vuelo, la
  // respuesta tardía del anterior se descarta.
  const turnoMetasRef = useRef(0);
  const turnoCheckinsRef = useRef(0);

  const cargarMetas = useCallback(async () => {
    const turno = ++turnoMetasRef.current;
    const vigente = () => turno === turnoMetasRef.current;
    if (isDemoMode) {
      setMetas(crearMetasNutricionalesDemo(alumnoUsuarioId));
      setMetasError(null);
      setIsMetasCargadas(true);
      return;
    }
    setIsCargandoMetas(true);
    setMetasError(null);
    try {
      // 204 (aún sin metas) se resuelve como null: estado "Sin metas configuradas".
      const data = await apiClient<MetasNutricionalesDetalleDTO | null>(
        `/nutricion/alumnos/${alumnoUsuarioId}/metas`
      );
      if (!vigente()) return;
      setMetas(data ?? null);
      setIsMetasCargadas(true);
    } catch (err: any) {
      if (!vigente()) return;
      setMetas(null);
      setIsMetasCargadas(false);
      setMetasError(
        err?.message || 'No se pudieron cargar las metas del alumno. Inténtalo de nuevo.'
      );
    } finally {
      if (vigente()) setIsCargandoMetas(false);
    }
  }, [alumnoUsuarioId, isDemoMode]);

  const cargarCheckins = useCallback(async () => {
    const turno = ++turnoCheckinsRef.current;
    const vigente = () => turno === turnoCheckinsRef.current;
    if (isDemoMode) {
      setCheckins(checkinsNutricionalesDemo(alumnoUsuarioId));
      setCheckinsError(null);
      return;
    }
    setIsCargandoCheckins(true);
    setCheckinsError(null);
    try {
      const desde = sumarDiasCalendario(hoyLocal, -(DIAS_VENTANA - 1));
      const data = await apiClient<CheckinNutricionalDetalleDTO[]>(
        `/nutricion/alumnos/${alumnoUsuarioId}/checkins?desde=${desde}&hasta=${hoyLocal}`
      );
      if (!vigente()) return;
      setCheckins(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (!vigente()) return;
      setCheckins([]);
      setCheckinsError(
        err?.message || 'No se pudieron cargar los reportes del alumno. Inténtalo de nuevo.'
      );
    } finally {
      if (vigente()) setIsCargandoCheckins(false);
    }
  }, [alumnoUsuarioId, isDemoMode, hoyLocal]);

  useEffect(() => {
    void cargarMetas();
    void cargarCheckins();
  }, [cargarMetas, cargarCheckins]);

  const calendario = useMemo(
    () => crearCalendarioNutricional(ultimosDiasCalendario(hoyLocal, DIAS_VENTANA), checkins, hoyLocal),
    [checkins, hoyLocal]
  );

  const diasPagina = rebanarPagina(calendario, pagina, tamano);
  const noReportadosVentana = contarNoReportados(calendario);
  const reportadosVentana = calendario.filter((dia) => dia.checkin !== null).length;

  const cargarFormulario = (formulario: FormularioMetas) => {
    setCalorias(formulario.calorias);
    setProteina(formulario.proteina);
    setCarbohidratos(formulario.carbohidratos);
    setGrasas(formulario.grasas);
    setAgua(formulario.agua);
    setRecursos(formulario.recursos);
  };

  const abrirEditorMetas = () => {
    if (!edicionMetas.habilitado) return;
    const inicial = formularioDesdeMetas(metas);
    cargarFormulario(inicial);
    setFormularioInicial(inicial);
    setMetasFormError(null);
    setMetasFormExito(null);
    setIsConfirmandoDescartar(false);
    setGuardadoPendiente(null);
    setIsModalMetasOpen(true);
  };

  const handleGuardarMetas = (e: React.FormEvent) => {
    e.preventDefault();
    setMetasFormError(null);
    setMetasFormExito(null);

    const formulario = formularioActual;
    const haySubidaEnCurso = formulario.recursos.some((recurso) => recurso.subiendo);

    // Decimales en calorías/macros se rechazan con un mensaje claro (el contrato exige enteros):
    // nunca se truncan en silencio. Con una subida en curso no se valida: se espera.
    const validacion = haySubidaEnCurso ? null : validarFormularioMetas(formulario);
    if (validacion && !validacion.ok) {
      setMetasFormError(validacion.mensaje);
      return;
    }

    // Guardar reemplaza la lista completa: la API borra para siempre los PDFs que ya no figuran.
    const pdfs = validacion ? pdfsQueSeEliminaran(metas?.recursos ?? [], validacion.datos.recursos) : [];
    const decision = decidirAlGuardar({
      haySubidaEnCurso,
      pdfsAEliminar: pdfs.length,
      modoDemo: isDemoMode,
    });

    if (decision === 'esperar-subida' || !validacion) {
      setMetasFormError(MENSAJE_ESPERA_SUBIDA);
      return;
    }
    if (decision === 'confirmar-borrado') {
      setGuardadoPendiente({ datos: validacion.datos, formulario, pdfs });
      return;
    }
    void enviarMetas(validacion.datos, formulario);
  };

  /**
   * Envía las metas ya validadas. `formulario` es la foto exacta que se guarda: tras el éxito pasa
   * a ser la base para detectar cambios sin guardar.
   */
  const enviarMetas = async (datos: MetasNutricionalesDTO, formulario: FormularioMetas) => {
    // MODO DEMO EXPLÍCITO: la edición se simula localmente y se declara como tal. Un PDF subido
    // en demo conserva su previsualización local (blob URL), nunca viaja a la API.
    if (isDemoMode) {
      const recursosDemo: RecursoNutricionalDetalleDTO[] = (datos.recursos ?? []).map((recurso) => {
        if (recurso.storageKey) {
          const fila = formulario.recursos.find((item) => item.storageKey === recurso.storageKey);
          return {
            titulo: recurso.titulo,
            url: fila?.url || null,
            storageKey: recurso.storageKey,
          };
        }
        return { titulo: recurso.titulo, url: recurso.url ?? null, storageKey: null };
      });

      setMetas({
        id: metas?.id ?? 'demo-metas-nutricion',
        alumnoId: alumnoUsuarioId,
        caloriasObjetivo: datos.caloriasObjetivo ?? null,
        proteinaGramosObjetivo: datos.proteinaGramosObjetivo ?? null,
        carbohidratosGramosObjetivo: datos.carbohidratosGramosObjetivo ?? null,
        grasasGramosObjetivo: datos.grasasGramosObjetivo ?? null,
        aguaLitrosObjetivo: datos.aguaLitrosObjetivo ?? null,
        recursos: recursosDemo,
        createdAtUtc: metas?.createdAtUtc ?? new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      });
      setFormularioInicial(formulario);
      setMetasFormExito('Modo demostración: el cambio solo se simuló en esta pantalla; no se guardó.');
      return;
    }

    setIsGuardandoMetas(true);
    try {
      const guardadas = await apiClient<MetasNutricionalesDetalleDTO>(
        `/nutricion/alumnos/${alumnoUsuarioId}/metas`,
        { method: 'PUT', body: JSON.stringify(datos) }
      );
      setMetas(guardadas);
      setFormularioInicial(formulario);
      setMetasFormExito('Metas guardadas. El alumno ya las ve en su pantalla de nutrición.');
      setMetasError(null);
    } catch (err: unknown) {
      // D5: el éxito solo se declara con 2xx; el error se muestra y no muta lo ya cargado.
      setMetasFormError(mensajeErrorGuardarMetas(err));
    } finally {
      setIsGuardandoMetas(false);
    }
  };

  /**
   * El diálogo de borrado permanece abierto en "procesando" (`isGuardandoMetas`) durante el PUT,
   * para no perder el resultado; se cierra al terminar y el resultado se ve en el editor.
   */
  const confirmarBorradoPdfs = async () => {
    if (!guardadoPendiente) return;
    await enviarMetas(guardadoPendiente.datos, guardadoPendiente.formulario);
    setGuardadoPendiente(null);
  };

  /** Actualiza una fila del editor sin tocar las demás. */
  const actualizarFilaRecurso = (indice: number, cambios: Partial<FilaRecursoFormulario>) => {
    setRecursos((previos) =>
      previos.map((item, i) => (i === indice ? { ...item, ...cambios } : item))
    );
  };

  /**
   * RF-002 RN-01 / RNF-001: sube el PDF elegido con presign + PUT reales. La validación es
   * real (MIME/extensión, tamaño y firma `%PDF-` del contenido) antes de pedir la URL firmada.
   */
  const subirPdf = async (indice: number, archivo: File | null | undefined) => {
    if (!archivo) return;

    const errorFormato = validarArchivoPdf(archivo);
    if (errorFormato) {
      actualizarFilaRecurso(indice, { errorSubida: errorFormato });
      return;
    }
    if (!(await tieneFirmaPdf(archivo))) {
      actualizarFilaRecurso(indice, {
        errorSubida: 'El archivo no parece un PDF válido. Elige otro archivo.',
      });
      return;
    }

    actualizarFilaRecurso(indice, { subiendo: true, errorSubida: null });

    // MODO DEMO: la subida se simula localmente y se declara; nunca viaja a la API.
    if (isDemoMode) {
      const previewUrl = URL.createObjectURL(archivo);
      actualizarFilaRecurso(indice, {
        subiendo: false,
        storageKey: `nutricion-recursos/${alumnoUsuarioId}/2026/${crypto.randomUUID()}.pdf`,
        nombreArchivo: archivo.name,
        url: previewUrl,
      });
      return;
    }

    try {
      const presigned = await apiClient<PresignedUploadUrlResponseDTO>(
        '/antropometria/presigned-upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            modulo: 'nutricion-recursos',
            alumnoId: alumnoUsuarioId,
            mimeType: 'application/pdf',
          }),
        }
      );

      const respuesta = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: archivo,
      });
      if (!respuesta.ok) {
        actualizarFilaRecurso(indice, { subiendo: false, errorSubida: MENSAJE_SUBIDA_PDF_FALLIDA });
        return;
      }

      actualizarFilaRecurso(indice, {
        subiendo: false,
        errorSubida: null,
        storageKey: presigned.storageKey,
        nombreArchivo: archivo.name,
        url: '',
      });
    } catch (err: unknown) {
      actualizarFilaRecurso(indice, { subiendo: false, errorSubida: mensajeErrorSubidaPdf(err) });
    }
  };

  /**
   * Quita el recurso de la lista del editor. Si era un PDF ya guardado, el archivo se borra para
   * siempre al guardar (la API elimina los PDFs que el reemplazo deja sin referencia); por eso
   * `handleGuardarMetas` pide confirmación antes de enviar.
   */
  const quitarRecurso = (indice: number) =>
    setRecursos((previos) => previos.filter((_, i) => i !== indice));

  const recursosVisibles = metas?.recursos ?? [];
  const textosBorrado = textosConfirmacionBorrado(guardadoPendiente?.pdfs.length ?? 1);
  const objetivos = resumenMetas(metas);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* RN-01: metas del alumno                                              */}
      {/* ------------------------------------------------------------------ */}
      <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm text-foreground">
              Metas nutricionales{alumnoNombre ? ` de ${alumnoNombre}` : ''}
            </h3>
          </div>
          <button
            type="button"
            onClick={abrirEditorMetas}
            disabled={!edicionMetas.habilitado}
            aria-describedby={edicionMetas.habilitado ? undefined : 'metas-edicion-motivo'}
            className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>{metasConfiguradas(metas) ? 'Editar metas' : 'Definir metas'}</span>
          </button>
        </div>

        {!edicionMetas.habilitado && (
          <p id="metas-edicion-motivo" className="text-xs text-muted-foreground">
            {edicionMetas.motivo}
          </p>
        )}

        {isCargandoMetas && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando metas…
          </p>
        )}

        {metasError && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25">
            <p role="alert" className="text-xs text-destructive font-semibold">{metasError}</p>
            <button
              type="button"
              onClick={() => void cargarMetas()}
              className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {!isCargandoMetas && !metasError && !metasConfiguradas(metas) && (
          <p className="text-xs text-muted-foreground">
            Sin metas configuradas. Define calorías, macros, agua o recursos para que el alumno vea
            sus objetivos y su reporte se compare contra ellos.
          </p>
        )}

        {!metasError && objetivos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {objetivos.map((objetivo) => (
              <div key={objetivo.etiqueta} className="p-3 rounded-2xl bg-secondary/40 border border-border">
                <span className="block text-xs font-semibold uppercase text-muted-foreground">
                  {objetivo.etiqueta}
                </span>
                <p className="text-base font-bold font-mono text-foreground mt-0.5">{objetivo.valor}</p>
              </div>
            ))}
          </div>
        )}

        {!metasError && recursosVisibles.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Recursos educativos
            </span>
            <ul className="space-y-1.5">
              {recursosVisibles.map((recurso) => (
                <li key={recurso.storageKey ?? recurso.url ?? recurso.titulo}>
                  {recurso.url ? (
                    <a
                      href={recurso.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline"
                    >
                      {recurso.storageKey ? (
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>{recurso.titulo}</span>
                      {recurso.storageKey && (
                        <span className="text-xs font-bold uppercase text-muted-foreground">PDF</span>
                      )}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 min-h-11 text-xs font-semibold text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <span>{recurso.titulo} · no pudimos generar el enlace del archivo</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Zona horaria del alumno (ADR-019)                                    */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-labelledby="titulo-zona-horaria-alumno"
        className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 id="titulo-zona-horaria-alumno" className="font-bold text-sm text-foreground">
            Zona horaria del alumno
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Su reporte se abre de {HORARIO_VENTANA_CHECKIN} en {horaDeZona(zonaHorariaAlumno)}, y las
          horas de registro se muestran en esa zona.
        </p>
        {alumnoPerfilId && (
          <ZonaHorariaPerfil
            id="zona-horaria-alumno"
            zonaActual={zonaHorariaAlumno}
            endpoint={`/alumnos/${alumnoPerfilId}`}
            modoDemo={isDemoMode}
            onGuardada={onZonaHorariaGuardada}
          />
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Calendario de reportes (últimos 30 días)                             */}
      {/* ------------------------------------------------------------------ */}
      <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm text-foreground">Reportes de los últimos 30 días</h3>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {pluralizar(reportadosVentana, 'día reportado', 'días reportados')} ·{' '}
            {noReportadosVentana} sin reporte
          </span>
        </div>

        {isCargandoCheckins && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando reportes…
          </p>
        )}

        {checkinsError && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25">
            <p role="alert" className="text-xs text-destructive font-semibold">{checkinsError}</p>
            <button
              type="button"
              onClick={() => void cargarCheckins()}
              className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Reintentar</span>
            </button>
          </div>
        )}

        {!isCargandoCheckins && !checkinsError && (
          <ul className="space-y-2.5">
            {diasPagina.map((dia) => (
              <FilaDiaNutricional
                key={dia.fecha}
                dia={dia}
                metas={metas}
                zonaHoraria={zonaHorariaAlumno}
                onVerFoto={(foto) => setFotoVisor({ foto, fecha: dia.fecha })}
              />
            ))}
          </ul>
        )}

        {!isCargandoCheckins && !checkinsError && calendario.length > 0 && (
          <div className="space-y-2 pt-1">
            <Paginacion
              pagina={pagina}
              tamano={tamano}
              total={calendario.length}
              onCambiarPagina={setPagina}
              onCambiarTamano={(nuevo) => {
                setTamano(nuevo);
                setPagina(1);
              }}
              cargando={isCargandoCheckins}
            />
            <p className="text-xs text-muted-foreground">
              Se muestran los últimos 30 días; los reportes anteriores no aparecen en esta lista.
            </p>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Editor de metas (diálogo accesible)                                  */}
      {/* ------------------------------------------------------------------ */}
      {isModalMetasOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) solicitarCerrarEditor();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            ref={refModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-metas-nutricion-titulo"
            tabIndex={-1}
            className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl bg-card border border-border shadow-2xl p-5 space-y-4 focus:outline-hidden"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
              <div>
                <h3 id="editor-metas-nutricion-titulo" className="font-bold text-base text-foreground">
                  Metas nutricionales
                </h3>
                <p className="text-xs text-muted-foreground">
                  Deja un campo vacío si no quieres fijar esa meta (no se guarda como 0).
                </p>
              </div>
              <button
                type="button"
                onClick={solicitarCerrarEditor}
                aria-label="Cerrar editor de metas"
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarMetas} noValidate className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <CampoMeta id="meta-calorias" etiqueta="Calorías (kcal)" valor={calorias} onChange={setCalorias} placeholder="2200" />
                <CampoMeta id="meta-proteina" etiqueta="Proteína (g)" valor={proteina} onChange={setProteina} placeholder="160" />
                <CampoMeta
                  id="meta-carbohidratos"
                  etiqueta="Carbohidratos (g)"
                  valor={carbohidratos}
                  onChange={setCarbohidratos}
                  placeholder="220"
                />
                <CampoMeta id="meta-grasas" etiqueta="Grasas (g)" valor={grasas} onChange={setGrasas} placeholder="70" />
                <CampoMeta id="meta-agua" etiqueta="Agua (L)" valor={agua} onChange={setAgua} placeholder="3.00" decimal />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground">Recursos educativos</span>
                  <button
                    type="button"
                    disabled={
                      recursos.length >= LIMITE_RECURSOS_EDUCATIVOS ||
                      recursos.some((recurso) => esFilaRecursoVacia(recurso))
                    }
                    onClick={() => setRecursos((previos) => [...previos, filaRecursoVacia()])}
                    className="min-h-11 px-3 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Añadir recurso</span>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pega un enlace externo o sube un PDF (lista de compras, distribución de comidas).
                  Los PDFs se guardan en el espacio privado del alumno (máx. 10 recursos).
                </p>

                {recursos.map((recurso, indice) => (
                  <FilaRecursoEditor
                    key={indice}
                    indice={indice}
                    recurso={recurso}
                    onCambiar={(cambios) => actualizarFilaRecurso(indice, cambios)}
                    onQuitar={() => quitarRecurso(indice)}
                    onSubirPdf={(archivo) => void subirPdf(indice, archivo)}
                  />
                ))}
              </div>

              <AvisosEditorMetas error={metasFormError} exito={metasFormExito} />

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={solicitarCerrarEditor}
                  className="min-h-11 px-4 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={isGuardandoMetas}
                  className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isGuardandoMetas && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isGuardandoMetas ? 'Guardando…' : 'Guardar metas'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmación: guardar borrará para siempre los PDFs quitados */}
      <DialogoConfirmacion
        abierto={guardadoPendiente !== null}
        idTitulo="confirmar-borrado-pdfs-titulo"
        titulo={textosBorrado.titulo}
        detalle={
          <div className="space-y-2">
            <p>{textosBorrado.detalle}</p>
            <ul className="list-disc pl-5 font-semibold text-foreground">
              {guardadoPendiente?.pdfs.map((pdf) => (
                <li key={pdf.storageKey}>{pdf.titulo}</li>
              ))}
            </ul>
          </div>
        }
        textoConfirmar="Borrar y guardar"
        textoCancelar="Volver al editor"
        variante="peligro"
        procesando={isGuardandoMetas}
        onCancelar={() => setGuardadoPendiente(null)}
        onConfirmar={() => void confirmarBorradoPdfs()}
      />

      {/* Confirmación: cerrar el editor con cambios sin guardar */}
      <DialogoConfirmacion
        abierto={isConfirmandoDescartar}
        idTitulo="confirmar-descartar-metas-titulo"
        titulo="¿Salir sin guardar?"
        detalle="Tienes cambios en las metas que no se han guardado. Si sales ahora, se perderán."
        textoConfirmar="Salir sin guardar"
        textoCancelar="Seguir editando"
        variante="peligro"
        onCancelar={() => setIsConfirmandoDescartar(false)}
        onConfirmar={() => {
          setIsConfirmandoDescartar(false);
          setIsModalMetasOpen(false);
        }}
      />

      {/* Visor accesible de fotos de platos */}
      {fotoVisor && (
        <VisorFoto
          foto={fotoVisor.foto}
          fecha={fotoVisor.fecha}
          etiqueta={etiquetaTipoComida(fotoVisor.foto.tipoComida)}
          onCerrar={() => setFotoVisor(null)}
        />
      )}
    </div>
  );
}

/** Fila del calendario: día con estado, totales vs metas, tolerancia, fotos y notas. */
function FilaDiaNutricional({
  dia,
  metas,
  zonaHoraria,
  onVerFoto,
}: {
  dia: DiaCalendarioNutricional;
  metas: MetasNutricionalesDetalleDTO | null;
  zonaHoraria: string;
  onVerFoto: (foto: FotoComidaDetalleDTO) => void;
}) {
  const etiqueta = etiquetaEstadoDia(dia.estado);
  const checkin = dia.checkin;
  // ADR-019: cada día se evalúa con las metas vigentes ese día (copia del reporte) o, en reportes
  // anteriores a la copia, con las actuales, y se dice cuál.
  const evaluacion = checkin ? evaluarToleranciaDia(checkin, metas) : null;
  const tolerancia = evaluacion?.tolerancia ?? null;
  const clasificacion = tolerancia ? clasificarTolerancia(tolerancia) : null;
  const notaBase = evaluacion ? notaBaseTolerancia(evaluacion.base) : null;
  const registro = checkin
    ? describirRegistroCheckin(checkin, checkin.zonaHoraria ?? zonaHoraria)
    : null;

  return (
    <li className="p-3.5 rounded-2xl bg-secondary/30 border border-border/70 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-foreground truncate">
            {formatFechaLargaCalendario(dia.fecha) ?? dia.fecha}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tonoDe(etiqueta.tono)}`}>
            {etiqueta.texto}
          </span>
        </div>
        {clasificacion && (
          <span className="inline-flex items-center gap-1 text-xs font-bold">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`px-2 py-0.5 rounded-full border ${tonoDe(clasificacion.tono)}`}>
              {clasificacion.texto}
            </span>
          </span>
        )}
      </div>

      {!checkin && (
        <p className="text-xs text-muted-foreground">
          {dia.estado === EstadoDiaNutricional.NO_REPORTADO
            ? 'Sin reporte ese día. No penaliza la racha de entrenamiento; cuenta en el resumen semanal.'
            : `El día sigue en curso: el reporte se habilita de ${HORARIO_VENTANA_CHECKIN} (${horaDeZona(zonaHoraria)}).`}
        </p>
      )}

      {checkin && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Calorías:{' '}
              <span className="font-mono font-bold text-foreground">
                {describirComparacionMeta(checkin.caloriasReportadas, evaluacion?.caloriasMeta ?? null, 'kcal') ?? '—'}
              </span>
              {tolerancia?.desviacionCaloriasPct !== undefined && (
                <span className="ml-1 font-mono">({formatearDesviacionPct(tolerancia.desviacionCaloriasPct)})</span>
              )}
            </span>
            <span>
              Proteína:{' '}
              <span className="font-mono font-bold text-foreground">
                {describirComparacionMeta(checkin.proteinaGramosReportada, evaluacion?.proteinaMeta ?? null, 'g') ?? '—'}
              </span>
              {tolerancia?.desviacionProteinasPct !== undefined && (
                <span className="ml-1 font-mono">({formatearDesviacionPct(tolerancia.desviacionProteinasPct)})</span>
              )}
            </span>
            {checkin.aguaLitros && <span>Agua: {checkin.aguaLitros} L</span>}
          </div>

          {(registro || notaBase) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {registro && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {registro}
                </span>
              )}
              {notaBase && <span className="italic">{notaBase}</span>}
            </div>
          )}

          {checkin.fotosPlatos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {checkin.fotosPlatos.map((foto) => (
                <li key={foto.id}>
                  <MiniaturaFotoPlato
                    foto={foto}
                    fechaTexto={formatFechaLargaCalendario(dia.fecha) ?? dia.fecha}
                    onAbrir={() => onVerFoto(foto)}
                  />
                </li>
              ))}
            </ul>
          )}

          {checkin.notasAlumno && (
            <p className="text-xs text-muted-foreground italic">"{checkin.notasAlumno}"</p>
          )}

          {checkin.fotosPlatos.length === 0 && (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5" />
              Ese día no adjuntó fotos de platos.
            </p>
          )}
        </>
      )}
    </li>
  );
}
