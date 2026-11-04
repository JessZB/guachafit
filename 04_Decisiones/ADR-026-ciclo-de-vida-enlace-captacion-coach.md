---
id: ADR-026
titulo: "ADR-026: Ciclo de vida del enlace de captación del entrenador: código generado por el servidor, rotación con corte inmediato, pausa y cupo"
fecha: 2026-11-04
estado: implementado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - arquitectura
  - seguridad
  - backend
  - frontend
  - onboarding
---

# ADR-026: Ciclo de vida del enlace de captación del entrenador: código generado por el servidor, rotación con corte inmediato, pausa y cupo

## 1. Estado
`implementado` en el lote D17 (`db2d68f`, 2026-11-04), con el alcance aprobado por el dueño el mismo día. Refina la vía B de [[RF-011-onboarding-alumnos-manual-deeplink]] (RN-06 y RN-07) y respeta la frontera pública de [[ADR-016-cascada-acceso-coach-alumnos-autenticacion]] (un único 404 uniforme).

## 2. Contexto
- El `coach_code` lo escribía el superadmin a mano al crear al entrenador (4 a 15 caracteres): era adivinable («JUAN», «GYM01») y **permanente**. No había forma de rotarlo, pausarlo ni limitarlo.
- Quien conociera o acertara el código se registraba y quedaba `ACTIVO` en la cartera del entrenador, sin aprobación. El registro público no comprobaba `capacidad_maxima`, así que un enlace filtrado podía llenar o rebasar el cupo.
- `GET /alumnos/coach/:code` devuelve el nombre y la marca del entrenador a quien acierte un código; la única barrera era el límite de 20 intentos por minuto y por IP.
- El enlace de activación de un alumno creado a mano ya tiene ciclo de vida (token de un solo uso, 48 h). El de captación no tenía ninguno.
- El entrenador no veía cuántos alumnos habían llegado por su enlace.

## 3. Decisión
1. **El autorregistro sigue siendo «entrar directo».** Quien abre el enlace de su entrenador entra a la app sin pasar por una aprobación. La seguridad se traslada al control del propio enlace.
2. **Código generado por el servidor.** 8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 símbolos, sin O/0/I/1) con `crypto.randomInt`: 2^40 combinaciones, sin sesgo de módulo. Si choca con otro código se reintenta (hasta 5 veces).
3. **Rotación con corte inmediato.** «Generar nuevo enlace» (con confirmación) escribe un código nuevo en `coach_code`; el anterior deja de resolver en el mismo instante, sin periodo de gracia ni caché. Se descartó la gracia de 24 h porque deja abierta justo la ventana que se quiere cerrar.
4. **Pausar captación.** Un interruptor del entrenador (`captacion_activa`). Pausado, el enlace responde como un código inexistente. Es idempotente por estado.
5. **Cupo.** Si los alumnos `ACTIVO` sin baja lógica alcanzan `capacidad_maxima`, el enlace responde igual que un código inexistente. El conteo y el alta ocurren en la misma transacción con la fila del entrenador bloqueada (`SELECT … FOR UPDATE`), de modo que dos registros simultáneos no superan el cupo.
6. **404 uniforme.** Código inexistente, rotado, cuenta o licencia inoperables, captación pausada y cupo lleno devuelven el mismo 404 y el mismo texto: nadie puede deducir el motivo. El orden de comprobaciones es código → cuenta y licencia → captación → cupo → correo repetido, así que el 409 de correo repetido solo se alcanza con un enlace válido.
7. **Contador.** El perfil del entrenador expone `registrosPorEnlace`: alumnos con `origen_registro = 'enlace'` creados desde la última rotación.
8. **Página propia de «enlace no válido».** `/onboarding` sin código, con un código inválido, inexistente, rotado, pausado o con cupo lleno muestra «Este enlace de registro no es válido» y **no** el formulario. Se elimina el campo manual de código: el código viaja solo en la URL. Un error de red, un 5xx o un 429 no se presenta como enlace inválido: se muestra «No pudimos verificar tu enlace» con «Reintentar».
9. **El modal «Invitar» refresca el estado del enlace cada vez que se abre**, para no ofrecer un enlace ya rotado desde otra pestaña.

### 3.1. Base de datos (migración `0025_captacion_enlace_coach`)
- `perfiles_entrenador.captacion_activa boolean NOT NULL DEFAULT true` y `perfiles_entrenador.enlace_rotado_en_utc timestamptz` (`NULL` = nunca rotado).
- `perfiles_alumno.origen_registro varchar(16) NOT NULL DEFAULT 'manual'` con `CHECK (origen_registro IN ('manual','enlace'))`.
- Columnas aditivas con valor por defecto: los entrenadores actuales quedan con captación activa y los alumnos actuales como `manual`. Sin impacto en RLS (las políticas son por fila y los permisos por tabla).

### 3.2. API
- `POST /entrenador/captacion/rotar` y `PATCH /entrenador/captacion` (`{ activa: boolean }`), solo `Rol.ENTRENADOR`; el `entrenadorId` sale del token, nunca del cuerpo.
- `GET /entrenador/perfil` añade `captacionActiva`, `enlaceRotadoEnUtc` y `registrosPorEnlace`.
- El hash de la contraseña del registro público se calcula **antes** de abrir la transacción con la fila bloqueada, para no alargar el bloqueo ni retener conexiones del pool; un código inválido nunca gasta CPU en él.
- Los registros de log de rotación y pausa llevan el id del entrenador y nunca el código.

## 4. Consecuencias
- Un enlace filtrado se corta con un clic, y el entrenador puede cerrar la captación cuando no quiere más alumnos o ya no hay cupo.
- El entrenador ve cuántos alumnos entraron por su enlace desde la última rotación: una cifra inesperada delata un abuso.
- La enumeración de códigos pasa a 2^40 posibilidades frente a 20 intentos por minuto y por IP.
- Quien comparta el enlace antiguo después de rotar provocará un «enlace no válido» a sus prospectos; el texto les indica pedir uno nuevo al entrenador.

## 5. Costos y límites honestos
- **La migración no se aplicó contra un PostgreSQL real** durante el lote (no hay base local); la suite e2e que la ejercitaría no se pudo ejecutar. Debe aplicarse la `0025` antes de arrancar el API nuevo; el verificador de migraciones del arranque lo detecta.
- **El contador subcuenta el pasado:** los alumnos registrados por enlace antes del lote quedaron como `manual`, así que no se cuentan.
- **`CrearEntrenadorSchema.coachCode` sigue siendo opcional y aceptado por la API:** un superadmin que llame al API a mano puede fijar un código corto. La web ya no lo pide. Es un riesgo acotado (rol de máxima confianza) y queda como seguimiento.
- **Sin auditoría ni métrica de los 404 públicos:** un escaneo lento por debajo del límite por IP no deja rastro agregado.
- **Sin caducidad ni tope de usos por enlace:** se descartaron por ahora; la rotación y la pausa cubren casi todo el riesgo.
- **El conteo de cupo trae las filas** `ACTIVO` del entrenador (acotadas por su capacidad, 50 por defecto) en lugar de usar `count(*)`; los dobles de los tests lo exigen.
- **Entre el filtro previo y la transacción** una rotación puede ocurrir: se revalida con la fila bloqueada, de modo que el corte es efectivo desde que el entrenador lo confirma.

## 6. Alternativas descartadas
- **Aprobación del entrenador para cada autorregistro:** el dueño prefirió «entrar directo»; la aprobación añade fricción al alumno y trabajo al entrenador.
- **Rotación con periodo de gracia:** deja válido el código filtrado durante la gracia.
- **Token de un solo uso por invitado** (como el enlace de activación): obliga al entrenador a generar un enlace por persona, lo que contradice un enlace único para compartir en un grupo.
- **Dejar el código a elección del superadmin:** es la causa del problema (códigos cortos y adivinables).

## 7. Trazabilidad
- Requerimientos: [[RF-011-onboarding-alumnos-manual-deeplink]] (RN-06, RN-07 y RN-08 nueva, escenarios 5 y 6, casos borde), [[RF-010-rbac-jerarquia-aislamiento-tenancy]] (alta de entrenador sin código manual).
- Implementación: `db2d68f` (API, web, base de datos y shared). Guía de pruebas manuales, sección 7.
