/**
 * Estado y guardado del editor de metas nutricionales (Ola 2).
 *
 * Recorte verbatim de `PanelNutricionAlumno.tsx`: formulario, validación sin
 * truncar, cambios sin guardar, confirmación de borrado permanente de PDFs y
 * subida presign+PUT real (simulada y declarada en modo demo). El editor solo
 * se abre con las metas ya cargadas: guardar reemplaza la lista de PDFs y,
 * sin conocerla, un PUT podría borrar archivos sin avisar.
 */
import { useState, type FormEvent } from 'react';
import { apiClient } from '../../../lib/api-client';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import type { FilaRecursoFormulario } from '../../../lib/recursos-pdf';
import {
  MENSAJE_ESPERA_SUBIDA,
  decidirAlCerrar,
  decidirAlGuardar,
  formularioDesdeMetas,
  mensajeErrorGuardarMetas,
  pdfsQueSeEliminaran,
  textosConfirmacionBorrado,
  validarFormularioMetas,
  type EstadoEdicionMetas,
  type FormularioMetas,
} from '../../../lib/editor-metas-nutricion';
import type {
  MetasNutricionalesDTO,
  MetasNutricionalesDetalleDTO,
  RecursoNutricionalDetalleDTO,
} from '@guachafit/shared';

export function useEditorMetasNutricion({
  alumnoUsuarioId,
  isDemoMode,
  metas,
  recursos,
  fijarRecursos,
  edicionMetas,
  onMetasGuardadas,
}: {
  alumnoUsuarioId: string;
  isDemoMode: boolean;
  metas: MetasNutricionalesDetalleDTO | null;
  recursos: FilaRecursoFormulario[];
  fijarRecursos: (filas: FilaRecursoFormulario[]) => void;
  edicionMetas: EstadoEdicionMetas;
  onMetasGuardadas: (guardadas: MetasNutricionalesDetalleDTO) => void;
}) {
  const [isModalMetasOpen, setIsModalMetasOpen] = useState(false);
  const [calorias, setCalorias] = useState('');
  const [proteina, setProteina] = useState('');
  const [carbohidratos, setCarbohidratos] = useState('');
  const [grasas, setGrasas] = useState('');
  const [agua, setAgua] = useState('');
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

  const formularioActual: FormularioMetas = {
    calorias,
    proteina,
    carbohidratos,
    grasas,
    agua,
    recursos,
  };

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

  const cargarFormulario = (formulario: FormularioMetas) => {
    setCalorias(formulario.calorias);
    setProteina(formulario.proteina);
    setCarbohidratos(formulario.carbohidratos);
    setGrasas(formulario.grasas);
    setAgua(formulario.agua);
    fijarRecursos(formulario.recursos);
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

  const handleGuardarMetas = (e: FormEvent) => {
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

      onMetasGuardadas({
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
      onMetasGuardadas(guardadas);
      setFormularioInicial(formulario);
      setMetasFormExito('Metas guardadas. El alumno ya las ve en su pantalla de nutrición.');
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

  const textosBorrado = textosConfirmacionBorrado(guardadoPendiente?.pdfs.length ?? 1);

  /** Cierra el editor descartando los cambios (lo usa la confirmación de descarte). */
  const descartarYCerrarEditor = () => {
    setIsConfirmandoDescartar(false);
    setIsModalMetasOpen(false);
  };

  return {
    isModalMetasOpen,
    calorias,
    proteina,
    carbohidratos,
    grasas,
    agua,
    setCalorias,
    setProteina,
    setCarbohidratos,
    setGrasas,
    setAgua,
    isGuardandoMetas,
    metasFormError,
    metasFormExito,
    isConfirmandoDescartar,
    setIsConfirmandoDescartar,
    guardadoPendiente,
    setGuardadoPendiente,
    textosBorrado,
    solicitarCerrarEditor,
    descartarYCerrarEditor,
    refModal,
    abrirEditorMetas,
    handleGuardarMetas,
    confirmarBorradoPdfs,
  };
}
