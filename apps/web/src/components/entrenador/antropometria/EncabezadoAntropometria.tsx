/**
 * Cabecera de `AntropometriaPage` con las pestañas de la vista.
 *
 * Las pestañas usan `BarraTabsSegmentada` (SEG-20): APG con flechas, Home/End, roving tabindex y
 * área táctil de 44px. Antes eran dos botones sueltos sin roles ni teclado. La página comparte
 * `CLAVES_PESTANAS_ANTROPOMETRIA` e `ID_BASE_PESTANAS_ANTROPOMETRIA` para enlazar sus paneles.
 */
import { Camera, ClipboardCheck, Columns2 } from "lucide-react";
import { DESTINOS_ENTRENADOR } from "../../../lib/etiquetas-dominio";
import { pluralizar } from "../../../lib/pluralizar";
import { useTabsAccesibles } from "../../../lib/use-tabs-accesibles";
import { BarraTabsSegmentada, type ItemTab } from "../../ui/BarraTabsSegmentada";

export type PestanaAntropometria = "pendientes" | "comparador";

export const CLAVES_PESTANAS_ANTROPOMETRIA: readonly PestanaAntropometria[] = [
  "pendientes",
  "comparador",
];

/** Base de los ids de tab/panel: la página la usa para enlazar `aria-labelledby`. */
export const ID_BASE_PESTANAS_ANTROPOMETRIA = "antropometria";

interface EncabezadoAntropometriaProps {
  pestanaActiva: PestanaAntropometria;
  totalPendientes: number;
  onCambiarPestana: (pestana: PestanaAntropometria) => void;
}

export function EncabezadoAntropometria({
  pestanaActiva,
  totalPendientes,
  onCambiarPestana,
}: EncabezadoAntropometriaProps) {
  const { propsTablist, propsTab } = useTabsAccesibles({
    claves: CLAVES_PESTANAS_ANTROPOMETRIA,
    activa: pestanaActiva,
    onActivar: onCambiarPestana,
    idBase: ID_BASE_PESTANAS_ANTROPOMETRIA,
  });

  const nombrePendientes = `Por revisar: ${pluralizar(totalPendientes, "pendiente", "pendientes")}`;
  const items: ItemTab<PestanaAntropometria>[] = [
    {
      clave: "pendientes",
      etiqueta: "Por revisar",
      icono: ClipboardCheck,
      ariaLabel: nombrePendientes,
      indicador: {
        texto: String(totalPendientes),
        ariaLabel: nombrePendientes,
        variante: "contador",
      },
    },
    { clave: "comparador", etiqueta: "Comparar", icono: Columns2 },
  ];

  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Camera className="h-4 w-4" />
            <span>Medidas y Fotos</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
            {DESTINOS_ENTRENADOR.evaluaciones.etiqueta}
          </h1>
          <p className="text-xs text-muted-foreground">
            Revisa las medidas y fotos de progreso que subieron tus alumnos.
          </p>
        </div>

        <div className="w-full sm:w-80">
          <BarraTabsSegmentada
            items={items}
            activa={pestanaActiva}
            propsTablist={propsTablist}
            propsTab={propsTab}
            ariaLabel="Secciones de evaluaciones"
          />
        </div>
      </div>
    </div>
  );
}
