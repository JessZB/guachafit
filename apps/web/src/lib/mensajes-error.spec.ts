import { describe, expect, it } from 'vitest';
import {
  describirRechazoCola,
  traducirMensajeSuelto,
  esMensajeAmigable,
  extraerMensajeServidor,
  MENSAJE_CREDENCIALES_INCORRECTAS,
  MENSAJE_ERROR_GENERICO,
  MENSAJE_SESION_VENCIDA,
  MENSAJE_SIN_CONEXION,
  MENSAJE_SIN_PERMISO,
  traducirErrorHttp,
} from './mensajes-error';

describe('mensajes-error: textos humanos para errores de la API', () => {
  it('expone los textos acordados en tuteo y sin jerga', () => {
    expect(MENSAJE_SIN_CONEXION).toBe(
      'No hay conexión a internet. Revisa tu red e inténtalo de nuevo.'
    );
    expect(MENSAJE_SESION_VENCIDA).toBe('Tu sesión venció. Inicia sesión de nuevo.');
    expect(MENSAJE_CREDENCIALES_INCORRECTAS).toBe('Correo o contraseña incorrectos.');
    expect(MENSAJE_SIN_PERMISO).toBe('No tienes permiso para ver esta sección.');
    expect(MENSAJE_ERROR_GENERICO).toBe(
      'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.'
    );
  });

  describe('esMensajeAmigable (heurística explícita)', () => {
    it.each([
      'Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde.',
      'Tu acceso a la planificación se encuentra pausado por mensualidad pendiente. Reporta tu pago para reactivarlo.',
      'Credenciales inválidas.',
      'Este correo ya se encuentra registrado.',
    ])('acepta mensajes de negocio legibles: %s', (mensaje) => {
      expect(esMensajeAmigable(mensaje)).toBe(true);
    });

    it.each([
      'Token inválido o expirado: jwt expired',
      'Formato de Bearer token inválido',
      'Encabezado de autorización ausente',
      'Acceso denegado: Se requiere uno de los roles [entrenador], pero el rol actual es alumno.',
      'Refresh token expirado o inválido.',
      'Internal server error',
      'ZodError: Expected string, received undefined',
      'Cannot read properties of null',
      'tenant_id no coincide',
      'Unauthorized',
      'Forbidden',
      'HTTP Error 500',
      '',
      '   ',
    ])('rechaza mensajes técnicos: "%s"', (mensaje) => {
      expect(esMensajeAmigable(mensaje)).toBe(false);
    });

    it.each([
      "Transición inválida: No se puede iniciar una sesión en estado 'en_progreso'. Solo se permite desde 'planificada'.",
      "Operación denegada: Solo se pueden registrar series en sesiones con estado 'en_progreso'. Estado actual: 'completada'.",
      "Sesión de entrenamiento con ID 'abc-123' no encontrada.",
      'El alumnoId no es un UUID válido.',
      "El timestamp de inicio '2026-10-02T10:00' debe estar en UTC estricto (terminar en 'Z').",
      'El peso debe enviarse como string decimal.',
      'El bloqueId es obligatorio para entrenar un bloque.',
      'Violación de Aislamiento de Tenant detectada.',
    ])('rechaza mensajes técnicos de la API de entrenamiento: "%s"', (mensaje) => {
      expect(esMensajeAmigable(mensaje)).toBe(false);
    });

    it('los rechazos técnicos de la API se reemplazan por el genérico según el status', () => {
      expect(
        traducirErrorHttp(
          400,
          "Operación denegada: Solo se pueden registrar series en sesiones con estado 'en_progreso'. Estado actual: 'planificada'.",
          'general'
        )
      ).toBe(MENSAJE_ERROR_GENERICO);
      expect(traducirErrorHttp(404, "Sesión con ID 'x' no encontrada.", 'general')).toBe(
        MENSAJE_ERROR_GENERICO
      );
      expect(traducirErrorHttp(403, 'Violación de Aislamiento de Tenant.', 'general')).toBe(
        MENSAJE_SIN_PERMISO
      );
    });

    it('rechaza valores que no son texto', () => {
      expect(esMensajeAmigable(undefined)).toBe(false);
      expect(esMensajeAmigable(null)).toBe(false);
      expect(esMensajeAmigable(['a', 'b'])).toBe(false);
    });
  });

  describe('extraerMensajeServidor', () => {
    it('prioriza detail (RFC 7807) y luego message (cuerpo por defecto de NestJS)', () => {
      expect(extraerMensajeServidor({ detail: 'Detalle', message: 'Otro' })).toBe('Detalle');
      expect(extraerMensajeServidor({ message: 'Credenciales inválidas.', statusCode: 401 })).toBe(
        'Credenciales inválidas.'
      );
    });

    it('descarta listas de validación y cuerpos sin texto', () => {
      expect(extraerMensajeServidor({ message: ['email must be an email'] })).toBeNull();
      expect(extraerMensajeServidor(null)).toBeNull();
      expect(extraerMensajeServidor('texto plano')).toBeNull();
    });
  });

  describe('textos derivados para la cola y resultados por alumno', () => {
    it('describirRechazoCola usa el motivo legible o una frase sin texto técnico', () => {
      expect(describirRechazoCola('Peso inválido: corrige el valor (ej. 28.5).')).toBe(
        'No se pudo guardar este cambio: Peso inválido: corrige el valor (ej. 28.5). Puedes reintentar o descartarlo.'
      );
      expect(
        describirRechazoCola("Operación denegada: Estado actual: 'completada'.")
      ).toBe('No se pudo guardar este cambio. Puedes reintentar o descartarlo.');
      expect(describirRechazoCola(MENSAJE_ERROR_GENERICO)).toBe(
        'No se pudo guardar este cambio. Puedes reintentar o descartarlo.'
      );
      expect(describirRechazoCola(null)).toBe(
        'No se pudo guardar este cambio. Puedes reintentar o descartarlo.'
      );
    });

    it('traducirMensajeSuelto deja pasar lo legible y reemplaza lo técnico', () => {
      expect(traducirMensajeSuelto('El alumno ya tiene una rutina activa.')).toBe(
        'El alumno ya tiene una rutina activa.'
      );
      expect(traducirMensajeSuelto("Alumno con ID 'x' no encontrado.")).toBe(
        MENSAJE_ERROR_GENERICO
      );
      expect(traducirMensajeSuelto(undefined)).toBe(MENSAJE_ERROR_GENERICO);
    });
  });

  describe('traducirErrorHttp', () => {
    it('401 fuera del login → sesión vencida si el servidor no da un mensaje amigable', () => {
      expect(traducirErrorHttp(401, 'Token inválido o expirado: jwt expired', 'general')).toBe(
        MENSAJE_SESION_VENCIDA
      );
      expect(traducirErrorHttp(401, null, 'general')).toBe(MENSAJE_SESION_VENCIDA);
    });

    it('401 conserva el mensaje amigable del servidor (cascada coach-alumnos)', () => {
      const cascada =
        'Tu entrenador no está disponible en este momento. Inténtalo de nuevo más tarde.';
      expect(traducirErrorHttp(401, cascada, 'general')).toBe(cascada);
    });

    it('401 en el login → mensaje de credenciales del servidor o el genérico de credenciales', () => {
      expect(traducirErrorHttp(401, 'Credenciales inválidas.', 'login')).toBe(
        'Credenciales inválidas.'
      );
      expect(traducirErrorHttp(401, 'Unauthorized', 'login')).toBe(
        MENSAJE_CREDENCIALES_INCORRECTAS
      );
      expect(traducirErrorHttp(401, null, 'login')).toBe(MENSAJE_CREDENCIALES_INCORRECTAS);
    });

    it('401 en endpoints públicos (sin sesión) nunca habla de sesión vencida', () => {
      expect(traducirErrorHttp(401, null, 'publico')).toBe(MENSAJE_ERROR_GENERICO);
    });

    it('403 → sin permiso, salvo mensaje amigable del servidor (alumno-habilitado.guard)', () => {
      expect(
        traducirErrorHttp(
          403,
          'Acceso denegado: Se requiere uno de los roles [entrenador], pero el rol actual es alumno.',
          'general'
        )
      ).toBe(MENSAJE_SIN_PERMISO);
      const pausado =
        'Tu plan está pausado. Puedes consultar tu historial, pero no iniciar nuevas sesiones ni enviar reportes hasta que tu entrenador lo reactive.';
      expect(traducirErrorHttp(403, pausado, 'general')).toBe(pausado);
    });

    it('5xx → genérico aunque el servidor mande texto', () => {
      expect(traducirErrorHttp(500, 'Internal server error', 'general')).toBe(
        MENSAJE_ERROR_GENERICO
      );
      expect(traducirErrorHttp(503, 'Servicio en mantenimiento', 'general')).toBe(
        MENSAJE_ERROR_GENERICO
      );
    });

    it('otros 4xx → mensaje del servidor si es amigable; si no, genérico', () => {
      expect(traducirErrorHttp(409, 'Este correo ya se encuentra registrado.', 'publico')).toBe(
        'Este correo ya se encuentra registrado.'
      );
      expect(traducirErrorHttp(400, 'ZodError: invalid_type', 'general')).toBe(
        MENSAJE_ERROR_GENERICO
      );
      expect(traducirErrorHttp(422, null, 'general')).toBe(MENSAJE_ERROR_GENERICO);
    });
  });
});
