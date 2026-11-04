import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  TipoDocumento,
  Modalidad,
  OrigenRegistro,
  type AltaManualAlumnoDTO,
  type RegistroPublicoAlumnoDTO,
  type CrearEntrenadorDTO,
} from '@guachafit/shared';

/**
 * D17 · Verificación contra PostgreSQL real (e2e):
 * Pruebas de integración reales contra `guachafit_d17` para el ciclo de vida del
 * enlace de captación del coach, concurrencia de cupo (FOR UPDATE), rotación inmediata,
 * pausa, persistencia de origen_registro, restricción CHECK y unicidad de coachCode.
 *
 * GATE: sin `E2E_DATABASE_URL` el spec se salta limpio.
 * NOTA CRÍTICA: Ningún módulo de `src/` ni `@guachafit/database` debe importarse
 * estáticamente al tope del archivo para que `@guachafit/database` se inicialice
 * cuando `process.env.DATABASE_URL` ya apunta a `E2E_DATABASE_URL` (`guachafit_d17`).
 */

const MENSAJE_ENLACE_NO_DISPONIBLE =
  'El código de entrenador no es válido o no está disponible. Por favor contacta a tu coach.';

let sql: any;
let db: any;
let cryptoService: any;
let alumnosService: any;
let entrenadorService: any;
let authService: any;

const coachesCreados: string[] = [];
const alumnosCreados: string[] = [];

function generarRegistroPublicoDTO(coachCode: string, sufijo?: string): RegistroPublicoAlumnoDTO {
  const uid = randomUUID().slice(0, 8);
  const numDoc = `${Math.floor(10000000 + Math.random() * 89999999)}`;
  return {
    coachCode,
    nombres: 'Alumno',
    apellidos: `E2E ${sufijo ?? uid}`,
    email: `alumno-${sufijo ?? uid}-${randomUUID().slice(0, 6)}@e2e-d17.local`,
    password: 'clave-segura-2026',
    tipoDocumento: TipoDocumento.V,
    numeroDocumento: numDoc,
    fechaNacimiento: '1995-05-15',
    telefonoWhatsapp: '+584141234567',
    modalidad: Modalidad.REMOTO,
  };
}

async function crearEntrenadorFixture(opciones?: {
  capacidadMaxima?: number;
  captacionActiva?: boolean;
  coachCode?: string;
}): Promise<{ usuarioId: string; perfilId: string; coachCode: string }> {
  const id = randomUUID().slice(0, 8);
  const dto: CrearEntrenadorDTO = {
    nombres: 'Coach',
    apellidos: `E2E ${id}`,
    email: `coach-${id}@e2e-d17.local`,
    telefonoContacto: '+584120000000',
    capacidadMaxima: opciones?.capacidadMaxima ?? 10,
    coachCode: opciones?.coachCode,
  };
  const creado = await authService.crearEntrenador(dto);
  coachesCreados.push(creado.usuarioId);

  if (opciones?.captacionActiva === false) {
    await sql.unsafe(
      'UPDATE perfiles_entrenador SET captacion_activa = false WHERE usuario_id = $1',
      [creado.usuarioId]
    );
  }

  return creado;
}

export function verificarBaseDeDatos(actual: string, urlEsperada: string): void {
  const url = new URL(urlEsperada);
  const esperada = url.pathname.replace(/^\//, '');
  if (actual !== esperada) {
    throw new Error(`El cliente de BD apunta a ${actual} pero E2E_DATABASE_URL apunta a ${esperada}`);
  }
}

describe('Salvaguarda de base de datos e2e (verificarBaseDeDatos)', () => {
  it('lanza cuando las bases difieren, no lanza cuando coinciden y no contiene contraseñas en el mensaje', () => {
    const urlEjemplo = 'postgres://usuario:claveSuperSecreta@localhost:5432/guachafit_d17';

    // No lanza cuando coinciden
    expect(() => verificarBaseDeDatos('guachafit_d17', urlEjemplo)).not.toThrow();

    // Lanza cuando difieren
    expect(() => verificarBaseDeDatos('guachafit', urlEjemplo)).toThrow(
      'El cliente de BD apunta a guachafit pero E2E_DATABASE_URL apunta a guachafit_d17'
    );

    // Comprueba que el mensaje no contiene la contraseña de una URL de ejemplo
    let mensajeError = '';
    try {
      verificarBaseDeDatos('guachafit_desarrollo', urlEjemplo);
    } catch (err: any) {
      mensajeError = err.message;
    }
    expect(mensajeError).toBe(
      'El cliente de BD apunta a guachafit_desarrollo pero E2E_DATABASE_URL apunta a guachafit_d17'
    );
    expect(mensajeError).not.toContain('claveSuperSecreta');
  });
});

describe.runIf(Boolean(process.env.E2E_DATABASE_URL))(
  'D17 E2E: ciclo de vida y concurrencia de captación de coach (PostgreSQL real)',
  () => {
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.E2E_DATABASE_URL as string;
      const database = await import('@guachafit/database');
      sql = (database as any).queryClient;
      db = (database as any).db;
      const { withTenant: withTenantBase } = database as any;

      const [fila] = await sql.unsafe('SELECT current_database() AS base');
      verificarBaseDeDatos(fila.base, process.env.E2E_DATABASE_URL as string);

      const { CryptoService } = await import('../../src/common/services/crypto.service');
      const { AlumnosService } = await import('../../src/modules/alumnos/alumnos.service');
      const { EntrenadorService } = await import('../../src/modules/entrenador/entrenador.service');
      const { AuthService } = await import('../../src/modules/auth/auth.service');

      cryptoService = new CryptoService();
      alumnosService = new AlumnosService(
        db,
        cryptoService,
        undefined,
        (ctx: any, fn: any) => withTenantBase(ctx, fn, db)
      );
      entrenadorService = new EntrenadorService(
        db,
        (ctx: any, fn: any) => withTenantBase(ctx, fn, db)
      );
      authService = new AuthService(
        db,
        cryptoService,
        (ctx: any, fn: any) => withTenantBase(ctx, fn, db)
      );
    });

    afterAll(async () => {
      if (!sql) return;
      try {
        if (coachesCreados.length > 0) {
          const alumnos = await sql.unsafe(
            'SELECT usuario_id FROM perfiles_alumno WHERE entrenador_id = ANY($1::uuid[])',
            [coachesCreados]
          );
          for (const a of alumnos) {
            alumnosCreados.push(a.usuario_id);
          }
          await sql.unsafe(
            'DELETE FROM perfiles_alumno WHERE entrenador_id = ANY($1::uuid[])',
            [coachesCreados]
          );
        }

        if (alumnosCreados.length > 0) {
          await sql.unsafe(
            'DELETE FROM perfiles_alumno WHERE usuario_id = ANY($1::uuid[])',
            [alumnosCreados]
          );
        }

        if (coachesCreados.length > 0) {
          await sql.unsafe(
            'DELETE FROM tokens_invitacion_entrenador WHERE usuario_id = ANY($1::uuid[])',
            [coachesCreados]
          );
          await sql.unsafe(
            'DELETE FROM perfiles_entrenador WHERE usuario_id = ANY($1::uuid[])',
            [coachesCreados]
          );
        }

        const todosUsuarios = [...new Set([...coachesCreados, ...alumnosCreados])];
        if (todosUsuarios.length > 0) {
          await sql.unsafe('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [todosUsuarios]);
        }
      } catch (err) {
        console.warn('[D17 E2E] Error en limpieza de fixtures:', err);
      } finally {
        await sql.end({ timeout: 5 }).catch(() => {});
      }
    });

    it('1. Rotación con corte inmediato: código viejo deja de resolver de inmediato y nuevo funciona', async () => {
      const coach = await crearEntrenadorFixture();
      const codigoViejo = coach.coachCode;

      // 1. resolverCoachPublico funciona con el código original
      const resViejo = await alumnosService.resolverCoachPublico(codigoViejo);
      expect(resViejo.coachCode).toBe(codigoViejo);

      // 2. rotarEnlaceCaptacion
      const rotacion = await entrenadorService.rotarEnlaceCaptacion(coach.usuarioId);
      expect(rotacion.cambioAplicado).toBe(true);
      expect(rotacion.coachCode).not.toBe(codigoViejo);
      expect(rotacion.coachCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(rotacion.enlaceRotadoEnUtc).toBeDefined();
      expect(typeof rotacion.enlaceRotadoEnUtc).toBe('string');

      // En base de datos enlace_rotado_en_utc está fijado
      const [filaCoach] = await sql.unsafe(
        'SELECT coach_code, enlace_rotado_en_utc FROM perfiles_entrenador WHERE usuario_id = $1',
        [coach.usuarioId]
      );
      expect(filaCoach.coach_code).toBe(rotacion.coachCode);
      expect(filaCoach.enlace_rotado_en_utc).not.toBeNull();

      // 3. Código viejo lanza NotFoundException con MENSAJE_ENLACE_NO_DISPONIBLE en resolverCoachPublico
      await expect(alumnosService.resolverCoachPublico(codigoViejo)).rejects.toThrow(NotFoundException);
      try {
        await alumnosService.resolverCoachPublico(codigoViejo);
      } catch (err: any) {
        expect(err.message).toBe(MENSAJE_ENLACE_NO_DISPONIBLE);
      }

      // 4. Código viejo lanza NotFoundException en registroPublico
      const dtoViejo = generarRegistroPublicoDTO(codigoViejo, 'rot-viejo');
      await expect(alumnosService.registroPublico(dtoViejo)).rejects.toThrow(NotFoundException);
      try {
        await alumnosService.registroPublico(dtoViejo);
      } catch (err: any) {
        expect(err.message).toBe(MENSAJE_ENLACE_NO_DISPONIBLE);
      }

      // 5. Código nuevo funciona en resolverCoachPublico y registroPublico
      const resNuevo = await alumnosService.resolverCoachPublico(rotacion.coachCode);
      expect(resNuevo.coachCode).toBe(rotacion.coachCode);

      const dtoNuevo = generarRegistroPublicoDTO(rotacion.coachCode, 'rot-nuevo');
      const regNuevo = await alumnosService.registroPublico(dtoNuevo);
      expect(regNuevo.id).toBeDefined();
    });

    it('2. Pausa: captacionActiva = false produce 404 con mensaje idéntico a inexistente; reanudación e idempotencia', async () => {
      const coach = await crearEntrenadorFixture();

      // Mensaje de error con código inexistente
      let mensajeInexistente = '';
      try {
        await alumnosService.resolverCoachPublico('NOEXISTE99');
      } catch (err: any) {
        mensajeInexistente = err.message;
      }
      expect(mensajeInexistente).toBe(MENSAJE_ENLACE_NO_DISPONIBLE);

      // Pausar captación
      const resPausa = await entrenadorService.actualizarCaptacion(coach.usuarioId, { activa: false });
      expect(resPausa.cambioAplicado).toBe(true);
      expect(resPausa.captacionActiva).toBe(false);

      // resolverCoachPublico y registroPublico lanzan NotFoundException con el MISMO mensaje
      try {
        await alumnosService.resolverCoachPublico(coach.coachCode);
        expect.fail('debió lanzar NotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect(err.message).toBe(mensajeInexistente);
      }

      const dtoPausa = generarRegistroPublicoDTO(coach.coachCode, 'pausa');
      try {
        await alumnosService.registroPublico(dtoPausa);
        expect.fail('debió lanzar NotFoundException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect(err.message).toBe(mensajeInexistente);
      }

      // Reanudar captación
      const resReanudar = await entrenadorService.actualizarCaptacion(coach.usuarioId, { activa: true });
      expect(resReanudar.cambioAplicado).toBe(true);
      expect(resReanudar.captacionActiva).toBe(true);

      // Ahora funciona de nuevo
      const resOk = await alumnosService.resolverCoachPublico(coach.coachCode);
      expect(resOk.coachCode).toBe(coach.coachCode);

      // Segunda llamada idéntica devuelve cambioAplicado = false (idempotencia)
      const resRepetida = await entrenadorService.actualizarCaptacion(coach.usuarioId, { activa: true });
      expect(resRepetida.cambioAplicado).toBe(false);
      expect(resRepetida.captacionActiva).toBe(true);
    });

    it('3. Cupo bajo concurrencia: serialización for update no permite desbordar capacidadMaxima (1/5 y 3/8)', async () => {
      // Subcaso 3a: capacidadMaxima = 2, 1 alumno ACTIVO previo, 5 registros simultáneos -> exactamente 1 exitoso, 4 rechazados
      const coachA = await crearEntrenadorFixture({ capacidadMaxima: 2 });

      // Registramos el 1er alumno
      const dtoPrevio = generarRegistroPublicoDTO(coachA.coachCode, 'previo-a');
      await alumnosService.registroPublico(dtoPrevio);

      // Lanzar 5 registros simultáneos
      const promesasA = Array.from({ length: 5 }, (_, i) => {
        const dto = generarRegistroPublicoDTO(coachA.coachCode, `conc-a-${i}`);
        return alumnosService.registroPublico(dto);
      });
      const resultadosA = await Promise.allSettled(promesasA);

      const exitososA = resultadosA.filter((r) => r.status === 'fulfilled');
      const rechazadosA = resultadosA.filter((r) => r.status === 'rejected');

      expect(exitososA).toHaveLength(1);
      expect(rechazadosA).toHaveLength(4);

      for (const r of rechazadosA) {
        const razon = (r as PromiseRejectedResult).reason;
        expect(razon).toBeInstanceOf(NotFoundException);
        expect(razon.message).toBe(MENSAJE_ENLACE_NO_DISPONIBLE);
      }

      // En la base hay exactamente 2 alumnos activos del coach
      const [conteoA] = await sql.unsafe(
        `SELECT COUNT(*)::int as total FROM perfiles_alumno 
         WHERE entrenador_id = $1 AND estado_activacion = 'activo' AND deleted_at_utc IS NULL`,
        [coachA.usuarioId]
      );
      expect(conteoA.total).toBe(2);

      // Subcaso 3b: capacidadMaxima = 3, 0 alumnos previos, 8 registros simultáneos -> exactamente 3 exitosos, 5 rechazados
      const coachB = await crearEntrenadorFixture({ capacidadMaxima: 3 });

      const promesasB = Array.from({ length: 8 }, (_, i) => {
        const dto = generarRegistroPublicoDTO(coachB.coachCode, `conc-b-${i}`);
        return alumnosService.registroPublico(dto);
      });
      const resultadosB = await Promise.allSettled(promesasB);

      const exitososB = resultadosB.filter((r) => r.status === 'fulfilled');
      const rechazadosB = resultadosB.filter((r) => r.status === 'rejected');

      expect(exitososB).toHaveLength(3);
      expect(rechazadosB).toHaveLength(5);

      for (const r of rechazadosB) {
        const razon = (r as PromiseRejectedResult).reason;
        expect(razon).toBeInstanceOf(NotFoundException);
        expect(razon.message).toBe(MENSAJE_ENLACE_NO_DISPONIBLE);
      }

      const [conteoB] = await sql.unsafe(
        `SELECT COUNT(*)::int as total FROM perfiles_alumno 
         WHERE entrenador_id = $1 AND estado_activacion = 'activo' AND deleted_at_utc IS NULL`,
        [coachB.usuarioId]
      );
      expect(conteoB.total).toBe(3);
    });

    it('4. Origen y contador: origen_registro correcto y registrosPorEnlace cuenta solo enlaces desde última rotación', async () => {
      const coach = await crearEntrenadorFixture({ capacidadMaxima: 10 });

      // 1. Alumno creado por registroPublico
      const dtoPublico = generarRegistroPublicoDTO(coach.coachCode, 'origen-pub');
      const resPublico = await alumnosService.registroPublico(dtoPublico);

      const [perfilPublico] = await sql.unsafe(
        'SELECT origen_registro FROM perfiles_alumno WHERE id = $1',
        [resPublico.id]
      );
      expect(perfilPublico.origen_registro).toBe(OrigenRegistro.ENLACE);

      // 2. Alumno creado por crearAlumnoManual
      const uid = randomUUID().slice(0, 8);
      const dtoManual: AltaManualAlumnoDTO = {
        nombres: 'Alumno',
        apellidos: `Manual ${uid}`,
        email: `manual-${uid}@e2e-d17.local`,
        tipoDocumento: TipoDocumento.V,
        numeroDocumento: `${Math.floor(10000000 + Math.random() * 89999999)}`,
        fechaNacimiento: '1992-03-20',
        telefonoWhatsapp: '+584123334455',
        modalidad: Modalidad.PRESENCIAL,
      };
      const resManual = await alumnosService.crearAlumnoManual(coach.usuarioId, dtoManual);

      const [perfilManual] = await sql.unsafe(
        'SELECT origen_registro FROM perfiles_alumno WHERE id = $1',
        [resManual.id]
      );
      expect(perfilManual.origen_registro).toBe(OrigenRegistro.MANUAL);

      // 3. registrosPorEnlace cuenta solo los de origen enlace (1 de enlace, 1 manual -> total 1)
      const perfilCoachAntes = await entrenadorService.obtenerPerfil(coach.usuarioId);
      expect(perfilCoachAntes.registrosPorEnlace).toBe(1);

      const captacionAntes = await entrenadorService.obtenerCaptacion(coach.usuarioId);
      expect(captacionAntes.registrosPorEnlace).toBe(1);

      // 4. Rotar el enlace
      await entrenadorService.rotarEnlaceCaptacion(coach.usuarioId);

      // 5. Tras rotar vuelve a 0
      const perfilCoachDespues = await entrenadorService.obtenerPerfil(coach.usuarioId);
      expect(perfilCoachDespues.registrosPorEnlace).toBe(0);

      const captacionDespues = await entrenadorService.obtenerCaptacion(coach.usuarioId);
      expect(captacionDespues.registrosPorEnlace).toBe(0);
    });

    it('5. CHECK de la base: restricción ck_perfiles_alumno_origen_registro rechaza valores inválidos', async () => {
      const coach = await crearEntrenadorFixture();
      const dto = generarRegistroPublicoDTO(coach.coachCode, 'check');
      const res = await alumnosService.registroPublico(dto);

      // Intentar update directo con 'otro'
      await expect(
        sql.unsafe("UPDATE perfiles_alumno SET origen_registro = 'otro' WHERE id = $1", [res.id])
      ).rejects.toThrow(/ck_perfiles_alumno_origen_registro/);
    });

    it('6. Bajas y estados: inactivo_pausado, suspendido_pago y soft-deleted no computan contra cupo', async () => {
      const coach = await crearEntrenadorFixture({ capacidadMaxima: 2 });

      // Insertar alumno 1: inactivo_pausado
      const uid1 = randomUUID();
      alumnosCreados.push(uid1);
      await sql.unsafe(
        "INSERT INTO usuarios (id, email, rol, estado, activo) VALUES ($1, $2, 'alumno', 'activo', true)",
        [uid1, `inactivo-${uid1.slice(0, 8)}@e2e-d17.local`]
      );
      await sql.unsafe(
        `INSERT INTO perfiles_alumno (id, usuario_id, entrenador_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, telefono_whatsapp, estado_activacion, origen_registro)
         VALUES ($1, $2, $3, $4, $5, 'Inactivo', 'Pausado', '1990-01-01', '+584140000001', 'inactivo_pausado', 'enlace')`,
        [randomUUID(), uid1, coach.usuarioId, TipoDocumento.V, `DOC-${uid1.slice(0, 6)}`]
      );

      // Insertar alumno 2: suspendido_pago
      const uid2 = randomUUID();
      alumnosCreados.push(uid2);
      await sql.unsafe(
        "INSERT INTO usuarios (id, email, rol, estado, activo) VALUES ($1, $2, 'alumno', 'activo', true)",
        [uid2, `suspendido-${uid2.slice(0, 8)}@e2e-d17.local`]
      );
      await sql.unsafe(
        `INSERT INTO perfiles_alumno (id, usuario_id, entrenador_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, telefono_whatsapp, estado_activacion, origen_registro)
         VALUES ($1, $2, $3, $4, $5, 'Suspendido', 'Pago', '1990-01-01', '+584140000002', 'suspendido_pago', 'enlace')`,
        [randomUUID(), uid2, coach.usuarioId, TipoDocumento.V, `DOC-${uid2.slice(0, 6)}`]
      );

      // Insertar alumno 3: soft-deleted (deleted_at_utc no null)
      const uid3 = randomUUID();
      alumnosCreados.push(uid3);
      await sql.unsafe(
        "INSERT INTO usuarios (id, email, rol, estado, activo) VALUES ($1, $2, 'alumno', 'activo', true)",
        [uid3, `deleted-${uid3.slice(0, 8)}@e2e-d17.local`]
      );
      await sql.unsafe(
        `INSERT INTO perfiles_alumno (id, usuario_id, entrenador_id, tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, telefono_whatsapp, estado_activacion, origen_registro, deleted_at_utc)
         VALUES ($1, $2, $3, $4, $5, 'Baja', 'Logica', '1990-01-01', '+584140000003', 'activo', 'enlace', now())`,
        [randomUUID(), uid3, coach.usuarioId, TipoDocumento.V, `DOC-${uid3.slice(0, 6)}`]
      );

      // Aunque hay 3 filas de alumnos en la BD, ninguno cuenta como cupo ocupado (0 de 2)
      const resCoach = await alumnosService.resolverCoachPublico(coach.coachCode);
      expect(resCoach.coachCode).toBe(coach.coachCode);

      // Registramos 2 alumnos activos (cupo 2/2)
      const dtoActivo1 = generarRegistroPublicoDTO(coach.coachCode, 'activo-1');
      const resActivo1 = await alumnosService.registroPublico(dtoActivo1);
      const dtoActivo2 = generarRegistroPublicoDTO(coach.coachCode, 'activo-2');
      await alumnosService.registroPublico(dtoActivo2);

      // Ahora con 2 activos, el cupo está lleno: 404 en resolución y en nuevo registro
      await expect(alumnosService.resolverCoachPublico(coach.coachCode)).rejects.toThrow(NotFoundException);
      const dtoExcedente = generarRegistroPublicoDTO(coach.coachCode, 'excedente');
      await expect(alumnosService.registroPublico(dtoExcedente)).rejects.toThrow(NotFoundException);

      // Damos de baja lógica a uno de los activos (resActivo1.id)
      await sql.unsafe('UPDATE perfiles_alumno SET deleted_at_utc = now() WHERE id = $1', [resActivo1.id]);

      // Cupo ocupado baja a 1: vuelve a resolver y permite nuevo registro
      const resRecuperado = await alumnosService.resolverCoachPublico(coach.coachCode);
      expect(resRecuperado.coachCode).toBe(coach.coachCode);

      const resNuevoRegistro = await alumnosService.registroPublico(dtoExcedente);
      expect(resNuevoRegistro.id).toBeDefined();
    });

    it('7. Código único: crearEntrenador sin coachCode genera código válido y dos altas seguidas producen códigos distintos', async () => {
      const uidA = randomUUID().slice(0, 8);
      const uidB = randomUUID().slice(0, 8);

      const dtoA: CrearEntrenadorDTO = {
        nombres: 'Coach',
        apellidos: `Auto ${uidA}`,
        email: `coach-auto-${uidA}@e2e-d17.local`,
        telefonoContacto: '+584121111111',
      };
      const dtoB: CrearEntrenadorDTO = {
        nombres: 'Coach',
        apellidos: `Auto ${uidB}`,
        email: `coach-auto-${uidB}@e2e-d17.local`,
        telefonoContacto: '+584122222222',
      };

      const coachA = await authService.crearEntrenador(dtoA);
      const coachB = await authService.crearEntrenador(dtoB);

      coachesCreados.push(coachA.usuarioId, coachB.usuarioId);

      expect(coachA.coachCode).toBeDefined();
      expect(coachB.coachCode).toBeDefined();
      expect(coachA.coachCode).toHaveLength(8);
      expect(coachB.coachCode).toHaveLength(8);
      expect(coachA.coachCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(coachB.coachCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);

      // Dos altas seguidas generan códigos distintos
      expect(coachA.coachCode).not.toBe(coachB.coachCode);

      // Persistencia en base de datos
      const [filaA] = await sql.unsafe(
        'SELECT coach_code FROM perfiles_entrenador WHERE usuario_id = $1',
        [coachA.usuarioId]
      );
      const [filaB] = await sql.unsafe(
        'SELECT coach_code FROM perfiles_entrenador WHERE usuario_id = $1',
        [coachB.usuarioId]
      );
      expect(filaA.coach_code).toBe(coachA.coachCode);
      expect(filaB.coach_code).toBe(coachB.coachCode);
    });
  }
);
