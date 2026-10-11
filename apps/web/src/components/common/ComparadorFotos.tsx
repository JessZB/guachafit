/**
 * RF-004 RN-02/RN-03: comparador fotográfico A/B con slider y lado a lado.
 *
 * - Selector de ángulo con disponibilidad real por fecha: la perspectiva que falta en alguna de
 *   las dos tomas se inhabilita con el aviso de RF-004 §6 ("Foto no disponible para esta fecha").
 * - Superposición: slider funcional (arrastre, clic en la pista y flechas del teclado) con un
 *   `<input type="range">` real: accesible y con área táctil de altura completa (≥44px).
 * - Lado a lado: rejilla de dos paneles desde `sm`; en móvil el slider es la vista por defecto.
 * - RN-03: solo se consumen URLs presignadas; si el enlace temporal venció, se avisa y se puede
 *   reintentar sin fingir que la foto existe.
 */
import React, { useState } from 'react';
import { AlertCircle, Camera, Columns2, ImageOff, Loader2, RefreshCw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { AnguloFoto, type FotoAntropometriaDetalleDTO } from '@guachafit/shared';
import { formatFechaCalendario, formatFechaLargaCalendario } from '../../lib/date-format';
import {
  ANGULOS_FOTO,
  etiquetaAngulo,
  formatearDiferencia,
  motivoAnguloNoDisponible,
  posicionSliderValida,
  type ComparativaFotos,
} from '../../lib/comparador-fotos';

type ModoVista = 'lado-a-lado' | 'superposicion';

export interface ComparadorFotosProps {
  comparativa: ComparativaFotos;
  angulo: AnguloFoto;
  onCambiarAngulo: (angulo: AnguloFoto) => void;
  angulosDisponibles: AnguloFoto[];
  cargando?: boolean;
  error?: string | null;
  onReintentar?: () => void;
  className?: string;
}

function etiquetaToma(titulo: string, fecha: string): string {
  return `${titulo} · ${formatFechaCalendario(fecha) ?? fecha}`;
}

/** Panel de una toma: imagen presignada o vacío honesto (sin URL / enlace vencido). */
function PanoFoto({
  foto,
  titulo,
  fecha,
  pesoKg,
  grasa,
  destacado = false,
}: {
  foto: FotoAntropometriaDetalleDTO | null;
  titulo: string;
  fecha: string;
  pesoKg: string;
  grasa: string | null;
  destacado?: boolean;
}) {
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);
  const url = foto?.presignedGetUrl ?? null;
  const etiquetaCompleta = `${titulo} del ${formatFechaLargaCalendario(fecha) ?? fecha}`;

  return (
    <div
      className={`p-4 rounded-3xl border space-y-3 ${
        destacado ? 'bg-primary/5 border-primary/20' : 'bg-secondary/30 border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold uppercase ${destacado ? 'text-primary' : 'text-muted-foreground'}`}>
          {etiquetaToma(titulo, fecha)}
        </span>
        <span className="font-mono font-bold text-xs text-foreground">{pesoKg} kg</span>
      </div>

      <div className="relative aspect-3/4 rounded-2xl overflow-hidden bg-background/60 border border-border">
        {url && !fallo ? (
          <img
            key={intento}
            src={url}
            alt={`Foto ${etiquetaAngulo(foto!.angulo)} de la toma ${etiquetaCompleta}`}
            loading="lazy"
            onError={() => setFallo(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 gap-2">
            {fallo ? (
              <>
                <ImageOff className="h-9 w-9 text-warning" />
                <p className="text-xs font-bold text-foreground">El enlace temporal venció</p>
                <p className="text-[11px] text-muted-foreground">
                  Las fotos se sirven con URLs firmadas de 15 minutos.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setFallo(false);
                    setIntento((n) => n + 1);
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 min-h-11 sm:min-h-0 px-3 py-2 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Reintentar</span>
                </button>
              </>
            ) : (
              <>
                <Camera className="h-9 w-9 text-muted-foreground opacity-40" />
                <p className="text-xs font-semibold text-muted-foreground">
                  Foto no disponible para esta fecha
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {grasa ? `Grasa: ${grasa}%` : 'Grasa: —'} · Perspectiva {etiquetaAngulo(foto?.angulo ?? AnguloFoto.FRONTAL)}
      </p>
    </div>
  );
}

export function ComparadorFotos({
  comparativa,
  angulo,
  onCambiarAngulo,
  angulosDisponibles,
  cargando = false,
  error = null,
  onReintentar,
  className = '',
}: ComparadorFotosProps) {
  const [modo, setModo] = useState<ModoVista>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(max-width: 767px)').matches ? 'superposicion' : 'lado-a-lado';
    }
    return 'lado-a-lado';
  });
  const [posicion, setPosicion] = useState(50);

  const { controlA, controlB, fotoA, fotoB } = comparativa;
  const motivoAngulo = motivoAnguloNoDisponible(controlA, controlB, angulo);
  const diferenciaPeso = formatearDiferencia(comparativa.diferenciaPesoKg, 'kg');
  const diferenciaGrasa = formatearDiferencia(comparativa.diferenciaGrasaPorcentaje, '%');

  if (error) {
    return (
      <div className={`p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3 ${className}`}>
        <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
        <p className="text-xs text-muted-foreground">{error}</p>
        {onReintentar && (
          <button
            type="button"
            onClick={onReintentar}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-base text-foreground">Comparativa visual A / B</h3>
          <p className="text-xs text-muted-foreground">
            Selecciona dos fechas y una perspectiva para comparar la recomposición corporal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de ángulo */}
          <div role="group" aria-label="Perspectiva de la foto" className="flex items-center gap-1.5 bg-secondary/60 p-1 rounded-2xl border border-border">
            {ANGULOS_FOTO.map((opcion) => {
              const disponible = angulosDisponibles.includes(opcion);
              const motivo = motivoAnguloNoDisponible(controlA, controlB, opcion);
              return (
                <button
                  key={opcion}
                  type="button"
                  onClick={() => onCambiarAngulo(opcion)}
                  disabled={!disponible}
                  aria-pressed={angulo === opcion}
                  title={disponible ? etiquetaAngulo(opcion) : (motivo ?? 'Foto no disponible para esta fecha')}
                  className={`min-h-11 sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary ${
                    angulo === opcion
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {etiquetaAngulo(opcion)}
                </button>
              );
            })}
          </div>

          {/* Modo de vista */}
          <div role="group" aria-label="Modo de comparación" className="flex items-center gap-1.5 bg-secondary/60 p-1 rounded-2xl border border-border">
            <button
              type="button"
              onClick={() => setModo('lado-a-lado')}
              aria-pressed={modo === 'lado-a-lado'}
              title="Lado a lado"
              className={`min-h-11 sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                modo === 'lado-a-lado' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lado a lado</span>
            </button>
            <button
              type="button"
              onClick={() => setModo('superposicion')}
              aria-pressed={modo === 'superposicion'}
              title="Superposición con slider"
              className={`min-h-11 sm:min-h-0 inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                modo === 'superposicion' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Superposición</span>
            </button>
          </div>
        </div>
      </div>

      {cargando ? (
        <div className="py-14 flex items-center justify-center">
          <Loader2 className="h-7 w-7 text-primary animate-spin" />
        </div>
      ) : !comparativa.fotoDisponible ? (
        <div className="p-6 rounded-3xl bg-card border border-dashed border-border text-center space-y-2">
          <Camera className="h-9 w-9 text-muted-foreground mx-auto opacity-40" />
          <p className="text-xs font-bold text-foreground">
            {motivoAngulo ?? 'Foto no disponible para esta fecha'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Prueba con otra perspectiva o elige dos fechas que tengan foto en el mismo ángulo.
          </p>
        </div>
      ) : modo === 'lado-a-lado' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PanoFoto
            foto={fotoA}
            titulo="Toma A"
            fecha={controlA.fechaEvaluacion}
            pesoKg={controlA.pesoKg}
            grasa={controlA.porcentajeGrasa ?? null}
          />
          <PanoFoto
            foto={fotoB}
            titulo="Toma B"
            fecha={controlB.fechaEvaluacion}
            pesoKg={controlB.pesoKg}
            grasa={controlB.porcentajeGrasa ?? null}
            destacado
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative aspect-3/4 sm:aspect-16/10 rounded-3xl overflow-hidden border border-border bg-background/60">
            {/* Toma A de fondo */}
            {fotoA?.presignedGetUrl ? (
              <img
                src={fotoA.presignedGetUrl}
                alt={`Foto ${etiquetaAngulo(angulo)} de la toma A del ${formatFechaLargaCalendario(controlA.fechaEvaluacion) ?? controlA.fechaEvaluacion}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Camera className="h-10 w-10 text-muted-foreground opacity-40" />
              </div>
            )}

            {/* Toma B recortada al tramo [posicion, 100] */}
            {fotoB?.presignedGetUrl && (
              <img
                src={fotoB.presignedGetUrl}
                alt={`Foto ${etiquetaAngulo(angulo)} de la toma B del ${formatFechaLargaCalendario(controlB.fechaEvaluacion) ?? controlB.fechaEvaluacion}`}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 0 0 ${posicion}%)` }}
              />
            )}

            {/* Etiquetas de cada lado */}
            <span className="absolute top-2 left-2 px-2.5 py-1 rounded-xl bg-background/80 border border-border text-[11px] font-bold text-foreground backdrop-blur">
              A · {formatFechaCalendario(controlA.fechaEvaluacion) ?? controlA.fechaEvaluacion}
            </span>
            <span className="absolute top-2 right-2 px-2.5 py-1 rounded-xl bg-background/80 border border-border text-[11px] font-bold text-foreground backdrop-blur">
              B · {formatFechaCalendario(controlB.fechaEvaluacion) ?? controlB.fechaEvaluacion}
            </span>

            {/* Divisor + manija (solo visual: el control real es el input range superpuesto) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary"
              style={{ left: `${posicion}%` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-12 w-12 rounded-full bg-primary text-primary-foreground border-2 border-background shadow-lg flex items-center justify-center"
              style={{ left: `${posicion}%` }}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </div>

            {/* Slider real: cubre toda la imagen (arrastre, clic y flechas del teclado). */}
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={posicion}
              onChange={(evento) => setPosicion(posicionSliderValida(Number(evento.target.value)))}
              aria-label="Posición del comparador entre la toma A y la toma B"
              className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
            <span>{controlA.pesoKg} kg</span>
            <span>{posicion}% A / {100 - posicion}% B</span>
            <span>{controlB.pesoKg} kg</span>
          </div>
        </div>
      )}

      {/* Resumen de diferencias (B − A) */}
      <div className="p-4 rounded-2xl bg-secondary/50 border border-border flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-bold text-foreground">Diferencias (B − A):</span>
        <span className="font-mono text-xs font-bold text-foreground">
          Peso: {diferenciaPeso ?? '—'}
        </span>
        <span className="font-mono text-xs font-bold text-foreground">
          Grasa: {diferenciaGrasa ?? '—'}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground sm:ml-auto">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>Fotos privadas servidas con enlaces temporales firmados (15 min).</span>
        </span>
      </div>
    </div>
  );
}
