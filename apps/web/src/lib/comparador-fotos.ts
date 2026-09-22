/**
 * RF-004 RN-02: helpers puros del comparador fotográfico A/B.
 *
 * El mismo shape que devuelve `GET /antropometria/comparador/:alumnoId`
 * (`ComparativaAngularResultadoDTO` con `fotoDisponible`) se construye localmente en modo demo,
 * para que la UI real y la demo rendericen exactamente el mismo contrato.
 */
import {
  AnguloFoto,
  type ComparativaAngularDTO,
  type ControlAntropometricoDetalleDTO,
  type FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';

export interface ComparativaFotos {
  angulo: AnguloFoto;
  controlA: ControlAntropometricoDetalleDTO;
  controlB: ControlAntropometricoDetalleDTO;
  fotoA: FotoAntropometriaDetalleDTO | null;
  fotoB: FotoAntropometriaDetalleDTO | null;
  /** true solo cuando AMBAS fechas tienen foto en el ángulo elegido (RN-02 §6). */
  fotoDisponible: boolean;
  diferenciaPesoKg: string | null;
  diferenciaGrasaPorcentaje: string | null;
}

export const ANGULOS_FOTO: AnguloFoto[] = [AnguloFoto.FRONTAL, AnguloFoto.LATERAL, AnguloFoto.POSTERIOR];

const ETIQUETAS_ANGULO: Record<AnguloFoto, string> = {
  [AnguloFoto.FRONTAL]: 'Frontal',
  [AnguloFoto.LATERAL]: 'Lateral',
  [AnguloFoto.POSTERIOR]: 'Posterior',
};

/** Etiqueta humana del ángulo (00_Reglas §6: sin enums crudos en UI). */
export function etiquetaAngulo(angulo: AnguloFoto): string {
  return ETIQUETAS_ANGULO[angulo] ?? 'Sin dato';
}

/** Ángulos con foto cargada en un control (sin repetir). */
export function angulosDeControl(control: ControlAntropometricoDetalleDTO | null | undefined): AnguloFoto[] {
  if (!control?.fotos) return [];
  const vistos = new Set<AnguloFoto>();
  for (const foto of control.fotos) vistos.add(foto.angulo);
  return ANGULOS_FOTO.filter((angulo) => vistos.has(angulo));
}

/** Ángulos comparables: presentes en AMBAS fechas (los demás se inhabilitan con aviso). */
export function angulosComparables(
  controlA: ControlAntropometricoDetalleDTO | null | undefined,
  controlB: ControlAntropometricoDetalleDTO | null | undefined
): AnguloFoto[] {
  const enA = new Set(angulosDeControl(controlA));
  return angulosDeControl(controlB).filter((angulo) => enA.has(angulo));
}

/** Mensaje del caso borde RF-004 §6 cuando falta la perspectiva en alguna de las dos fechas. */
export function motivoAnguloNoDisponible(
  controlA: ControlAntropometricoDetalleDTO | null | undefined,
  controlB: ControlAntropometricoDetalleDTO | null | undefined,
  angulo: AnguloFoto
): string | null {
  const enA = angulosDeControl(controlA).includes(angulo);
  const enB = angulosDeControl(controlB).includes(angulo);
  if (enA && enB) return null;
  return 'Foto no disponible para esta fecha';
}

function buscarFoto(
  control: ControlAntropometricoDetalleDTO,
  angulo: AnguloFoto
): FotoAntropometriaDetalleDTO | null {
  return control.fotos?.find((foto) => foto.angulo === angulo) ?? null;
}

function diferencia(a: number, b: number): string {
  return (b - a).toFixed(2);
}

/**
 * Construye la comparativa (mismo cálculo que el servicio): deltas B − A y `fotoDisponible`
 * solo cuando ambas fotos existen. Si falta el % de grasa en alguna fecha, el delta es `null`.
 */
export function construirComparativa(
  controlA: ControlAntropometricoDetalleDTO,
  controlB: ControlAntropometricoDetalleDTO,
  angulo: AnguloFoto
): ComparativaFotos {
  const fotoA = buscarFoto(controlA, angulo);
  const fotoB = buscarFoto(controlB, angulo);

  const grasaA = controlA.porcentajeGrasa === null || controlA.porcentajeGrasa === undefined
    ? null
    : Number(controlA.porcentajeGrasa);
  const grasaB = controlB.porcentajeGrasa === null || controlB.porcentajeGrasa === undefined
    ? null
    : Number(controlB.porcentajeGrasa);

  return {
    angulo,
    controlA,
    controlB,
    fotoA,
    fotoB,
    fotoDisponible: Boolean(fotoA && fotoB),
    diferenciaPesoKg: diferencia(Number(controlA.pesoKg), Number(controlB.pesoKg)),
    diferenciaGrasaPorcentaje:
      grasaA !== null && grasaB !== null && Number.isFinite(grasaA) && Number.isFinite(grasaB)
        ? diferencia(grasaA, grasaB)
        : null,
  };
}

/**
 * Normaliza la respuesta real de la API: `fotoDisponible` es aditivo y puede faltar en cachés
 * previas; se deriva de las fotos presentes.
 */
export function normalizarComparativaApi(
  respuesta: ComparativaAngularDTO & { fotoDisponible?: boolean }
): ComparativaFotos {
  const fotoA = respuesta.fotoA ?? null;
  const fotoB = respuesta.fotoB ?? null;
  return {
    angulo: respuesta.angulo,
    controlA: respuesta.controlA,
    controlB: respuesta.controlB,
    fotoA,
    fotoB,
    fotoDisponible: respuesta.fotoDisponible ?? Boolean(fotoA && fotoB),
    diferenciaPesoKg: respuesta.diferenciaPesoKg ?? null,
    diferenciaGrasaPorcentaje: respuesta.diferenciaGrasaPorcentaje ?? null,
  };
}

/** Posición del slider acotada a 0..100 (un valor inválido cae al centro, nunca a NaN). */
export function posicionSliderValida(posicion: number): number {
  if (!Number.isFinite(posicion)) return 50;
  return Math.min(100, Math.max(0, Math.round(posicion)));
}

/** Diferencia humana con signo: '+1.20 kg', '-3.20 kg', '0.00 kg'. */
export function formatearDiferencia(diferenciaTexto: string | null, unidad: 'kg' | '%'): string | null {
  if (diferenciaTexto === null || diferenciaTexto === undefined || diferenciaTexto === '') return null;
  const valor = Number(diferenciaTexto);
  if (!Number.isFinite(valor)) return null;
  const redondeado = valor.toFixed(2);
  const numero = valor > 0 ? `+${redondeado}` : redondeado;
  return unidad === '%' ? `${numero}%` : `${numero} ${unidad}`;
}
