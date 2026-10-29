/**
 * Pestañas de la ficha del alumno (wrapper de dominio sobre `BarraTabsSegmentada`).
 *
 * Las claves de `?tab=` no cambian (`resumen`, `finanzas`, `antropometria`, `entrenamiento`,
 * `nutricion`); solo cambian las etiquetas visibles (Perfil, Pagos, Medidas, Entrenos, Nutrición).
 * Extraída de `pages/entrenador/AlumnoDetallePage.tsx` (SL-2).
 *
 * Aporta solo el dominio: las cinco pestañas, sus iconos y el badge de deuda de Pagos, que se
 * anuncia como "Saldo pendiente N dólares" (sin símbolo y con dos decimales). La barra, su diseño
 * y sus atributos accesibles viven en `ui/BarraTabsSegmentada`.
 */
import { DollarSign, Dumbbell, Scale, User, Utensils } from 'lucide-react';
import type { TabFichaAlumno } from '../../../lib/alumno-detalle-tab';
import type { PropsTab, PropsTablist } from '../../../lib/use-tabs-accesibles';
import { BarraTabsSegmentada, type ItemTab } from '../../ui/BarraTabsSegmentada';

interface PestanasFichaAlumnoProps {
  activa: TabFichaAlumno;
  propsTablist: PropsTablist;
  propsTab: (clave: TabFichaAlumno) => PropsTab;
  /** Saldo pendiente total en USD; con deuda muestra el badge sobre Pagos. */
  saldoDeudaUsd: string | null;
}

export function PestanasFichaAlumno({
  activa,
  propsTablist,
  propsTab,
  saldoDeudaUsd,
}: PestanasFichaAlumnoProps) {
  const importeDeuda =
    saldoDeudaUsd !== null && Number(saldoDeudaUsd) > 0 ? Number(saldoDeudaUsd).toFixed(2) : null;
  const indicadorDeuda = importeDeuda
    ? { texto: `$${importeDeuda}`, ariaLabel: `Saldo pendiente ${importeDeuda} dólares` }
    : null;

  const items: ItemTab<TabFichaAlumno>[] = [
    { clave: 'resumen', etiqueta: 'Perfil', icono: User },
    { clave: 'finanzas', etiqueta: 'Pagos', icono: DollarSign, indicador: indicadorDeuda },
    { clave: 'antropometria', etiqueta: 'Medidas', icono: Scale },
    { clave: 'entrenamiento', etiqueta: 'Entrenos', icono: Dumbbell },
    { clave: 'nutricion', etiqueta: 'Nutrición', icono: Utensils },
  ];

  return (
    <BarraTabsSegmentada
      items={items}
      activa={activa}
      propsTablist={propsTablist}
      propsTab={propsTab}
      ariaLabel="Pestañas de la ficha del alumno"
    />
  );
}
