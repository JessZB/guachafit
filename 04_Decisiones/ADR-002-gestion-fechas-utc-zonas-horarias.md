---
id: ADR-002
titulo: "ADR-002: Estrategia Global de Gestión Temporal en UTC y Renderizado en Zona Horaria Local"
fecha: 2026-09-06
estado: aceptado
decisores:
  - "Arquitecto de Software"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - backend
  - frontend
---

# ADR-002: Estrategia Global de Gestión Temporal en UTC y Renderizado en Zona Horaria Local

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La plataforma **GUACHAFIT** atiende a entrenadores y alumnos que pueden operar en diferentes zonas horarias (ej. entrenador en España GMT+1 / GMT+2 y alumnos en Venezuela GMT-4, Colombia GMT-5 o EE.UU.). 

Además, existen eventos de negocio críticos dependientes del tiempo:
- Momento exacto en que un alumno comienza y finaliza un entrenamiento (`fecha_inicio_utc`, `fecha_fin_utc`).
- Cálculo de rachas diarias y semanales (para saber a qué "día calendario" del alumno corresponde la sesión).
- Ventanas de check-in antropométrico en ayunas (06:00 AM hora local).
- Semáforo diario de nutrición (18:00 a 23:59 hora local).

### Riesgos de un mal manejo temporal:
- Inconsistencia al comparar registros de alumnos en distintas regiones.
- Ambigüedad en la persistencia si la base de datos almacena horas con offsets locales variables o cambios por horario de verano (DST).
- Desajustes en el cálculo de rachas (ej. un entrenamiento a las 23:30 local registrado como el día siguiente en el servidor).

---

## 3. Decisión
Adoptamos el patrón estándar de la industria: **"Almacenamiento Estricto en UTC con Contexto de Zona Horaria IANA y Proyección Local en Cliente"**:

```
[Dispositivo Cliente]
  │ (Detecta IANA Timezone: ej. "America/Caracas")
  │ Captura momento exacto
  ▼
[Payload HTTP API] ──────> Envía timestamp en formato ISO 8601 UTC (ej. "2026-09-06T14:30:00.000Z")
                           + zona horaria del cliente ("America/Caracas")
  ▼
[Backend & Base de Datos] ─> Almacena exclusivamente en columnas TIMESTAMP WITH TIME ZONE (UTC)
  │
  ▼
[Respuesta JSON API] ────> Retorna cadenas ISO 8601 UTC estándar
  ▼
[Frontend / UI] ─────────> El navegador o app móvil transforma el valor UTC a la hora local
                           del usuario activo para su visualización ("10:30 AM")
```

### Reglas Técnicas
1. **Base de Datos & APIs:** Ningún endpoint o tabla almacenará ni expondrá timestamps en hora local ingenua (*naive local time*). Todo campo con fecha y hora debe terminar en `Z` o corresponder al meridiano 0 UTC.
2. **Determinación del Día Calendario:** Para reglas de negocio que dependen del "día" (ej. `fecha_programada`, racha de hoy), el frontend calcula el día según la zona horaria del alumno y lo envía como `Date` (`YYYY-MM-DD`).
3. **Separación de Operaciones:** 
   - `Iniciar Sesión en la app (Login)`: Acción de autenticación en IAM (solo lectura en datos de rutinas).
   - `Comenzar Entrenamiento`: Acción explícita de negocio (`comenzarEntrenamiento()`) que estampa `fecha_inicio_utc = now_utc()`.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Determinismo y Portabilidad:** La base de datos es inmune a cambios de huso horario del servidor cloud o transiciones de horario de verano (DST).
- **Auditoría Científica:** Cálculos precisos de duración efectiva de entrenamientos e intervalos de descanso entre series.
- **Transparencia Multi-Usuario:** El entrenador siempre ve las horas normalizadas a su propio huso horario local sin alterar el registro original del alumno.

### Consecuencias Negativas (Trade-offs)
- Requiere disciplina en el frontend para aplicar formateadores (`Intl.DateTimeFormat` / date-fns / Luxon) y no presentar fechas UTC crudas al usuario final.

---

## 5. Trazabilidad y Referencias
- Vinculado a entidades:
  - [[Entidad-SesionEntrenamiento]]
  - [[Entidad-ControlAntropometrico]]
  - [[Entidad-CheckinNutricional]]
- Requerimientos asociados:
  - [[RF-001-checklist-entrenamiento-diario]]
  - [[RF-003-checkin-antropometrico-rbac-hibrido]]
