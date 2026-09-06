import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import {
  PresignedUploadUrlDTO,
  PresignedUploadUrlSchema,
  PresignedUploadUrlResponseDTO,
} from '@guachafit/shared';

@Injectable()
export class R2StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private endpoint: string;

  constructor(
    @Optional() configOrBucket?: ConfigService | string,
    endpointOrBucket?: string
  ) {
    let accessKeyId = 'mock-access-key-id-guachafit';
    let secretAccessKey = 'mock-secret-access-key-guachafit-32chars';

    if (typeof configOrBucket === 'string') {
      this.bucketName = configOrBucket;
      this.endpoint = endpointOrBucket || 'https://mock-account.r2.cloudflarestorage.com';
    } else if (configOrBucket && typeof (configOrBucket as ConfigService).get === 'function') {
      const cfg = configOrBucket as ConfigService;
      this.bucketName = cfg.get<string>('R2_BUCKET_NAME') || 'guachafit-biometric-vault';
      this.endpoint = cfg.get<string>('R2_ENDPOINT') || 'https://mock-account.r2.cloudflarestorage.com';
      accessKeyId = cfg.get<string>('R2_ACCESS_KEY_ID') || accessKeyId;
      secretAccessKey = cfg.get<string>('R2_SECRET_ACCESS_KEY') || secretAccessKey;
    } else {
      this.bucketName = 'guachafit-biometric-vault';
      this.endpoint = 'https://mock-account.r2.cloudflarestorage.com';
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Genera una clave jerárquica segura para Cloudflare R2 (ADR-007).
   * Formato:
   * - antropometria: antropometria/{alumnoId}/{anio}/{uuid}.webp
   * - comidas: comidas/{alumnoId}/{fecha}/{uuid}.webp
   * - comprobantes: comprobantes/{alumnoId}/{anio}/{uuid}.webp
   */
  construirStorageKey(
    alumnoId: string,
    anioOrFecha: number | string,
    uuid: string,
    extension = 'webp',
    modulo: 'antropometria' | 'comidas' | 'comprobantes' = 'antropometria'
  ): string {
    return `${modulo}/${alumnoId}/${anioOrFecha}/${uuid}.${extension}`;
  }

  /**
   * Valida la estructura estricta del storageKey según ADR-007 y RNF-001.
   */
  validarStorageKey(storageKey: string): boolean {
    const regex = /^(antropometria|comidas|comprobantes)\/[0-9a-fA-F-]{36}\/(\d{4}|\d{4}-\d{2}-\d{2})\/[0-9a-fA-F-]{36}\.(webp|jpeg|jpg)$/;
    return regex.test(storageKey);
  }

  /**
   * Genera Presigned Upload URL PUT con TTL de 15 min (900 segundos) (RNF-001, ADR-007).
   */
  async generarPresignedUploadUrl(
    dto: PresignedUploadUrlDTO,
    customUuid?: string
  ): Promise<PresignedUploadUrlResponseDTO> {
    const validado = PresignedUploadUrlSchema.parse(dto);
    const uuid = customUuid ?? randomUUID();
    const extension = validado.mimeType === 'image/jpeg' ? 'jpeg' : 'webp';

    let storageKey: string;
    if (validado.modulo === 'comidas') {
      const fecha = new Date().toISOString().split('T')[0];
      storageKey = this.construirStorageKey(validado.alumnoId, fecha, uuid, extension, 'comidas');
    } else if (validado.modulo === 'comprobantes') {
      const anio = new Date().getUTCFullYear();
      storageKey = this.construirStorageKey(validado.alumnoId, anio, uuid, extension, 'comprobantes');
    } else {
      const anio = new Date().getUTCFullYear();
      storageKey = this.construirStorageKey(validado.alumnoId, anio, uuid, extension, 'antropometria');
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: validado.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

    return {
      uploadUrl,
      storageKey,
      expiresInSeconds: 900,
      key: storageKey,
    };
  }

  /**
   * Genera Presigned GET URL para lectura de fotos privadas con TTL de 900s (RNF-001).
   */
  async generarPresignedGetUrl(storageKey: string, expiresInSeconds = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
  }
}
