---
id: ADR-004
titulo: "ADR-004: Adopción de PWA Instalable Offline-First con IndexedDB y Compresión de Imágenes en Cliente"
fecha: 2026-09-06
estado: implementado
fecha_verificacion: 2026-09-21
decisores:
  - "Tech Lead & Principal Software Architect"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - frontend
  - offline-first
  - pwa
---

# ADR-004: Adopción de PWA Instalable Offline-First con IndexedDB y Compresión de Imágenes en Cliente

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La experiencia del usuario en **GUACHAFIT** tiene lugar primariamente dentro de gimnasios, boxes de entrenamiento y salas de pesas. Estos entornos presentan desafíos operativos severos:
1. **Conectividad Intermitente o Nula:** Estructuras subterráneas, jaulas de hormigón armado y masificación de usuarios generan caídas recurrentes de señal 4G/5G y redes Wi-Fi saturadas.
2. **Sensibilidad a la Interrupción:** El alumno ejecuta series con tiempos de descanso cronometrados (60-90 segundos). Si al pulsar el checklist de una serie (`RF-001`) la interfaz se congela o muestra un spinner de red, se destruye la adherencia y la experiencia de uso.
3. **Carga Multimedia sin Sobrecargar la Red (`RNF-001`):** Las cámaras de teléfonos actuales capturan imágenes de 10 a 20 MB. Subir fotos crudas de platos (`RF-002`) y controles corporales (`RF-003`) colapsaría el ancho de banda del usuario y los tiempos de respuesta del sistema.
4. **Time-to-Market y Costos de Operación para el MVP:** El desarrollo simultáneo de dos bases de código nativas (iOS en Swift y Android en Kotlin) o la gestión de pipelines de compilación móvil con aprobación de tiendas (App Store / Play Store) añade semanas de retraso y costos fijos de suscripción (\$99/año Apple, \$25 Google).

### Opciones Consideradas
1. **Opción A (Aplicación Móvil Híbrida Nativa con React Native / Expo):** Excelente rendimiento offline y acceso nativo a sensores, pero requiere compilar binarios móviles, gestionar cuentas de tiendas y mantener una versión web separada para el dashboard del entrenador.
2. **Opción B (Aplicación en Flutter):** Muy buen rendimiento gráfico, pero introduce un lenguaje adicional (Dart) ajeno al stack de TypeScript y duplica el esfuerzo de desarrollo web para el módulo administrativo.
3. **Opción C (Progressive Web App - PWA Instalable con Service Workers, IndexedDB y Web Workers):** Un solo código base en **React 19 + TypeScript + Vite + Tailwind CSS**, instalable en pantalla de inicio (Add to Home Screen / WebAPK), con persistencia local en **IndexedDB (Dexie.js)** y compresión en cliente vía **OffscreenCanvas / Web Workers**.

---

## 3. Decisión
Elegimos la **Opción C: PWA Instalable con Enfoque Offline-First**:

```
[Usuario en Gimnasio / Sin Señal]
  │
  ├── 1. Tilda Serie / Completa Check-in
  │     │ (Mutación Optimista Instantánea < 16ms)
  │     ▼
  ├── 2. Persistencia Inmediata en Local Cache
  │     │ Dexie.js / IndexedDB ("offline-first ledger")
  │     ▼
  └── 3. Encolamiento en "MutationSyncQueue"
        │
[Recuperación de Señal / Red Online]
  │
  ├── 4. Background Sync Listener (TanStack Query + Workbox)
  │     │ Despacha peticiones POST/PUT pendientes con Idempotency-Key
  │     ▼
  └── 5. Consolidación en PostgreSQL
```

### Detalles de la Implementación
1. **Capa de Persistencia Local:** Se utiliza **Dexie.js** sobre IndexedDB para almacenar la sesión activa de entrenamiento del día y una tabla `sync_mutations` que registra cada acción no sincronizada con un UUID determinista.
2. **Actualizaciones Optimistas:** TanStack Query v5 actualiza el estado en memoria de forma inmediata. Si la llamada HTTP falla por desconexión de red, la mutación queda retenida en IndexedDB y se reintenta automáticamente mediante `online` event listeners.
3. **Compresión Fotográfica Client-Side:** Antes de solicitar cualquier presigned URL a Cloudflare R2, la imagen capturada por `<input type="file" capture="environment">` o la cámara se procesa en un Web Worker utilizando `OffscreenCanvas`, reduciéndola a un blob `image/webp` con calidad 85% y dimensión máxima de 1920px (garantizando $< 600$ KB en $< 500$ ms, cumpliendo `RNF-001`).
4. **Sistema de Diseño y UI Kit (Tailwind CSS v4 + primitivas Radix):**
   - Motor de estilos CSS-first (**Tailwind CSS v4**) que acelera la compilación en Vite ($< 10$ ms HMR) y define tokens semánticos mediante directivas `@theme`.
   - Primitivas headless de **Radix UI** montadas directamente en el código (`DropdownMenu`, `Dialog`, `Tabs`, `Toast`, `Avatar`, `Slot`) e iconografía **Lucide**: menús y listas del entrenador (`RF-013`, ver [[ADR-013-paginacion-server-side-stack-listas]]) y diálogos/tabs accesibles. No se adoptaron el registry de `shadcn/ui`, los drawers `vaul` ni los toasts con `Sonner`.
5. **Temas Claro/Oscuro con Tokens Semánticos y Contraste AA:**
   - Detección automática del sistema operativo mediante media query `prefers-color-scheme: dark`.
   - Selector tri-estado (`system`, `dark`, `light`) con almacenamiento síncrono en `localStorage` (clave `guachafit-theme`) y script inline en `<head>` para prevenir parpadeos blancos (*Zero FOUC*).
   - Tokens semánticos en HSL para ambos temas: `:root` claro tipo "Athletic Slate" sobre lienzo suave (nunca blanco puro) y `.dark` oscuro por capas de elevación (nunca negro puro), con contraste AA medido en ambos y piso tipográfico de 11px. Prohibido usar paletas fijas sin variante de tema.
   - La columna `usuarios.tema_ui` existe en el esquema, pero la preferencia se persiste localmente; la sincronización cross-device no está implementada.
6. **Camino de Migración Nativa:** La arquitectura de la PWA desacopla la capa de presentación de los servicios de sincronización. Si a futuro se requiere distribución en Google Play o Apple App Store, la aplicación se envolverá en **Capacitor 6** sin necesidad de reescribir la lógica ni la UI.
7. **Resolución de Módulos Compartidos en Monorepo:** Para compatibilidad cruzada sin fricción entre Vite (ESM en browser) y NestJS (CommonJS en backend), `@guachafit/shared` implementa exportaciones condicionales (`import: ./src/index.ts` y `require: ./dist/index.js`) con alias explícito en `apps/web/vite.config.ts`, permitiendo HMR instantáneo y resolución directa de enums como `Rol`.

### Estado implementado (2026-09-21)

> Verificación de la Ola 4 "Vivencia PWA/Mobile/Desktop" (commits `9f121e5`, `e37c235`). Corrige y aterriza el detalle original de la decisión.

- **Temas y tokens:** la paleta fija (`zinc-950`, acentos hardcodeados) fue reemplazada por tokens semánticos HSL con variante claro/oscuro (`:root` / `.dark`) y contraste AA medido en ambos temas (501 usos migrados); piso tipográfico de 11px.
- **Stack real de UI:** Tailwind CSS v4 + primitivas Radix individuales (`DropdownMenu`, `Dialog`, `Tabs`, `Toast`, `Avatar`, `Slot`) + Lucide. No se usan `shadcn/ui`, `vaul` ni `Sonner`.
- **PWA instalable real:** `manifest` con `lang: es`, `display: standalone`, shortcuts ("Entrenar hoy", "Mi menú") y sin `orientation` forzada; iconos 192/512/maskable/apple reales y favicon SVG. A2HS con `beforeinstallprompt` en Android e instructivo manual en iOS Safari, oculto en modo standalone y con descarte persistente de 30 días.
- **Safe-areas y viewport:** `viewport-fit=cover` con zoom habilitado (sin `user-scalable=no` ni `maximum-scale`); utilidades `safe-area-pt/pb/content-pb` con `env()` y `min-h-dvh` en el layout.
- **Persistencia de almacenamiento:** `navigator.storage.persist()` best-effort al detectar sesión (login nuevo o restaurado), para proteger IndexedDB y la caché del Service Worker.
- **Actualizaciones y frescura offline:** SW en modo `prompt` (nada se aplica sin clic del usuario), chips de antigüedad de datos cacheados y logout con aviso de pendientes; decisión completa en [[ADR-014-actualizaciones-guiadas-sw-frescura-offline]].

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Cero Fricción de Despliegue:** Actualizaciones inmediatas y continuas (*over-the-air*) en producción sin esperar tiempos de revisión de Apple o Google.
- **Base de Código Unificada:** El entrenador accede desde su laptop o tablet y el alumno desde su teléfono móvil consumiendo exactamente la misma aplicación web responsiva.
- **Inmunidad a Micro-Cortes de Red:** El alumno puede completar un entrenamiento de 60 minutos en el sótano del gimnasio sin conexión; el sistema sincronizará todas las series al volver a conectarse.
- **Ahorro Masivo de Ancho de Banda y Almacenamiento:** Las imágenes llegan pre-optimizadas al bucket de Cloudflare R2 sin consumir CPU en el backend.

### Consecuencias Negativas (Trade-offs)
- **Limitaciones Históricas de iOS Safari:** En dispositivos iOS, las PWAs requieren que el usuario use *"Añadir a pantalla de inicio"* para habilitar Web Push Notifications (disponible desde iOS 16.4+).
- **Riesgo de Desalojo de Cache (Storage Eviction):** Si el dispositivo móvil entra en estado crítico de almacenamiento, el sistema operativo podría vaciar IndexedDB. *Mitigación implementada:* se solicita `navigator.storage.persist()` (best-effort, con guard por sesión) al detectar sesión activa; ver "Estado implementado (2026-09-21)".

---

## 5. Trazabilidad y Referencias
- **Problemas que resuelve:** [[PROB-001-adherencia-trazabilidad]]
- **Requerimientos asociados:**
  - [[RF-001-checklist-entrenamiento-diario]]
  - [[RF-002-nutricion-agil-reporte-rapido]]
  - [[RF-003-checkin-antropometrico-rbac-hibrido]]
  - [[RNF-001-almacenamiento-seguridad-fotos-progreso]]
- **Documento de Arquitectura:** [[01_Evaluacion_Stack_Tecnologico]]
