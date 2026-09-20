/**
 * WU19: resumen de la cartera del directorio de alumnos.
 *
 * El servidor entrega `resumen` con COUNT reales (cartera completa, sin importar la página
 * cargada). Este helper replica la MISMA semántica para:
 * - el modo demo (roster local, cero llamadas API), y
 * - el respaldo cuando una respuesta no trae `resumen` (defensa ante cachés previas).
 *
 * WU25a: `filtrarDirectorioDemo` replica además los filtros server-side (q, estado, modalidad,
 * archivados y mora) sobre el roster demo, para que la paginación demo use el mismo flujo.
 *
 * WU26: `ROSTER_DEMO_DIRECTORIO` (15 perfiles, más de una página de 10) vive aquí para que el
 * directorio demo pueda paginar de verdad y para testear su coherencia sin montar la página.
 */
import {
  EstadoAlumno,
  Modalidad,
  TipoDocumento,
  type PerfilAlumnoDetalleDTO,
  type ResumenDirectorioAlumnosDTO,
} from '@guachafit/shared';
import { normalizarTextoBusqueda } from './texto-busqueda';

/**
 * WU26: roster del modo demo del directorio. Es la fuente local de verdad del directorio en demo:
 * se filtra con `filtrarDirectorioDemo` (misma semántica que los parámetros del servidor) y se
 * pagina con `rebanarPagina`, sin ninguna llamada API.
 *
 * Coherencia entre pantallas del modo demo: los ids `al-00X` y los nombres son los del roster del
 * monitor de adherencia (`demo-monitor-adherencia.ts`) y del dashboard; `AlumnoDetallePage`
 * hidrata fixtures para cualquier id, así que el enlace al expediente funciona para todos.
 */
export const ROSTER_DEMO_DIRECTORIO: PerfilAlumnoDetalleDTO[] = [
  {
    id: 'al-001',
    usuarioId: 'u-001',
    entrenadorId: 'coach-01',
    nombres: 'Carlos Alberto',
    apellidos: 'Mendoza Silva',
    email: 'carlos.mendoza@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '24123456',
    fechaNacimiento: '1998-05-14',
    edadCalculada: 28,
    telefonoWhatsapp: '+584121234567',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Presencial Completo',
    semaforoPago: 'al_dia',
    fichaSaludPrivada: 'Cirugía de rodilla en 2022. Evitar sentadilla pesada.',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-002',
    usuarioId: 'u-002',
    entrenadorId: 'coach-01',
    nombres: 'Mariana',
    apellidos: 'Pérez Gómez',
    email: 'mariana.perez@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '26987654',
    fechaNacimiento: '2001-11-20',
    edadCalculada: 24,
    telefonoWhatsapp: '+584149876543',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Asesoría Online',
    semaforoPago: 'por_vencer',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-003',
    usuarioId: 'u-003',
    entrenadorId: 'coach-01',
    nombres: 'Roberto',
    apellidos: 'Díaz Navarro',
    email: 'roberto.diaz@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '20112233',
    fechaNacimiento: '1992-03-15',
    edadCalculada: 34,
    telefonoWhatsapp: '+584241122334',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
    planActivoNombre: 'Presencial 3 Días',
    semaforoPago: 'moroso',
    fichaSaludPrivada: 'Esguince tobillo derecho en pausa',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-004',
    usuarioId: 'u-004',
    entrenadorId: 'coach-01',
    nombres: 'Valeria',
    apellidos: 'Silva Castillo',
    email: 'valeria.silva@email.com',
    tipoDocumento: TipoDocumento.E,
    numeroDocumento: '84992211',
    fechaNacimiento: '1999-08-10',
    edadCalculada: 27,
    telefonoWhatsapp: '+584165544332',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
    planActivoNombre: 'Online Nutrición',
    semaforoPago: 'sin_cuota',
    deletedAtUtc: '2026-06-01T00:00:00.000Z',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-005',
    usuarioId: 'u-005',
    entrenadorId: 'coach-01',
    nombres: 'Andrés',
    apellidos: 'Silva',
    email: 'andres.silva@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '17555443',
    fechaNacimiento: '1989-02-07',
    edadCalculada: 37,
    telefonoWhatsapp: '+584141112233',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    // Sin rutina activa: el monitor lo muestra como "Sin plan".
    planActivoNombre: null,
    semaforoPago: 'sin_cuota',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-006',
    usuarioId: 'u-006',
    entrenadorId: 'coach-01',
    nombres: 'Elena',
    apellidos: 'Gómez',
    email: 'elena.gomez@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '19222334',
    fechaNacimiento: '1995-06-22',
    edadCalculada: 31,
    telefonoWhatsapp: '+584151223344',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Plan Trimestral Online',
    semaforoPago: 'al_dia',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-007',
    usuarioId: 'u-007',
    entrenadorId: 'coach-01',
    nombres: 'Luis Fernando',
    apellidos: 'Rojas',
    email: 'luis.rojas@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '20333445',
    fechaNacimiento: '1993-10-03',
    edadCalculada: 32,
    telefonoWhatsapp: '+584161334455',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Presencial 5 Días',
    semaforoPago: 'por_vencer',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-008',
    usuarioId: 'u-008',
    entrenadorId: 'coach-01',
    nombres: 'Gabriela',
    apellidos: 'Torres',
    email: 'gabriela.torres@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '22444556',
    fechaNacimiento: '1997-12-01',
    edadCalculada: 28,
    telefonoWhatsapp: '+584171445566',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Asesoría Online',
    semaforoPago: 'al_dia',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-009',
    usuarioId: 'u-009',
    entrenadorId: 'coach-01',
    nombres: 'Daniela',
    apellidos: 'Ríos Peña',
    email: 'daniela.rios@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '23555667',
    fechaNacimiento: '1996-04-18',
    edadCalculada: 30,
    telefonoWhatsapp: '+584181556677',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Presencial Completo',
    semaforoPago: 'moroso',
    fichaSaludPrivada: 'Molestia lumbar recurrente; evitar peso muerto pesado.',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-010',
    usuarioId: 'u-010',
    entrenadorId: 'coach-01',
    nombres: 'Jorge',
    apellidos: 'Ramírez León',
    email: 'jorge.ramirez@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '24666778',
    fechaNacimiento: '1991-09-27',
    edadCalculada: 35,
    telefonoWhatsapp: '+584191667788',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Plan Mensual Online',
    semaforoPago: 'por_vencer',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-011',
    usuarioId: 'u-011',
    entrenadorId: 'coach-01',
    nombres: 'Sofía',
    apellidos: 'Herrera Blanco',
    email: 'sofia.herrera@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '25777889',
    fechaNacimiento: '2000-07-09',
    edadCalculada: 26,
    telefonoWhatsapp: '+584121778899',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.INACTIVO_PAUSADO,
    planActivoNombre: 'Presencial 3 Días',
    semaforoPago: 'sin_cuota',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-012',
    usuarioId: 'u-012',
    entrenadorId: 'coach-01',
    nombres: 'Miguel Ángel',
    apellidos: 'Contreras',
    email: 'miguel.contreras@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '26888990',
    fechaNacimiento: '1994-01-30',
    edadCalculada: 32,
    telefonoWhatsapp: '+584131889900',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Presencial Completo',
    semaforoPago: 'al_dia',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-013',
    usuarioId: 'u-013',
    entrenadorId: 'coach-01',
    nombres: 'Lucía',
    apellidos: 'Fernández Ríos',
    email: 'lucia.fernandez@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '27999001',
    fechaNacimiento: '2002-03-12',
    edadCalculada: 24,
    telefonoWhatsapp: '+584141990011',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Asesoría Online',
    semaforoPago: 'al_dia',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-014',
    usuarioId: 'u-014',
    entrenadorId: 'coach-01',
    nombres: 'Tomás',
    apellidos: 'Aguirre Salas',
    email: 'tomas.aguirre@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '28100112',
    fechaNacimiento: '1988-11-25',
    edadCalculada: 37,
    telefonoWhatsapp: '+584151001122',
    modalidad: Modalidad.PRESENCIAL,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Presencial 4 Días',
    semaforoPago: 'por_vencer',
    createdAtUtc: new Date().toISOString(),
  },
  {
    id: 'al-015',
    usuarioId: 'u-015',
    entrenadorId: 'coach-01',
    nombres: 'Camila',
    apellidos: 'Navarro Reyes',
    email: 'camila.navarro@email.com',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: '29211223',
    fechaNacimiento: '1999-05-06',
    edadCalculada: 27,
    telefonoWhatsapp: '+584161112233',
    modalidad: Modalidad.REMOTO,
    estadoActivacion: EstadoAlumno.ACTIVO,
    planActivoNombre: 'Plan Mensual Online',
    semaforoPago: 'moroso',
    createdAtUtc: new Date().toISOString(),
  },
];

export function calcularResumenDirectorio(
  alumnos: readonly PerfilAlumnoDetalleDTO[]
): ResumenDirectorioAlumnosDTO {
  const resumen: ResumenDirectorioAlumnosDTO = {
    total: alumnos.length,
    activos: 0,
    pausados: 0,
    morosos: 0,
    presenciales: 0,
    remotos: 0,
    archivados: 0,
  };

  for (const alumno of alumnos) {
    // Los archivados solo cuentan en `total` y `archivados` (igual que la API).
    if (alumno.deletedAtUtc) {
      resumen.archivados += 1;
      continue;
    }
    if (alumno.estadoActivacion === EstadoAlumno.ACTIVO) resumen.activos += 1;
    if (alumno.estadoActivacion === EstadoAlumno.INACTIVO_PAUSADO) resumen.pausados += 1;
    if (alumno.modalidad === Modalidad.PRESENCIAL) resumen.presenciales += 1;
    if (alumno.modalidad === Modalidad.REMOTO) resumen.remotos += 1;
    if (alumno.semaforoPago === 'moroso') resumen.morosos += 1;
  }

  return resumen;
}

export type FiltroEstadoDirectorio =
  | 'todos'
  | 'activo'
  | 'pausado'
  | 'mora'
  | 'archivados';
export type FiltroModalidadDirectorio = 'todas' | 'presencial' | 'remoto';

export interface FiltrosDirectorioDemo {
  q?: string;
  estado?: FiltroEstadoDirectorio;
  modalidad?: FiltroModalidadDirectorio;
}

/**
 * Filtros del directorio en modo demo, con la MISMA semántica que los parámetros del servidor:
 * - `todos`: cartera completa (`incluirArchivados=true`), vigentes + archivados.
 * - `activo`/`pausado`: solo vigentes con ese estado (`estado=`).
 * - `mora`: solo vigentes con `semaforoPago === 'moroso'` (`semaforoPago=moroso`).
 * - `archivados`: solo bajas lógicas (`soloArchivados=true`).
 * - `q`: nombre/apellido/correo/documento, sin distinguir mayúsculas ni acentos.
 */
export function filtrarDirectorioDemo(
  alumnos: readonly PerfilAlumnoDetalleDTO[],
  filtros: FiltrosDirectorioDemo = {}
): PerfilAlumnoDetalleDTO[] {
  const termino = normalizarTextoBusqueda(filtros.q);
  const estado = filtros.estado ?? 'todos';
  const modalidad = filtros.modalidad ?? 'todas';

  return alumnos.filter((alumno) => {
    if (estado === 'archivados') {
      if (!alumno.deletedAtUtc) return false;
    } else if (estado !== 'todos') {
      if (alumno.deletedAtUtc) return false;
      if (estado === 'activo' && alumno.estadoActivacion !== EstadoAlumno.ACTIVO) return false;
      if (estado === 'pausado' && alumno.estadoActivacion !== EstadoAlumno.INACTIVO_PAUSADO) {
        return false;
      }
      if (estado === 'mora' && alumno.semaforoPago !== 'moroso') return false;
    }

    if (modalidad === 'presencial' && alumno.modalidad !== Modalidad.PRESENCIAL) return false;
    if (modalidad === 'remoto' && alumno.modalidad !== Modalidad.REMOTO) return false;

    if (termino.length === 0) return true;
    return [alumno.nombres, alumno.apellidos, alumno.email ?? '', alumno.numeroDocumento].some(
      (valor) => normalizarTextoBusqueda(valor).includes(termino)
    );
  });
}

