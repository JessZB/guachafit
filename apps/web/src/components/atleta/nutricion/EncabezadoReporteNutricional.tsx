/**
 * Módulo 6 · Nutrición: encabezado "Reporte de hoy" (ÚNICO de vista).
 *
 * Extraído de `pages/atleta/NutricionPage.tsx` (SL2, fase B) sin cambios de textos ni clases.
 * §6: sin interactivos; título y misión de la pantalla.
 */
import { Utensils } from 'lucide-react';

export function EncabezadoReporteNutricional() {
  return (
    <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
      <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
        <Utensils className="h-4 w-4" />
        <span>Reporte de hoy</span>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
        Mi Comida de Hoy
      </h1>
      <p className="text-xs text-muted-foreground">
        Marca cómo te fue hoy en menos de 10 segundos.
      </p>
    </div>
  );
}
