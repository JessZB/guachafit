import { describe, it, expect, vi } from 'vitest';
import { keepPreviousData } from '@tanstack/react-query';
import {
  construirClavePaginada,
  construirOpcionesConsultaPaginada,
  type PaginaServidor,
} from './use-paginacion-servidor';

interface Fila {
  id: string;
}

describe('usePaginacionServidor (WU25a: contrato de la paginación con TanStack Query)', () => {
  describe('construirClavePaginada', () => {
    it('compone [clave, pagina, tamano] con clave simple', () => {
      expect(construirClavePaginada('alumnos', 2, 25)).toEqual(['alumnos', 2, 25]);
    });

    it('admite claves compuestas para incluir los filtros activos', () => {
      expect(construirClavePaginada(['directorio-alumnos', 'ana', 'activo'], 1, 50)).toEqual([
        'directorio-alumnos',
        'ana',
        'activo',
        1,
        50,
      ]);
    });
  });

  describe('construirOpcionesConsultaPaginada', () => {
    it('usa placeholderData keepPreviousData para no parpadear al cambiar de página', () => {
      const opciones = construirOpcionesConsultaPaginada<Fila>({
        clave: 'monitor',
        pagina: 3,
        tamano: 10,
        cargar: vi.fn(),
      });

      expect(opciones.queryKey).toEqual(['monitor', 3, 10]);
      expect(opciones.placeholderData).toBe(keepPreviousData);
      expect(opciones.enabled).toBe(true);
    });

    it('respeta habilitado=false para suspender la consulta', () => {
      const opciones = construirOpcionesConsultaPaginada<Fila>({
        clave: 'monitor',
        pagina: 1,
        tamano: 25,
        cargar: vi.fn(),
        habilitado: false,
      });

      expect(opciones.enabled).toBe(false);
    });

    it('la queryFn delega pagina/tamano/signal a la función cargar de la pantalla', async () => {
      const respuesta: PaginaServidor<Fila> = { items: [{ id: 'a1' }], total: 42 };
      const cargar = vi.fn().mockResolvedValue(respuesta);
      const controller = new AbortController();

      const opciones = construirOpcionesConsultaPaginada<Fila>({
        clave: ['directorio', 'ana'],
        pagina: 2,
        tamano: 10,
        cargar,
      });

      const data = await opciones.queryFn({ signal: controller.signal });

      expect(cargar).toHaveBeenCalledTimes(1);
      expect(cargar).toHaveBeenCalledWith({ pagina: 2, tamano: 10, signal: controller.signal });
      expect(data).toBe(respuesta);
    });

    it('conserva el payload extendido del servidor (resumen del directorio/monitor)', async () => {
      const cargar = vi.fn().mockResolvedValue({
        items: [{ id: 'a1' }],
        total: 1,
        resumen: { total: 7, activos: 6, archivados: 1 },
      });

      const opciones = construirOpcionesConsultaPaginada<Fila, PaginaServidor<Fila> & { resumen: unknown }>({
        clave: 'directorio',
        pagina: 1,
        tamano: 25,
        cargar,
      });

      const data = await opciones.queryFn({ signal: new AbortController().signal });
      expect(data.resumen).toEqual({ total: 7, activos: 6, archivados: 1 });
    });
  });
});
