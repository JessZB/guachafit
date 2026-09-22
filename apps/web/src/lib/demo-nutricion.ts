/**
 * Fixtures demo del módulo de nutrición (RF-002), SOLO tras `isDemoMode`.
 *
 * Coherencia con el resto del modo demo:
 * - Ids y fechas relativos a "ahora" para que el calendario se vea fresco en cualquier fecha.
 * - Hay días sin reporte a propósito: el coach debe VER el estado derivado `No reportado` (§6)
 *   y la fila "Sin metas configuradas" tiene su propio camino real (aquí se muestran metas).
 * - Las fotos son SVGs sintéticos con marca "DEMO" en data URI: no son fotos reales ni
 *   requieren red (mismo patrón que `demo-evolucion.ts`).
 */
import {
  SemaforoNutricional,
  TipoComida,
  type CheckinNutricionalDetalleDTO,
  type FotoComidaDetalleDTO,
  type MetasNutricionalesDetalleDTO,
} from '@guachafit/shared';
import { fechaCalendarioLocal, formatFechaLargaCalendario, sumarDiasCalendario } from './date-format';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Etiqueta humana de la comida para la foto sintética (sin depender de otro módulo). */
const ETIQUETA_COMIDA_DEMO: Record<TipoComida, string> = {
  [TipoComida.DESAYUNO]: 'Desayuno',
  [TipoComida.ALMUERZO]: 'Almuerzo',
  [TipoComida.CENA]: 'Cena',
  [TipoComida.SNACK]: 'Merienda',
};

/** Plato demo sintético: círculo de plato, cubiertos y la marca DEMO visible. */
function svgPlatoDemo(tipoComida: TipoComida, fechaLarga: string): string {
  const acento = '#38bdf8';
  const fondo = '#11161f';
  const etiqueta = ETIQUETA_COMIDA_DEMO[tipoComida];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480" role="img" aria-label="Foto demo ${etiqueta}">
  <rect width="360" height="480" fill="${fondo}"/>
  <circle cx="180" cy="236" r="96" fill="${acento}" opacity="0.16"/>
  <circle cx="180" cy="236" r="72" fill="none" stroke="${acento}" stroke-width="3" opacity="0.6"/>
  <circle cx="180" cy="236" r="34" fill="${acento}" opacity="0.35"/>
  <rect x="24" y="24" width="84" height="30" rx="8" fill="${acento}" opacity="0.18"/>
  <text x="66" y="44" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="${acento}" text-anchor="middle">DEMO</text>
  <text x="180" y="400" font-family="system-ui, sans-serif" font-size="20" font-weight="700" fill="#e2e8f0" text-anchor="middle">${etiqueta}</text>
  <text x="180" y="428" font-family="system-ui, sans-serif" font-size="15" fill="#8b9cb0" text-anchor="middle">${fechaLarga}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function crearFotoDemo(
  checkinId: string,
  fecha: string,
  tipoComida: TipoComida,
  indice: number
): FotoComidaDetalleDTO {
  const fechaLarga = formatFechaLargaCalendario(fecha) ?? fecha;
  return {
    id: `demo-foto-${checkinId}-${indice}`,
    checkinId,
    tipoComida,
    storageKey: `comidas/demo/${fecha}/${checkinId}-${indice}.webp`,
    fotoUrl: svgPlatoDemo(tipoComida, fechaLarga),
    createdAtUtc: new Date(`${fecha}T22:00:00.000Z`).toISOString(),
  };
}

/** Metas demo del coach (RN-01): objetivos cuantitativos + un recurso educativo por enlace. */
export function crearMetasNutricionalesDemo(
  alumnoId = 'demo-alumno',
  ahora: Date = new Date()
): MetasNutricionalesDetalleDTO {
  const iso = ahora.toISOString();
  return {
    id: 'demo-metas-nutricion',
    alumnoId,
    caloriasObjetivo: 2200,
    proteinaGramosObjetivo: 160,
    carbohidratosGramosObjetivo: 220,
    grasasGramosObjetivo: 70,
    aguaLitrosObjetivo: '3.00',
    recursos: [
      {
        titulo: 'Lista de compras semanal',
        url: 'https://demo.guachafit.com/recursos/lista-de-compras.pdf',
      },
      {
        titulo: 'Distribución de comidas por bloque',
        url: 'https://demo.guachafit.com/recursos/distribucion-comidas.pdf',
      },
    ],
    createdAtUtc: iso,
    updatedAtUtc: iso,
  };
}

/** Perfil de un día del fixture (offsets negativos = días atrás; los omitidos quedan sin reporte). */
interface DiaDemo {
  diasAtras: number;
  semaforo: SemaforoNutricional;
  calorias?: number;
  proteina?: number;
  agua?: string;
  notas?: string;
  comidas: TipoComida[];
}

const DIAS_DEMO: DiaDemo[] = [
  // Dentro del margen ±10 % (2200/160): verde.
  { diasAtras: 1, semaforo: SemaforoNutricional.CUMPLIDO, calorias: 2150, proteina: 158, agua: '3.00', comidas: [TipoComida.ALMUERZO, TipoComida.CENA], notas: 'Cumplí la pauta completa.' },
  // Calorías fuera (+13.64 %) y proteína dentro: ámbar.
  { diasAtras: 2, semaforo: SemaforoNutricional.PARCIAL, calorias: 2500, proteina: 150, agua: '2.50', comidas: [TipoComida.DESAYUNO, TipoComida.ALMUERZO, TipoComida.CENA], notas: 'Cena fuera de casa, cuidé la proteína.' },
  // Ambas dimensiones fuera: rojo.
  { diasAtras: 3, semaforo: SemaforoNutricional.NO_CUMPLIDO, calorias: 3100, proteina: 90, comidas: [TipoComida.ALMUERZO], notas: 'Día libre planificado.' },
  // Sin registro → el calendario lo muestra "No reportado".
  // Sin totales: la tolerancia queda "sin evaluar" (nunca un falso OK).
  { diasAtras: 5, semaforo: SemaforoNutricional.CUMPLIDO, agua: '2.00', comidas: [] },
  { diasAtras: 6, semaforo: SemaforoNutricional.PARCIAL, calorias: 2050, proteina: 120, comidas: [TipoComida.DESAYUNO, TipoComida.CENA] },
  { diasAtras: 7, semaforo: SemaforoNutricional.CUMPLIDO, calorias: 2200, proteina: 160, agua: '3.00', comidas: [TipoComida.DESAYUNO, TipoComida.ALMUERZO, TipoComida.SNACK, TipoComida.CENA] },
  { diasAtras: 9, semaforo: SemaforoNutricional.NO_CUMPLIDO, calorias: 2800, proteina: 100, comidas: [TipoComida.CENA] },
  { diasAtras: 10, semaforo: SemaforoNutricional.CUMPLIDO, calorias: 2180, proteina: 165, agua: '2.75', comidas: [TipoComida.ALMUERZO] },
  { diasAtras: 12, semaforo: SemaforoNutricional.PARCIAL, calorias: 1900, proteina: 170, comidas: [TipoComida.DESAYUNO, TipoComida.ALMUERZO] },
  { diasAtras: 13, semaforo: SemaforoNutricional.CUMPLIDO, calorias: 2250, proteina: 155, comidas: [] },
];

/**
 * Check-ins demo de los últimos 14 días (orden descendente por fecha, como el listado real).
 * Los días del rango sin entrada quedan ausentes a propósito: el calendario del coach deriva
 * `No reportado` para los días cerrados.
 */
export function checkinsNutricionalesDemo(
  alumnoId = 'demo-alumno',
  ahora: Date = new Date()
): CheckinNutricionalDetalleDTO[] {
  const hoy = fechaCalendarioLocal(ahora);

  return DIAS_DEMO.map((dia) => {
    const fecha = sumarDiasCalendario(hoy, -dia.diasAtras);
    const checkinId = `demo-checkin-${fecha}`;
    const creado = new Date(ahora.getTime() - dia.diasAtras * DIA_MS).toISOString();

    return {
      id: checkinId,
      alumnoId,
      fecha,
      semaforo: dia.semaforo,
      caloriasReportadas: dia.calorias ?? null,
      proteinaGramosReportada: dia.proteina ?? null,
      aguaLitros: dia.agua ?? null,
      notasAlumno: dia.notas ?? null,
      fotosPlatos: dia.comidas.map((tipo, indice) => crearFotoDemo(checkinId, fecha, tipo, indice)),
      alumnoNombre: 'Carlos Alberto Mendoza Silva',
      createdAtUtc: creado,
      updatedAtUtc: creado,
    };
  });
}
