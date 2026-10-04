import { Injectable, Optional, Inject, Logger } from '@nestjs/common';
import { parsearContrato } from '../../common/errores/parsear-contrato';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import {
  PresignedUploadUrlDTO,
  PresignedUploadUrlSchema,
  PresignedUploadUrlResponseDTO,
} from '@guachafit/shared';

// =============================================================================
// CONFIGURACIÓN DEL ENTORNO (RNF-001, ADR-007)
//
// El `.env` del proyecto declara la bóveda con la familia `STORAGE_*` (y el histórico `R2_*`).
// Se aceptan ambas, en orden de prioridad, para que un despliegue no dependa de un solo nombre.
// En local el endpoint apunta a MinIO (`http://localhost:9000`, namespace S3), que exige
// direccionamiento path-style (`/bucket/key`) — a diferencia del virtual-hosted de R2.
// =============================================================================
import {
  ENV_ACCESS_KEY_ID,
  ENV_BUCKET,
  ENV_ENDPOINT,
  ENV_SECRET_ACCESS_KEY,
} from '../../common/config/variables-almacenamiento';

// Alias de la bóveda: la definición vive en `common/config` (fuente única) y aquí solo se
// re-exportan para no romper los imports existentes de este servicio.
export { ENV_ACCESS_KEY_ID, ENV_BUCKET, ENV_ENDPOINT, ENV_SECRET_ACCESS_KEY };

export const ENV_REGION = ['STORAGE_REGION', 'R2_REGION'] as const;
export const ENV_FORCE_PATH_STYLE = ['STORAGE_FORCE_PATH_STYLE', 'R2_FORCE_PATH_STYLE'] as const;

const ENDPOINT_MOCK = 'https://mock-account.r2.cloudflarestorage.com';
const BUCKET_POR_DEFECTO = 'guachafit-biometric-vault';
const ACCESS_KEY_MOCK = 'mock-access-key-id-guachafit';
const SECRET_KEY_MOCK = 'mock-secret-access-key-guachafit-32chars';

type ModuloStorageKey = 'antropometria' | 'comidas' | 'comprobantes' | 'nutricion-recursos';

const EXTENSION_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** Primer valor no vacío de la lista de alias, tal como lo expone ConfigService. */
function leerAlias(cfg: ConfigService, nombres: readonly string[]): string | undefined {
  for (const nombre of nombres) {
    const valor = cfg.get<string>(nombre);
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
      return String(valor).trim();
    }
  }
  return undefined;
}

function leerBooleano(cfg: ConfigService, nombres: readonly string[]): boolean | undefined {
  const valor = leerAlias(cfg, nombres)?.toLowerCase();
  if (valor === undefined) return undefined;
  if (['true', '1', 'yes', 'si'].includes(valor)) return true;
  if (['false', '0', 'no'].includes(valor)) return false;
  return undefined;
}

/** `true` para endpoints de Cloudflare R2 (virtual-hosted por defecto); `false` para MinIO/S3 local. */
function esEndpointCloudflareR2(endpoint: string): boolean {
  try {
    return new URL(endpoint).hostname.endsWith('.r2.cloudflarestorage.com');
  } catch {
    return endpoint.includes('r2.cloudflarestorage.com');
  }
}

@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;
  /** `true` solo cuando NO hay ninguna configuración de bóveda: se usan endpoint/credenciales de marcador. */
  private readonly modoMock: boolean;

  /**
   * La inyección de `ConfigService` es EXPLÍCITA (`@Inject`) a propósito: el parámetro acepta el
   * modo legado posicional (`bucket`, `endpoint`) que usan los tests del engine, y un tipo unión
   * `ConfigService | string` emite `design:paramtypes [Object, String]`. Sin el token explícito,
   * Nest no puede resolver el primer parámetro (lo entrega `undefined` por `@Optional`) y la
   * bóveda caía SIEMPRE al endpoint mock aunque el entorno estuviese configurado.
   */
  constructor(
    @Optional() @Inject(ConfigService) configOrBucket?: ConfigService | string,
    @Optional() @Inject('ENDPOINT_OR_BUCKET') endpointOrBucket?: string
  ) {
    if (typeof configOrBucket === 'string') {
      // Compatibilidad con la construcción posicional de los tests/engines: bucket + endpoint.
      this.bucketName = configOrBucket;
      this.endpoint = endpointOrBucket || ENDPOINT_MOCK;
      this.modoMock = false;
      this.s3Client = this.crearCliente({
        endpoint: this.endpoint,
        region: 'auto',
        accessKeyId: ACCESS_KEY_MOCK,
        secretAccessKey: SECRET_KEY_MOCK,
        forcePathStyle: !esEndpointCloudflareR2(this.endpoint),
      });
      return;
    }

    const cfg = configOrBucket as ConfigService | undefined;
    const tieneConfig = Boolean(cfg) && typeof cfg?.get === 'function';

    const endpointLeido = tieneConfig ? leerAlias(cfg!, ENV_ENDPOINT) : undefined;
    const bucketLeido = tieneConfig ? leerAlias(cfg!, ENV_BUCKET) : undefined;
    const accessKeyLeida = tieneConfig ? leerAlias(cfg!, ENV_ACCESS_KEY_ID) : undefined;
    const secretKeyLeida = tieneConfig ? leerAlias(cfg!, ENV_SECRET_ACCESS_KEY) : undefined;

    this.modoMock = !endpointLeido && !bucketLeido && !accessKeyLeida && !secretKeyLeida;

    if (this.modoMock) {
      // Sin configuración de bóveda: endpoint y credenciales de marcador, documentados. Las URLs
      // firmadas siguen siendo válidas criptográficamente (el presign no toca la red), pero no
      // apuntan a un bucket real. Producción/local SIEMPRE configuran `STORAGE_*`/`R2_*`.
      this.bucketName = BUCKET_POR_DEFECTO;
      this.endpoint = ENDPOINT_MOCK;
      this.logger.warn(
        `Bóveda sin configuración (${ENV_ENDPOINT[0]}/${ENV_ENDPOINT[1]} ausentes): se usa el endpoint de marcador ${ENDPOINT_MOCK}.`
      );
    } else {
      this.bucketName = bucketLeido ?? BUCKET_POR_DEFECTO;
      this.endpoint = endpointLeido ?? ENDPOINT_MOCK;
      if (!accessKeyLeida || !secretKeyLeida) {
        this.logger.warn(
          `Bóveda configurada sin credenciales completas (${ENV_ACCESS_KEY_ID[0]} / ${ENV_SECRET_ACCESS_KEY[0]}): las firmas no serán aceptadas por el almacenamiento.`
        );
      }
    }

    const region =
      (tieneConfig ? leerAlias(cfg!, ENV_REGION) : undefined) ??
      (esEndpointCloudflareR2(this.endpoint) ? 'auto' : 'us-east-1');
    const forcePathStyle =
      (tieneConfig ? leerBooleano(cfg!, ENV_FORCE_PATH_STYLE) : undefined) ??
      !esEndpointCloudflareR2(this.endpoint);

    this.s3Client = this.crearCliente({
      endpoint: this.endpoint,
      region,
      accessKeyId: accessKeyLeida ?? ACCESS_KEY_MOCK,
      secretAccessKey: secretKeyLeida ?? SECRET_KEY_MOCK,
      forcePathStyle,
    });
  }

  private crearCliente(opciones: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  }): S3Client {
    return new S3Client({
      region: opciones.region,
      endpoint: opciones.endpoint,
      // MinIO y los S3 locales no resuelven buckets por subdominio; R2 sí admite virtual-hosted.
      forcePathStyle: opciones.forcePathStyle,
      credentials: {
        accessKeyId: opciones.accessKeyId,
        secretAccessKey: opciones.secretAccessKey,
      },
      // SDK v3.729+ exige checksum por defecto en PutObject; un PUT presignado desde el navegador
      // no puede calcularlo, así que solo se pide cuando el almacenamiento lo exige.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /**
   * Genera una clave jerárquica segura para Cloudflare R2 (ADR-007).
   * Formato:
   * - antropometria: antropometria/{alumnoId}/{anio}/{uuid}.webp
   * - comidas: comidas/{alumnoId}/{fecha}/{uuid}.webp
   * - comprobantes: comprobantes/{alumnoId}/{anio}/{uuid}.webp
   * - nutricion-recursos: nutricion-recursos/{alumnoId}/{anio}/{uuid}.pdf
   */
  construirStorageKey(
    alumnoId: string,
    anioOrFecha: number | string,
    uuid: string,
    extension = 'webp',
    modulo: ModuloStorageKey = 'antropometria'
  ): string {
    return `${modulo}/${alumnoId}/${anioOrFecha}/${uuid}.${extension}`;
  }

  /**
   * Valida la estructura estricta del storageKey según ADR-007 y RNF-001.
   * Función pura y estática: los servicios que no inyectan la bóveda (p. ej. metas de nutrición
   * en tests unitarios) pueden validar la clave sin instanciar el cliente S3.
   */
  static validarStorageKeyEstructura(storageKey: string): boolean {
    const regex =
      /^(antropometria|comidas|comprobantes|nutricion-recursos)\/[0-9a-fA-F-]{36}\/(\d{4}|\d{4}-\d{2}-\d{2})\/[0-9a-fA-F-]{36}\.(webp|jpeg|jpg|pdf)$/;
    return regex.test(storageKey);
  }

  validarStorageKey(storageKey: string): boolean {
    return R2StorageService.validarStorageKeyEstructura(storageKey);
  }

  /** Endpoint efectivo resuelto (útil para diagnóstico y tests de la inyección). */
  obtenerEndpoint(): string {
    return this.endpoint;
  }

  /** `true` cuando no hay configuración de bóveda y se usa el modo marcador (nunca en producción). */
  estaEnModoMock(): boolean {
    return this.modoMock;
  }

  /**
   * Genera Presigned Upload URL PUT con TTL de 15 min (900 segundos) (RNF-001, ADR-007).
   */
  async generarPresignedUploadUrl(
    dto: PresignedUploadUrlDTO,
    customUuid?: string
  ): Promise<PresignedUploadUrlResponseDTO> {
    const validado = parsearContrato(PresignedUploadUrlSchema, dto);
    const uuid = customUuid ?? randomUUID();
    const extension = EXTENSION_POR_MIME[validado.mimeType] ?? 'webp';

    let storageKey: string;
    if (validado.modulo === 'comidas') {
      const fecha = new Date().toISOString().split('T')[0];
      storageKey = this.construirStorageKey(validado.alumnoId, fecha, uuid, extension, 'comidas');
    } else if (validado.modulo === 'comprobantes') {
      const anio = new Date().getUTCFullYear();
      storageKey = this.construirStorageKey(validado.alumnoId, anio, uuid, extension, 'comprobantes');
    } else if (validado.modulo === 'nutricion-recursos') {
      const anio = new Date().getUTCFullYear();
      storageKey = this.construirStorageKey(validado.alumnoId, anio, uuid, extension, 'nutricion-recursos');
    } else {
      const anio = new Date().getUTCFullYear();
      storageKey = this.construirStorageKey(validado.alumnoId, anio, uuid, extension, 'antropometria');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: validado.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 900,
      // RNF-001 §2: el `Content-Type` declarado viaja FIRMADO. El almacenamiento rechaza con 403
      // un PUT que no lo envíe exactamente igual, así el MIME autorizado por módulo (PDF en
      // recursos, WebP/JPEG en fotos) no se puede sustituir al momento de subir.
      signableHeaders: new Set(['content-type']),
    });

    return {
      uploadUrl,
      storageKey,
      expiresInSeconds: 900,
      key: storageKey,
    };
  }

  /**
   * Genera Presigned GET URL para lectura de archivos privados con TTL de 900s (RNF-001).
   */
  async generarPresignedGetUrl(storageKey: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Elimina un objeto de la bóveda (RF-002, RNF-001). Lo usa el ciclo de vida de las metas de
   * nutrición cuando un PUT deja de referenciar un PDF: sin borrado, el objeto queda huérfano.
   *
   * Flujo best-effort: los casos que este método puede descartar sin red NO lanzan — una clave
   * que no cumple la estructura ADR-007 (podría apuntar fuera del namespace de la aplicación) y
   * el modo mock (el endpoint de marcador no tiene bucket real: un `send()` intentaría red
   * contra él). Ambos se avisan con warning y retornan. Un fallo de red sí se propaga: el
   * llamador best-effort (`NutricionService`) lo contiene para no tumbar la respuesta de negocio.
   * `DeleteObject` es idempotente: borrar una clave ya inexistente también responde 204.
   */
  async eliminarObjeto(storageKey: string): Promise<void> {
    if (!R2StorageService.validarStorageKeyEstructura(storageKey)) {
      this.logger.warn(
        `No se elimina '${storageKey}': la clave no cumple la estructura de almacenamiento esperada (ADR-007).`
      );
      return;
    }

    if (this.modoMock) {
      this.logger.warn(
        `No se elimina '${storageKey}': la bóveda está en modo mock (${ENV_ENDPOINT[0]}/${ENV_ENDPOINT[1]} sin configurar).`
      );
      return;
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    await this.s3Client.send(command);
  }
}
