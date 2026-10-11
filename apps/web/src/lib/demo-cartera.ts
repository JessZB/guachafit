/**
 * WU-I (RF-009): fixture demo del Tablero de Control de Cartera.
 *
 * SOLO se consume con la bandera `isDemoMode` activa. Los ids `al-00X`/`u-00X` y los nombres son
 * los del roster demo del directorio y del monitor, así que "Ver ficha" abre el expediente demo
 * correcto. Las fechas se calculan relativas a "ahora" para que la cartera se vea fresca.
 *
 * Honestidad del fixture (misma regla que el modo real):
 * - `tasaVigente: null` => la columna en Bs se muestra "—" (sin tasa configurada), nunca un
 *   monto inventado.
 * - Los cobros/recordatorios demo de la sesión se aplican sobre la lista y el resumen se
 *   recalcula con los datos restantes (misma aritmética del servidor).
 */
import {
  EstadoCuota,
  Moneda,
  MetodoPago,
  type CarteraDTO,
  type FilaCarteraDTO,
  type PestanaCarteraDTO,
  type ResumenCarteraDTO,
} from '@guachafit/shared';
import { rebanarPagina } from './paginacion';
import { normalizarTextoBusqueda } from './texto-busqueda';

const DIA_MS = 24 * 60 * 60 * 1000;

export interface OpcionesCarteraDemo {
  pestana: PestanaCarteraDTO;
  q?: string;
  limit: number;
  offset: number;
  /** `usuarioId` de alumnos cobrados en la sesión demo: salen de mora/por vencer. */
  cobrados?: string[];
  /** Recordatorios manuales enviados en la sesión demo (`usuarioId` → ISO UTC). */
  recordatorios?: Record<string, string>;
}

function filaBase(
  parcial: Pick<FilaCarteraDTO, 'alumnoUsuarioId' | 'alumnoPerfilId' | 'alumnoNombre'> &
    Partial<FilaCarteraDTO>
): FilaCarteraDTO {
  return {
    proximoCorte: null,
    saldoAFavorUsd: '0.00',
    telefonoWhatsapp: null,
    cuotaId: null,
    estadoCuota: null,
    fechaCorteUtc: null,
    saldoPendienteUsd: null,
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: null,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: null,
    periodo: null,
    pagoId: null,
    montoReportado: null,
    monedaOriginal: null,
    metodoPago: null,
    referenciaBancaria: null,
    comprobanteUrl: null,
    fechaReporteUtc: null,
    diasEspera: null,
    ...parcial,
  };
}

function filasMoraDemo(ahora: Date): FilaCarteraDTO[] {
  return [
    filaBase({
      alumnoUsuarioId: 'u-003',
      alumnoPerfilId: 'al-003',
      alumnoNombre: 'Roberto Díaz Navarro',
      telefonoWhatsapp: '+584123333333',
      cuotaId: 'demo-cuota-003',
      estadoCuota: EstadoCuota.VENCIDA,
      fechaCorteUtc: new Date(ahora.getTime() - 12 * DIA_MS).toISOString(),
      saldoPendienteUsd: '45.00',
      diasAtraso: 12,
    }),
    filaBase({
      alumnoUsuarioId: 'u-004',
      alumnoPerfilId: 'al-004',
      alumnoNombre: 'Valeria Silva Castillo',
      telefonoWhatsapp: '+584124444444',
      cuotaId: 'demo-cuota-004',
      estadoCuota: EstadoCuota.VENCIDA,
      fechaCorteUtc: new Date(ahora.getTime() - 7 * DIA_MS).toISOString(),
      saldoPendienteUsd: '60.00',
      diasAtraso: 7,
    }),
    filaBase({
      alumnoUsuarioId: 'u-001',
      alumnoPerfilId: 'al-001',
      alumnoNombre: 'Carlos Alberto Mendoza Silva',
      telefonoWhatsapp: '+584121234567',
      cuotaId: 'demo-cuota-001',
      estadoCuota: EstadoCuota.VENCIDA,
      fechaCorteUtc: new Date(ahora.getTime() - 2 * DIA_MS).toISOString(),
      saldoPendienteUsd: '35.00',
      diasAtraso: 2,
    }),
  ];
}

function filasPorVencerDemo(ahora: Date): FilaCarteraDTO[] {
  return [
    filaBase({
      alumnoUsuarioId: 'u-002',
      alumnoPerfilId: 'al-002',
      alumnoNombre: 'Mariana Pérez Gómez',
      telefonoWhatsapp: '+584149876543',
      cuotaId: 'demo-cuota-002',
      estadoCuota: EstadoCuota.POR_VENCER,
      fechaCorteUtc: new Date(ahora.getTime() + 2 * DIA_MS).toISOString(),
      saldoPendienteUsd: '40.00',
      diasRestantes: 2,
    }),
    filaBase({
      alumnoUsuarioId: 'u-007',
      alumnoPerfilId: 'al-007',
      alumnoNombre: 'Luis Fernando Rojas',
      telefonoWhatsapp: '+584127777777',
      cuotaId: 'demo-cuota-007',
      estadoCuota: EstadoCuota.POR_VENCER,
      fechaCorteUtc: new Date(ahora.getTime() + 4 * DIA_MS).toISOString(),
      saldoPendienteUsd: '25.00',
      diasRestantes: 4,
    }),
  ];
}

function filasRevisionDemo(ahora: Date): FilaCarteraDTO[] {
  return [
    filaBase({
      alumnoUsuarioId: 'u-001',
      alumnoPerfilId: 'al-001',
      alumnoNombre: 'Carlos Alberto Mendoza Silva',
      telefonoWhatsapp: '+584121234567',
      cuotaId: 'demo-cuota-001',
      pagoId: 'demo-tx-001',
      montoReportado: '2275.00',
      monedaOriginal: Moneda.VES,
      metodoPago: MetodoPago.PAGO_MOVIL,
      referenciaBancaria: '445566',
      fechaReporteUtc: new Date(ahora.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      diasEspera: 0,
    }),
    filaBase({
      alumnoUsuarioId: 'u-011',
      alumnoPerfilId: 'al-011',
      alumnoNombre: 'Sofía Herrera Blanco',
      telefonoWhatsapp: '+584121111111',
      cuotaId: 'demo-cuota-011',
      pagoId: 'demo-tx-002',
      montoReportado: '30.00',
      monedaOriginal: Moneda.USD,
      metodoPago: MetodoPago.ZELLE,
      referenciaBancaria: 'ZEL-998811',
      fechaReporteUtc: new Date(ahora.getTime() - 2 * DIA_MS).toISOString(),
      diasEspera: 2,
    }),
  ];
}

function filasAlDiaDemo(ahora: Date): FilaCarteraDTO[] {
  const periodo = `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}`;
  return [
    filaBase({
      alumnoUsuarioId: 'u-008',
      alumnoPerfilId: 'al-008',
      alumnoNombre: 'Gabriela Torres',
      telefonoWhatsapp: '+584128888888',
      cuotaId: 'demo-cuota-008',
      estadoCuota: EstadoCuota.AL_DIA,
      fechaCorteUtc: new Date(ahora.getTime() + 18 * DIA_MS).toISOString(),
      saldoPendienteUsd: '0.00',
      planNombre: 'Presencial Completo',
      periodo,
    }),
    filaBase({
      alumnoUsuarioId: 'u-013',
      alumnoPerfilId: 'al-013',
      alumnoNombre: 'Lucía Fernández Ríos',
      telefonoWhatsapp: '+584121313131',
      cuotaId: 'demo-cuota-013',
      estadoCuota: EstadoCuota.AL_DIA,
      fechaCorteUtc: new Date(ahora.getTime() + 22 * DIA_MS).toISOString(),
      saldoPendienteUsd: '0.00',
      planNombre: 'Asesoría Online',
      periodo,
    }),
  ];
}

/**
 * Construye la página demo del tablero con la MISMA semántica del envelope del servidor:
 * `resumen` describe la cartera completa (ya sin los cobrados de la sesión) y `items` es el
 * slice de la pestaña tras aplicar la búsqueda.
 */
export function crearCarteraDemo(opciones: OpcionesCarteraDemo): CarteraDTO {
  const { pestana, q, limit, offset, cobrados = [], recordatorios = {} } = opciones;
  const ahora = new Date();

  const excluidos = new Set(cobrados);
  const conGestion = (fila: FilaCarteraDTO): FilaCarteraDTO => ({
    ...fila,
    ultimaGestionUtc: recordatorios[fila.alumnoUsuarioId] ?? fila.ultimaGestionUtc,
  });

  const mora = filasMoraDemo(ahora)
    .filter((fila) => !excluidos.has(fila.alumnoUsuarioId))
    .map(conGestion);
  const porVencer = filasPorVencerDemo(ahora)
    .filter((fila) => !excluidos.has(fila.alumnoUsuarioId))
    .map(conGestion);
  const revision = filasRevisionDemo(ahora);
  const alDia = filasAlDiaDemo(ahora).map(conGestion);

  const suma = (filas: FilaCarteraDTO[]) =>
    filas
      .reduce((acc, fila) => acc + Number(fila.saldoPendienteUsd ?? 0), 0)
      .toFixed(2);

  const resumen: ResumenCarteraDTO = {
    recaudadoMesUsd: '1900.00',
    totalEnMoraUsd: suma(mora),
    alumnosEnMora: mora.length,
    totalPorVencerUsd: suma(porVencer),
    proximosAVencer: porVencer.length,
    pagosPorValidar: revision.length,
    contadores: {
      enMora: mora.length,
      porVencer: porVencer.length,
      revision: revision.length,
      alDia: alDia.length,
    },
    // Demo explícito del estado honesto: sin tasa configurada no hay proyección en Bs.
    tasaVigente: null,
  };

  const porPestana: Record<PestanaCarteraDTO, FilaCarteraDTO[]> = {
    mora,
    por_vencer: porVencer,
    revision,
    al_dia: alDia,
  };

  const termino = normalizarTextoBusqueda(q);
  const filtradas =
    termino.length > 0
      ? porPestana[pestana].filter((fila) =>
          normalizarTextoBusqueda(fila.alumnoNombre).includes(termino)
        )
      : porPestana[pestana];

  // El offset del servidor equivale a la página `floor(offset/limit)+1` del slice local.
  const pagina = Math.floor(offset / Math.max(1, limit)) + 1;

  return {
    items: rebanarPagina(filtradas, pagina, limit),
    total: filtradas.length,
    limit,
    offset,
    resumen,
  };
}
