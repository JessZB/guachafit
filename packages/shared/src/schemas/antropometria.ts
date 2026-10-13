import { z } from 'zod';
import { AnguloFoto } from '../enums';
import { DECIMAL_STRING_REGEX, FECHA_CALENDARIO_REGEX } from './comunes';

// =============================================================================
// ANTROPOMETRÍA & BÓVEDA R2 SCHEMAS (Módulo 4: Control Antropométrico & Bóveda R2)
// =============================================================================

/** WU24b: página por defecto y techo duro de `GET /antropometria/pendientes` (cola del coach). */
export const LIMITE_COLA_ANTROPOMETRIA_POR_DEFECTO = 25;
export const LIMITE_COLA_ANTROPOMETRIA_MAXIMO = 100;

/**
 * WU24b: página por defecto y techo duro del slice opt-in de `GET /antropometria/evolucion/:alumnoId`.
 * La serie completa (sin `controlesLimit`/`controlesOffset`) sigue siendo el default para los charts.
 */
export const LIMITE_CONTROLES_EVOLUCION_POR_DEFECTO = 25;
export const LIMITE_CONTROLES_EVOLUCION_MAXIMO = 100;

export const FotoAntropometriaInputSchema = z.object({
  angulo: z.nativeEnum(AnguloFoto),
  storageKey: z.string().min(5, 'La clave de almacenamiento no es válida'),
});

/** RF-003 RN-02: las fotos del check-in son opcionales, pero como máximo una por ángulo. */
export const MENSAJE_FOTOS_ANGULO_REPETIDO =
  'Adjunta como máximo una foto por ángulo (frontal, lateral y posterior).';

/**
 * RNF-001: la clave de una foto no pertenece a la bóveda de antropometría del alumno (o no tiene
 * la estructura que emite el presign). El API la rechaza antes de guardar nada.
 */
export const MENSAJE_FOTO_ANTROPOMETRIA_INVALIDA = 'Una de las fotos no es válida. Vuelve a subirla.';

/**
 * RF-003 §6: medida decimal con rango de saneamiento.
 *
 * Los rangos del doc están fijados para peso (30–300 kg) y % de grasa (2–70%). Los perímetros y
 * pliegues del RN-02 usan cotas de coherencia antropométrica (ISAK) que atrapan el error de tipeo
 * sin rechazar un valor real: el mensaje conserva el mismo formato del peso/grasa y la medida sigue
 * siendo un string decimal de hasta 2 decimales (nunca un `number` flotante).
 */
function decimalEnRango(
  minimo: number,
  maximo: number,
  etiqueta: string,
  unidad: 'cm' | 'mm'
): z.ZodEffects<z.ZodString, string, string> {
  return z
    .string()
    .regex(DECIMAL_STRING_REGEX, `${etiqueta} debe tener formato decimal de hasta 2 decimales`)
    .refine((val) => {
      const num = Number(val);
      return num >= minimo && num <= maximo;
    }, `${etiqueta} debe estar entre ${minimo.toFixed(2)} ${unidad} y ${maximo.toFixed(2)} ${unidad}`);
}

/** Perímetros frecuentes del RN-02 (cm), reutilizables por cualquier variante del contrato. */
const PERIMETRO_BRAZO = (etiqueta: string) => decimalEnRango(10, 80, etiqueta, 'cm');
const PERIMETRO_MUSLO = (etiqueta: string) => decimalEnRango(20, 120, etiqueta, 'cm');

/**
 * RF-003 RN-02: perímetros corporales del control antropométrico.
 *
 * El doc lista: pecho, cintura, cadera, **brazo relajado/contraído**, **muslo medio** y cuello.
 * `brazoCm`/`musloCm` se conservan como ALIAS LEGADOS del brazo relajado y del muslo medio
 * (documentado en el WU RF-003a): no se rompe el contrato previo y el servicio resuelve la
 * precedencia `brazoRelajadoCm ?? brazoCm` al persistir.
 */
export const PerimetrosCorporalesInputSchema = z.object({
  cuelloCm: decimalEnRango(20, 80, 'El cuello', 'cm').optional(),
  pechoCm: decimalEnRango(40, 200, 'El pecho', 'cm').optional(),
  cinturaCm: decimalEnRango(30, 250, 'La cintura', 'cm').optional(),
  caderaCm: decimalEnRango(40, 250, 'La cadera', 'cm').optional(),
  /** RN-02: brazo RELAJADO (dato nuevo; alias legado `brazoCm`). */
  brazoRelajadoCm: PERIMETRO_BRAZO('El brazo relajado').optional(),
  /** RN-02: brazo CONTRAÍDO (dato nuevo, independiente del relajado). */
  brazoContraidoCm: PERIMETRO_BRAZO('El brazo contraído').optional(),
  /** RN-02: muslo MEDIO (dato nuevo; alias legado `musloCm`). */
  musloMedioCm: PERIMETRO_MUSLO('El muslo medio').optional(),
  /** Alias legado del brazo relajado (WU previos). */
  brazoCm: PERIMETRO_BRAZO('El brazo').optional(),
  /** Alias legado del muslo medio (WU previos). */
  musloCm: PERIMETRO_MUSLO('El muslo').optional(),
});

/**
 * RF-003 RN-02: pliegues cutáneos (mm) para la composición corporal estimada.
 * El doc lista tríceps, subescapular, suprailíaco y abdominal. Son opcionales y alternativos al
 * `%` de grasa por bioimpedancia/fórmula (el servicio admite cualquiera de los dos o ambos).
 */
export const PlieguesCutaneosInputSchema = z.object({
  tricepsMm: decimalEnRango(1, 100, 'El pliegue del tríceps', 'mm').optional(),
  subescapularMm: decimalEnRango(1, 100, 'El pliegue subescapular', 'mm').optional(),
  suprailiacoMm: decimalEnRango(1, 100, 'El pliegue suprailíaco', 'mm').optional(),
  abdominalMm: decimalEnRango(1, 100, 'El pliegue abdominal', 'mm').optional(),
});

/** RF-002 RN-01: módulo de la bóveda que solo admite PDFs (recursos del coach). */
export const MODULO_UPLOAD_PDF = 'nutricion-recursos' as const;

export const PresignedUploadUrlSchema = z
  .object({
    modulo: z.enum(['antropometria', 'comidas', 'comprobantes', MODULO_UPLOAD_PDF]),
    alumnoId: z.string().uuid('No encontramos ese alumno. Actualiza la pantalla e inténtalo de nuevo.'),
    angulo: z.nativeEnum(AnguloFoto).optional(),
    mimeType: z.enum(['image/webp', 'image/jpeg', 'application/pdf']),
  })
  .superRefine((valor, ctx) => {
    // RNF-001 §2: cada módulo tiene su familia de MIME. Los recursos nutricionales son PDFs
    // (documentos); las fotos de antropometría y comidas siguen siendo WebP/JPEG optimizados.
    if (valor.modulo === MODULO_UPLOAD_PDF && valor.mimeType !== 'application/pdf') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mimeType'],
        message: 'Los recursos nutricionales solo admiten archivos PDF.',
      });
    }
    if (valor.modulo !== MODULO_UPLOAD_PDF && valor.mimeType === 'application/pdf') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mimeType'],
        message: 'Solo los recursos nutricionales admiten PDF; aquí se permiten imágenes WebP o JPEG.',
      });
    }
  });

export const CheckinAntropometricoSchema = z.object({
  alumnoId: z.string().uuid('No encontramos ese alumno. Actualiza la pantalla e inténtalo de nuevo.'),
  fechaEvaluacion: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)'),
  pesoKg: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El peso en kg debe tener hasta 2 decimales')
    .refine((val) => {
      const num = Number(val);
      return num >= 30 && num <= 300;
    }, 'El peso debe estar entre 30.00 kg y 300.00 kg'),
  alturaCm: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'La altura en cm debe tener hasta 2 decimales')
    .refine((val) => {
      const num = Number(val);
      return num >= 100 && num <= 250;
    }, 'La altura debe estar entre 100.00 cm y 250.00 cm')
    .optional(),
  porcentajeGrasa: z
    .string()
    .regex(DECIMAL_STRING_REGEX, 'El porcentaje de grasa debe tener hasta 2 decimales')
    .refine((val) => {
      const num = Number(val);
      return num >= 2 && num <= 70;
    }, 'El porcentaje de grasa debe estar entre 2.00% y 70.00%')
    .optional(),
  perimetros: PerimetrosCorporalesInputSchema.optional(),
  /** RN-02: composición por pliegues cutáneos (mm); alternativa/complemento del % de grasa. */
  pliegues: PlieguesCutaneosInputSchema.optional(),
  fotos: z
    .array(FotoAntropometriaInputSchema)
    .max(3, 'No se permiten más de 3 fotografías corporales de progreso por evaluación')
    .refine(
      (fotos) => new Set(fotos.map((foto) => foto.angulo)).size === fotos.length,
      MENSAJE_FOTOS_ANGULO_REPETIDO
    )
    .optional(),
  observacionesCoach: z.string().max(1000).optional(),
});

export const ConciliarAntropometriaSchema = z
  .object({
    accion: z.enum(['aprobar', 'rechazar']),
    observacionesCoach: z.string().max(1000).optional(),
    motivoRechazo: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accion === 'rechazar' && (!data.motivoRechazo || data.motivoRechazo.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['motivoRechazo'],
        message: 'El motivo de rechazo es obligatorio al rechazar una evaluación antropométrica',
      });
    }
  });

export const FiltroEvolucionAntropometricaSchema = z.object({
  periodo: z.enum(['1M', '3M', '6M', '1A', 'todo']).optional(),
  desde: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)').optional(),
  hasta: z.string().regex(FECHA_CALENDARIO_REGEX, 'La fecha no es válida. Usa el formato año-mes-día (por ejemplo, 2026-01-31)').optional(),
  /**
   * WU24b: slice OPT-IN de la serie de controles aprobados. Sin ninguno de los dos parámetros,
   * `evaluaciones` devuelve la serie completa (contrato que consumen los charts del alumno).
   * Con `controlesOffset` y sin `controlesLimit`, el servidor aplica la página por defecto.
   */
  controlesLimit: z
    .coerce
    .number()
    .int('El límite de controles debe ser un número entero')
    .min(1, 'El límite de controles debe ser al menos 1')
    .max(LIMITE_CONTROLES_EVOLUCION_MAXIMO, 'El límite de controles no puede exceder 100')
    .optional(),
  controlesOffset: z
    .coerce
    .number()
    .int('La posición de inicio de los controles debe ser un número entero')
    .min(0, 'La posición de inicio de los controles no puede ser negativa')
    .optional(),
});

export const ConsultaComparadorFotograficoSchema = z.object({
  controlIdA: z.string().uuid('No encontramos el primer control que elegiste. Actualiza la pantalla e inténtalo de nuevo.'),
  controlIdB: z.string().uuid('No encontramos el segundo control que elegiste. Actualiza la pantalla e inténtalo de nuevo.'),
  angulo: z.nativeEnum(AnguloFoto),
});
