/**
 * RF-004: fixture demo de la evolución corporal y del comparador fotográfico.
 *
 * SOLO se consume con la bandera `isDemoMode` activa (ADR-012). Los controles se calculan
 * relativos a "ahora" (6 tomas: 150/120/90/60/30/3 días atrás) para que los filtros de rango
 * (1M/3M/6M/1A/Todo) tengan datos frescos en cualquier fecha.
 *
 * Honestidad del fixture:
 * - Las fotos demo son SVG sintéticos con marca "DEMO" incrustada: nunca se hacen pasar por
 *   fotografías reales ni disparan tráfico a R2.
 * - El control intermedio solo tiene foto frontal y el último no tiene posterior, para poder
 *   VER el caso borde de RF-004 §6 ("Foto no disponible para esta fecha") sin inventar datos.
 * - `cambioNetoPesoKg`/`cambioNetoGrasaPorcentaje` se derivan de la primera y la última toma,
 *   con la misma aritmética del servicio.
 */
import {
  AnguloFoto,
  EstadoMedicion,
  Modalidad,
  OrigenAntropometria,
  type ControlAntropometricoDetalleDTO,
  type EvolucionCorporalDTO,
  type FotoAntropometriaDetalleDTO,
} from '@guachafit/shared';
import { formatFechaLargaCalendario } from './date-format';
import { fechaCalendarioLocal } from './evolucion-graficos';

const DIA_MS = 24 * 60 * 60 * 1000;

interface TomaDemo {
  diasAtras: number;
  pesoKg: string;
  grasa: string;
  cintura: string;
  brazo: string;
  pecho: string;
  muslo: string;
  cadera: string;
  cuello: string;
  angulos: AnguloFoto[];
}

const TOMAS_DEMO: TomaDemo[] = [
  {
    diasAtras: 150,
    pesoKg: '77.70',
    grasa: '17.20',
    cintura: '85.00',
    brazo: '36.00',
    pecho: '100.00',
    muslo: '57.00',
    cadera: '98.00',
    cuello: '38.00',
    angulos: [AnguloFoto.FRONTAL, AnguloFoto.LATERAL],
  },
  {
    diasAtras: 120,
    pesoKg: '76.90',
    grasa: '16.60',
    cintura: '84.00',
    brazo: '36.30',
    pecho: '100.50',
    muslo: '57.20',
    cadera: '97.40',
    cuello: '38.00',
    angulos: [AnguloFoto.FRONTAL],
  },
  {
    diasAtras: 90,
    pesoKg: '76.10',
    grasa: '16.10',
    cintura: '83.40',
    brazo: '36.50',
    pecho: '101.00',
    muslo: '57.50',
    cadera: '97.00',
    cuello: '37.80',
    angulos: [AnguloFoto.FRONTAL, AnguloFoto.LATERAL],
  },
  {
    diasAtras: 60,
    pesoKg: '75.40',
    grasa: '15.60',
    cintura: '82.60',
    brazo: '36.80',
    pecho: '101.40',
    muslo: '57.80',
    cadera: '96.60',
    cuello: '37.70',
    angulos: [AnguloFoto.FRONTAL],
  },
  {
    diasAtras: 30,
    pesoKg: '74.90',
    grasa: '15.10',
    cintura: '82.00',
    brazo: '37.10',
    pecho: '101.70',
    muslo: '58.00',
    cadera: '96.20',
    cuello: '37.60',
    angulos: [AnguloFoto.FRONTAL, AnguloFoto.LATERAL],
  },
  {
    diasAtras: 3,
    pesoKg: '74.50',
    grasa: '14.80',
    cintura: '81.00',
    brazo: '37.50',
    pecho: '102.00',
    muslo: '58.20',
    cadera: '96.00',
    cuello: '37.50',
    angulos: [AnguloFoto.FRONTAL, AnguloFoto.LATERAL, AnguloFoto.POSTERIOR],
  },
];

const ETIQUETA_ANGULO_DEMO: Record<AnguloFoto, string> = {
  [AnguloFoto.FRONTAL]: 'Frontal',
  [AnguloFoto.LATERAL]: 'Lateral',
  [AnguloFoto.POSTERIOR]: 'Posterior',
};

/**
 * Foto demo sintética (SVG en data URI) con marca "DEMO" visible: silueta esquemática y la
 * fecha/ángulo de la toma. No es una fotografía real y no requiere red.
 */
function svgFotoDemo(angulo: AnguloFoto, fechaLarga: string, esUltima: boolean): string {
  const acento = esUltima ? '#1cd38d' : '#38bdf8';
  const fondo = esUltima ? '#18202c' : '#11161f';
  const etiqueta = ETIQUETA_ANGULO_DEMO[angulo];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480" role="img" aria-label="Foto demo ${etiqueta}">
  <rect width="360" height="480" fill="${fondo}"/>
  <circle cx="180" cy="118" r="46" fill="${acento}" opacity="0.35"/>
  <path d="M92 300 Q92 210 180 210 Q268 210 268 300 L268 460 L92 460 Z" fill="${acento}" opacity="0.22"/>
  <path d="M92 300 Q92 210 180 210 Q268 210 268 300" fill="none" stroke="${acento}" stroke-width="3" opacity="0.7"/>
  <rect x="24" y="24" width="84" height="30" rx="8" fill="${acento}" opacity="0.18"/>
  <text x="66" y="44" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="${acento}" text-anchor="middle">DEMO</text>
  <text x="180" y="430" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#e2e8f0" text-anchor="middle">${etiqueta}</text>
  <text x="180" y="456" font-family="system-ui, sans-serif" font-size="15" fill="#8b9cb0" text-anchor="middle">${fechaLarga}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function crearFotosDemo(
  controlId: string,
  fecha: string,
  angulos: AnguloFoto[],
  esUltima: boolean,
  createdAtUtc: string
): FotoAntropometriaDetalleDTO[] {
  const fechaLarga = formatFechaLargaCalendario(fecha) ?? fecha;
  return angulos.map((angulo) => ({
    id: `demo-foto-${controlId}-${angulo}`,
    controlId,
    angulo,
    storageKey: `antropometria/demo/${controlId}/${angulo}.webp`,
    presignedGetUrl: svgFotoDemo(angulo, fechaLarga, esUltima),
    createdAtUtc,
  }));
}

/** Serie demo completa de controles aprobados, en orden cronológico ascendente. */
export function crearEvolucionDemo(usuarioId: string, ahora: Date = new Date()): EvolucionCorporalDTO {
  const evaluaciones: ControlAntropometricoDetalleDTO[] = TOMAS_DEMO.map((toma, indice) => {
    const fecha = new Date(ahora.getTime() - toma.diasAtras * DIA_MS);
    const fechaEvaluacion = fechaCalendarioLocal(fecha);
    const controlId = `demo-evo-${indice + 1}`;
    const esUltima = indice === TOMAS_DEMO.length - 1;

    return {
      id: controlId,
      alumnoId: usuarioId,
      fechaEvaluacion,
      pesoKg: toma.pesoKg,
      alturaCm: '178.00',
      porcentajeGrasa: toma.grasa,
      perimetros: {
        cuelloCm: toma.cuello,
        pechoCm: toma.pecho,
        cinturaCm: toma.cintura,
        caderaCm: toma.cadera,
        brazoCm: toma.brazo,
        musloCm: toma.muslo,
      },
      modalidad: Modalidad.REMOTO,
      origen: OrigenAntropometria.REMOTO_AUTOREPORTE,
      registradoPor: usuarioId,
      estado: EstadoMedicion.APROBADO,
      fotos: crearFotosDemo(controlId, fechaEvaluacion, toma.angulos, esUltima, fecha.toISOString()),
      createdAtUtc: fecha.toISOString(),
      updatedAtUtc: fecha.toISOString(),
    };
  });

  const primera = evaluaciones[0];
  const ultima = evaluaciones[evaluaciones.length - 1];
  const cambioNetoPesoKg = (Number(ultima.pesoKg) - Number(primera.pesoKg)).toFixed(2);
  const cambioNetoGrasaPorcentaje = (Number(ultima.porcentajeGrasa) - Number(primera.porcentajeGrasa)).toFixed(2);

  return {
    alumnoId: usuarioId,
    totalEvaluaciones: evaluaciones.length,
    controlesTotal: evaluaciones.length,
    evaluaciones,
    cambioNetoPesoKg,
    cambioNetoGrasaPorcentaje,
    rangoSeleccionado: 'todo',
  };
}
