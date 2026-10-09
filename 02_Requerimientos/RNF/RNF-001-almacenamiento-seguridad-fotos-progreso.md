---
id: RNF-001
modulo: Antropometria
categoria: seguridad # seguridad | rendimiento | disponibilidad
prioridad: alta
estado: parcial
version_implementada: v1.0.0
fecha_verificacion: 2026-10-09
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
- **Compresión en el cliente:** implementada en `apps/web/src/lib/imagen-comprimida.ts` (WebP, lado mayor 1920 px, calidad 85 %, fallback JPEG). La usan las fotos de platos, los comprobantes de pago y, desde 2026-10-08 (`affec1f`), las fotos del check-in antropométrico.
- **Reintentos de subida (§5):** las fotos del check-in antropométrico reintentan hasta 3 veces (esperas de 1 s y 2 s) con una URL de subida nueva en cada intento; el PUT tiene un plazo de 30 s y se puede cancelar (`apps/web/src/lib/antropometria-fotos.ts`). Las fotos de platos reintentan desde la cola offline. No hay subida reanudable por partes (las fotos comprimidas pesan < 1 MB).
- **Cifrado en reposo:** Cloudflare R2 cifra todos los objetos en reposo con AES-256 por defecto (garantía del proveedor; no es configurable ni se verificó desde la cuenta). El MinIO local de desarrollo no cifra.
- **Tenancy de las fotos antropométricas (2026-10-08):** el check-in solo acepta claves `antropometria/{alumnoId}/…` con estructura válida (400 si no), y las lecturas (detalle, evolución, comparador) no firman claves de otro alumno. Antes se aceptaba cualquier clave.
- Validación de `storageKey` implementada: estructura estricta por módulo (`validarStorageKeyEstructura`) y, en los recursos de nutrición, tenancy por prefijo del alumno (`nutricion-recursos/{alumnoId}/`, clave ajena → 400). Verificada en las suites `rnf001-r2-storage` y `nutricion-service`.
- Borrado de objetos implementado: `R2StorageService.eliminarObjeto` (`DeleteObject` idempotente; valida la estructura de la clave y no lanza si es inválida; early-return en modo mock; un fallo de red se propaga al llamador). Ciclo de vida **best-effort post-commit** en el PUT-replace de metas de nutrición ([[RF-002-nutricion-agil-reporte-rapido]]), con re-lectura anti-race y respuesta intacta ante fallos. Decisión y límites en [[ADR-015-borrado-best-effort-objetos-boveda]].

### Privacidad de las fotos (2026-10-09, `84643ef`)
- **Sin metadatos en las fotos corporales:** si el navegador no pudo recodificar la foto (el compresor devuelve el original, que conserva su EXIF con la ubicación GPS), la subida se rechaza con *"Este navegador no pudo preparar la foto. Prueba con otro navegador actualizado."*. En el camino normal la recodificación ya elimina los metadatos.
- **Fotos en iPhone (Safari):** Safari no codifica WebP y, como manda el estándar, entrega un PNG en vez de fallar; antes ese PNG pasaba y las validaciones de formato rechazaban toda foto (antropometría, platos y comprobantes). Ahora solo se acepta un WebP real y si no se usa el respaldo JPEG.
- **Caché del service worker sin enlaces firmados:** la caché runtime de la API (24 h, necesaria para ver la evolución sin conexión) guarda las respuestas JSON con todo enlace firmado vaciado: `presignedGetUrl` y cualquier texto con `X-Amz-Signature` (`fotoUrl` de platos, `comprobanteUrl` de pagos…). Sin conexión, las fotos se ven como "Sin imagen". Plugin `pluginSinUrlsFirmadas` en `apps/web/src/lib/api-cache-pattern.ts`, serializado al SW (verificado en `dist/sw.js`).
- Evidencia: `apps/web/src/lib/imagen-comprimida.spec.ts`, `lib/antropometria-fotos.spec.ts`, `lib/api-cache-pattern.privacidad.spec.ts`; web **1134** aprobados; typecheck y build en verde. Revisado con los 4 enfoques y validado.

### Pendiente
- **Objetos huérfanos de antropometría:** una foto subida y luego quitada, o un check-in que no se envía, deja el objeto en la bóveda (privado y sin enlace firmado, pero sin borrar). Falta un barrido o una regla de ciclo de vida (patrón de [[ADR-015-borrado-best-effort-objetos-boveda]]).
- **Metadatos en comprobantes y fotos de platos:** sus subidas no rechazan todavía el original sin recodificar.
- **Verificación del SLO:** sin pruebas de carga k6 (§6) ni medición de p95 de subida.
- **Menores (revisión 2026-10-09):** tras el error "no pudo preparar la foto", el botón "Reintentar" no puede funcionar en el mismo navegador; el saneado de la caché pierde una clave literal `__proto__` (el API no la emite); faltan pruebas de bordes del plugin (array vacío, valor no texto).
