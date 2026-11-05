/**
 * RF-002 · vista del coach dentro del expediente del alumno (pestaña "Nutrición").
 *
 * Contenedor orquestador (Ola 2, ADR-022): resuelve la zona horaria del alumno,
 * conecta los hooks de datos y compone las secciones. Sin JSX de detalle.
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
import { useEffect, useMemo, useState } from 'react';
import { VisorFoto } from '../common/VisorFoto';
import { DialogoConfirmacion } from '../common/DialogoConfirmacion';
import { rebanarPagina } from '../../lib/paginacion';
import {
  crearCalendarioNutricional,
  contarNoReportados,
  etiquetaTipoComida,
} from '../../lib/nutricion-metas';
import { estadoEdicionMetas } from '../../lib/editor-metas-nutricion';
import { SeccionMetasNutricion } from './panel-nutricion-alumno/SeccionMetasNutricion';
import { SeccionCalendarioNutricion } from './panel-nutricion-alumno/SeccionCalendarioNutricion';
import { EditorMetasNutricion } from './panel-nutricion-alumno/EditorMetasNutricion';
import { useMetasNutricionAlumno } from './panel-nutricion-alumno/use-metas-nutricion-alumno';
import { useCheckinsNutricionAlumno } from './panel-nutricion-alumno/use-checkins-nutricion-alumno';
import { useRecursosMetasNutricion } from './panel-nutricion-alumno/use-recursos-metas-nutricion';
import { useEditorMetasNutricion } from './panel-nutricion-alumno/use-editor-metas-nutricion';
import { partesEnZona } from '../../lib/zona-horaria';
import { zonaPerfilEfectiva } from '../../lib/nutricion-checkin';
import { ultimosDiasCalendario } from '../../lib/date-format';
import type { FotoComidaDetalleDTO } from '@guachafit/shared';

export interface PanelNutricionAlumnoProps {
  /** `usuarios.id` del alumno: clave real de check-ins y del presign (no el id del perfil). */
  alumnoUsuarioId: string;
  /** ADR-019: zona horaria del perfil del alumno (se edita en Perfil). */
  zonaHoraria?: string | null;
  isDemoMode: boolean;
}

/** Ventana de consulta del calendario (días hacia atrás desde hoy, inclusive). */
const DIAS_VENTANA = 30;

export function PanelNutricionAlumno({
  alumnoUsuarioId,
  zonaHoraria,
  isDemoMode,
}: PanelNutricionAlumnoProps) {
  // ADR-019: "hoy" del alumno, el calendario y las horas de registro se cuentan en la zona de su
  // perfil (resuelta como en el servidor), no en la del entrenador.
  const zonaHorariaAlumno = zonaPerfilEfectiva(zonaHoraria);
  const hoyLocal = partesEnZona(new Date(), zonaHorariaAlumno).fecha;

  const {
    metas,
    isMetasCargadas,
    isCargandoMetas,
    metasError,
    cargarMetas,
    aplicarMetasGuardadas,
  } = useMetasNutricionAlumno({ alumnoUsuarioId, isDemoMode });

  const { checkins, isCargandoCheckins, checkinsError, cargarCheckins } =
    useCheckinsNutricionAlumno({ alumnoUsuarioId, isDemoMode, hoyLocal });

  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(10);

  const edicionMetas = estadoEdicionMetas({
    cargando: isCargandoMetas,
    error: metasError,
    cargadas: isMetasCargadas,
  });

  const recursosEditor = useRecursosMetasNutricion({ alumnoUsuarioId, isDemoMode });

  const editor = useEditorMetasNutricion({
    alumnoUsuarioId,
    isDemoMode,
    metas,
    recursos: recursosEditor.recursos,
    fijarRecursos: recursosEditor.fijarRecursos,
    edicionMetas,
    onMetasGuardadas: aplicarMetasGuardadas,
  });

  const [fotoVisor, setFotoVisor] = useState<{ foto: FotoComidaDetalleDTO; fecha: string } | null>(
    null
  );

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

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* RN-01: metas del alumno                                              */}
      {/* ------------------------------------------------------------------ */}
      <SeccionMetasNutricion
        metas={metas}
        edicionMetas={edicionMetas}
        isCargandoMetas={isCargandoMetas}
        metasError={metasError}
        onAbrirEditor={editor.abrirEditorMetas}
        onReintentarMetas={() => void cargarMetas()}
      />

      {/* La zona horaria del alumno (ADR-019) se edita en Perfil; aquí solo se indica. */}
      <p className="text-xs text-muted-foreground">La zona horaria del alumno se cambia en Perfil.</p>

      {/* ------------------------------------------------------------------ */}
      {/* Calendario de reportes (últimos 30 días)                             */}
      {/* ------------------------------------------------------------------ */}
      <SeccionCalendarioNutricion
        reportadosVentana={reportadosVentana}
        noReportadosVentana={noReportadosVentana}
        isCargandoCheckins={isCargandoCheckins}
        checkinsError={checkinsError}
        diasPagina={diasPagina}
        metas={metas}
        zonaHorariaAlumno={zonaHorariaAlumno}
        pagina={pagina}
        tamano={tamano}
        total={calendario.length}
        onCambiarPagina={setPagina}
        onCambiarTamano={setTamano}
        onRecargar={() => void cargarCheckins()}
        onVerFoto={(foto, fecha) => setFotoVisor({ foto, fecha })}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Editor de metas (diálogo accesible)                                  */}
      {/* ------------------------------------------------------------------ */}
      {editor.isModalMetasOpen && (
        <EditorMetasNutricion
          calorias={editor.calorias}
          proteina={editor.proteina}
          carbohidratos={editor.carbohidratos}
          grasas={editor.grasas}
          agua={editor.agua}
          onCambiarCalorias={editor.setCalorias}
          onCambiarProteina={editor.setProteina}
          onCambiarCarbohidratos={editor.setCarbohidratos}
          onCambiarGrasas={editor.setGrasas}
          onCambiarAgua={editor.setAgua}
          recursos={recursosEditor.recursos}
          onAnadirRecurso={recursosEditor.anadirRecurso}
          onCambiarRecurso={recursosEditor.actualizarFilaRecurso}
          onQuitarRecurso={recursosEditor.quitarRecurso}
          onSubirPdf={(indice, archivo) => void recursosEditor.subirPdf(indice, archivo)}
          error={editor.metasFormError}
          exito={editor.metasFormExito}
          guardando={editor.isGuardandoMetas}
          onCerrar={editor.solicitarCerrarEditor}
          onGuardar={editor.handleGuardarMetas}
        />
      )}

      {/* Confirmación: guardar borrará para siempre los PDFs quitados */}
      <DialogoConfirmacion
        abierto={editor.guardadoPendiente !== null}
        idTitulo="confirmar-borrado-pdfs-titulo"
        titulo={editor.textosBorrado.titulo}
        detalle={
          <div className="space-y-2">
            <p>{editor.textosBorrado.detalle}</p>
            <ul className="list-disc pl-5 font-semibold text-foreground">
              {editor.guardadoPendiente?.pdfs.map((pdf) => (
                <li key={pdf.storageKey}>{pdf.titulo}</li>
              ))}
            </ul>
          </div>
        }
        textoConfirmar="Borrar y guardar"
        textoCancelar="Volver al editor"
        variante="peligro"
        procesando={editor.isGuardandoMetas}
        onCancelar={() => editor.setGuardadoPendiente(null)}
        onConfirmar={() => void editor.confirmarBorradoPdfs()}
      />

      {/* Confirmación: cerrar el editor con cambios sin guardar */}
      <DialogoConfirmacion
        abierto={editor.isConfirmandoDescartar}
        idTitulo="confirmar-descartar-metas-titulo"
        titulo="¿Salir sin guardar?"
        detalle="Tienes cambios en las metas que no se han guardado. Si sales ahora, se perderán."
        textoConfirmar="Salir sin guardar"
        textoCancelar="Seguir editando"
        variante="peligro"
        onCancelar={() => editor.setIsConfirmandoDescartar(false)}
        onConfirmar={() => editor.descartarYCerrarEditor()}
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
