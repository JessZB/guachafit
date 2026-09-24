import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { R2StorageService } from '../../src/modules/antropometria/r2-storage.service';

// =============================================================================
// RNF-001 E2E REAL DE LA BÓVEDA (MinIO local, docker-compose.yml)
//
// Flujo completo sin stubs: presign PUT del módulo de recursos → PUT HTTP con el Content-Type
// firmado → HeadObject (existe) → `eliminarObjeto` → HeadObject 404, con limpieza en `finally`.
// Gateado por `STORAGE_ENDPOINT`: sin bóveda configurada el spec se salta limpio, así la suite
// unitaria nunca depende de Docker.
//
// Ejecución local (credenciales dev del compose):
//   $env:STORAGE_ENDPOINT='http://localhost:9000'; $env:STORAGE_BUCKET='guachafit-r2-local';
//   $env:STORAGE_ACCESS_KEY_ID='minioadmin'; $env:STORAGE_SECRET_ACCESS_KEY='minioadmin';
//   pnpm vitest run test/bdd/rnf001-r2-delete-minio.e2e.spec.ts
// =============================================================================

const endpoint = process.env.STORAGE_ENDPOINT;
const bucket =
  process.env.STORAGE_BUCKET ?? process.env.STORAGE_BUCKET_NAME ?? 'guachafit-r2-local';
const accessKeyId =
  process.env.STORAGE_ACCESS_KEY_ID ?? process.env.STORAGE_ACCESS_KEY ?? 'minioadmin';
const secretAccessKey =
  process.env.STORAGE_SECRET_ACCESS_KEY ?? process.env.STORAGE_SECRET_KEY ?? 'minioadmin';
const region = process.env.STORAGE_REGION ?? 'us-east-1';
const esCloudflareR2 = endpoint?.includes('r2.cloudflarestorage.com') ?? false;

describe.runIf(Boolean(endpoint))(
  'RNF-001 E2E: eliminación real de objetos en la bóveda (MinIO local)',
  () => {
    it('un PDF subido por presign PUT se elimina con eliminarObjeto y HeadObject responde 404', async () => {
      const endpointE2E = endpoint as string;

      // Bóveda real: mismo camino de configuración que producción (alias STORAGE_*).
      const boveda = new R2StorageService(
        new ConfigService({
          STORAGE_ENDPOINT: endpointE2E,
          STORAGE_BUCKET: bucket,
          STORAGE_REGION: region,
          STORAGE_ACCESS_KEY_ID: accessKeyId,
          STORAGE_SECRET_ACCESS_KEY: secretAccessKey,
          STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE ?? String(!esCloudflareR2),
        })
      );

      // Cliente S3 independiente para verificar el estado real del objeto en el bucket.
      const s3 = new S3Client({
        endpoint: endpointE2E,
        region,
        forcePathStyle: !esCloudflareR2,
        credentials: { accessKeyId, secretAccessKey },
      });

      let storageKey: string | undefined;
      try {
        // 1) Presign PUT del módulo de recursos (PDF, RNF-001 §2).
        const presign = await boveda.generarPresignedUploadUrl({
          modulo: 'nutricion-recursos',
          alumnoId: randomUUID(),
          mimeType: 'application/pdf',
        });
        storageKey = presign.storageKey;

        expect(boveda.estaEnModoMock()).toBe(false);
        expect(boveda.validarStorageKey(storageKey)).toBe(true);

        // 2) PUT real desde el "navegador": el Content-Type declarado viaja firmado y debe
        //    enviarse EXACTO (otro valor lo rechaza con 403).
        const contenido = new TextEncoder().encode('%PDF-1.4\n% Guachafit RNF-001 E2E\n%%EOF\n');
        const respuestaPut = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: contenido,
        });
        expect(respuestaPut.status).toBe(200);

        // 3) El objeto existe antes del borrado.
        const headAntes = await s3.send(
          new HeadObjectCommand({ Bucket: bucket, Key: storageKey })
        );
        expect(headAntes.ContentLength).toBe(contenido.byteLength);

        // 4) eliminarObjeto borra el objeto real (DeleteObject idempotente).
        await boveda.eliminarObjeto(storageKey);

        // 5) HeadObject ya no lo encuentra: 404 del almacenamiento.
        const errorHead = await s3
          .send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }))
          .then(
            () => null,
            (error: any) => error
          );
        expect(errorHead).not.toBeNull();
        expect(errorHead.$metadata?.httpStatusCode).toBe(404);
      } finally {
        // Limpieza best-effort incluso si una aserción falló a mitad de camino.
        if (storageKey) {
          try {
            await boveda.eliminarObjeto(storageKey);
          } catch {
            // El fallo de limpieza no debe enmascarar el fallo original del test.
          }
        }
        s3.destroy();
      }
    });
  }
);
