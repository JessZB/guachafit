---
id: ADR-025
titulo: "ADR-025: Zona horaria del alumno: precarga única desde el dispositivo, uso exclusivo de la zona del perfil y aviso de discrepancia"
fecha: 2026-11-03
estado: implementado
decisores:
  - "Dueño del producto"
  - "Tech Lead"
tags:
  - decision
  - adr
  - arquitectura
  - backend
  - frontend
  - zonas-horarias
---

# ADR-025: Zona horaria del alumno: precarga única desde el dispositivo, uso exclusivo de la zona del perfil y aviso de discrepancia

## 1. Estado
`implementado` en los lotes ZH-1 (`6111326`) y ZH-2 (`6da5794`), ambos del 2026-11-03, con el diseño aprobado por el dueño el 2026-11-03. Refina [[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]] (costo T2: los perfiles existentes quedan en Caracas) y respeta la estrategia UTC/IANA de [[ADR-002-gestion-fechas-utc-zonas-horarias]].

## 2. Contexto
- La zona del alumno vive en `perfiles_alumno.zona_horaria`, `NOT NULL` con valor por defecto `America/Caracas`. Hoy nadie la rellena con la del dispositivo: un alumno que se registra fuera de Venezuela queda en Caracas hasta que la cambie en Ajustes, algo que quizá no sabe ni le importa.
- La columna no distingue «nunca configurada» de «el alumno eligió Caracas», así que no se puede precargar sin riesgo de pisar una elección.
- El entrenador **no** puede fijar la zona en el alta manual (`AltaManualAlumnoSchema` no la admite); sí puede cambiarla después con `PATCH /alumnos/:id`.
- Hay dos fuentes mezcladas en el cliente. La ventana de nutrición ya usa la zona del perfil (ADR-019), pero el menú, el entrenamiento, la fecha del pago y el contexto de antropometría usan la del dispositivo (`Intl.DateTimeFormat().resolvedOptions().timeZone` y `fechaCalendarioLocal()`). Con un dispositivo en otra zona, dos pantallas del mismo alumno pueden hablar de días distintos.
- Si el alumno viaja o usa una VPN, nada le avisa de que la zona de su perfil ya no coincide con la del teléfono.

## 3. Decisión
1. **Precarga única.** La primera vez que un alumno inicia sesión o establece su contraseña, el cliente envía la zona de su dispositivo. El servidor la guarda **solo si** la zona del perfil aún no está definida y la marca como definida.
2. **Después, libre y sin tocar.** El alumno (en Ajustes) o el entrenador (en la ficha) cambian la zona cuando quieran; esa acción también la marca como definida. La zona nunca se vuelve a cambiar sola, ni aunque el alumno viaje.
3. **Los cálculos usan siempre la zona del perfil.** La zona del dispositivo solo sirve para la precarga y para el aviso. Se retira su uso en el menú, el entrenamiento, la fecha de operación del pago y el contexto de antropometría.
4. **Aviso discreto de discrepancia.** Una línea pequeña al final del contenido del layout del alumno cuando la zona del dispositivo y la del perfil tienen **distinto desfase horario** en este momento. Se compara por desfase y no por nombre (`America/Caracas` y `America/La_Paz` no avisan). Se puede descartar durante la sesión. No cambia nada por su cuenta.

### 3.1. Base de datos
- Columna nueva `perfiles_alumno.zona_horaria_definida boolean NOT NULL DEFAULT false` (migración `0024`).
- **Relleno de lo existente:** todas las filas actuales pasan a `true`. Así los alumnos de hoy no cambian de zona sin querer (la ventana de nutrición y las cuotas dependen de ella); ellos verán el aviso si su dispositivo difiere. Solo los alumnos nuevos nacen con `false`.
- Sin impacto en RLS: las políticas son por fila y los permisos del rol de aplicación son por tabla. `usuarios.timezone` (calendario de antropometría) es otra columna y queda fuera, como ya documenta RF-011.

### 3.2. API
- Contratos (`packages/shared`): `LoginUsuarioSchema` y `EstablecerPasswordConTokenSchema` admiten `zonaDispositivo?: string`. Se valida en el servidor con `esZonaHorariaIanaValida`; un valor inválido o ausente **se ignora y nunca bloquea el inicio de sesión**.
- Caso de uso nuevo `precargarZonaDispositivo` (`apps/api/src/modules/alumnos/casos-alumnos/`): una sola sentencia atómica `UPDATE perfiles_alumno SET zona_horaria = $zona, zona_horaria_definida = true WHERE usuario_id = $id AND zona_horaria_definida = false RETURNING zona_horaria`, con el mismo contexto de inquilino que usa `actualizar-zona-horaria.ts`. Es idempotente y segura ante dos inicios de sesión simultáneos.
- Se invoca desde `iniciar-sesion.ts` y `establecer-password-token.ts`, solo para el rol alumno, antes de armar la respuesta. La respuesta devuelve la zona ya precargada (`usuario.zonaHoraria`), así la sesión nace correcta.
- `actualizar-zona-horaria.ts` (PATCH propio) y `actualizar-alumno.ts` (PATCH del entrenador, cuando llega `zonaHoraria`) ponen `zona_horaria_definida = true`.
- El entrenador no tiene zona: se ignora `zonaDispositivo` para ese rol.

### 3.3. Web
- Envío: `auth-context.tsx` (login) y `ActivacionPage.tsx` añaden `zonaDispositivo: obtenerTimezoneDispositivo()`.
- `lib/zona-horaria.ts`: `desfaseMinutosEnZona(zona, instante?)`, `hayDiscrepanciaZona(zonaPerfil, zonaDispositivo, instante?)` (falso si alguna es inválida) y `fechaCalendarioEnZona(zona, ahora?)`.
- Componente `components/layout/AvisoZonaDiscrepante.tsx`, montado en `AppLayout.tsx` **al final del `<main>`, después del `<Outlet/>`**, solo para el rol alumno y fuera del modo demo:
  - texto del estilo «Tu teléfono marca la hora de {ciudad} y tu perfil usa la de {ciudad}.», con el enlace «Cambiar zona horaria» (`rutaAjustes(Rol.ALUMNO, 'zona-horaria')`) y el botón «Entendido»;
  - `text-xs text-muted-foreground`, sin `role="alert"` ni anuncio automático; contenedor `aside` con nombre accesible;
  - en móvil queda sobre la barra inferior fija porque el `<main>` ya reserva `safe-area-content-pb`;
  - descartar guarda en `sessionStorage` (con `try/catch`, como `lib/sesion-estado.ts`) la clave `guachafit:aviso-zona:{usuarioId}:{zonaPerfil}|{zonaDispositivo}`: reaparece en otra sesión o si cambia cualquiera de las dos zonas.
- La zona de los cálculos sale de un único punto, `useZonaPerfil()` (`zonaPerfilEfectiva(user?.zonaHoraria)`), que reemplaza al dispositivo en: `use-resumen-menu.ts:146`, `use-entrenamiento.tsx:37` (y lo que de ahí baja: `use-semana-entrenamiento`, `use-carga-sesion`, `use-acciones-sesion`), `use-reporte-pago.ts` y `FormularioReportePago.tsx` (fecha de operación) y `use-contexto-antropometrico.ts`.
- El lado del entrenador no cambia: no tiene zona de perfil y sigue usando la de su dispositivo.

## 4. Consecuencias
- **C1.** Un alumno nuevo nace con su zona correcta sin configurar nada.
- **C2.** El menú, «Hoy», la ventana de nutrición y el pago hablan del mismo día, el del perfil.
- **C3.** Quien viaja o usa una VPN ve un aviso discreto y decide; nada cambia solo.
- **C4.** Los alumnos existentes conservan su zona; ven el aviso si su dispositivo difiere.
- **C5.** `zonaDispositivo` es un dato que el cliente declara: lo peor que puede hacer un cliente malintencionado es fijar su propia zona una vez, que es lo que ya puede hacer con `PATCH /alumnos/me/zona-horaria`. No abre ninguna superficie nueva.

## 5. Costos y límites honestos
- **T1.** Un alumno creado antes de esta decisión que nunca eligió zona y está fuera de Venezuela sigue en Caracas hasta que acepte el aviso y la cambie (decisión de no tocar lo existente).
- **T2.** Una VPN al iniciar sesión por primera vez fija una zona equivocada; el aviso aparece en cuanto el dispositivo vuelva a su zona real y el alumno puede corregirla en un toque.
- **T3.** Los endpoints `?timezone=` del entrenamiento siguen aceptando lo que el cliente envíe. Hacer que el servidor ignore el parámetro y use la zona del perfil, como ya hace nutrición, queda como mejora posterior.
- **T4.** El aviso no cubre al entrenador.

## 6. Lotes de implementación
1. **ZH-1 (datos y aviso):** migración `0024`, contratos, `precargarZonaDispositivo`, las dos escrituras que marcan «definida», el envío desde login y activación, `lib/zona-horaria.ts` y `AvisoZonaDiscrepante`. Riesgo medio por la migración y la autenticación: cuatro revisiones 4R.
2. **ZH-2 (cálculos con la zona del perfil):** `useZonaPerfil()` y los consumidores del punto 3.3. Riesgo medio; revisión de fiabilidad. Implementado en `6da5794`.

## 6.1. Estado de la implementación (ZH-1, `6111326`, y ZH-2, `6da5794`)
- **Hecho:** columna `zona_horaria_definida` y migración `0024` (con el `UPDATE` que deja todas las filas existentes como definidas); `zonaDispositivo` en login y activación; `precargarZonaDispositivo` con el `UPDATE` atómico condicionado; las dos escrituras que marcan la zona como definida (PATCH del alumno y del entrenador); `AvisoZonaDiscrepante` al final del `<main>` del layout del alumno; comparación por desfase UTC en `lib/zona-horaria.ts`.
- **Decisión añadida en la revisión:** la precarga es una conveniencia y **nunca bloquea** el acceso. Si el `UPDATE` falla se registra una advertencia con `Logger('PrecargarZonaDispositivo')` y el login o la activación siguen con la zona del perfil. Se descartó poner un límite `.max()` a `zonaDispositivo` en el esquema Zod: un valor largo debe ignorarse, no convertirse en un 400 que bloquee un acceso válido.
- **Hecho (ZH-2, `6da5794`):** `useZonaPerfil()` (`lib/use-zona-perfil.ts`) y `fechaCalendarioEnZona(zona, ahora?)` (`lib/zona-horaria.ts`; una zona nula o inválida cae en `America/Caracas`). Ahora calculan el día con la zona del perfil: el menú (`use-resumen-menu.ts`), el «Hoy» del entrenamiento (`use-entrenamiento.tsx` y, de ahí, la semana, la carga de la sesión, las acciones y la lectura de la caché offline de la rutina de hoy), la fecha de operación del pago (estado inicial, reinicio con `iniciarNuevoPago`, validación de la fecha de cobro y el `max` del campo; `FormularioReportePago` recibe la prop `hoyLocal`) y la antropometría (ventana del check-in y fecha enviada al guardar). El lado del entrenador no cambia.
- **Decisión añadida en la implementación:** la antropometría usa la zona fresca de `/auth/me` si existe y, si no, la del login, por si la zona cambió después de iniciar sesión. En el modo demo el «hoy» sigue siendo el reloj del dispositivo, porque no hay perfil real que consultar.
- **Límites que quedan:** la agrupación «Hoy/Ayer» de las notificaciones (`lib/notificaciones-in-app.ts`), los gráficos de evolución (`lib/evolucion-graficos.ts`) y `timezoneCliente` de nutrición siguen con la zona del dispositivo; los endpoints `?timezone=` del entrenamiento todavía aceptan lo que envía el cliente (costo T3).

## 7. Trazabilidad
- Contexto: [[ADR-019-zona-horaria-perfil-captura-relativa-nutricion]], [[ADR-002-gestion-fechas-utc-zonas-horarias]], [[ADR-011-aislamiento-multitenant-rls-progresivo-withtenant]].
- Requisitos: [[RF-018-mi-perfil-autogestion-cuenta]] (datos editables por rol), [[RF-002-nutricion-agil-reporte-rapido]] (ventana de 18:00 a 23:59), [[RF-011-onboarding-alumnos-manual-deeplink]] (dos columnas de zona, límite honesto).
- Decisión del dueño: D13 de la auditoría UX (`00_Inbox/Auditoria_UX_Vistas_2026-10-28.md`).
