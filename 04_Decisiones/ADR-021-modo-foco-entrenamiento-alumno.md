---
id: ADR-021
titulo: "ADR-021: Modo Foco en el Entrenamiento del Alumno (una serie a la vez)"
fecha: 2026-10-11
estado: aceptado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - frontend
  - ux
  - entrenamiento
---

# ADR-021: Modo Foco en el Entrenamiento del Alumno (una serie a la vez)

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La pantalla de entrenamiento de [[RF-001-checklist-entrenamiento-diario]] mostraba de una vez todas las tarjetas de ejercicios, cada una con todas sus series y todos sus controles. En el móvil, en pleno gimnasio, eso causaba:

- **fatiga visual:** demasiadas cards, títulos y badges compitiendo por el espacio;
- **errores de registro:** el alumno podía marcar series de un entrenamiento que aún no había empezado, o anotar la serie equivocada;
- **falta de guía:** no había un "qué hago ahora".

A la vez, el gimnasio real impone **flexibilidad**: si la máquina del siguiente ejercicio está ocupada, el alumno necesita cambiar el orden sin salir del flujo.

---

## 3. Decisión
Decisiones del dueño (2026-10-10 y 2026-10-11), aplicando los criterios de la skill ui-ux-pro-max (*progressive disclosure*, *read-only distinction*, indicadores de progreso):

1. **Antes de iniciar**, vista previa de solo lectura sin inputs ("Tu plan de hoy") y un único botón "Iniciar entrenamiento" ([[RF-001-checklist-entrenamiento-diario]] §7.13).
2. **En curso, modo foco por defecto:**
   - una sola serie en pantalla;
   - arriba, "Ejercicio X de N · Serie Y de M" y cuántas series quedan del ejercicio;
   - debajo, **solo el siguiente ejercicio** ("Siguiente: …");
   - el botón "Ver entrenamiento completo".
3. **El foco sigue la primera serie pendiente en orden.** Al completar la serie pasa a la siguiente del ejercicio y, al terminarlo, al siguiente ejercicio con series pendientes.
4. **Lista completa a demanda:**
   - muestra las series hechas compactas y las pendientes con sus controles;
   - **"Hacer ahora"** fija un ejercicio preferido: el foco va a él y, cuando termina, sigue por los posteriores y vuelve al principio;
   - "Volver al enfoque" regresa al modo foco.
5. **Una serie completada no se oculta: se compacta** en una línea que se toca para corregir o desmarcar.

---

## 4. Consecuencias
- **Positivas:**
  - menos ruido visual y un "qué hago ahora" explícito;
  - imposible registrar series de un entrenamiento no iniciado;
  - el orden sigue siendo libre.
  - La fila de serie es **una sola función** (`renderFilaSerie`) compartida por el foco y la lista, así que los filtros de entrada, los borradores, el envío y la cola offline no se duplican.
- **Costes y límites:**
  - con el foco solo se ve una serie, así que un rechazo del servidor sobre otra serie se publica también en el banner superior para no quedar oculto;
  - el ejercicio preferido de "Hacer ahora" vive en memoria y se pierde al recargar (el foco vuelve a la primera serie pendiente);
  - el modo foco no tiene *swipe* entre series: se navega con "Hacer ahora" desde la lista.
- **Implementación:** `apps/web/src/lib/modo-foco.ts` (posición y textos), `components/atleta/ModoFoco.tsx`, `components/atleta/VistaPreviaSesion.tsx`, `components/atleta/FilaSerieCompletada.tsx`; commits `e440587`, `bb42b55`, `dfc3e51` y `0194fcb`.

---

## 5. Alternativas consideradas
- **Mantener la lista completa y solo aligerarla:** descartada porque no resuelve el "qué hago ahora" ni el registro anticipado.
- **Foco estricto sin cambiar el orden:** descartada, porque en el gimnasio las máquinas ocupadas obligan a alterar el orden.
- **Ocultar las series completadas:** descartada, porque impide corregir datos mal puestos y quita la sensación de progreso.
