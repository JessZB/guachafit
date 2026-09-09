---
name: GUACHAFIT
description: Plataforma integral de alto rendimiento para atletas y entrenadores con operativa offline-first y control bimonetario
colors:
  background-dark: "#11161f"
  card-dark: "#18202c"
  popover-dark: "#202938"
  secondary-dark: "#252e3e"
  muted-dark: "#222937"
  text-primary-dark: "#e2e8f0"
  text-muted-dark: "#8b9cb0"
  border-dark: "#2d3749"
  primary: "#1cd38d"
  primary-foreground: "#0f172a"
  destructive: "#f43f5e"
  warning: "#f59e0b"
  background-light: "#f4f6f9"
  card-light: "#ffffff"
  text-primary-light: "#131a26"
  text-muted-light: "#627084"
  border-light: "#d5dde6"
typography:
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "16px"
  full: "9999px"
---

# Design System: Athletic Slate

## Overview
GUACHAFIT utiliza la dirección visual **Athletic Slate**: una atmósfera deportiva de alta precisión técnica, inspirada en dispositivos de rendimiento atlético (Whoop, Strava Summit, Apple Fitness+), diseñada para eliminar completamente la fatiga visual provocada por negros absolutos y blancos cegadores.

El diseño se estructura sobre niveles de elevación tonal (*slate profundo con tinte frío al 20-25% de saturación*), bordes limpios translúcidos, tipografía perla relajada y un acento esmeralda/menta de alto impacto para la ejecución del entrenamiento.

## Colors

### Dark Mode (Atmósfera Principal)
- **Canvas / Background (`#11161f` / `hsl(222, 22%, 8.5%)`):** Fondo inmersivo gris pizarra frío. Erradica el negro absoluto `#000000` / `#09090b` que produce fatiga en sesiones prolongadas.
- **Card Surface (`#18202c` / `hsl(222, 20%, 12.5%)`):** Contenedores de series, módulos de tarjetas de alumno y métricas. Emerge suavemente sobre el canvas.
- **Popover / Dialog (`#202938` / `hsl(222, 20%, 16%)`):** Modales, drawers táctiles y menús flotantes. Mayor proximidad espacial.
- **Secondary / Chip (`#252e3e` / `hsl(222, 18%, 18%)`):** Badges, botones secundarios y áreas de control táctil.
- **Text Principal (`#e2e8f0` / `hsl(214, 32%, 91%)`):** Blanco perla/tiza frío. Máxima legibilidad WCAG AAA sin halo de deslumbramiento.
- **Text Muted / Secundario (`#8b9cb0` / `hsl(215, 18%, 62%)`):** Gris pizarra medio. Permite jerarquía clara en labels, subtítulos y datos técnicos secundarios.
- **Primary Accent (`#1cd38d` / `hsl(158, 72%, 46%)`):** Verde esmeralda atlético de alta energía para botones de acción, series completadas y rachas.
- **Primary Foreground (`#0f172a` / `hsl(222, 47%, 11%)`):** Texto pizarra oscuro sobre fondo primario para legibilidad y contraste nítido.
- **Border (`#2d3749` / `hsl(222, 16%, 22%)`):** Delimitadores estructurales finos.

### Light Mode (Modo Diurno Ergonómico)
- **Canvas (`#f4f6f9` / `hsl(216, 28%, 97%)`):** Fondo gris frío relajante, nunca blanco absoluto deslumbrante (`#ffffff`).
- **Cards (`#ffffff`):** Tarjetas blancas limpias con bordes definidos `#d5dde6`.
- **Text Principal (`#131a26` / `hsl(222, 35%, 12%)`):** Azul pizarra oscuro para lectura confortable sin negro puro.

## Typography
- **Fuente de Interfaz:** `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Fuente de Datos Numéricos:** `ui-monospace, monospace`. Utilizada obligatoriamente para pesos (kg), repeticiones, RPE, porcentajes, montos monetarios (USD/VES) y cronómetros de descanso.
- **Escala de Pesos:**
  - `font-black` (900): Títulos de página y cifras maestras de KPI.
  - `font-bold` (700): Nombres de ejercicios y estados.
  - `font-semibold` (600): Inputs numéricos y etiquetas táctiles.
  - `font-normal` (400): Descripciones y notas del coach.

## Layout
- **Athlete View (Móvil First):** Flujo vertical en una sola columna centrada (`max-w-xl`), con barra de navegación inferior fija (`BottomNav`) para uso táctil con una mano durante el entrenamiento.
- **Coach View (Desktop / Tablet):** Layout de dos paneles con `Sidebar` colapsable y área de datos densa (`max-w-6xl`) para análisis de cartera, listas de alumnos y conciliación rápida.

## Elevation & Depth
- **Filosofía Tonal sobre Sombras:** La profundidad no se logra con sombras negras agresivas, sino mediante la progresión tonal del slate: `Canvas (#11161f)` $\rightarrow$ `Card (#18202c)` $\rightarrow$ `Popover (#202938)`.
- **Bordes Translúcidos:** Uso de bordes sutiles `border-border/60` o `border-border/80` para definir el perímetro de las tarjetas con precisión técnica.

## Shapes
- **Radio Base (`--radius: 0.875rem` / 14px):**
  - Tarjetas principales: `rounded-2xl` (16px) o `rounded-3xl` (24px) en banners hero.
  - Botones de acción y celdas de series: `rounded-xl` (12px) a `rounded-2xl`.
  - Badges de estado y chips de conectividad: `rounded-full` (completamente redondeados).

## Components

### Checklist de Series (Atleta)
- Las series pendientes usan fondo neutro elevado con borde de contraste y texto mono.
- Al completarse, la fila o botón transiciona a `bg-primary` con texto `text-primary-foreground`, disparando el cronómetro de descanso sin recargas ni bloqueos de red.

### Badges de Estado
- **Completada / Verificada:** `bg-emerald-500/15 text-emerald-400 border border-emerald-500/25`.
- **En Progreso / Pendiente:** `bg-primary/15 text-primary border border-primary/25`.
- **Alerta / Mora:** `bg-amber-500/15 text-amber-400 border border-amber-500/25`.
- **Rechazado / Error:** `bg-destructive/15 text-destructive border border-destructive/25`.

## Do's and Don'ts

### Do's
- **Sí** usar grises pizarra templados (`#11161f`, `#18202c`) para crear profundidad y evitar la fatiga ocular.
- **Sí** usar `font-mono` para toda métrica numérica, series de ejercicios, tasas cambiarias y montos de dinero.
- **Sí** reservar el verde esmeralda primario (`#1cd38d`) para el 5-10% de la pantalla (acciones prioritarias y confirmaciones).
- **Sí** mantener áreas táctiles de mínimo 44x44px para alumnos operando con guantes o dedos sudorosos en el gimnasio.

### Don'ts
- **No** usar `#000000` o `#09090b` puro para fondos, ni `#ffffff` puro para textos en modo oscuro.
- **No** utilizar sombras negras pesadas o desenfoques borrosos que ensucien la interfaz.
- **No** usar colores chillones o gradientes agresivos en contenedores de datos; la sobriedad técnica es la clave.
