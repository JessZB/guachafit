---
id: RNF-003
modulo: Seguridad
categoria: seguridad-privacidad # seguridad-privacidad | rendimiento | arquitectura
prioridad: alta
estado: aprobado
requisito_origen: "[[RF-010-rbac-jerarquia-aislamiento-tenancy]]"
metrica_objetivo: "0% fugas entre tenants (RLS estricto) / Dashboard p95 < 200ms"
fecha_creacion: 2026-09-06
tags:
  - requerimiento
  - rnf
  - sdd
  - seguridad
  - multi-tenant
  - privacidad
---

# RNF-003: Aislamiento Multi-Tenant, Cifrado de Datos de Salud y Rendimiento del Dashboard

## 1. Definición y Alcance
Establece los requerimientos de seguridad, privacidad y rendimiento asociados a la arquitectura multi-inquilino, la protección de notas médicas de alumnos y el tiempo de respuesta del panel principal del entrenador.

- **Atributos de calidad:** Aislamiento de Datos, Confidencialidad Médica, Seguridad de Sesión y Latencia.
- **Componentes afectados:** Base de Datos (PostgreSQL RLS), Servicio de Autenticación (JWT/Tokens), Backend API.

---

## 2. Métricas Cuantitativas y SLOs / SLAs

| Métrica | Valor Mínimo Aceptable | Valor Deseado (SLO) | Condición de Medición |
| :--- | :--- | :--- | :--- |
| **Tiempo de Carga del Dashboard (p95)**| < 400 ms | < 200 ms | Consulta agregada de KPIs y listas |
| **Aislamiento Multi-Tenant** | 100% estricto | Cero riesgo de fuga | Verificación mediante Row-Level Security |
| **TTL de Tokens de Invitación** | $\le 48$ horas | 24 horas | Token de un solo uso (*single-use*) |
| **Cifrado de Ficha de Salud en Reposo**| AES-256 | AES-256-GCM | Campo sensible en base de datos |

---

## 3. Aislamiento Lógico Multi-Tenant (Row-Level Security)
- **Defensa en Profundidad:** El aislamiento de datos no debe depender únicamente de filtros `WHERE entrenador_id = ?` en el código de aplicación.
- **Políticas RLS en PostgreSQL:** Las tablas `alumnos`, `planes`, `cuotas`, `transacciones` y `rutinas` deben contar con políticas de **Row-Level Security (RLS)** activadas en PostgreSQL, ligadas al contexto de sesión de base de datos (`SET LOCAL app.current_entrenador_id = '...'`).

---

## 4. Confidencialidad y Protección de Datos de Salud
- La ficha médica y notas de salud (`lesiones`, `cirugias`, `patologias`) constituyen datos de categoría especial (sensibles bajo GDPR y estándares de protección biomédica).
- **Control de Acceso Estricto:** La columna de notas de salud solo se expone en endpoints autorizados para el rol `ENTRENADOR` y jamás debe serializarse en los DTOs de respuesta destinados al frontend del alumno.

---

## 5. Seguridad en Invitaciones y Tokens de Contraseña
- Los enlaces de entrega de credenciales disparados por el correo de bienvenida contienen un token criptográfico seguro generado con `crypto.randomBytes(32)`.
- El token se almacena en base de datos en formato **hash SHA-256** (nunca en texto plano).
- Al ser consumido una vez para establecer la contraseña, el token se invalida permanentemente.

---

## 6. Estrategia de Pruebas y Auditoría
- **Pruebas de Penetración de Tenancy:** Tests automatizados que intentan acceder con el token del Entrenador A a recursos del Entrenador B, validando que el 100% de las peticiones fallen con `403 Forbidden` o `404 Not Found`.
- **Pruebas de Carga en Dashboard:** Simulación de 50 entrenadores consultando concurrentemente sus KPIs matutinos para asegurar tiempos de respuesta $< 200$ ms mediante índices adecuados en `cuotas(entrenador_id, estado)` y `alumnos(entrenador_id, estado)`.
