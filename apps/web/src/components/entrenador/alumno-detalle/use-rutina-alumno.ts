/**
 * Hook de la rutina semanal del alumno: lectura, edición y guardado (WU5, WU6b, D4, C4, D7).
 *
 * Mismo mecanismo que hoy (`apiClient` + estado local; R9). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-7).
 *
 * WU5: normaliza la carga prescrita (coma → punto, vacío cualitativo) y valida inline antes
 * de que el payload viaje a la API; nunca se materializa '0.00' por defecto. D4: los
 * ejercicios vinculados al catálogo deben llevar un UUID real. C4: borrar un día o un
 * ejercicio pide confirmación. D7: sin conexión no se puede guardar la rutina.
 */
import { useRef, useState } from 'react';
import type {
  BloqueDiaRutinaDTO,
  EjercicioCatalogoDetalleDTO,
  GuardarRutinaSemanalDTO,
  RutinaSemanalDetalleDTO,
} from '@guachafit/shared';
import { UUID_REGEX } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import { triggerHaptic } from '../../../lib/haptics';
import { normalizarPesoPrescritoTexto, validarRpe } from '../../../lib/weight-unit';
import {
  MENSAJE_REPS_PRESCRITAS_INVALIDAS,
  esRepsPrescritasValidas,
} from '../../../lib/entrada-numerica';
import {
  actualizarConfiguracionBloque,
  crearBloqueEdicion,
  crearEjercicioEdicion,
  generarTituloBloque,
  parsearBloqueParaEdicion,
  type BloqueEdicion,
} from '../../../lib/rutina-bloques';

export interface ParametrosRutinaAlumno {
  /** D7: sin conexión no se puede guardar la rutina (se avisa en el botón). */
  hayConexion: boolean;
}

export function useRutinaAlumno({ hayConexion }: ParametrosRutinaAlumno) {
  // Planificación semanal de entrenamiento por bloques de días (vacía hasta cargar la real;
  // en modo demo se hidrata con fixtures locales).
  const [rutinaSemanal, setRutinaSemanal] = useState<BloqueDiaRutinaDTO[]>([]);
  // Fallo real al pedir la rutina activa (red/5xx): no es "sin rutina" y se avisa con reintento.
  const [errorRutina, setErrorRutina] = useState<string | null>(null);
  const [ejerciciosCatalogo, setEjerciciosCatalogo] = useState<EjercicioCatalogoDetalleDTO[]>([]);

  // Modal Prescripción / Edición de Rutina
  const [isRutinaModalOpen, setIsRutinaModalOpen] = useState(false);
  const [bloquesRutinaEdit, setBloquesRutinaEdit] = useState<BloqueEdicion[]>([]);
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
  // C4: borrar un día o un ejercicio de la rutina en edición pide confirmación.
  const [confirmarBorradoRutina, setConfirmarBorradoRutina] = useState<
    { tipo: 'dia'; indice: number } | { tipo: 'ejercicio'; indice: number } | null
  >(null);

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

  // Evita dos peticiones de refresco en vuelo (doble clic en "Reintentar").
  const refrescandoRutinaRef = useRef(false);
  /**
   * WU6b: refresca solo la rutina activa tras asignar una plantilla, sin disparar el
   * estado de carga global (que desmontaría el modal de asignación antes de ver el resultado).
   * El error se limpia SOLO con una respuesta correcta. Un fallo real deja `errorRutina` (con
   * reintento en la pestaña) y conserva los bloques previos.
   */
  const refrescarRutinaActiva = async (alumnoId: string | undefined) => {
    if (!alumnoId || refrescandoRutinaRef.current) return;
    refrescandoRutinaRef.current = true;
    try {
      const res = await apiClient<RutinaSemanalDetalleDTO>(`/rutinas/alumno/${alumnoId}/activa`);
      setRutinaSemanal(res && Array.isArray(res.bloques) ? res.bloques : []);
      setErrorRutina(null);
    } catch {
      setErrorRutina('No se pudo cargar la rutina semanal');
    } finally {
      refrescandoRutinaRef.current = false;
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
    } catch (err: unknown) {
      // D4: sin ejercicios fantasma con IDs no-UUID; el fallo se muestra y el formulario queda abierto.
      triggerHaptic('warning');
      setRutinaErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo crear el ejercicio en el catálogo. Revisa tu conexión e inténtalo de nuevo.'
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
        (_, idx: number) => idx !== ejIdx
      );
      updated[activeDiaIdx] = {
        ...updated[activeDiaIdx],
        ejercicios: filteredEjercicios,
      };
      return updated;
    });
  };

  // W-4: el editor sin tipo vive aquí hasta que D lo tipa contra `BloqueEdicion`
  // (el `any` explícito conserva el comportamiento exacto de la vista original).
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

  const cambiarSeriesEjercicio = (ejIdx: number, delta: number) => {
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
      actualizarConfiguracionBloque(prev, activeDiaIdx, cambios)
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

  const guardarRutinaPrescrita = async (
    alumno: { id: string } | null
  ) => {
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
            `«${ej.nombre || `Ejercicio ${idx + 1}`}» no está en tu lista de ejercicios. Quítalo y agrégalo de nuevo desde la lista.`
          );
        }
        const nombreEjercicio = ej.nombre || `Ejercicio ${idx + 1}`;
        const resultadoPeso = normalizarPesoPrescritoTexto(ej.peso);
        if (resultadoPeso.error) {
          erroresPeso.push(`${nombreEjercicio}: ${resultadoPeso.error}`);
        }
        // Lote E3: mismas reglas que el API, con el ejercicio nombrado en el aviso.
        if (!esRepsPrescritasValidas(ej.reps || '')) {
          erroresPeso.push(`${nombreEjercicio}: ${MENSAJE_REPS_PRESCRITAS_INVALIDAS}`);
        }
        const resultadoRpe = validarRpe(ej.rpe ?? '');
        if (!resultadoRpe.ok && resultadoRpe.error) {
          erroresPeso.push(`${nombreEjercicio}: ${resultadoRpe.error}`);
        }
        const { rpe: _rpeOriginal, ...resto } = ej;
        return {
          ...resto,
          peso: resultadoPeso.valor,
          ...(resultadoRpe.ok && resultadoRpe.rpe ? { rpe: resultadoRpe.rpe } : {}),
        };
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
      setRutinaErrorMsg(`Revisa los ejercicios: ${erroresCatalogo[0]}`);
      return;
    }

    if (erroresPeso.length > 0) {
      triggerHaptic('warning');
      setRutinaErrorMsg(`Revisa la prescripción — ${erroresPeso[0]}`);
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
      setErrorRutina(null);
      // WU5: el mensaje de éxito persiste inline hasta que el coach cierre el modal.
      setRutinaSuccessMsg(
        'Planificación semanal guardada y activada. Tu alumno ya la ve en su app y cuenta para el seguimiento semanal.'
      );
    } catch (err: unknown) {
      triggerHaptic('warning');
      setRutinaErrorMsg(
        err instanceof Error ? err.message : 'Error al guardar la planificación en el servidor.'
      );
    } finally {
      setIsSavingRutina(false);
    }
  };

  return {
    rutinaSemanal,
    setRutinaSemanal,
    errorRutina,
    setErrorRutina,
    ejerciciosCatalogo,
    setEjerciciosCatalogo,
    isRutinaModalOpen,
    setIsRutinaModalOpen,
    bloquesRutinaEdit,
    // Convergence (76): direct setter for the shared ConfiguracionDia onCambiar.
    setBloquesRutinaEdit,
    activeDiaIdx,
    setActiveDiaIdx,
    selectedGrupoMuscular,
    setSelectedGrupoMuscular,
    filtroBusquedaEj,
    setFiltroBusquedaEj,
    isCrearEjRapidoOpen,
    setIsCrearEjRapidoOpen,
    nuevoEjNombre,
    setNuevoEjNombre,
    nuevoEjGrupo,
    setNuevoEjGrupo,
    nuevoEjPatron,
    setNuevoEjPatron,
    isSubmittingEj,
    editingEjNombreIdx,
    setEditingEjNombreIdx,
    rutinaSuccessMsg,
    setRutinaSuccessMsg,
    isSavingRutina,
    rutinaErrorMsg,
    setRutinaErrorMsg,
    confirmarBorradoRutina,
    setConfirmarBorradoRutina,
    catalogoFiltrado,
    hayFiltroCatalogo,
    refrescarRutinaActiva,
    abrirModalPrescribirRutina,
    handleCrearEjercicioRapido,
    agregarEjercicioADia,
    removerEjercicioDeDia,
    actualizarCampoEjercicio,
    cambiarSeriesEjercicio,
    actualizarConfiguracionDiaActivo,
    agregarNuevoDiaRutina,
    removerDiaRutina,
    guardarRutinaPrescrita,
  };
}

export type RetornoRutinaAlumno = ReturnType<typeof useRutinaAlumno>;
