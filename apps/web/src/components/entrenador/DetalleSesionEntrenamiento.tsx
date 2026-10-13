/**
 * WU15: detalle completo de UNA sesión de entrenamiento (props puras, sin fetch).
 *
 * Contenedor orquestador (R11): conserva ruta, export y API de props. Lo importan
 * `alumno-detalle/HistorialSesionesAlumno.tsx` y `monitor-adherencia/ModalActividadAlumno.tsx`.
 * Compone `CabeceraSesion` + `BloqueEjercicio` (piezas ÚNICAS en
 * `components/entrenador/detalle-sesion-entrenamiento/`) y calcula los derivados
 * entre marcas de cada ejercicio con las funciones puras de `lib/sesion-tiempos`.
 *
 * Muestra las series con reps/carga reales vs planificadas, RPE, el valor del
 * TEMPORIZADOR de descanso y los tiempos derivados de las marcas
 * (`Tiempo entre series (aprox.)` / `Tiempo entre ejercicios (aprox.)`), que son
 * cotas entre marcas, nunca "descanso exacto" (ver `lib/sesion-tiempos.ts`).
 * WU17: cuando existen marcas de inicio reales, muestra la MEDICIÓN observada
 * (`Descanso real` / `Duración de la serie`) y deja el tiempo aproximado como respaldo.
 * WU18: copy en lenguaje humano para no técnicos (`Plan:`, `Descanso planificado:`,
 * `Temporizador:`) con el formato de tiempo de `formatearSegundos`.
 */
import React from 'react';
import type { SesionEntrenamientoDetalleDTO } from '@guachafit/shared';
import {
  deltasEntreEjercicios,
  descansosRealesEntreEjercicios,
} from '../../lib/sesion-tiempos';
import { CabeceraSesion } from './detalle-sesion-entrenamiento/CabeceraSesion';
import { BloqueEjercicio } from './detalle-sesion-entrenamiento/BloqueEjercicio';

export interface DetalleSesionEntrenamientoProps {
  sesion: SesionEntrenamientoDetalleDTO;
  /** Título opcional del bloque/rutina que encabeza la sesión (p. ej. en el expediente). */
  titulo?: string | null;
  /**
   * Texto del chip ámbar cuando la sesión se recuperó en un día de descanso (WU16, ficha del
   * alumno: "Recuperada en Lunes (Día de descanso)"). Sin la prop se conserva el texto plano
   * del monitor ("Recuperada en día de descanso").
   */
  chipRecuperada?: string | null;
  /** Acciones extra en la fila de chips de la cabecera (p. ej. el toggle Ver/Ocultar series). */
  accionesCabecera?: React.ReactNode;
  /** Muestra el grupo muscular de cada ejercicio (la ficha del alumno lo usaba; el monitor no). */
  mostrarGrupoMuscular?: boolean;
  /** `false` = acordeón colapsado: solo cabecera, sin la lista de ejercicios. */
  mostrarSeries?: boolean;
  /** `id` del contenedor de ejercicios, para `aria-controls` del toggle externo. */
  idSeries?: string;
  className?: string;
}

export function DetalleSesionEntrenamiento({
  sesion,
  titulo,
  chipRecuperada,
  accionesCabecera,
  mostrarGrupoMuscular = false,
  mostrarSeries = true,
  idSeries,
  className = '',
}: DetalleSesionEntrenamientoProps) {
  const ejercicios = sesion.ejercicios ?? [];
  const deltasEjercicios = deltasEntreEjercicios(ejercicios);
  const descansosRealesEjercicios = descansosRealesEntreEjercicios(ejercicios);

  return (
    <section className={`space-y-3 ${className}`.trim()}>
      {/* Cabecera: cuándo, cuánto y cómo cerró la sesión */}
      <CabeceraSesion
        sesion={sesion}
        titulo={titulo}
        chipRecuperada={chipRecuperada}
        accionesCabecera={accionesCabecera}
      />

      {/* Ejercicios y series (ocultos cuando el acordeón externo está colapsado) */}
      {mostrarSeries &&
        (ejercicios.length === 0 ? (
          <p className="p-4 rounded-2xl border border-dashed border-border/70 text-[11px] text-muted-foreground text-center">
            Sin series registradas en esta sesión.
          </p>
        ) : (
          <div id={idSeries} className="space-y-3">
            {ejercicios.map((ejercicio, indiceEjercicio) => (
              <BloqueEjercicio
                key={ejercicio.id}
                ejercicio={ejercicio}
                indiceEjercicio={indiceEjercicio}
                mostrarGrupoMuscular={mostrarGrupoMuscular}
                deltaEjercicio={deltasEjercicios[indiceEjercicio]}
                descansoRealEjercicio={descansosRealesEjercicios[indiceEjercicio]}
              />
            ))}
          </div>
        ))}
    </section>
  );
}
