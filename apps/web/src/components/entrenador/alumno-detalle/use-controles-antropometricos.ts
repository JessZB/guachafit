/**
 * Hook de controles antropométricos del alumno (N3, WU25b, WU26).
 *
 * Paginación manual descendente con el MISMO mecanismo que hoy (`apiClient` + estado local;
 * R9: sin TanStack ni `usePaginacionServidor`). Extraído de
 * `pages/entrenador/AlumnoDetallePage.tsx` (SL-5).
 *
 * La API devuelve la serie en orden cronológico ASCENDENTE y la tabla la muestra "más
 * reciente primero": el offset se calcula desde el final (`offsetPaginaDescendente`) y la
 * página se invierte al pintar. Un fallo muestra aviso visible, nunca una tabla vacía
 * pasando por "sin registros".
 */
import { useRef, useState } from 'react';
import type { ControlAntropometricoDetalleDTO, EvolucionCorporalDTO } from '@guachafit/shared';
import { apiClient } from '../../../lib/api-client';
import {
  calcularTotalPaginas,
  limitePaginaDescendente,
  offsetPaginaDescendente,
  rebanarPagina,
} from '../../../lib/paginacion';
import {
  controlesDemoAlumno,
  mapearControlAntro,
  TAMANO_PAGINA_FICHA,
  type ControlAntroFila,
} from '../../../lib/alumno-detalle-controles';

export interface ParametrosControlesAntropometricos {
  isDemoMode: boolean;
}

export function useControlesAntropometricos({ isDemoMode }: ParametrosControlesAntropometricos) {
  // Controles antropométricos reales del alumno. En modo demo se cargan fixtures locales;
  // en sesión real, sin dato => lista vacía (nunca mediciones inventadas). Los campos
  // opcionales pueden venir nulos de la API y la UI los muestra como "—".
  const [controlesAntro, setControlesAntro] = useState<ControlAntroFila[]>([]);
  // WU25b: paginación server-side de la tabla (`controlesLimit`/`controlesOffset` + total).
  // `controlesDemo` conserva los controles creados en modo demo para que sigan visibles al paginar.
  const [controlesDemo, setControlesDemo] = useState<ControlAntroFila[]>(() =>
    controlesDemoAlumno()
  );
  // W3: el peso de la franja es el control más reciente, no el de la página abierta. Solo cambia
  // al cargar la página 1 (o con la primera fila del demo); navegar a otras páginas no lo toca.
  const [controlMasReciente, setControlMasReciente] = useState<ControlAntroFila | null>(
    () => (isDemoMode ? (controlesDemoAlumno()[0] ?? null) : null)
  );
  const [controlesTotal, setControlesTotal] = useState(0);
  // N3: error honesto al re-consultar los controles reales del alumno (nunca lista "vaciada" en silencio).
  const [controlesErrorMsg, setControlesErrorMsg] = useState<string | null>(null);
  const [paginaControles, setPaginaControles] = useState(1);
  const [tamanoControles, setTamanoControles] = useState(TAMANO_PAGINA_FICHA);
  const [isCargandoControles, setIsCargandoControles] = useState(false);
  /**
   * Total cacheado de controles: permite pedir la página correcta de la serie ascendente en los
   * cambios de página sin una consulta sonda extra. Se invalida al crear un control.
   */
  const totalControlesRef = useRef<number | null>(null);

  const invalidarTotalControles = () => {
    totalControlesRef.current = null;
  };

  /**
   * WU25b: carga UNA página de controles antropométricos aprobados.
   *
   * La API devuelve la serie en orden cronológico ASCENDENTE y la tabla la muestra "más
   * reciente primero", así que el offset se calcula desde el final (`offsetPaginaDescendente`)
   * y la página se invierte al pintar. WU26: la ventana también recorta su límite
   * (`limitePaginaDescendente`): con el offset medido desde el final, la página parcial es la
   * ÚLTIMA y pedir siempre `tamano` filas repetiría las de la página anterior. La primera
   * consulta sin total cacheado trae la página más antigua y sirve de sonda del `controlesTotal`;
   * se repite cuando el total supera el tamaño de página y la ventana pedida no coincide con la
   * del sondeo (offset 0 + tamaño completo). En demo se corta `controlesDemo`. Devuelve false si
   * la llamada falla: el llamador conserva lo que ya tenía; nunca se inventan medidas.
   */
  const cargarControles = async (
    paginaSolicitada: number,
    tamanoSolicitado: number,
    alumnoUsuarioId: string,
    reintento = false
  ): Promise<boolean> => {
    setIsCargandoControles(true);
    try {
      if (isDemoMode) {
        setControlesAntro(rebanarPagina(controlesDemo, paginaSolicitada, tamanoSolicitado));
        if (paginaSolicitada === 1) setControlMasReciente(controlesDemo[0] ?? null);
        setControlesTotal(controlesDemo.length);
        setControlesErrorMsg(null);
        return true;
      }
      // WU26: la ventana descendente limita también la CANTIDAD de filas. La página parcial es
      // la ÚLTIMA (`min(tamano, total - filasPrevias)`); sin ese límite, el offset medido desde
      // el final traería filas ya mostradas en la página anterior.
      const consultar = (offset: number, limite: number) =>
        apiClient<EvolucionCorporalDTO>(
          `/antropometria/evolucion/${alumnoUsuarioId}?controlesLimit=${limite}&controlesOffset=${offset}`
        );
      const totalCacheado = totalControlesRef.current;
      let res = await consultar(
        totalCacheado !== null
          ? offsetPaginaDescendente(paginaSolicitada, tamanoSolicitado, totalCacheado)
          : 0,
        totalCacheado !== null
          ? limitePaginaDescendente(paginaSolicitada, tamanoSolicitado, totalCacheado)
          : tamanoSolicitado
      );
      const total = Number(res.controlesTotal ?? res.evaluaciones.length);
      if (totalCacheado === null && total > tamanoSolicitado) {
        const offsetReal = offsetPaginaDescendente(paginaSolicitada, tamanoSolicitado, total);
        const limiteReal = limitePaginaDescendente(paginaSolicitada, tamanoSolicitado, total);
        if (offsetReal !== 0 || limiteReal !== tamanoSolicitado) {
          res = await consultar(offsetReal, limiteReal);
        }
      }
      const filas = res.evaluaciones.map(mapearControlAntro).reverse();
      totalControlesRef.current = total;
      setControlesTotal(total);
      setControlesAntro(filas);
      if (paginaSolicitada === 1) setControlMasReciente(filas[0] ?? null);
      setControlesErrorMsg(null);
      const totalPaginas = calcularTotalPaginas(total, tamanoSolicitado);
      if (paginaSolicitada > totalPaginas && !reintento) {
        setPaginaControles(totalPaginas);
        void cargarControles(totalPaginas, tamanoSolicitado, alumnoUsuarioId, true);
      }
      return true;
    } catch {
      // N3: fallo honesto; se conserva lo ya cargado y la tabla lo advierte (nunca "sin registros").
      setControlesErrorMsg('No se pudieron cargar los controles antropométricos.');
      return false;
    } finally {
      setIsCargandoControles(false);
    }
  };

  const cambiarPaginaControles = (usuarioId: string | undefined, nuevaPagina: number) => {
    if (!usuarioId) return;
    setPaginaControles(nuevaPagina);
    void cargarControles(nuevaPagina, tamanoControles, usuarioId);
  };

  const cambiarTamanoControles = (usuarioId: string | undefined, nuevoTamano: number) => {
    if (!usuarioId) return;
    setTamanoControles(nuevoTamano);
    setPaginaControles(1);
    void cargarControles(1, nuevoTamano, usuarioId);
  };

  return {
    controlesAntro,
    setControlesAntro,
    controlesDemo,
    setControlesDemo,
    controlMasReciente,
    setControlMasReciente,
    controlesTotal,
    setControlesTotal,
    controlesErrorMsg,
    setControlesErrorMsg,
    paginaControles,
    setPaginaControles,
    tamanoControles,
    setTamanoControles,
    isCargandoControles,
    invalidarTotalControles,
    cargarControles,
    cambiarPaginaControles,
    cambiarTamanoControles,
  };
}

export type RetornoControlesAntropometricos = ReturnType<typeof useControlesAntropometricos>;
