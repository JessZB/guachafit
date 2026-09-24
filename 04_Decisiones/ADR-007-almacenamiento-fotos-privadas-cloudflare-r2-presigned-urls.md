---
id: ADR-007
titulo: "ADR-007: Almacenamiento Seguro de Fotos Biométricas y Comprobantes en Cloudflare R2 con Presigned URLs Temporales"
fecha: 2026-09-06
estado: aceptado
decisores:
  - "Tech Lead & Principal Software Architect"
  - "Equipo de Ingeniería"
tags:
  - decision
  - adr
  - arquitectura
  - storage
  - seguridad
  - cloudflare-r2
  - privacidad
---

# ADR-007: Almacenamiento Seguro de Fotos Biométricas y Comprobantes en Cloudflare R2 con Presigned URLs Temporales

## 1. Estado
`aceptado`

---

## 2. Contexto y Fuerzas en Juego
La plataforma **GUACHAFIT** almacena activos multimedia de alta sensibilidad:
1. **Fotografías Antropométricas Corporales (`RF-003`, `RF-004`, `RNF-001`):** Imágenes en ropa deportiva o ropa interior que constituyen datos biométricos íntimos. Cualquier filtración pública o URL persistente sin expiración vulneraría gravemente la privacidad de los alumnos y expondría al negocio a responsabilidades legales.
2. **Comprobantes Bancarios (`RF-007`, `RNF-002`):** Capturas de transferencias y pagos móviles que contienen datos bancarios, números de cédula/documento de identidad y teléfonos.
3. **Perfil de Carga Concurrente:** En días de cierre o check-ins masivos (domingos y lunes), decenas de alumnos suben simultáneamente hasta 3 fotografías corporales. Hacer pasar los megabytes de estas imágenes a través del servidor web Node.js colapsaría la memoria del proceso y saturaría el ancho de banda del backend.
4. **Costos de Transferencia de Salida (Egress):** El comparador fotográfico interactivo (`RF-004`) permite al entrenador y al alumno deslizar y comparar imágenes de alta resolución mes a mes. En nubes tradicionales (AWS S3 / Google Cloud), el costo de transferencia de salida (\$0.09/GB) representaría un gasto desproporcionado.

### Opciones Consideradas
1. **Opción A (Almacenamiento en Servidor Local / VPS con URLs Públicas):** Guardar en disco `/uploads` y servir con Nginx. *Descartada de inmediato:* Cero aislamiento de seguridad, riesgo de fuga masiva y no escala horizontalmente.
2. **Opción B (AWS S3 con CloudFront y URLs Firmadas):** Estándar de la industria, pero con costos crecientes por transferencia de datos de salida (egress) y configuración compleja de OAC / CloudFront.
3. **Opción C (Cloudflare R2 Storage con URLs Presignadas S3-Compatible):** Bucket 100% privado, compatible con la API S3 de AWS, cifrado AES-256 en reposo y **$0.00 en costos de salida (cero egress fees)**.

---

## 3. Decisión
Elegimos la **Opción C: Cloudflare R2 Storage con Arquitectura de Subida Directa y URLs Presignadas de Expiración Corta (15 minutos)**:

```
[PWA Cliente / Alumno]                [Backend NestJS]             [Cloudflare R2 Bucket]
        │                                    │                               │
        │── 1. POST /presigned-upload-url ──>│                               │
        │      (auth + permisos RBAC)        │── 2. Genera Key UUID y ──────>│
        │                                    │      URL PUT firmada (TTL 15m)│
        │<── 3. Retorna { uploadUrl, key } ──│                               │
        │                                                                    │
        │── 4. PUT /uploadUrl (WebP Comprimido, Direct-to-Storage) ─────────>│
        │      (Cero consumo de memoria/ancho de banda en NestJS)            │
        │                                                                    │
        │── 5. POST /antropometria/checkin ─>│                               │
        │      (Persiste metadatos con key)  │── 6. Asocia key a PostgreSQL  │
        ▼                                    ▼                               ▼
```

### Reglas de Seguridad e Implementación Técnica
1. **Aislamiento Total del Bucket:** El bucket de Cloudflare R2 tiene deshabilitado cualquier acceso público (`Public Access Block`). No existen URLs estáticas accesibles sin firma.
2. **Estructura Jerárquica de Keys:**
   - Antropometría: `antropometria/{alumnoId}/{anio}/{uuid}.webp`
   - Comidas: `comidas/{alumnoId}/{fecha}/{uuid}.webp`
   - Pagos: `comprobantes/{entrenadorId}/{cuotaId}/{uuid}.webp`
3. **Expiración Estricta de Lectura (TTL $\le 15$ minutos, `RNF-001`):** Cuando la API entrega la lista de fotos de progreso o comprobantes, invoca `@aws-sdk/s3-request-presigner` con `expiresIn: 900` (15 minutos). Si un usuario copia la URL y la comparte o si el token expira, el enlace queda automáticamente revocado.
4. **Cifrado en Reposo:** Activación obligatoria de cifrado del lado del servidor SSE-S3 (AES-256) administrado por Cloudflare.

---

## 4. Consecuencias y Trade-offs

### Consecuencias Positivas (Beneficios)
- **Privacidad y Cumplimiento Regulatorio:** Protección biométrica del más alto nivel; URLs no persistentes y acceso condicionado estrictamente al token JWT autenticado.
- **Escalabilidad de Red Extrema:** El servidor de backend solo procesa payloads JSON ligeros de metadatos ($< 2$ KB); todo el tráfico pesado de imágenes va directamente del cliente a la red perimetral de Cloudflare.
- **Cero Costos Ocultos de Egress:** Ahorro financiero total en la descarga y comparación continua de fotos en el dashboard del entrenador.

### Consecuencias Negativas (Trade-offs)
- **Complejidad en el Frontend:** El cliente debe ejecutar dos pasos para subir una imagen (solicitar URL presignada $\rightarrow$ subir binario $\rightarrow$ confirmar guardado). *Mitigación:* Se implementa un servicio encapsulado en la PWA `useDirectUpload()` que maneja reintentos transparentemente.

---

## 5. Trazabilidad y Referencias
- **Problemas que resuelve:** [[PROB-001-adherencia-trazabilidad]], [[PROB-002-cobranza-bimonetaria-fraccionada]]
- **Requerimientos asociados:**
  - [[RNF-001-almacenamiento-seguridad-fotos-progreso]]
  - [[RF-003-checkin-antropometrico-rbac-hibrido]]
  - [[RF-004-evolucion-corporal-comparador-fotografico]]
  - [[RF-007-reporte-pagos-bandeja-conciliacion]]
- **Decisión vinculada:** [[ADR-001-modelo-hibrido-auditoria-antropometrica]]
- **Ciclo de vida de borrado de objetos:** [[ADR-015-borrado-best-effort-objetos-boveda]] (borrado best-effort post-commit en el PUT-replace de recursos de nutrición; guards de estructura/prefijo y respuesta 200 intacta ante fallos).
- **Estado de implementación (drift detectado el 2026-09-24):** el código implementa la clave de comprobantes como `comprobantes/{alumnoId}/{anio}/{uuid}.webp` (tenancy por alumno), mientras §3 de este ADR describe `comprobantes/{entrenadorId}/{cuotaId}/{uuid}.webp`. Se conserva la línea original y esta nota registra la deriva para su reconciliación documental.
