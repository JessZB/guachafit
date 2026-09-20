import React, { useEffect, useMemo, useState } from 'react';
import {
  NivelObjetivoPlantilla,
  type EjercicioCatalogoDetalleDTO,
  type PlantillaRutinaDTO,
  type PlantillaRutinaResumenDTO,
} from '@guachafit/shared';
import { apiClient } from '../../lib/api-client';
import { triggerHaptic } from '../../lib/haptics';
import { formatFechaLocal } from '../../lib/date-format';
import {
  ETIQUETAS_NIVEL_PLANTILLA,
  NIVELES_PLANTILLA_ORDEN,
  construirBloquesParaPlantilla,
  resumirBloques,
  validarNombrePlantilla,
} from '../../lib/plantillas-rutina';
import {
  crearBloqueEdicion,
  parsearBloqueParaEdicion,
  type BloqueEdicion,
} from '../../lib/rutina-bloques';
import {
  BloquesRutinaEditor,
  type DatosEjercicioNuevo,
} from '../../components/entrenador/BloquesRutinaEditor';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Dumbbell,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

type FiltroEstado = 'activas' | 'desactivadas' | 'todas';

const OPCIONES_FILTRO: Array<{ valor: FiltroEstado; label: string }> = [
  { valor: 'activas', label: 'Activas' },
  { valor: 'desactivadas', label: 'Desactivadas' },
  { valor: 'todas', label: 'Todas' },
];

/** Clases de badge por nivel objetivo (paleta Athletic Slate compartida). */
const CLASES_NIVEL: Record<NivelObjetivoPlantilla, string> = {
  [NivelObjetivoPlantilla.PRINCIPIANTE]:
    'bg-sky-500/15 text-sky-400 border-sky-500/30',
  [NivelObjetivoPlantilla.INTERMEDIO]:
    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  [NivelObjetivoPlantilla.AVANZADO]:
    'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

/**
 * RF-017 Escenario 1: banco de plantillas de rutina del coach.
 * Listado con estados explícitos (loading/vacío/error+retry) + creación/edición con los
 * selectores estructurados y el picker de catálogo del modal de prescripción (WU5).
 */
export function PlantillasPage() {
  const [plantillas, setPlantillas] = useState<PlantillaRutinaResumenDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroEstado>('activas');
  const [accionError, setAccionError] = useState<string | null>(null);

  const [catalogo, setCatalogo] = useState<EjercicioCatalogoDetalleDTO[]>([]);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  // Modal de creación/edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editando, setEditando] = useState<PlantillaRutinaDTO | null>(null);
  const [cargandoDetalleId, setCargandoDetalleId] = useState<string | null>(null);
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

  // Confirmación inline de desactivación + acción en curso
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [ocupadaId, setOcupadaId] = useState<string | null>(null);

  const cargarPlantillas = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient<PlantillaRutinaResumenDTO[]>('/plantillas');
      setPlantillas(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar tu banco de plantillas.');
    } finally {
      setIsLoading(false);
    }
  };

  const cargarCatalogo = async () => {
    setCatalogoError(null);
    try {
      const res = await apiClient<EjercicioCatalogoDetalleDTO[]>('/ejercicios/catalogo');
      setCatalogo(Array.isArray(res) ? res : []);
    } catch {
      setCatalogoError('No se pudo cargar el catálogo de ejercicios. Revisa la conexión.');
    }
  };

  useEffect(() => {
    cargarPlantillas();
    cargarCatalogo();
  }, []);

  // Accesibilidad: cierre del modal de plantilla con Escape (paridad con el resto de modales).
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setSaveSuccess(null);
        setSaveError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const conteos = useMemo(
    () => ({
      activas: plantillas.filter((p) => p.activa).length,
      desactivadas: plantillas.filter((p) => !p.activa).length,
      todas: plantillas.length,
    }),
    [plantillas]
  );

  const visibles = useMemo(() => {
    if (filtro === 'activas') return plantillas.filter((p) => p.activa);
    if (filtro === 'desactivadas') return plantillas.filter((p) => !p.activa);
    return plantillas;
  }, [plantillas, filtro]);

  const nombreError = validarNombrePlantilla(formNombre);
  const mostrarNombreError = Boolean(nombreError) && (intentoGuardar || formNombre.trim() !== '');

  const abrirCrear = () => {
    triggerHaptic('light');
    setEditando(null);
    setFormNombre('');
    setFormNivel(NivelObjetivoPlantilla.PRINCIPIANTE);
    setBloquesEdit([crearBloqueEdicion(1)]);
    setEditorKey((k) => k + 1);
    setSaveSuccess(null);
    setSaveError(null);
    setIntentoGuardar(false);
    setIsModalOpen(true);
  };

  const abrirEditar = async (resumen: PlantillaRutinaResumenDTO) => {
    triggerHaptic('light');
    setCargandoDetalleId(resumen.id);
    setAccionError(null);
    try {
      const detalle = await apiClient<PlantillaRutinaDTO>(`/plantillas/${resumen.id}`);
      setEditando(detalle);
      setFormNombre(detalle.nombre);
      setFormNivel(detalle.nivelObjetivo);
      setBloquesEdit(
        (detalle.bloques ?? []).map((bloque, idx) => parsearBloqueParaEdicion(bloque, idx))
      );
      setEditorKey((k) => k + 1);
      setSaveSuccess(null);
      setSaveError(null);
      setIntentoGuardar(false);
      setIsModalOpen(true);
    } catch (err: any) {
      setAccionError(err?.message || 'No se pudo abrir la plantilla para edición.');
      triggerHaptic('warning');
    } finally {
      setCargandoDetalleId(null);
    }
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
      setSaveError(`Revisa la estructura — ${errores[0]}`);
      triggerHaptic('warning');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = {
        nombre: formNombre.trim(),
        nivelObjetivo: formNivel,
        bloques,
      };
      const res = editando
        ? await apiClient<PlantillaRutinaDTO>(`/plantillas/${editando.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await apiClient<PlantillaRutinaDTO>('/plantillas', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      const resumen: PlantillaRutinaResumenDTO = {
        id: res.id,
        entrenadorId: res.entrenadorId,
        nombre: res.nombre,
        nivelObjetivo: res.nivelObjetivo,
        totalDias: res.bloques.length,
        totalEjercicios: res.bloques.reduce(
          (total, bloque) => total + (bloque.ejercicios?.length ?? 0),
          0
        ),
        activa: res.activa,
        createdAtUtc: res.createdAtUtc,
        updatedAtUtc: res.updatedAtUtc,
      };
      setPlantillas((prev) => [resumen, ...prev.filter((p) => p.id !== res.id)]);
      setEditando(res);
      triggerHaptic('success');
      // WU5: el mensaje persiste inline hasta que el coach cierre el panel.
      setSaveSuccess(
        editando
          ? 'Plantilla actualizada. Las rutinas ya asignadas a alumnos no se modifican.'
          : 'Plantilla creada y activa en tu banco. Puedes seguir ajustándola o cerrar este panel.'
      );
    } catch (err: any) {
      setSaveError(err?.message || 'No se pudo guardar la plantilla en el servidor.');
      triggerHaptic('warning');
    } finally {
      setIsSaving(false);
    }
  };

  const desactivarPlantilla = async (id: string) => {
    setOcupadaId(id);
    setAccionError(null);
    try {
      await apiClient<PlantillaRutinaResumenDTO>(`/plantillas/${id}`, { method: 'DELETE' });
      setPlantillas((prev) => prev.map((p) => (p.id === id ? { ...p, activa: false } : p)));
      triggerHaptic('success');
    } catch (err: any) {
      setAccionError(err?.message || 'No se pudo desactivar la plantilla.');
      triggerHaptic('warning');
    } finally {
      setOcupadaId(null);
      setConfirmandoId(null);
    }
  };

  const reactivarPlantilla = async (id: string) => {
    setOcupadaId(id);
    setAccionError(null);
    try {
      const res = await apiClient<PlantillaRutinaDTO>(`/plantillas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activa: true }),
      });
      setPlantillas((prev) => prev.map((p) => (p.id === id ? { ...p, activa: res.activa } : p)));
      triggerHaptic('success');
    } catch (err: any) {
      setAccionError(err?.message || 'No se pudo reactivar la plantilla.');
      triggerHaptic('warning');
    } finally {
      setOcupadaId(null);
    }
  };

  const crearEjercicioEnCatalogo = async (
    datos: DatosEjercicioNuevo
  ): Promise<EjercicioCatalogoDetalleDTO | null> => {
    try {
      const res = await apiClient<EjercicioCatalogoDetalleDTO>('/ejercicios/catalogo', {
        method: 'POST',
        body: JSON.stringify(datos),
      });
      setCatalogo((prev) => [res, ...prev]);
      return res;
    } catch {
      return null;
    }
  };

  const cerrarModal = () => {
    setIsModalOpen(false);
    setSaveSuccess(null);
    setSaveError(null);
    setIntentoGuardar(false);
  };

  const resumenEditor = useMemo(() => resumirBloques(bloquesEdit), [bloquesEdit]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-black tracking-tight text-foreground">Banco de Plantillas</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Diseña rutinas reutilizables y asígnalas a tus alumnos en segundos. Cada asignación es una
            copia independiente: editar la plantilla no altera lo ya prescrito.
          </p>
        </div>

        <button
          type="button"
          onClick={abrirCrear}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Nueva Plantilla</span>
        </button>
      </div>

      {accionError && (
        <div
          role="alert"
          className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {accionError}
          </span>
          <button
            type="button"
            onClick={() => setAccionError(null)}
            className="p-1 rounded-lg hover:bg-destructive/10 cursor-pointer"
            title="Descartar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filtro por estado */}
      <div className="flex items-center gap-2 flex-wrap">
        {OPCIONES_FILTRO.map((opcion) => {
          const activo = filtro === opcion.valor;
          const conteo = conteos[opcion.valor];
          return (
            <button
              key={opcion.valor}
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setFiltro(opcion.valor);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activo
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{opcion.label}</span>
              <span className={`font-mono text-[10px] ${activo ? 'opacity-80' : 'opacity-60'}`}>
                {conteo}
              </span>
            </button>
          );
        })}
      </div>

      {/* Estados de la lista */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-5 rounded-3xl bg-card border border-border/80 space-y-3 animate-pulse"
            >
              <div className="h-4 w-2/3 rounded-lg bg-secondary/60" />
              <div className="h-3 w-1/3 rounded-lg bg-secondary/40" />
              <div className="h-8 w-full rounded-lg bg-secondary/30" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-3xl bg-card border border-border text-center space-y-3 max-w-lg mx-auto">
          <AlertCircle className="h-9 w-9 text-destructive mx-auto" />
          <h3 className="text-sm font-black text-foreground">No se pudo cargar el banco</h3>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={cargarPlantillas}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reintentar</span>
          </button>
        </div>
      ) : visibles.length === 0 ? (
        <div className="p-10 rounded-3xl bg-card border border-dashed border-border text-center space-y-3">
          <Dumbbell className="h-9 w-9 text-muted-foreground mx-auto opacity-50" />
          <h3 className="text-sm font-black text-foreground">
            {filtro === 'activas'
              ? 'No tienes plantillas activas'
              : filtro === 'desactivadas'
              ? 'No tienes plantillas desactivadas'
              : 'Tu banco de plantillas está vacío'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {filtro === 'activas'
              ? 'Crea tu primera plantilla para prescribir una semana completa con un clic a cualquier alumno.'
              : 'Las plantillas desactivadas se conservan y pueden reactivarse cuando quieras.'}
          </p>
          <button
            type="button"
            onClick={abrirCrear}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Crear Plantilla</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibles.map((plantilla) => (
            <div
              key={plantilla.id}
              className={`p-5 rounded-3xl bg-card border border-border/80 shadow-xs space-y-3.5 flex flex-col justify-between transition-all hover:border-primary/40 ${
                plantilla.activa ? '' : 'opacity-75'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-extrabold text-sm text-foreground leading-snug break-words">
                    {plantilla.nombre}
                  </h3>
                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                      plantilla.activa
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    {plantilla.activa ? 'Activa' : 'Desactivada'}
                  </span>
                </div>

                <span
                  className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                    CLASES_NIVEL[plantilla.nivelObjetivo]
                  }`}
                >
                  {ETIQUETAS_NIVEL_PLANTILLA[plantilla.nivelObjetivo]}
                </span>

                <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span className="px-2 py-0.5 rounded-md bg-secondary border border-border/60 font-bold text-foreground">
                    {plantilla.totalDias} {plantilla.totalDias === 1 ? 'día' : 'días'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-secondary border border-border/60 font-bold text-foreground">
                    {plantilla.totalEjercicios} ejercicios
                  </span>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Actualizada el {formatFechaLocal(plantilla.updatedAtUtc) || '—'}
                </p>
              </div>

              {confirmandoId === plantilla.id ? (
                <div className="p-3 rounded-2xl bg-destructive/10 border border-destructive/30 space-y-2">
                  <p className="text-[11px] text-foreground leading-snug">
                    ¿Desactivar <span className="font-bold">{plantilla.nombre}</span>? No se borra: podrás
                    reactivarla. Las rutinas ya asignadas no cambian.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={ocupadaId === plantilla.id}
                      onClick={() => desactivarPlantilla(plantilla.id)}
                      className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground font-bold text-[11px] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                    >
                      {ocupadaId === plantilla.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      <span>Sí, desactivar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmandoId(null)}
                      className="px-3 py-1.5 rounded-lg bg-secondary text-foreground font-bold text-[11px] cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-3 border-t border-border/60">
                  <button
                    type="button"
                    onClick={() => abrirEditar(plantilla)}
                    disabled={cargandoDetalleId === plantilla.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {cargandoDetalleId === plantilla.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    <span>Editar</span>
                  </button>

                  {plantilla.activa ? (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setConfirmandoId(plantilla.id);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Desactivar</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={ocupadaId === plantilla.id}
                      onClick={() => reactivarPlantilla(plantilla.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 hover:bg-primary text-primary hover:text-primary-foreground font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {ocupadaId === plantilla.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      <span>Reactivar</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CREAR / EDITAR PLANTILLA                                       */}
      {/* ===================================================================== */}
      {isModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrarModal();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-plantilla-title"
            className="p-6 rounded-3xl bg-card border border-border shadow-2xl w-full max-w-4xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <div>
                  <h3 id="modal-plantilla-title" className="font-black text-base text-foreground">
                    {editando ? 'Editar Plantilla' : 'Nueva Plantilla de Rutina'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Estructura los días, los ejercicios y sus cargas. Podrás reutilizarla con cualquier
                    alumno.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                title="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {saveSuccess && (
              <div
                role="status"
                aria-live="polite"
                className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="block font-bold">{saveSuccess}</span>
                  <span className="block text-[11px] text-emerald-400/80">
                    Puedes seguir ajustando la plantilla o cerrar este panel cuando quieras.
                  </span>
                </div>
              </div>
            )}

            {/* Identidad de la plantilla */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label
                  htmlFor="plantilla-nombre"
                  className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
                >
                  Nombre de la Plantilla
                </label>
                <input
                  id="plantilla-nombre"
                  type="text"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  placeholder="ej. Pierna Énfasis Isquios - Fase 1"
                  maxLength={120}
                  autoFocus
                  aria-invalid={mostrarNombreError}
                  className={`w-full px-3 py-2 rounded-xl bg-background border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary transition-colors ${
                    mostrarNombreError ? 'border-destructive/70' : 'border-border'
                  }`}
                />
                {mostrarNombreError && (
                  <span className="text-[10px] font-bold text-destructive block">{nombreError}</span>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="plantilla-nivel"
                  className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block"
                >
                  Nivel Objetivo
                </label>
                <select
                  id="plantilla-nivel"
                  value={formNivel}
                  onChange={(e) => setFormNivel(e.target.value as NivelObjetivoPlantilla)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs font-bold text-foreground focus:outline-hidden focus:border-primary transition-colors cursor-pointer"
                >
                  {NIVELES_PLANTILLA_ORDEN.map((nivel) => (
                    <option key={nivel} value={nivel}>
                      {ETIQUETAS_NIVEL_PLANTILLA[nivel]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <BloquesRutinaEditor
              key={editorKey}
              bloques={bloquesEdit}
              onCambiar={setBloquesEdit}
              catalogo={catalogo}
              catalogoError={catalogoError}
              onReintentarCatalogo={cargarCatalogo}
              onCrearEjercicio={crearEjercicioEnCatalogo}
              mostrarNotas
              minBloques={1}
            />

            {saveError && (
              <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="pt-3 border-t border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {resumenEditor.totalDias} día{resumenEditor.totalDias === 1 ? '' : 's'} ·{' '}
                {resumenEditor.totalEjercicios} ejercicio
                {resumenEditor.totalEjercicios === 1 ? '' : 's'} · {resumenEditor.totalSeries} series
              </span>

              <div className="flex gap-2 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={cerrarModal}
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={guardarPlantilla}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <div className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>{editando ? 'Guardar Cambios' : 'Crear Plantilla Activa'}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
