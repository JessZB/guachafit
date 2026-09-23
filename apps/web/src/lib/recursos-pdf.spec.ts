import { describe, it, expect } from 'vitest';
import { MetasNutricionalesSchema, UUID_REGEX } from '@guachafit/shared';
import {
  construirRecursosParaGuardar,
  esFilaRecursoVacia,
  filaRecursoVacia,
  LIMITE_RECURSOS_EDUCATIVOS,
  TAMANO_MAXIMO_PDF_BYTES,
  tieneFirmaPdf,
  validarArchivoPdf,
  type FilaRecursoFormulario,
} from './recursos-pdf';

const ALUMNO_ID = 'a1111111-1111-4111-8111-111111111111';
const UUID_PDF = 'b2222222-2222-4222-8222-222222222222';
const STORAGE_KEY_PDF = `nutricion-recursos/${ALUMNO_ID}/2026/${UUID_PDF}.pdf`;

function fila(parcial: Partial<FilaRecursoFormulario> = {}): FilaRecursoFormulario {
  return { ...filaRecursoVacia(), ...parcial };
}

describe('RF-002 RN-01: recursos PDF del coach (validación y payload)', () => {
  it('acepta un PDF con MIME y extensión correctos dentro del tamaño máximo', () => {
    expect(
      validarArchivoPdf({ name: 'lista.pdf', type: 'application/pdf', size: 1024 })
    ).toBeNull();
  });

  it('rechaza archivos que no son PDF (MIME o extensión) y los vacíos o gigantes', () => {
    expect(
      validarArchivoPdf({ name: 'foto.png', type: 'image/png', size: 1024 })
    ).toMatch(/PDF/);
    // Un archivo que se declara .pdf pero cuyo contenido es una imagen no pasa.
    expect(
      validarArchivoPdf({ name: 'disfraz.pdf', type: 'image/png', size: 1024 })
    ).toMatch(/PDF/);
    expect(
      validarArchivoPdf({ name: 'renombrado.pdf', type: '', size: 1024 })
    ).toBeNull();
    expect(
      validarArchivoPdf({ name: 'vacio.pdf', type: 'application/pdf', size: 0 })
    ).toMatch(/vacío/);
    expect(
      validarArchivoPdf({
        name: 'enorme.pdf',
        type: 'application/pdf',
        size: TAMANO_MAXIMO_PDF_BYTES + 1,
      })
    ).toMatch(/10 MB/);
  });

  it('verifica la firma real %PDF- del contenido, no solo la extensión', async () => {
    const pdfReal = new Blob(['%PDF-1.4\ncontenido'], { type: 'application/pdf' });
    const falso = new Blob(['esto no es un pdf'], { type: 'application/pdf' });

    await expect(tieneFirmaPdf(pdfReal)).resolves.toBe(true);
    await expect(tieneFirmaPdf(falso)).resolves.toBe(false);
  });

  it('construye el payload excluyente: URL externa o storageKey, nunca ambos, e ignora filas vacías', () => {
    const recursos = construirRecursosParaGuardar([
      fila(),
      fila({ titulo: 'Lista externa', url: ' https://demo.test/lista.pdf ' }),
      fila({ titulo: 'Guía subida', storageKey: STORAGE_KEY_PDF, nombreArchivo: 'guia.pdf' }),
      // Ambos presentes (p. ej. el coach pegó una URL tras subir): gana el archivo subido.
      fila({ titulo: 'Mixta', url: 'https://demo.test/x.pdf', storageKey: STORAGE_KEY_PDF }),
    ]);

    expect(recursos).toEqual([
      { titulo: 'Lista externa', url: 'https://demo.test/lista.pdf' },
      { titulo: 'Guía subida', storageKey: STORAGE_KEY_PDF },
      { titulo: 'Mixta', storageKey: STORAGE_KEY_PDF },
    ]);
    for (const recurso of recursos) {
      expect(Boolean(recurso.url && recurso.storageKey)).toBe(false);
    }
  });

  it('una fila con título pero sin fuente viaja sin fuente y el contrato compartido la rechaza', () => {
    const recursos = construirRecursosParaGuardar([fila({ titulo: 'Sin fuente' })]);
    expect(recursos).toEqual([{ titulo: 'Sin fuente' }]);

    const sinFuente = MetasNutricionalesSchema.safeParse({ recursos });
    expect(sinFuente.success).toBe(false);

    const conAmbas = MetasNutricionalesSchema.safeParse({
      recursos: [{ titulo: 'Ambas', url: 'https://demo.test/a.pdf', storageKey: STORAGE_KEY_PDF }],
    });
    expect(conAmbas.success).toBe(false);
  });

  it('el contrato compartido acepta el storageKey del módulo de recursos y su límite es 10', () => {
    expect(UUID_REGEX.test(ALUMNO_ID)).toBe(true);
    expect(LIMITE_RECURSOS_EDUCATIVOS).toBe(10);

    const valido = MetasNutricionalesSchema.safeParse({
      recursos: [{ titulo: 'Guía PDF', storageKey: STORAGE_KEY_PDF }],
    });
    expect(valido.success).toBe(true);

    const demasiados = MetasNutricionalesSchema.safeParse({
      recursos: Array.from({ length: LIMITE_RECURSOS_EDUCATIVOS + 1 }, (_, i) => ({
        titulo: `Recurso ${i}`,
        url: `https://demo.test/r${i}.pdf`,
      })),
    });
    expect(demasiados.success).toBe(false);
  });

  it('detecta filas completamente vacías (incluido el estado de subida)', () => {
    expect(esFilaRecursoVacia(fila())).toBe(true);
    expect(esFilaRecursoVacia(fila({ subiendo: true }))).toBe(false);
    expect(esFilaRecursoVacia(fila({ titulo: 'x' }))).toBe(false);
    expect(esFilaRecursoVacia(fila({ storageKey: STORAGE_KEY_PDF }))).toBe(false);
  });
});
