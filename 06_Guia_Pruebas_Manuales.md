---
id: GUIA-PRUEBAS
titulo: "Guía de Pruebas Manuales — GUACHAFIT"
fecha: 2026-09-21
estado: activo
tags:
  - pruebas
  - manual
  - checklist
  - qa
---

# 🧪 Guía de Pruebas Manuales — GUACHAFIT

> **Para qué sirve:** probar a mano todo lo construido sin perder de vista ningún cambio. Cada punto dice **qué hacer** y **qué deberías ver**. Si algo no coincide, anótalo con el formato del final (y captura de pantalla).
>
> **Estado del código:** todo versionado y con pruebas automáticas en verde (430 de la web + 547 del API). Lo de abajo es lo que las pruebas automáticas **no pueden** ver: la vivencia real.

---

## 0. Cómo levantar todo (una sola vez por sesión)

1. **Docker Desktop abierto** (Postgres, Redis y MinIO deben estar corriendo).
2. **Base de datos al día** (solo si es la primera vez o hubo cambios de esquema):
   `pnpm --filter @guachafit/database db:migrate`
3. **Datos de ejemplo** (⚠️ borra y recarga los datos):
   `pnpm --filter @guachafit/database db:seed`
   → Las credenciales de prueba están definidas en `packages/database/src/seed.ts`.
4. **API**: `pnpm --filter @guachafit/api dev` → queda en `http://localhost:4000` (documentación en `/api/docs`).
5. **Web**: `pnpm --filter @guachafit/web dev` → abre `http://localhost:3000`.
6. **Modo demo** (sin tocar la base de datos): en el login hay botones **"Modo Coach"** y **"Modo Alumno"**. Aparece un banner de "Modo demo — datos de ejemplo". Ideal para recorrer pantallas rápido.

> **Tip para probar en el teléfono por WiFi:** por defecto no es accesible (Vite escucha solo en tu PC). Para probar la PWA de verdad usa **USB** (`adb reverse tcp:3000 tcp:3000` y abre `http://localhost:3000` en el teléfono) o un **túnel HTTPS** (cloudflared/ngrok). Por HTTP de la red local, los service workers no se activan.

---

## 1. Entrenamiento del alumno (lo más usado en el gimnasio)

- [ ] **Pantalla angosta (360px, como un celular):** la fila de series se ve cómoda; puedes escribir repeticiones y peso en campos amplios, con botones +/− fáciles de tocar.
- [ ] **Iniciar:** pulsar "Comenzar a entrenar" pasa la sesión a "En Progreso" y guarda la hora (UTC) + tu zona horaria.
- [ ] **Descanso real:** al marcar una serie arranca el temporizador; al marcar la siguiente aparece **"Descanso real: X"** (medido de verdad). Si no marcaste inicio, muestra "—" (nunca un número inventado).
- [ ] **Cierre con sesión vacía:** pulsar "Finalizar" sin haber marcado nada pregunta **"¿descansado o incompleto?"**; en ninguno de los dos casos sube la racha.
- [ ] **Finalizar bien:** muestra duración y horas **en tu hora local**; si superaste el 70% del plan dice la racha real; si no, un mensaje honesto (no miente).
- [ ] **kg / lb:** cambia la unidad en el checklist; se recuerda aunque recargues.
- [ ] **Video de técnica:** si el ejercicio tiene enlace, aparece "Ver técnica" con reproductor (Escape cierra).
- [ ] **Navegar entre días de la semana:** consultar otro día **no borra** tu sesión planificada; "Entrenar este bloque hoy" crea/inicia la de ese bloque.
- [ ] **Repetir un bloque ya completado:** crea una sesión nueva sin borrar el historial anterior.
- [ ] **Sin conexión (modo avión):** sigues viendo la rutina guardada y puedes marcar series; aparece **"Sin conexión · datos guardados · actualizado hace X"**; al volver la red, se sincroniza solo. Si algo fue rechazado, el panel de sincronización lo explica y permite Reintentar/Descartar.

## 2. Seguimiento de Alumnos (entrenador)

- [ ] **Semáforo semanal** por alumno (rojo/amarillo/verde), "Sin plan" y "Al día — sin pendientes" cuando corresponde.
- [ ] **Buscador** por nombre y **chips de color clicables** (ver solo los rojos, por ejemplo).
- [ ] **Paginación** abajo (cambia "Filas por página" a 10 para ver la página 2 en demo).
- [ ] **Clic en un alumno** → ventana "Actividad" con sus últimas sesiones y el detalle por serie: peso y reps reales, descansos reales, notas del coach. Botón "Abrir ficha completa" que aterriza en la pestaña Entrenamiento.

## 3. Ficha del alumno (expediente)

- [ ] **El historial de sesiones está ARRIBA** en la pestaña "Entrenamiento" (ya no al fondo), con botones de salto "Último · Historial · Rutina".
- [ ] Cada sesión muestra **estado real** (Completada / Omitida con motivo: Descansado/Incompleto), horas locales, volumen, y por serie: prescrito vs real (peso, reps) y descansos.
- [ ] **"Cargar más" / paginación** del historial.
- [ ] **Antropometría en el móvil:** la tabla se convierte en tarjetas (sin scroll lateral).
- [ ] **Plan y tarifa:** asigna plan, "Precio Acordado" (vacío = precio del plan; `0` = becado) y "Tasa Especial"; guarda y verás el badge "Override activo". Puedes quitarlo.
- [ ] **Suspender por pago** y **Reactivar**: verifica en el lado del alumno (sección 7).

## 4. Cobros (entrenador)

- [ ] **Control de Cobros** (menú): 4 indicadores arriba (recaudado del mes, en mora con monto, por vencer, por validar).
- [ ] **Pestañas**: Mora (ordenada por atraso), Por Vencer, En Revisión, Al Día, con contadores.
- [ ] **Bolívares**: si no hay tasa configurada, muestra "—" con aviso hacia Ajustes (no inventa).
- [ ] **Enviar recordatorio** a un moroso: llega la notificación in-app; si lo repites enseguida, avisa que ya se envió hace poco (anti-spam).
- [ ] **Registrar cobro** desde la fila: al liquidar, el alumno sale de mora.
- [ ] **Recordatorios automáticos (por debajo):** emite una cuota desde la ficha y revisa `http://localhost:4000/admin/queues` (si configuraste `BULL_BOARD_USER`/`BULL_BOARD_PASS` en `apps/api/.env`): verás los 4 avisos agendados en la cola "cobranza"; al pagar todo, desaparecen.
- [ ] **Estado "Por Vencer"**: una cuota a ≤5 días del corte se pinta como preventiva y **no** cuenta como mora.

## 5. Directorio de Alumnos

- [ ] Busca por nombre, apellido, correo o documento (filtrando en el servidor, no solo lo visible).
- [ ] **Pestaña "En Mora"**: ahora coincide con el número del KPI (antes decía N y mostraba 0 filas).
- [ ] **Paginación numerada** con "Mostrando X de N" — ya no se pierden alumnos después del número 50.
- [ ] Las filas muestran el **plan real** o "Sin plan asignado" (ya no un "Plan Estándar" inventado).

## 6. Plantillas de ejercicios

- [ ] Crear, editar y desactivar plantillas (con días, series, reps, peso, RPE y notas).
- [ ] Buscador + filtro por nivel + estado.
- [ ] En la ficha del alumno: **"Cargar desde Plantilla"** → elegir plantilla, ajustar cargas antes de confirmar, elegir **Reemplazar** o **Fusionar**.

## 7. Altas, enlaces y accesos

- [ ] **Alta manual**: al crear un alumno, la app te muestra un **enlace de activación copiable** ("Compártelo con tu alumno"). Ábrelo en una ventana de incógnito: crea la contraseña y entra. El enlace **sirve una sola vez**.
- [ ] **Link de inscripción del coach**: la web te muestra tu enlace real (`/onboarding?coach=TU-CODIGO`). Pruébalo con un código inventado (dice "no válido") y con el real (muestra tu nombre y permite registrarse). Al registrarse alguien, te llega una notificación.
- [ ] **Alumno suspendido/pausado**: al entrar, ve la pantalla de bloqueo con el mensaje correspondiente y botón **"Reportar pago"** (sus pagos y cuenta siguen accesibles).
- [ ] **Alumno dado de baja**: ya **no puede iniciar sesión** (mensaje claro).
- [ ] **Admin** (`/admin`, solo superadmin): crear entrenador y ver el enlace de activación; ya no puede operar el negocio del coach (recibe "no autorizado").

## 8. PWA, instalación y actualizaciones

- [ ] **Instalar en Android** (Chrome): aparece "Instalar app" en la cabecera.
- [ ] **Instalar en iPhone** (Safari): aparece el instructivo "Compartir → Añadir a pantalla de inicio".
- [ ] **Ya instalada**: se abre sin barra del navegador; el notch y la barra inferior no tapan nada.
- [ ] **Nueva versión**: al desplegar/compilar una versión nueva aparece "Nueva versión disponible · Actualizar" — **nunca se recarga sola**; tú decides cuándo.
- [ ] **Cerrar sesión con cambios sin subir**: pregunta si cancelar, sincronizar o cerrar igualmente.
- [ ] **Zoom con pinza** habilitado (antes estaba bloqueado).

## 9. Tema y accesibilidad

- [ ] **Tema claro**: todo legible (antes los estados eran ilegibles por contraste bajo). Alterna claro/oscuro/sistema.
- [ ] **Teclado (desktop)**: Tab recorre; los modales atrapan el foco; Escape cierra y devuelve el foco; pestañas se mueven con flechas; el botón de sincronización de la cabecera responde a teclado.

## 10. ⛔ Lo que AÚN NO existe (no lo reportes como error)

- **Notificaciones**: la campana in-app y las preferencias por canal todavía no tienen pantalla (el motor ya despacha; la UI está en camino). Tampoco existen los recordatorios de check-in 06:00 ni el resumen semanal.
- **Nutrición**: metas del coach y diario fotográfico de platos pendientes; la tolerancia automática depende de esas metas.
- **Antropometría**: ventana horaria del check-in y periodicidad pendientes; los gráficos/comparador visuales aún no tienen UI real (solo demo).
- **Admin**: deshabilitar entrenadores, licencias y correo automático pendientes.
- **Listas**: los filtros de Conciliación/Evaluaciones/Pagos filtran solo la página visible (la UI lo dice); Plantillas no está paginada.
- **Seguridad**: RLS activo solo en `rutinas`/`plantillas` (etapas 2-4 pendientes); push del navegador no implementado.
- **Extras**: iconos provisionales (mancuerna generada) — si hay logo oficial, se reemplazan; instalación real en dispositivo físico pendiente de tu prueba.

## 11. Cómo reportar un hallazgo

Copia esta plantilla en `00_Inbox/` (o al final de este documento):

```
- Pantalla: (ej. /app/hoy)
- Qué hice: (pasos)
- Qué esperaba: 
- Qué pasó: 
- Captura: (adjuntar)
- ¿Modo demo o sesión real?: 
```
