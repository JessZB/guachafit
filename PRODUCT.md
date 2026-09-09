# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Alumno / Atleta**: Entrena presencialmente o a distancia. Ejecuta rutinas de fuerza y acondicionamiento en gimnasios o boxes (frecuentemente con señal móvil deficiente o nula). Necesita consultar su rutina del día, registrar series, cargas y repeticiones durante descansos cortos (60-90s) sin bloqueos de red, reportar adherencia nutricional ágil (semáforo 1-tap y fotos de comidas), subir fotos y medidas corporales en ventanas autorizadas, y consultar su estado de cuenta/cuotas.
- **Entrenador / Coach**: Gestiona de 15 a 50+ alumnos simultáneos. Monitorea la adherencia real a rutinas y metas nutricionales, programa y audita evaluaciones antropométricas (presenciales validadas in situ; remotas aprobadas con flujo previo), y administra la cobranza bimonetaria de cuotas (catálogo con overrides individuales, deuda maestra en USD, liquidación de abonos en Bolívares o divisas a tasa congelada, y conciliación rápida de pagos).
- **Superadmin**: Administrador global de la plataforma con permisos de auditoría y soporte.

## Product Purpose

GUACHAFIT existe para resolver los dos cuellos de botella operativos críticos de los entrenadores y gimnasios:
1. **Pérdida de adherencia y trazabilidad de los alumnos**: Sustituir rutinas estáticas en PDF o mensajes de WhatsApp por un checklist interactivo offline-first con cálculo de sobrecarga progresiva y registro nutricional de micro-fricción.
2. **Caos de cobranza bimonetaria y morosidad**: Eliminar la pérdida de 15-20% del tiempo semanal del entrenador en conciliar transferencias bancarias de múltiples rieles (Pago Móvil, Zelle, efectivo, Binance), calcular conversiones cambiarias fluctuantes manualmente y gestionar cobros individuales.

El éxito significa que el alumno registra su progreso sin fricción técnica en cualquier gimnasio, y el coach mantiene control empírico de la evolución física y solidez de caja en tiempo real.

## Positioning

Frente a CRMs de fitness convencionales que asumen conectividad constante, monedas estables y planes rígidos, GUACHAFIT se posiciona como la **plataforma integral offline-first y motor financiero bimonetario**:
- Permite registrar el entrenamiento completo en el sótano del gimnasio sin conexión, sincronizando de forma transparente al recuperar red mediante cola idempotente.
- Ancla la deuda de membresía en USD y liquida abonos parciales o totales en Bolívares (VES) congelando la tasa pactada por transacción, con overrides personalizados por alumno y conciliación bancaria ágil.
- Implementa un modelo híbrido RBAC de antropometría que distingue mediciones certificadas por el coach de autoreportes remotos del alumno.

## Operating Context

- **Entornos físicos**: Salas de pesas, sótanos de gimnasio y boxes de crossfit con paredes de hormigón armado y conectividad celular 4G/5G intermitente o saturada; escritorio o tablet del entrenador para gestión administrativa y conciliación.
- **Herramientas reemplazadas**: PDFs enviados por chat, notas de voz, hojas de cálculo de Google Sheets, libretas de papel, capturas de pantalla de comprobantes de pago en WhatsApp, básculas caseras no calibradas.
- **Rituales de uso**:
  - *Diario*: Checklist interactivo durante el entrenamiento con descansos cronometrados; reporte nutricional 1-tap post-comida.
  - *Periódico (quincenal/mensual)*: Toma de fotos corporales y perímetros musculares; corte de cuotas de membresía con revisión de comprobantes en bandeja de conciliación.

## Capabilities and Constraints

- **Capacidades clave**:
  - Checklist interactivo de series con mutación optimista (<16ms) y persistencia local en Dexie.js (IndexedDB).
  - Nutrición ágil con metas de macronutrientes, semáforo diario 1-Tap y diario fotográfico.
  - Check-in antropométrico con control de roles (RBAC): mediciones presenciales verificadas directamente; mediciones remotas con flujo de aprobación previa.
  - Catálogo de planes con personalización individual (override de precio, beneficios y tasa acordada por cliente).
  - Motor de liquidación bimonetaria: deuda maestra en USD, cálculo de abonos en VES con tasa congelada por comprobante, y trazabilidad de saldos pendientes.
  - Bandeja de conciliación rápida para aprobación/rechazo de pagos (Pago Móvil, transferencias, efectivo, Zelle, Binance).
  - Tablero de control de cartera con métricas de morosidad en tiempo real y máquina de estados de cuota con recordatorios programados (T-5, T-1, T, T+2).
- **Restricciones técnicas**:
  - PWA instalable con Service Workers y Web Workers para compresión de imágenes client-side (<600 KB WebP).
  - Aritmética de punto fijo decimal sin errores de punto flotante en cálculos financieros y de conversión.
  - Timestamps universales en UTC para persistencia y sincronización distribuida.
  - Arquitectura monorepo con paquetes compartidos de tipos y contratos (`@guachafit/shared`).

## Brand Commitments

- **Nombre**: GUACHAFIT.
- **Tono y Personalidad**: Atlético, de alto rendimiento, directo, profesional y enérgico; sin jerga corporativa innecesaria.
- **Identidad de Interfaz**: Optimización para pantallas OLED en entornos de entrenamiento (fondo oscuro de alto contraste, acentos energéticos esmeralda/lima y ámbar para alertas de cobranza).

## Evidence on Hand

- **Vault SDD formalizado**:
  - `01_Problemas/`: `PROB-001` (Adherencia/Antropometría) y `PROB-002` (Cobranza bimonetaria y cartera).
  - `02_Requerimientos/`: `RF-001` al `RF-009` en formato Gherkin; `RNF-001` (Almacenamiento y privacidad de fotos) y `RNF-002` (Consistencia financiera e idempotencia).
  - `03_Dominio/`: 6 Agregados DDD (`SesionEntrenamiento`, `CheckinNutricional`, `ControlAntropometrico`, `PlanMembresia`, `CuotaMembresia`, `TransaccionPago`).
  - `04_Decisiones/`: `ADR-001` a `ADR-010` (RBAC híbrido, UTC timestamps, deuda USD, PWA offline-first, NestJS, PostgreSQL/Drizzle, Cloudflare R2, BullMQ).
  - `HANDOFF_REQUERIMIENTOS_TECNICOS.md` y `00_Dashboard.md`.
- **Ausencias**: No existen testimonios inventados de clientes ni planes de precios genéricos prefabricados; cada entrenador configura sus tarifas.

## Product Principles

1. **Cero fricción en el entrenamiento real**: La interfaz debe operar de manera instantánea e ininterrumpida aun sin señal; nunca debe bloquear al atleta entre series con pantallas de carga.
2. **Trazabilidad empírica sobre percepciones**: Toda decisión de ajuste de cargas, nutrición o progreso físico debe respaldarse en datos reales registrados, no en suposiciones.
3. **Invarianza financiera bimonetaria**: La deuda maestra se preserva en USD; cada abono y conversión cambiaria queda registrado de forma inmutable a la tasa acordada en el instante del pago con precisión decimal exacta.
4. **Claridad de roles y superficies**: Experiencia móvil, directa y táctil para el alumno en el gimnasio; vista analítica, densa y estructurada para el coach en gestión de cartera y auditoría.

## Accessibility & Inclusion

- Contraste visual elevado y legibilidad nítida en pantallas móviles bajo iluminación intensa o penumbra de gimnasio.
- Áreas de toque táctil cómodas (mínimo 44x44px) diseñadas para manipulación ágil con una mano o guantes de entrenamiento.
- Primitivas accesibles WCAG a través de componentes headless Radix UI con navegación por teclado y soporte de lectores de pantalla.
