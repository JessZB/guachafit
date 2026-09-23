/**
 * RF-002 · vista del coach dentro del expediente del alumno (pestaña "Nutrición").
 *
 * Muestra:
 * - RN-01: metas del alumno (calorías, macros, agua y recursos educativos: enlace externo o
 *   PDF subido a la bóveda con presign+PUT reales, con estado de subida y previsualización por
 *   el enlace firmado) con editor y estado honesto "Sin metas configuradas" (204 real, nunca un
 *   0 fabricado).
 * - Escenario 2/3 + §6: calendario de check-ins de los últimos 30 días con estado
 *   (`cumplido`/`parcial`/`no_cumplido`/`No reportado` derivado), totales vs metas, semáforo de
 *   tolerancia ±10 % y galería de fotos de platos con el visor accesible compartido.
 *
 * El listado del endpoint no es paginado server-side (no hay envelope): se consulta una ventana
 * declarada de 30 días y se pagina en cliente con `Paginacion`, cuyo copy declara el alcance.
 * Los datos demo solo se consumen con `isDemoMode` (ADR-012).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  evaluarToleranciaNutricionalLocal,
  formatearDesviacionPct,
  metasConfiguradas,
  resumenMetas,
  type DiaCalendarioNutricional,
} from '../../lib/nutricion-metas';
import {
  construirRecursosParaGuardar,
  esFilaRecursoVacia,
  filaRecursoVacia,
  LIMITE_RECURSOS_EDUCATIVOS,
  tieneFirmaPdf,
  validarArchivoPdf,
  type FilaRecursoFormulario,
} from '../../lib/recursos-pdf';
import { checkinsNutricionalesDemo, crearMetasNutricionalesDemo } from '../../lib/demo-nutricion';
import { fechaCalendarioLocal, formatFechaLargaCalendario, sumarDiasCalendario, ultimosDiasCalendario } from '../../lib/date-format';
import { pluralizar } from '../../lib/pluralizar';
import {
  EstadoDiaNutricional,
  MetasNutricionalesSchema,
  type CheckinNutricionalDetalleDTO,
  type FotoComidaDetalleDTO,
  type MetasNutricionalesDetalleDTO,
  type PresignedUploadUrlResponseDTO,
  type RecursoNutricionalDetalleDTO,
} from '@guachafit/shared';
import {
  Activity,
  AlertTriangle,
  Camera,
  ExternalLink,
  FileText,
  FileUp,
  Gauge,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  X,
} from 'lucide-react';

export interface PanelNutricionAlumnoProps {
  /** `usuarios.id` del alumno: clave real de check-ins y del presign (no el id del perfil). */
  alumnoUsuarioId: string;
  alumnoNombre?: string | null;
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
  alumnoNombre,
  isDemoMode,
}: PanelNutricionAlumnoProps) {
  const hoyLocal = fechaCalendarioLocal();

  const [metas, setMetas] = useState<MetasNutricionalesDetalleDTO | null>(null);
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

  const [fotoVisor, setFotoVisor] = useState<{ foto: FotoComidaDetalleDTO; fecha: string } | null>(
    null
  );

  // U3b: el editor de metas es un diálogo accesible (Escape, trampa de Tab, restore de foco).
  const refModal = useDialogoAccesible({
    abierto: isModalMetasOpen,
    onCerrar: () => setIsModalMetasOpen(false),
  });

  const cargarMetas = useCallback(async () => {
    if (isDemoMode) {
      setMetas(crearMetasNutricionalesDemo(alumnoUsuarioId));
      setMetasError(null);
      return;
    }
    setIsCargandoMetas(true);
    setMetasError(null);
    try {
      // 204 (aún sin metas) se resuelve como null: estado "Sin metas configuradas".
      const data = await apiClient<MetasNutricionalesDetalleDTO | null>(
        `/nutricion/alumnos/${alumnoUsuarioId}/metas`
      );
      setMetas(data ?? null);
    } catch (err: any) {
      setMetas(null);
      setMetasError(
        err?.message || 'No se pudieron cargar las metas del alumno. Inténtalo de nuevo.'
      );
    } finally {
      setIsCargandoMetas(false);
    }
  }, [alumnoUsuarioId, isDemoMode]);

  const cargarCheckins = useCallback(async () => {
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
      setCheckins(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setCheckins([]);
      setCheckinsError(
        err?.message || 'No se pudieron cargar los check-ins del alumno. Inténtalo de nuevo.'
      );
    } finally {
      setIsCargandoCheckins(false);
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

  const abrirEditorMetas = () => {
    setCalorias(metas?.caloriasObjetivo !== null && metas ? String(metas.caloriasObjetivo) : '');
    setProteina(
      metas?.proteinaGramosObjetivo !== null && metas ? String(metas.proteinaGramosObjetivo) : ''
    );
    setCarbohidratos(
      metas?.carbohidratosGramosObjetivo !== null && metas
        ? String(metas.carbohidratosGramosObjetivo)
        : ''
    );
    setGrasas(metas?.grasasGramosObjetivo !== null && metas ? String(metas.grasasGramosObjetivo) : '');
    setAgua(metas?.aguaLitrosObjetivo ?? '');
    // Un recurso subido se reabre con su `storageKey` y SIN la URL firmada (caduca): la URL
    // externa solo se precarga cuando el recurso no es un archivo de la bóveda.
    setRecursos(
      (metas?.recursos ?? []).map((recurso) => ({
        ...filaRecursoVacia(),
        titulo: recurso.titulo,
        url: recurso.storageKey ? '' : recurso.url ?? '',
        storageKey: recurso.storageKey ?? '',
      }))
    );
    setMetasFormError(null);
    setMetasFormExito(null);
    setIsModalMetasOpen(true);
  };

  /** Texto del formulario → entero opcional; '' = no configurado (null), nunca 0 fabricado. */
  const aEntero = (texto: string): number | undefined => {
    const limpio = texto.trim();
    if (limpio === '') return undefined;
    const valor = Number(limpio);
    return Number.isFinite(valor) ? Math.trunc(valor) : Number.NaN;
  };

  const handleGuardarMetas = async (e: React.FormEvent) => {
    e.preventDefault();
    setMetasFormError(null);
    setMetasFormExito(null);

    if (recursos.some((recurso) => recurso.subiendo)) {
      setMetasFormError('Espera a que termine la subida del PDF antes de guardar.');
      return;
    }

    const recursosValidos = construirRecursosParaGuardar(recursos);

    const candidato = {
      caloriasObjetivo: aEntero(calorias),
      proteinaGramosObjetivo: aEntero(proteina),
      carbohidratosGramosObjetivo: aEntero(carbohidratos),
      grasasGramosObjetivo: aEntero(grasas),
      aguaLitrosObjetivo: agua.trim() === '' ? undefined : agua.trim().replace(',', '.'),
      recursos: recursosValidos.length > 0 ? recursosValidos : undefined,
    };

    const validacion = MetasNutricionalesSchema.safeParse(candidato);
    if (!validacion.success) {
      setMetasFormError(validacion.error.issues[0]?.message ?? 'Revisa las metas configuradas.');
      return;
    }

    // MODO DEMO EXPLÍCITO: la edición se simula localmente y se declara como tal. Un PDF subido
    // en demo conserva su previsualización local (blob URL), nunca viaja a la API.
    if (isDemoMode) {
      const recursosDemo: RecursoNutricionalDetalleDTO[] = (validacion.data.recursos ?? []).map(
        (recurso) => {
          if (recurso.storageKey) {
            const fila = recursos.find((item) => item.storageKey === recurso.storageKey);
            return {
              titulo: recurso.titulo,
              url: fila?.url || null,
              storageKey: recurso.storageKey,
            };
          }
          return { titulo: recurso.titulo, url: recurso.url ?? null, storageKey: null };
        }
      );

      setMetas({
        id: metas?.id ?? 'demo-metas-nutricion',
        alumnoId: alumnoUsuarioId,
        caloriasObjetivo: validacion.data.caloriasObjetivo ?? null,
        proteinaGramosObjetivo: validacion.data.proteinaGramosObjetivo ?? null,
        carbohidratosGramosObjetivo: validacion.data.carbohidratosGramosObjetivo ?? null,
        grasasGramosObjetivo: validacion.data.grasasGramosObjetivo ?? null,
        aguaLitrosObjetivo: validacion.data.aguaLitrosObjetivo ?? null,
        recursos: recursosDemo,
        createdAtUtc: metas?.createdAtUtc ?? new Date().toISOString(),
        updatedAtUtc: new Date().toISOString(),
      });
      setMetasFormExito('Modo demo: cambio simulado localmente; no se envió a la API.');
      return;
    }

    setIsGuardandoMetas(true);
    try {
      const guardadas = await apiClient<MetasNutricionalesDetalleDTO>(
        `/nutricion/alumnos/${alumnoUsuarioId}/metas`,
        { method: 'PUT', body: JSON.stringify(validacion.data) }
      );
      setMetas(guardadas);
      setMetasFormExito('Metas guardadas. El alumno ya las ve en su pantalla de nutrición.');
      setMetasError(null);
    } catch (err: any) {
      // D5: el éxito solo se declara con 2xx; el error se muestra y no muta lo ya cargado.
      setMetasFormError(err?.message || 'No se pudieron guardar las metas. Inténtalo de nuevo.');
    } finally {
      setIsGuardandoMetas(false);
    }
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
        errorSubida: 'El archivo no parece un PDF válido (no encontramos su firma). Elige otro archivo.',
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
        throw new Error(
          `No se pudo subir el PDF (${respuesta.status}). Revisa tu conexión e inténtalo de nuevo.`
        );
      }

      actualizarFilaRecurso(indice, {
        subiendo: false,
        errorSubida: null,
        storageKey: presigned.storageKey,
        nombreArchivo: archivo.name,
        url: '',
      });
    } catch (err: any) {
      actualizarFilaRecurso(indice, {
        subiendo: false,
        errorSubida: err?.message || 'No se pudo subir el PDF. Inténtalo de nuevo.',
      });
    }
  };

  /** Quita el recurso de la lista. El objeto ya subido queda huérfano en la bóveda (sin DELETE). */
  const quitarRecurso = (indice: number) =>
    setRecursos((previos) => previos.filter((_, i) => i !== indice));

  const recursosVisibles = metas?.recursos ?? [];
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
            className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>{metasConfiguradas(metas) ? 'Editar metas' : 'Definir metas'}</span>
          </button>
        </div>

        {isCargandoMetas && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando metas…
          </p>
        )}

        {metasError && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25">
            <p className="text-xs text-destructive font-semibold">{metasError}</p>
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
                <span className="block text-[11px] font-semibold uppercase text-muted-foreground">
                  {objetivo.etiqueta}
                </span>
                <p className="text-base font-black font-mono text-foreground mt-0.5">{objetivo.valor}</p>
              </div>
            ))}
          </div>
        )}

        {!metasError && recursosVisibles.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground">
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
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">PDF</span>
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
      {/* Calendario de check-ins (últimos 30 días)                            */}
      {/* ------------------------------------------------------------------ */}
      <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm text-foreground">Check-ins de los últimos 30 días</h3>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {pluralizar(reportadosVentana, 'día reportado', 'días reportados')} ·{' '}
            {noReportadosVentana} sin reporte
          </span>
        </div>

        {isCargandoCheckins && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando check-ins…
          </p>
        )}

        {checkinsError && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25">
            <p className="text-xs text-destructive font-semibold">{checkinsError}</p>
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
            <p className="text-[11px] text-muted-foreground">
              Ventana consultada: últimos 30 días. La paginación aplica sobre esa ventana, no sobre
              todo el historial del alumno.
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
            if (e.target === e.currentTarget) setIsModalMetasOpen(false);
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
                <p className="text-[11px] text-muted-foreground">
                  Un campo vacío queda "no configurado" (no se guarda como 0).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalMetasOpen(false)}
                aria-label="Cerrar editor de metas"
                className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleGuardarMetas} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <CampoMeta etiqueta="Calorías (kcal)" valor={calorias} onChange={setCalorias} placeholder="2200" />
                <CampoMeta etiqueta="Proteína (g)" valor={proteina} onChange={setProteina} placeholder="160" />
                <CampoMeta
                  etiqueta="Carbohidratos (g)"
                  valor={carbohidratos}
                  onChange={setCarbohidratos}
                  placeholder="220"
                />
                <CampoMeta etiqueta="Grasas (g)" valor={grasas} onChange={setGrasas} placeholder="70" />
                <CampoMeta etiqueta="Agua (L)" valor={agua} onChange={setAgua} placeholder="3.00" decimal />
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
                <p className="text-[11px] text-muted-foreground">
                  Pega un enlace externo o sube un PDF (lista de compras, distribución de comidas).
                  Los PDFs se guardan en la bóveda privada del alumno (máx. 10 recursos).
                </p>

                {recursos.map((recurso, indice) => (
                  <div
                    key={indice}
                    className="rounded-2xl border border-border bg-secondary/20 p-2.5 space-y-2"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={recurso.titulo}
                        onChange={(e) => actualizarFilaRecurso(indice, { titulo: e.target.value })}
                        placeholder="Título (ej. Lista de compras)"
                        className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => quitarRecurso(indice)}
                        aria-label={`Quitar recurso ${indice + 1}`}
                        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {recurso.storageKey ? (
                      <div className="flex flex-wrap items-center gap-2 min-h-11">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-success bg-success/10 border border-success/25 rounded-full px-2.5 py-1">
                          <FileText className="h-3.5 w-3.5" />
                          {recurso.nombreArchivo ?? 'PDF subido a la bóveda'}
                        </span>
                        {recurso.url ? (
                          <a
                            href={recurso.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Ver PDF</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            Vista previa disponible al guardar
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            actualizarFilaRecurso(indice, {
                              storageKey: '',
                              nombreArchivo: null,
                              url: '',
                              errorSubida: null,
                            })
                          }
                          className="min-h-11 px-3 rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Quitar archivo
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="url"
                          value={recurso.url}
                          onChange={(e) => actualizarFilaRecurso(indice, { url: e.target.value })}
                          placeholder="https://… (enlace externo)"
                          className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-xs text-foreground focus:outline-hidden focus:border-primary"
                        />
                        <label
                          className={`shrink-0 min-h-11 px-3 rounded-xl border border-border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            recurso.subiendo
                              ? 'opacity-60 cursor-wait bg-secondary'
                              : 'bg-secondary hover:bg-secondary/70 text-foreground'
                          }`}
                        >
                          <input
                            type="file"
                            accept="application/pdf,.pdf"
                            className="sr-only"
                            disabled={recurso.subiendo}
                            onChange={(e) => {
                              const archivo = e.target.files?.[0];
                              e.target.value = '';
                              void subirPdf(indice, archivo);
                            }}
                          />
                          {recurso.subiendo ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileUp className="h-3.5 w-3.5" />
                          )}
                          <span>{recurso.subiendo ? 'Subiendo…' : 'Subir PDF'}</span>
                        </label>
                      </div>
                    )}

                    {recurso.subiendo && (
                      <p role="status" className="text-[11px] font-semibold text-muted-foreground">
                        Subiendo el PDF a la bóveda privada…
                      </p>
                    )}
                    {recurso.errorSubida && (
                      <p
                        role="alert"
                        className="text-[11px] font-semibold text-destructive bg-destructive/10 border border-destructive/25 rounded-xl px-2.5 py-1.5"
                      >
                        {recurso.errorSubida}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {metasFormError && (
                <p
                  role="alert"
                  className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/25 rounded-2xl px-3 py-2"
                >
                  {metasFormError}
                </p>
              )}
              {metasFormExito && (
                <p className="text-xs font-semibold text-success bg-success/10 border border-success/25 rounded-2xl px-3 py-2">
                  {metasFormExito}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsModalMetasOpen(false)}
                  className="min-h-11 px-4 rounded-xl bg-secondary border border-border text-foreground text-xs font-bold hover:bg-secondary/70 cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={isGuardandoMetas}
                  className="min-h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isGuardandoMetas && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isGuardandoMetas ? 'Guardando…' : 'Guardar metas'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

/** Campo numérico del editor de metas con etiqueta y área táctil de 44px. */
function CampoMeta({
  etiqueta,
  valor,
  onChange,
  placeholder,
  decimal = false,
}: {
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  placeholder: string;
  decimal?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{etiqueta}</label>
      <input
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-11 px-3 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary"
      />
    </div>
  );
}

/** Fila del calendario: día con estado, totales vs metas, tolerancia, fotos y notas. */
function FilaDiaNutricional({
  dia,
  metas,
  onVerFoto,
}: {
  dia: DiaCalendarioNutricional;
  metas: MetasNutricionalesDetalleDTO | null;
  onVerFoto: (foto: FotoComidaDetalleDTO) => void;
}) {
  const etiqueta = etiquetaEstadoDia(dia.estado);
  const checkin = dia.checkin;
  const tolerancia = checkin
    ? evaluarToleranciaNutricionalLocal(
        checkin.caloriasReportadas,
        checkin.proteinaGramosReportada,
        metas
      )
    : null;
  const clasificacion = tolerancia ? clasificarTolerancia(tolerancia) : null;

  return (
    <li className="p-3.5 rounded-2xl bg-secondary/30 border border-border/70 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-foreground truncate">
            {formatFechaLargaCalendario(dia.fecha) ?? dia.fecha}
          </span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${tonoDe(etiqueta.tono)}`}>
            {etiqueta.texto}
          </span>
        </div>
        {clasificacion && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold">
            <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`px-2 py-0.5 rounded-full border ${tonoDe(clasificacion.tono)}`}>
              {clasificacion.texto}
            </span>
          </span>
        )}
      </div>

      {!checkin && (
        <p className="text-[11px] text-muted-foreground">
          {dia.estado === EstadoDiaNutricional.NO_REPORTADO
            ? 'Sin reporte ese día. No penaliza la racha de entrenamiento; cuenta en el resumen semanal.'
            : 'El día sigue en curso: el check-in se habilita de 18:00 a 23:59 (hora local del alumno).'}
        </p>
      )}

      {checkin && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Calorías:{' '}
              <span className="font-mono font-bold text-foreground">
                {checkin.caloriasReportadas ?? '—'}
              </span>{' '}
              / {metas?.caloriasObjetivo ?? '—'} kcal
              {tolerancia?.desviacionCaloriasPct !== undefined && (
                <span className="ml-1 font-mono">({formatearDesviacionPct(tolerancia.desviacionCaloriasPct)})</span>
              )}
            </span>
            <span>
              Proteína:{' '}
              <span className="font-mono font-bold text-foreground">
                {checkin.proteinaGramosReportada ?? '—'}
              </span>{' '}
              / {metas?.proteinaGramosObjetivo ?? '—'} g
              {tolerancia?.desviacionProteinasPct !== undefined && (
                <span className="ml-1 font-mono">({formatearDesviacionPct(tolerancia.desviacionProteinasPct)})</span>
              )}
            </span>
            {checkin.aguaLitros && <span>Agua: {checkin.aguaLitros} L</span>}
          </div>

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
            <p className="text-[11px] text-muted-foreground italic">"{checkin.notasAlumno}"</p>
          )}

          {checkin.fotosPlatos.length === 0 && (
            <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Camera className="h-3.5 w-3.5" />
              Ese día no adjuntó fotos de platos.
            </p>
          )}
        </>
      )}
    </li>
  );
}
