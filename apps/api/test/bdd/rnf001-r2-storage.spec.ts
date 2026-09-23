import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  AnguloFoto,
  PresignedUploadUrlSchema,
} from '@guachafit/shared';
import { R2StorageService } from './helpers/antropometria-test-engine';

describe('RNF-001: Almacenamiento Seguro, Privacidad y Bóveda Cloudflare R2', () => {
  const r2Storage = new R2StorageService(
    'guachafit-biometric-vault',
    'https://mock-account.r2.cloudflarestorage.com'
  );

  const alumnoId = 'a5555555-5555-4555-8555-555555555555';
  const customUuid = 'b6666666-6666-4666-8666-666666666666';

  describe('Escenario 1: Generación de Presigned Upload URL PUT con Cloudflare R2 / S3 Client (TTL 15 min / 900s)', () => {
    it('debe generar una URL presignada con método PUT, TTL exactamente de 900s y cabeceras de firma SigV4', async () => {
      // Given una petición válida para subir una fotografía antropométrica en formato WebP
      const uploadPayload = {
        modulo: 'antropometria' as const,
        alumnoId,
        angulo: AnguloFoto.FRONTAL,
        mimeType: 'image/webp' as const,
      };

      // Validar contrato con PresignedUploadUrlSchema
      const parseResult = PresignedUploadUrlSchema.safeParse(uploadPayload);
      expect(parseResult.success).toBe(true);

      // When se invoca la generación de URL presignada de subida directa (Direct-to-Storage, ADR-007)
      const resultado = await r2Storage.generarPresignedUploadUrl(uploadPayload, customUuid);

      // Then la respuesta debe incluir uploadUrl, storageKey y expiración de 900s
      expect(resultado.expiresInSeconds).toBe(900);
      expect(resultado.storageKey).toBe(`antropometria/${alumnoId}/2026/${customUuid}.webp`);
      expect(resultado.key).toBe(resultado.storageKey);

      // And la URL presignada debe contener el endpoint de Cloudflare R2 y los parámetros de autenticación SigV4
      expect(resultado.uploadUrl).toContain('mock-account.r2.cloudflarestorage.com');
      expect(resultado.uploadUrl).toContain('guachafit-biometric-vault');
      expect(resultado.uploadUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(resultado.uploadUrl).toContain('X-Amz-Expires=900');
      expect(resultado.uploadUrl).toContain('X-Amz-Signature=');
    });

    it('debe soportar imágenes WebP y JPEG con las extensiones adecuadas', async () => {
      const jpegPayload = {
        modulo: 'antropometria' as const,
        alumnoId,
        angulo: AnguloFoto.LATERAL,
        mimeType: 'image/jpeg' as const,
      };

      const resultado = await r2Storage.generarPresignedUploadUrl(jpegPayload, customUuid);
      expect(resultado.storageKey.endsWith('.jpeg')).toBe(true);
      expect(resultado.expiresInSeconds).toBe(900);
    });
  });

  describe('Escenario 2: Estructura Jerárquica de storageKey (ADR-007)', () => {
    it('debe generar una clave de almacenamiento con formato estricto: antropometria/{alumnoId}/{anio}/{uuid}.webp', () => {
      const anio = 2026;
      const key = r2Storage.construirStorageKey(alumnoId, anio, customUuid, 'webp');

      expect(key).toBe(`antropometria/${alumnoId}/2026/${customUuid}.webp`);
      expect(r2Storage.validarStorageKey(key)).toBe(true);
    });

    it('debe rechazar claves de almacenamiento que no cumplan la convención de seguridad y privacidad', () => {
      // Claves inválidas (nombres arbitrarios, sin partición por alumno, o sin UUID)
      expect(r2Storage.validarStorageKey('uploads/foto.png')).toBe(false);
      expect(r2Storage.validarStorageKey('antropometria/foto_carlos.webp')).toBe(false);
      expect(r2Storage.validarStorageKey('antropometria/123/foto.webp')).toBe(false);
      expect(r2Storage.validarStorageKey(`antropometria/${alumnoId}/foto.exe`)).toBe(false);
    });
  });

  describe('Escenario 3: Presigned GET URL para Lectura de Fotos Privadas (TTL 900s, RNF-001 & ADR-007)', () => {
    it('debe generar URL presignada GET con TTL de 900s garantizando aislamiento total del bucket (sin URLs estáticas públicas)', async () => {
      const storageKey = `antropometria/${alumnoId}/2026/${customUuid}.webp`;

      // When se genera la URL de lectura privada
      const getUrl = await r2Storage.generarPresignedGetUrl(storageKey, 900);

      // Then debe ser una URL temporal firmada criptográficamente
      expect(getUrl).toContain('mock-account.r2.cloudflarestorage.com');
      expect(getUrl).toContain(storageKey);
      expect(getUrl).toContain('X-Amz-Expires=900');
      expect(getUrl).toContain('X-Amz-Signature=');

      // And no debe ser una URL pública estática sin parámetros de firma
      const urlObj = new URL(getUrl);
      expect(urlObj.searchParams.has('X-Amz-Signature')).toBe(true);
      expect(urlObj.searchParams.get('X-Amz-Expires')).toBe('900');
    });
  });

  describe('Escenario 4: Validación de Tipos MIME Permitidos y Módulos de Carga (RNF-001 §2)', () => {
    it('debe rechazar solicitudes de subida con tipos MIME no permitidos (ej. PDF, GIF, PNG no optimizado)', () => {
      const mimePdf = PresignedUploadUrlSchema.safeParse({
        modulo: 'antropometria',
        alumnoId,
        mimeType: 'application/pdf',
      });
      expect(mimePdf.success).toBe(false);

      const mimeGif = PresignedUploadUrlSchema.safeParse({
        modulo: 'antropometria',
        alumnoId,
        mimeType: 'image/gif',
      });
      expect(mimeGif.success).toBe(false);
    });

    it('RF-002 RN-01: acepta PDF SOLO para el módulo de recursos nutricionales', () => {
      const pdfRecursos = PresignedUploadUrlSchema.safeParse({
        modulo: 'nutricion-recursos',
        alumnoId,
        mimeType: 'application/pdf',
      });
      expect(pdfRecursos.success).toBe(true);

      // El módulo de recursos es documental: una imagen no es un recurso válido.
      const imagenEnRecursos = PresignedUploadUrlSchema.safeParse({
        modulo: 'nutricion-recursos',
        alumnoId,
        mimeType: 'image/webp',
      });
      expect(imagenEnRecursos.success).toBe(false);

      // Y el PDF sigue vetado en los módulos de imágenes (comidas/comprobantes/antropometría).
      const pdfEnComidas = PresignedUploadUrlSchema.safeParse({
        modulo: 'comidas',
        alumnoId,
        mimeType: 'application/pdf',
      });
      expect(pdfEnComidas.success).toBe(false);
    });

    it('RF-002 RN-01: genera storageKey .pdf del módulo de recursos y la valida estructuralmente', async () => {
      const resultado = await r2Storage.generarPresignedUploadUrl(
        { modulo: 'nutricion-recursos', alumnoId, mimeType: 'application/pdf' },
        customUuid
      );

      expect(resultado.storageKey).toBe(`nutricion-recursos/${alumnoId}/2026/${customUuid}.pdf`);
      expect(resultado.expiresInSeconds).toBe(900);
      expect(r2Storage.validarStorageKey(resultado.storageKey)).toBe(true);
      // El Content-Type autorizado viaja firmado: el PUT debe declararlo exactamente.
      expect(decodeURIComponent(resultado.uploadUrl)).toContain('X-Amz-SignedHeaders=content-type');

      // Una clave de otro módulo (o con extensión no documental) no es una clave de recurso.
      expect(r2Storage.validarStorageKey(`antropometria/${alumnoId}/2026/${customUuid}.webp`)).toBe(true);
      expect(
        r2Storage.validarStorageKey(`nutricion-recursos/${alumnoId}/2026/${customUuid}.exe`)
      ).toBe(false);
    });

    it('debe rechazar solicitudes con UUID de alumno inválido', () => {
      const uuidInvalido = PresignedUploadUrlSchema.safeParse({
        modulo: 'antropometria',
        alumnoId: 'no-es-un-uuid',
        mimeType: 'image/webp',
      });
      expect(uuidInvalido.success).toBe(false);
      if (!uuidInvalido.success) {
        expect(uuidInvalido.error.errors[0].message).toMatch(/UUID válido/i);
      }
    });
  });

  describe('Escenario 5: Inyección real de la configuración del entorno (regresión RNF-001)', () => {
    const alumnoIdPresign = 'a5555555-5555-4555-8555-555555555555';

    async function bovedaInyectada(valores: Record<string, string | undefined>) {
      const modulo = await Test.createTestingModule({
        providers: [
          R2StorageService,
          {
            provide: ConfigService,
            useValue: { get: (clave: string) => valores[clave] },
          },
        ],
      }).compile();
      return modulo.get(R2StorageService);
    }

    it('la bóveda inyectada por el contenedor Nest lee STORAGE_* y NO cae al endpoint mock', async () => {
      const boveda = await bovedaInyectada({
        STORAGE_ENDPOINT: 'http://localhost:9000',
        STORAGE_BUCKET: 'guachafit-r2-local',
        STORAGE_REGION: 'us-east-1',
        STORAGE_ACCESS_KEY_ID: 'minioadmin',
        STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
      });

      expect(boveda.obtenerEndpoint()).toBe('http://localhost:9000');
      expect(boveda.estaEnModoMock()).toBe(false);

      const resultado = await boveda.generarPresignedUploadUrl(
        { modulo: 'antropometria', alumnoId: alumnoIdPresign, mimeType: 'image/webp' },
        customUuid
      );
      expect(resultado.uploadUrl).toContain('localhost:9000');
      expect(resultado.uploadUrl).toContain('guachafit-r2-local');
      expect(resultado.uploadUrl).not.toContain('mock-account');
    });

    it('acepta también la familia histórica R2_* del entorno', async () => {
      const boveda = await bovedaInyectada({
        R2_ENDPOINT: 'https://cuenta-real.r2.cloudflarestorage.com',
        R2_BUCKET_NAME: 'guachafit-biometric-vault',
        R2_ACCESS_KEY_ID: 'clave-real',
        R2_SECRET_ACCESS_KEY: 'secreto-real',
      });

      expect(boveda.obtenerEndpoint()).toBe('https://cuenta-real.r2.cloudflarestorage.com');
      expect(boveda.estaEnModoMock()).toBe(false);
    });

    it('sin configuración de bóveda queda el modo mock documentado (NUNCA en producción)', async () => {
      const boveda = await bovedaInyectada({});

      expect(boveda.estaEnModoMock()).toBe(true);
      expect(boveda.obtenerEndpoint()).toContain('mock-account.r2.cloudflarestorage.com');
    });
  });
});
