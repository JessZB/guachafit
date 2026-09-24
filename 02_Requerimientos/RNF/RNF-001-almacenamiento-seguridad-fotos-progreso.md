---
id: RNF-001
modulo: Antropometria
categoria: seguridad # seguridad | rendimiento | disponibilidad
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-09-24
requisito_origen: "[[RF-003-checkin-antropometrico-rbac-hibrido]]"
metrica_objetivo: "p95 < 800ms subida / URLs firmadas TTL < 15 min"
fecha_creacion: 2026-09-05
tags:
  - requerimiento
  - rnf
  - sdd
  - seguridad
  - performance
---

# RNF-001: Almacenamiento Seguro, Privacidad y Rendimiento en Fotos de Progreso

## 1. Definición y Alcance
Las fotografías de control corporal y progreso físico constituyen datos biométricos sensibles de carácter íntimo. Este requerimiento establece los estándares estrictos de cifrado, autorización, compresión en cliente y políticas de entrega segura.

- **Atributos de calidad:** Seguridad / Privacidad de Datos, Eficiencia de Red y Rendimiento en Carga.
- **Componentes afectados:** Storage Service (S3 / Cloud Storage / MinIO), API Gateway, Clientes Web/Mobile.

---

## 2. Métricas Cuantitativas y SLOs / SLAs

| Métrica | Valor Mínimo Aceptable | Valor Deseado (SLO) | Condición de Medición |
| :--- | :--- | :--- | :--- |
| **Tiempo de Subida por Foto (p95)** | < 2.0 s | < 800 ms | Conexión móvil 4G (10 Mbps subida) |
| **Tamaño Máximo por Imagen Post-Compresión** | < 1.2 MB | < 600 KB | Formato WebP / JPEG 85% calidad |
| **TTL de Presigned URL de Visualización** | $\le 30$ min | 15 min | Expiración estricta de token |
| **Disponibilidad del Storage** | 99.9% | 99.99% | Acceso ininterrumpido |

---

## 3. Latencia y Tiempos de Respuesta
- **Generación de Presigned Upload URL:** La API de backend debe generar la URL de subida directa en $< 100$ ms.
- **Compresión del lado del cliente (Client-side):** El canvas o worker en el dispositivo del alumno debe procesar y optimizar la imagen antes de iniciar la transmisión por red en $< 500$ ms.

---

## 4. Concurrencia y Perfil de Carga
- En días de check-in masivo (ej. domingos noche y lunes temprano), el sistema debe soportar picos concurrentes de subida de hasta 100 imágenes por minuto sin saturar el ancho de banda del backend, utilizando **Direct-to-Storage Uploads** (subida directa a bucket mediante URLs presignadas).

---

## 5. Tolerancia a Fallos y Resiliencia
- **Reintentos en background:** La subida móvil debe implementar `Resumable Uploads` o reintentos exponenciales automáticos si la conexión se interrumpe durante el envío.
- **Cifrado en reposo:** Todas las imágenes almacenadas deben contar con cifrado AES-256 del lado del servidor (SSE-S3 / SSE-KMS).
- **Aislamiento de buckets:** Los buckets de storage no deben tener ningún permiso público. El acceso a los objetos se realiza exclusivamente mediante URLs firmadas de corta duración, generadas previa verificación de permisos de sesión del usuario.

---

## 6. Estrategia de Verificación y Pruebas
- **Pruebas de Carga:** Simulación con k6 de 200 usuarios subiendo 3 fotos de 800 KB en una ventana de 5 minutos.
- **Pruebas de Seguridad (Pen-testing):** Verificación de que peticiones sin token o con tokens manipulados sobre los buckets arrojen `HTTP 403 Access Denied`.

---

## 7. Estado real de implementación

- TTL de URLs presignadas y subida directa a storage (direct-to-storage) implementados.
- Compresión en el cliente sin evidencia de implementación.
- Cifrado en reposo (SSE-S3 / SSE-KMS) sin evidencia.
- Validación de `storageKey` implementada: estructura estricta por módulo (`validarStorageKeyEstructura`) y, en los recursos de nutrición, tenancy por prefijo del alumno (`nutricion-recursos/{alumnoId}/`, clave ajena → 400). Verificada en las suites `rnf001-r2-storage` y `nutricion-service`.
- Borrado de objetos implementado: `R2StorageService.eliminarObjeto` (`DeleteObject` idempotente; valida la estructura de la clave y no lanza si es inválida; early-return en modo mock; un fallo de red se propaga al llamador). Ciclo de vida **best-effort post-commit** en el PUT-replace de metas de nutrición ([[RF-002-nutricion-agil-reporte-rapido]]), con re-lectura anti-race y respuesta intacta ante fallos. Decisión y límites en [[ADR-015-borrado-best-effort-objetos-boveda]].
