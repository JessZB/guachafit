/**
 * Módulo `bloques-rutina-editor` (Ola 2, prompt 74) · estado y operaciones del editor.
 *
 * Origen: `BloquesRutinaEditor.tsx:70-197` (estados locales, efecto de reajuste,
 * derivados y los siete manejadores). Hook único de la vista (R1): encapsula el
 * mecanismo vigente —componente controlado con `useState`/`useEffect`, sin TanStack
 * Query— (R9). La edición viaja por `onCambiar`; el alta rápida por la prop
 * `onCrearEjercicio`. El filtrado y el resumen se calculan con la lógica pura de
 * `lib/bloques-rutina-editor-*` (R1). Los tipos de dominio vienen de
 * `@guachafit/shared` vía `BloqueEdicion` (R4).
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { EjercicioCatalogoDetalleDTO } from '@guachafit/shared';
import {
  crearBloqueEdicion,
  crearEjercicioEdicion,
  type BloqueEdicion,
} from '../../../lib/rutina-bloques';
import { triggerHaptic } from '../../../lib/haptics';
import { filtrarCatalogoEditor, hayFiltroEditor } from '../../../lib/bloques-rutina-editor-catalogo';
import { calcularResumenEditor } from '../../../lib/bloques-rutina-editor-resumen';
import type { EstadoCreacionEjercicio } from './PanelCatalogo';
import type { DatosEjercicioNuevo } from '../BloquesRutinaEditor';

export type ConfirmarBorradoEditor =
  | { tipo: 'dia'; indice: number }
  | { tipo: 'ejercicio'; indice: number }
  | null;

interface UseEditorBloquesOpciones {
  bloques: BloqueEdicion[];
  catalogo: EjercicioCatalogoDetalleDTO[];
  onCambiar: (bloques: BloqueEdicion[]) => void;
  onCrearEjercicio?: (datos: DatosEjercicioNuevo) => Promise<EjercicioCatalogoDetalleDTO | null>;
  minBloques: number;
}

export function useEditorBloques({
  bloques,
  catalogo,
  onCambiar,
  onCrearEjercicio,
  minBloques,
}: UseEditorBloquesOpciones) {
  const [activeDiaIdx, setActiveDiaIdx] = useState(0);
  const [grupo, setGrupo] = useState('Todos');
  const [filtro, setFiltro] = useState('');
  const [isCrearOpen, setIsCrearOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoGrupo, setNuevoGrupo] = useState('Pecho');
  const [nuevoPatron, setNuevoPatron] = useState('Empuje');
  const [isCreando, setIsCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | null>(null);
  // C4: borrar un día o un ejercicio pide confirmación (acción destructiva).
  const [confirmarBorrado, setConfirmarBorrado] = useState<ConfirmarBorradoEditor>(null);

  // El editor puede recibir un set de bloques más corto (reset, eliminación externa).
  useEffect(() => {
    if (activeDiaIdx > bloques.length - 1) {
      setActiveDiaIdx(Math.max(0, bloques.length - 1));
    }
  }, [bloques.length, activeDiaIdx]);

  const diaActivo = bloques[activeDiaIdx];

  const catalogoFiltrado = useMemo(
    () => filtrarCatalogoEditor(catalogo, grupo, filtro),
    [catalogo, grupo, filtro]
  );
  const hayFiltro = hayFiltroEditor(grupo, filtro);

  const totales = useMemo(() => calcularResumenEditor(bloques), [bloques]);

  const creacion: EstadoCreacionEjercicio = {
    abierto: isCrearOpen,
    nombre: nuevoNombre,
    grupo: nuevoGrupo,
    patron: nuevoPatron,
    enCurso: isCreando,
    error: errorCrear,
  };

  const actualizarCreacion = (cambios: Partial<EstadoCreacionEjercicio>) => {
    if (cambios.abierto !== undefined) setIsCrearOpen(cambios.abierto);
    if (cambios.nombre !== undefined) setNuevoNombre(cambios.nombre);
    if (cambios.grupo !== undefined) setNuevoGrupo(cambios.grupo);
    if (cambios.patron !== undefined) setNuevoPatron(cambios.patron);
    if (cambios.enCurso !== undefined) setIsCreando(cambios.enCurso);
    if (cambios.error !== undefined) setErrorCrear(cambios.error);
  };

  const agregarEjercicio = (nombre: string, ejercicioId?: string) => {
    triggerHaptic('selection');
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = {
      ...actual,
      ejercicios: [...actual.ejercicios, crearEjercicioEdicion(nombre, ejercicioId)],
    };
    onCambiar(nuevos);
  };

  const removerEjercicio = (ejIdx: number) => {
    triggerHaptic('selection');
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = {
      ...actual,
      ejercicios: actual.ejercicios.filter((_, idx) => idx !== ejIdx),
    };
    onCambiar(nuevos);
  };

  const actualizarCampoEjercicio = (ejIdx: number, campo: string, valor: unknown) => {
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const ejercicios = [...actual.ejercicios];
    ejercicios[ejIdx] = { ...ejercicios[ejIdx], [campo]: valor };
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = { ...actual, ejercicios };
    onCambiar(nuevos);
  };

  const handleStepSeries = (ejIdx: number, delta: number) => {
    triggerHaptic('selection');
    const actual = bloques[activeDiaIdx];
    if (!actual) return;
    const ejercicios = [...actual.ejercicios];
    const siguiente = Math.max(1, Math.min(20, (ejercicios[ejIdx].series || 1) + delta));
    ejercicios[ejIdx] = { ...ejercicios[ejIdx], series: siguiente };
    const nuevos = [...bloques];
    nuevos[activeDiaIdx] = { ...actual, ejercicios };
    onCambiar(nuevos);
  };

  const agregarDia = () => {
    if (bloques.length >= 7) return;
    triggerHaptic('light');
    onCambiar([...bloques, crearBloqueEdicion(bloques.length + 1)]);
    setActiveDiaIdx(bloques.length);
  };

  const removerDia = (diaIdx: number) => {
    if (bloques.length <= minBloques) return;
    triggerHaptic('light');
    onCambiar(bloques.filter((_, idx) => idx !== diaIdx));
    setActiveDiaIdx(Math.max(0, diaIdx - 1));
  };

  const handleCrearEjercicio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoNombre.trim() || !onCrearEjercicio) return;
    setIsCreando(true);
    setErrorCrear(null);
    const creado = await onCrearEjercicio({
      nombre: nuevoNombre.trim(),
      grupoMuscular: nuevoGrupo,
      patronMovimiento: nuevoPatron,
    });
    setIsCreando(false);
    if (!creado) {
      setErrorCrear('No se pudo crear el ejercicio en el catálogo. Revisa la conexión e inténtalo de nuevo.');
      return;
    }
    agregarEjercicio(creado.nombre, creado.id);
    setNuevoNombre('');
    setIsCrearOpen(false);
    triggerHaptic('success');
  };

  return {
    activeDiaIdx,
    setActiveDiaIdx,
    grupo,
    setGrupo,
    filtro,
    setFiltro,
    confirmarBorrado,
    setConfirmarBorrado,
    diaActivo,
    catalogoFiltrado,
    hayFiltro,
    totales,
    creacion,
    actualizarCreacion,
    agregarEjercicio,
    removerEjercicio,
    actualizarCampoEjercicio,
    handleStepSeries,
    agregarDia,
    removerDia,
    handleCrearEjercicio,
  };
}
