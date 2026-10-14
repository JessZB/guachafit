/**
 * Reglas puras del barrido antropométrico.
 *
 * Copia palabra por palabra la lógica de memoria del procesador:
 * selección de candidatos, rangos globales, ventanas de 48 h,
 * marcas de reporte y de aviso, filtro de modalidad y nombre visible.
 * Sin base de datos ni bus de eventos.
 */
import { Modalidad, PeriodicidadAntropometria } from '@guachafit/shared';
import {
  fechaAnteriorYyyyMmDd,
  instanteUtcDesdeMedianocheLocal,
} from '../../../../common/adherencia.util';
import {
  evaluarExpiracionAntropometria,
  evaluarRecordatorioAntropometria,
  sumarDiasCalendario,
} from '../../antropometria-periodicidad.util';

/** Alumno con calendario configurado por el coach. */
export interface AlumnoCalendarioReglas {
  usuarioId: string;
  entrenadorId: string;
  nombres: string;
  apellidos: string;
  modalidad: Modalidad;
  periodicidad: PeriodicidadAntropometria;
  inicio: string;
  timezone: string | null;
}

/** Candidato al recordatorio del día con su fecha programada. */
export interface CandidatoRecordatorioReglas {
  alumno: AlumnoCalendarioReglas;
  recordatorio: { corresponde: boolean; fechaProgramada?: string | null; referenciaId?: string | null };
}

/** Candidato a expiración con su fecha programada vencida. */
export interface CandidatoExpiracionReglas {
  alumno: AlumnoCalendarioReglas;
  expiracion: { expirado: boolean; fechaProgramada?: string | null; referenciaId?: string | null };
}

/** Control antropométrico con fecha de evaluación en calendario. */
export interface ControlAntropometricoReglas {
  alumnoId: string;
  fechaEvaluacion: string;
}

/** Aviso previo en bandeja para idempotencia por medianoche local. */
export interface AvisoBandejaReglas {
  usuarioId: string;
  createdAtUtc: Date | string;
}

/** Aviso previo en bandeja del coach por referencia determinista. */
export interface AvisoReferenciaReglas {
  usuarioId: string;
  referenciaId: string | null;
}

/** Día programado con hora local del recordatorio (06:00). */
export function filtrarCandidatosRecordatorio(
  alumnos: AlumnoCalendarioReglas[],
  ahora: Date
): CandidatoRecordatorioReglas[] {
  return alumnos
    .map((alumno) => ({
      alumno,
      recordatorio: evaluarRecordatorioAntropometria({
        periodicidad: alumno.periodicidad,
        antropometriaInicio: alumno.inicio,
        timezone: alumno.timezone,
        ahora,
      }),
    }))
    .filter(({ recordatorio }) => recordatorio.corresponde && recordatorio.fechaProgramada);
}

/** Rango global inclusivo de fechas de control y piso global de avisos. */
export function calcularRangoGlobalRecordatorio(candidatos: CandidatoRecordatorioReglas[]): {
  desdeGlobal: string;
  hastaGlobal: string;
  inicioAvisoGlobalUtc: Date;
} {
  const desdeGlobal = candidatos
    .map(({ recordatorio }) => fechaAnteriorYyyyMmDd(recordatorio.fechaProgramada!, 1))
    .sort()[0];
  const hastaGlobal = candidatos
    .map(({ recordatorio }) => sumarDiasCalendario(recordatorio.fechaProgramada!, 1))
    .sort()
    .at(-1)!;
  const inicioAvisoGlobalUtc = new Date(
    Math.min(
      ...candidatos.map(({ alumno, recordatorio }) =>
        instanteUtcDesdeMedianocheLocal(recordatorio.fechaProgramada!, alumno.timezone).getTime()
      )
    )
  );
  return { desdeGlobal, hastaGlobal, inicioAvisoGlobalUtc };
}

/** Ventana de 48 h de cada fecha programada: [D-1, D+1] en calendario. */
export function ventanaRecordatorio(fechaProgramada: string): {
  desdeVentana: string;
  hastaVentana: string;
} {
  return {
    desdeVentana: fechaAnteriorYyyyMmDd(fechaProgramada, 1),
    hastaVentana: sumarDiasCalendario(fechaProgramada, 1),
  };
}

/** Indica si el alumno registró control dentro de su ventana de 48 h. */
export function tieneReporteEnVentana(
  controles: ControlAntropometricoReglas[],
  alumnoId: string,
  desdeVentana: string,
  hastaVentana: string
): boolean {
  return controles.some(
    (control) =>
      control.alumnoId === alumnoId &&
      control.fechaEvaluacion >= desdeVentana &&
      control.fechaEvaluacion <= hastaVentana
  );
}

/** Instante UTC de la medianoche local de la fecha programada, en milisegundos. */
export function inicioAvisoLocalMs(fechaProgramada: string, timezone: string | null): number {
  return instanteUtcDesdeMedianocheLocal(fechaProgramada, timezone).getTime();
}

/** Indica si el aviso del día ya quedó en la bandeja desde la medianoche local. */
export function tieneAvisoDesdeMedianoche(
  avisosPrevios: AvisoBandejaReglas[],
  usuarioId: string,
  inicioAvisoLocalMs: number
): boolean {
  return avisosPrevios.some((aviso) => {
    if (aviso.usuarioId !== usuarioId) return false;
    const creado = new Date(aviso.createdAtUtc);
    return !Number.isNaN(creado.getTime()) && creado.getTime() >= inicioAvisoLocalMs;
  });
}

/** Remotos con la última fecha programada ya vencida sin medición. */
export function filtrarCandidatosExpiracion(
  alumnos: AlumnoCalendarioReglas[],
  ahora: Date
): CandidatoExpiracionReglas[] {
  return alumnos
    .filter((alumno) => alumno.modalidad === Modalidad.REMOTO)
    .map((alumno) => ({
      alumno,
      expiracion: evaluarExpiracionAntropometria({
        alumnoId: alumno.usuarioId,
        periodicidad: alumno.periodicidad,
        antropometriaInicio: alumno.inicio,
        timezone: alumno.timezone,
        ahora,
      }),
    }))
    .filter(({ expiracion }) => expiracion.expirado && expiracion.fechaProgramada);
}

/** Cota inferior global de ventanas vencidas: cada fecha D abre en D-1. */
export function calcularDesdeGlobalExpiracion(candidatos: CandidatoExpiracionReglas[]): string {
  return candidatos
    .map(({ expiracion }) => fechaAnteriorYyyyMmDd(expiracion.fechaProgramada!, 1))
    .sort()[0];
}

/** Inicio de la ventana de expiración: cada fecha D abre en D-1. */
export function inicioVentanaExpiracion(fechaProgramada: string): string {
  return fechaAnteriorYyyyMmDd(fechaProgramada, 1);
}

/** Indica si existe medición desde que abrió la ventana de la fecha. */
export function tieneMedicionDesde(
  controles: ControlAntropometricoReglas[],
  alumnoId: string,
  desdeVentana: string
): boolean {
  return controles.some(
    (control) => control.alumnoId === alumnoId && control.fechaEvaluacion >= desdeVentana
  );
}

/** Indica si el aviso de esa fecha ya quedó en la bandeja del coach. */
export function avisoExpiracionYaEmitido(
  avisosPrevios: AvisoReferenciaReglas[],
  coachId: string,
  referenciaId: string
): boolean {
  return avisosPrevios.some(
    (aviso) => aviso.usuarioId === coachId && aviso.referenciaId === referenciaId
  );
}

/** Nombre visible del alumno sin espacios en los bordes. */
export function nombreCompleto(nombres: string, apellidos: string): string {
  return `${nombres} ${apellidos}`.trim();
}
