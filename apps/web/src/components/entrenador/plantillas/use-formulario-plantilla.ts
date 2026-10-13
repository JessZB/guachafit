/**
 * M8 plantillas (fase B, prompt 58) · hook del formulario crear/editar plantilla.
 *
 * Origen: `PlantillasPage.tsx:109-136, 200-365, 456-485` (R9: mismo mecanismo,
 * `POST`/`PATCH /plantillas` con `apiClient`, rama demo local idéntica).
 * Único de la vista (R3). Recibe del banco lo compartido (detalle, reposición
 * del listado y aviso de error) para no duplicar estado entre hooks.
 */
import { useMemo, useState } from 'react';
import {
  NivelObjetivoPlantilla,
  type PlantillaRutinaDTO,
  type PlantillaRutinaResumenDTO,
} from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import { crearPlantillaDemo, resumirPlantillaDemo } from '../../../lib/demo-plantillas';
import {
  construirBloquesParaPlantilla,
  firmaFormularioPlantilla,
  resumirBloques,
  validarNombrePlantilla,
} from '../../../lib/plantillas-rutina';
import {
  crearBloqueEdicion,
  parsearBloqueParaEdicion,
  type BloqueEdicion,
} from '../../../lib/rutina-bloques';
import { resumirDetallePlantilla } from '../../../lib/plantillas-resumen';

export interface DependenciasFormularioPlantilla {
  isDemoMode: boolean;
  obtenerDetalle: (resumen: PlantillaRutinaResumenDTO) => Promise<PlantillaRutinaDTO | null>;
  reponerResumen: (resumen: PlantillaRutinaResumenDTO) => void;
  reponerDetalleDemo: (detalle: PlantillaRutinaDTO) => void;
  informarErrorAccion: (mensaje: string | null) => void;
}

export function useFormularioPlantilla(deps: DependenciasFormularioPlantilla) {
  const { isDemoMode, obtenerDetalle, reponerResumen, reponerDetalleDemo, informarErrorAccion } =
    deps;

  // Modal de creación/edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editando, setEditando] = useState<PlantillaRutinaDTO | null>(null);
  const [formNombre, setFormNombre] = useState('');
  const [formNivel, setFormNivel] = useState<NivelObjetivoPlantilla>(
    NivelObjetivoPlantilla.PRINCIPIANTE
  );
  const [bloquesEdit, setBloquesEdit] = useState<BloqueEdicion[]>([]);
  // Remonta el editor al abrir el modal (día activo/búsqueda frescos) sin resetearlo al guardar.
  const [editorKey, setEditorKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  // C4: firma del formulario al abrir/guardar para avisar de cambios sin guardar al cerrar.
  const [firmaGuardada, setFirmaGuardada] = useState('');
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  const nombreError = validarNombrePlantilla(formNombre);
  const mostrarNombreError = Boolean(nombreError) && (intentoGuardar || formNombre.trim() !== '');

  const abrirCrear = () => {
    triggerHaptic('light');
    setEditando(null);
    setFormNombre('');
    setFormNivel(NivelObjetivoPlantilla.PRINCIPIANTE);
    const bloquesIniciales = [crearBloqueEdicion(1)];
    setBloquesEdit(bloquesIniciales);
    setFirmaGuardada(
      firmaFormularioPlantilla('', NivelObjetivoPlantilla.PRINCIPIANTE, bloquesIniciales)
    );
    setEditorKey((k) => k + 1);
    setSaveSuccess(null);
    setSaveError(null);
    setIntentoGuardar(false);
    setIsModalOpen(true);
  };

  /** Carga un detalle en el formulario del modal (mismo estado en demo y en sesión real). */
  const cargarDetalleEnFormulario = (detalle: PlantillaRutinaDTO) => {
    setEditando(detalle);
    setFormNombre(detalle.nombre);
    setFormNivel(detalle.nivelObjetivo);
    const bloquesDetalle = (detalle.bloques ?? []).map((bloque, idx) =>
      parsearBloqueParaEdicion(bloque, idx)
    );
    setBloquesEdit(bloquesDetalle);
    setFirmaGuardada(
      firmaFormularioPlantilla(detalle.nombre, detalle.nivelObjetivo, bloquesDetalle)
    );
    setEditorKey((k) => k + 1);
    setSaveSuccess(null);
    setSaveError(null);
    setIntentoGuardar(false);
    setIsModalOpen(true);
  };

  const abrirEditar = async (resumen: PlantillaRutinaResumenDTO) => {
    triggerHaptic('light');
    informarErrorAccion(null);

    const detalle = await obtenerDetalle(resumen);
    if (!detalle) {
      informarErrorAccion('No se pudo abrir la plantilla para edición.');
      triggerHaptic('warning');
      return;
    }
    cargarDetalleEnFormulario(detalle);
  };

  const guardarPlantilla = async () => {
    setIntentoGuardar(true);
    setSaveSuccess(null);

    const errorNombre = validarNombrePlantilla(formNombre);
    if (errorNombre) {
      setSaveError(errorNombre);
      triggerHaptic('warning');
      return;
    }

    const { bloques, errores } = construirBloquesParaPlantilla(bloquesEdit);
    if (errores.length > 0) {
      setSaveError(`Revisa los días y ejercicios: ${errores[0]}`);
      triggerHaptic('warning');
      return;
    }

    const payload = {
      nombre: formNombre.trim(),
      nivelObjetivo: formNivel,
      bloques,
    };
    // Firma de lo que realmente se envía, calculada al INICIAR el guardado.
    const firmaEnviada = firmaFormularioPlantilla(formNombre, formNivel, bloquesEdit);

    // MODO DEMO EXPLÍCITO (isDemoMode): crear/editar en estado LOCAL, sin llamada API,
    // con los mismos mensajes de éxito y la misma actualización del listado.
    if (isDemoMode) {
      const detalle = crearPlantillaDemo({
        id: editando?.id,
        nombre: payload.nombre,
        nivelObjetivo: payload.nivelObjetivo,
        bloques: payload.bloques,
        activa: editando?.activa ?? true,
        createdAtUtc: editando?.createdAtUtc,
      });
      reponerDetalleDemo(detalle);
      reponerResumen(resumirPlantillaDemo(detalle));
      setEditando(detalle);
      setFirmaGuardada(firmaEnviada);
      triggerHaptic('success');
      setSaveError(null);
      // WU5: el mensaje persiste inline hasta que el coach cierre el panel.
      setSaveSuccess(
        editando
          ? 'Plantilla actualizada. Las rutinas ya asignadas a alumnos no se modifican.'
          : 'Plantilla creada y activa. Puedes seguir ajustándola o cerrar este panel.'
      );
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = editando
        ? await apiClient<PlantillaRutinaDTO>(`/plantillas/${editando.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiClient<PlantillaRutinaDTO>('/plantillas', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      reponerResumen(resumirDetallePlantilla(res));
      setEditando(res);
      setFirmaGuardada(firmaEnviada);
      triggerHaptic('success');
      // WU5: el mensaje persiste inline hasta que el coach cierre el panel.
      setSaveSuccess(
        editando
          ? 'Plantilla actualizada. Las rutinas ya asignadas a alumnos no se modifican.'
          : 'Plantilla creada y activa. Puedes seguir ajustándola o cerrar este panel.'
      );
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : null;
      setSaveError(mensaje || 'No se pudo guardar la plantilla en el servidor.');
      triggerHaptic('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const cerrarModalSinPreguntar = () => {
    setConfirmandoCierre(false);
    setIsModalOpen(false);
    setSaveSuccess(null);
    setSaveError(null);
    setIntentoGuardar(false);
  };

  const hayCambiosSinGuardar =
    isModalOpen && firmaFormularioPlantilla(formNombre, formNivel, bloquesEdit) !== firmaGuardada;

  /** C4: con cambios sin guardar, cerrar pide confirmación (X, Escape, fondo o "Cerrar"). */
  const cerrarModal = () => {
    if (isSaving) return;
    if (hayCambiosSinGuardar) {
      setConfirmandoCierre(true);
      return;
    }
    cerrarModalSinPreguntar();
  };

  const resumenEditor = useMemo(() => resumirBloques(bloquesEdit), [bloquesEdit]);

  return {
    isModalOpen,
    editando,
    formNombre,
    setFormNombre,
    formNivel,
    setFormNivel,
    bloquesEdit,
    setBloquesEdit,
    editorKey,
    isSaving,
    saveSuccess,
    saveError,
    nombreError,
    mostrarNombreError,
    confirmandoCierre,
    setConfirmandoCierre,
    resumenEditor,
    abrirCrear,
    abrirEditar,
    guardarPlantilla,
    cerrarModal,
    cerrarModalSinPreguntar,
  };
}

export type UsoFormularioPlantilla = ReturnType<typeof useFormularioPlantilla>;

