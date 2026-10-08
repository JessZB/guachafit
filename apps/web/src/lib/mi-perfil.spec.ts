/**
 * RF-018 §A/§B/§C · Lote WEB: contrato del formulario de perfil (qué edita cada rol, cambios
 * enviados y validación), la validación de la contraseña nueva y la confirmación pública del
 * cambio de correo. Lógica pura, entorno Node sin jsdom.
 */
import { describe, expect, it } from 'vitest';
import {
  MENSAJE_CORREO_EN_USO,
  MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO,
  Rol,
  TipoDocumento,
  type MiPerfilDTO,
  type ProblemDetails,
} from '@guachafit/shared';
import { ApiError, ErrorDeConexion } from './api-client';
import {
  AVISO_CAMBIO_CORREO,
  MENSAJE_AJUSTES_SIN_CONEXION,
  TEXTO_IDENTIDAD_SOLO_LECTURA,
  camposEditablesPerfil,
  cambiosPerfil,
  estadoConfirmacionCorreo,
  formularioDesdePerfil,
  mensajeConfirmacionCorreo,
  mensajeErrorAjustes,
  validarCambioPassword,
  validarFormularioPerfil,
  type FormularioPerfil,
} from './mi-perfil';

/** ProblemDetails con fechas fijas: estos tests no dependen del reloj real. */
function problema(status: number, detail = ''): ProblemDetails {
  return {
    type: 'https://api.guachafit.com/errors/error',
    title: 'Error',
    status,
    detail,
    message: detail,
    timestampUtc: '2026-10-06T00:00:00.000Z',
  };
}

function apiError(status: number, detail = ''): ApiError {
  return new ApiError(status, problema(status, detail));
}

function perfilAlumno(): MiPerfilDTO {
  return {
    id: 'u-alumno',
    email: 'alumno@example.com',
    rol: Rol.ALUMNO,
    correoPendiente: null,
    correoPendienteExpiraUtc: null,
    alumno: {
      nombres: 'Ana',
      apellidos: 'Pérez',
      telefonoWhatsapp: '04141234567',
      tipoDocumento: TipoDocumento.V,
      numeroDocumento: '24123456',
      fechaNacimiento: '1990-05-15',
      zonaHoraria: 'America/Caracas',
    },
    entrenador: null,
  };
}

function perfilEntrenador(nombreComercial: string | null): MiPerfilDTO {
  return {
    id: 'u-coach',
    email: 'coach@example.com',
    rol: Rol.ENTRENADOR,
    correoPendiente: null,
    correoPendienteExpiraUtc: null,
    alumno: null,
    entrenador: {
      nombres: 'Luis',
      apellidos: 'Gómez',
      nombreComercial,
      telefonoContacto: '04140000000',
    },
  };
}

function perfilSuperadmin(): MiPerfilDTO {
  return {
    id: 'u-admin',
    email: 'admin@example.com',
    rol: Rol.SUPERADMIN,
    correoPendiente: null,
    correoPendienteExpiraUtc: null,
    alumno: null,
    entrenador: null,
  };
}

const FORMULARIO_ALUMNO: FormularioPerfil = {
  nombres: 'Ana',
  apellidos: 'Pérez',
  telefono: '04141234567',
  nombreComercial: '',
};

const FORMULARIO_ENTRENADOR: FormularioPerfil = {
  nombres: 'Luis',
  apellidos: 'Gómez',
  telefono: '04140000000',
  nombreComercial: 'Fit House',
};

describe('mi-perfil: formularioDesdePerfil (RF-018 RN-01/RN-02)', () => {
  it('el alumno edita su teléfono de WhatsApp y no tiene nombre comercial', () => {
    expect(formularioDesdePerfil(perfilAlumno())).toEqual({
      nombres: 'Ana',
      apellidos: 'Pérez',
      telefono: '04141234567',
      nombreComercial: '',
    });
  });

  it('el entrenador edita su teléfono de contacto y su nombre comercial (null → vacío)', () => {
    expect(formularioDesdePerfil(perfilEntrenador('Fit House'))).toEqual({
      nombres: 'Luis',
      apellidos: 'Gómez',
      telefono: '04140000000',
      nombreComercial: 'Fit House',
    });
    expect(formularioDesdePerfil(perfilEntrenador(null))).toEqual({
      nombres: 'Luis',
      apellidos: 'Gómez',
      telefono: '04140000000',
      nombreComercial: '',
    });
  });

  it('el superadmin no tiene datos de perfil: todo vacío', () => {
    expect(formularioDesdePerfil(perfilSuperadmin())).toEqual({
      nombres: '',
      apellidos: '',
      telefono: '',
      nombreComercial: '',
    });
  });
});

describe('mi-perfil: camposEditablesPerfil por rol (RF-018 §A)', () => {
  it('alumno: nombres, apellidos y teléfono', () => {
    expect(camposEditablesPerfil(Rol.ALUMNO)).toEqual(['nombres', 'apellidos', 'telefono']);
  });

  it('entrenador: suma el nombre comercial', () => {
    expect(camposEditablesPerfil(Rol.ENTRENADOR)).toEqual([
      'nombres',
      'apellidos',
      'telefono',
      'nombreComercial',
    ]);
  });

  it('superadmin: ninguno (solo gestiona correo y contraseña)', () => {
    expect(camposEditablesPerfil(Rol.SUPERADMIN)).toEqual([]);
  });
});

describe('mi-perfil: cambiosPerfil solo con lo editable y cambiado (RF-018 RN-02)', () => {
  it('recorta espacios y devuelve solo los campos que cambiaron', () => {
    expect(
      cambiosPerfil(
        FORMULARIO_ALUMNO,
        { ...FORMULARIO_ALUMNO, telefono: ' 04149876543 ' },
        Rol.ALUMNO
      )
    ).toEqual({ telefono: '04149876543' });
  });

  it('sin cambios devuelve {} (el PATCH no viaja vacío)', () => {
    expect(cambiosPerfil(FORMULARIO_ALUMNO, { ...FORMULARIO_ALUMNO }, Rol.ALUMNO)).toEqual({});
  });

  it('un campo no editable del rol nunca aparece aunque cambie', () => {
    expect(
      cambiosPerfil(
        FORMULARIO_ALUMNO,
        { ...FORMULARIO_ALUMNO, nombres: 'Ana María', nombreComercial: 'Intruso' },
        Rol.ALUMNO
      )
    ).toEqual({ nombres: 'Ana María' });
  });

  it('el nombre comercial vacío del entrenador viaja como null', () => {
    expect(
      cambiosPerfil(
        FORMULARIO_ENTRENADOR,
        { ...FORMULARIO_ENTRENADOR, nombreComercial: '   ' },
        Rol.ENTRENADOR
      )
    ).toEqual({ nombreComercial: null });
  });

  it('el entrenador envía su nombre comercial recortado cuando cambia', () => {
    expect(
      cambiosPerfil(
        FORMULARIO_ENTRENADOR,
        { ...FORMULARIO_ENTRENADOR, nombreComercial: '  Fit Nuevo  ' },
        Rol.ENTRENADOR
      )
    ).toEqual({ nombreComercial: 'Fit Nuevo' });
  });

  it('el superadmin no puede enviar ningún cambio', () => {
    const inicial: FormularioPerfil = {
      nombres: 'Root',
      apellidos: 'Admin',
      telefono: '00000000',
      nombreComercial: 'X',
    };
    expect(
      cambiosPerfil(
        inicial,
        { nombres: 'Otro', apellidos: 'Otro', telefono: '11111111', nombreComercial: 'Y' },
        Rol.SUPERADMIN
      )
    ).toEqual({});
  });
});

describe('mi-perfil: validarFormularioPerfil (RF-018 RN-02)', () => {
  it('un formulario de alumno válido no tiene errores', () => {
    expect(validarFormularioPerfil(FORMULARIO_ALUMNO, Rol.ALUMNO)).toEqual({});
  });

  it('nombres y apellidos exigen entre 2 y 100 caracteres (valores ya recortados)', () => {
    expect(validarFormularioPerfil({ ...FORMULARIO_ALUMNO, nombres: 'A' }, Rol.ALUMNO)).toEqual({
      nombres: 'Escribe entre 2 y 100 caracteres.',
    });
    expect(
      validarFormularioPerfil({ ...FORMULARIO_ALUMNO, apellidos: 'x'.repeat(101) }, Rol.ALUMNO)
    ).toEqual({ apellidos: 'Escribe entre 2 y 100 caracteres.' });
    expect(
      validarFormularioPerfil({ ...FORMULARIO_ALUMNO, nombres: '  Ana  ' }, Rol.ALUMNO)
    ).toEqual({});
    expect(validarFormularioPerfil({ ...FORMULARIO_ALUMNO, nombres: '  A  ' }, Rol.ALUMNO)).toEqual(
      { nombres: 'Escribe entre 2 y 100 caracteres.' }
    );
  });

  it('el teléfono exige entre 8 y 30 caracteres', () => {
    expect(
      validarFormularioPerfil({ ...FORMULARIO_ALUMNO, telefono: '1234567' }, Rol.ALUMNO)
    ).toEqual({ telefono: 'Escribe un teléfono de 8 a 30 caracteres.' });
    expect(
      validarFormularioPerfil({ ...FORMULARIO_ALUMNO, telefono: '1'.repeat(31) }, Rol.ALUMNO)
    ).toEqual({ telefono: 'Escribe un teléfono de 8 a 30 caracteres.' });
  });

  it('el nombre comercial admite hasta 150 caracteres y el vacío es válido', () => {
    expect(validarFormularioPerfil(FORMULARIO_ENTRENADOR, Rol.ENTRENADOR)).toEqual({});
    expect(
      validarFormularioPerfil(
        { ...FORMULARIO_ENTRENADOR, nombreComercial: 'x'.repeat(151) },
        Rol.ENTRENADOR
      )
    ).toEqual({ nombreComercial: 'Escribe hasta 150 caracteres.' });
  });

  it('solo valida los campos editables del rol (un dato ajeno no genera error)', () => {
    expect(
      validarFormularioPerfil(
        { ...FORMULARIO_ALUMNO, nombreComercial: 'x'.repeat(151) },
        Rol.ALUMNO
      )
    ).toEqual({});
    expect(
      validarFormularioPerfil(
        { nombres: 'A', apellidos: 'B', telefono: '1', nombreComercial: 'x'.repeat(151) },
        Rol.SUPERADMIN
      )
    ).toEqual({});
  });
});

describe('mi-perfil: validarCambioPassword (RF-018 RN-08)', () => {
  const VALIDA = { actual: 'ClaveActual1', nueva: 'ClaveNueva123', confirmacion: 'ClaveNueva123' };

  it('todo correcto no tiene errores', () => {
    expect(validarCambioPassword(VALIDA)).toEqual({});
  });

  it('exige la contraseña actual', () => {
    expect(validarCambioPassword({ ...VALIDA, actual: '' })).toEqual({
      actual: 'Escribe tu contraseña actual.',
    });
  });

  it('la nueva debe tener entre 8 y 100 caracteres', () => {
    expect(
      validarCambioPassword({ actual: 'ClaveActual1', nueva: 'corta', confirmacion: 'corta' })
    ).toEqual({ nueva: 'La contraseña nueva debe tener al menos 8 caracteres.' });
    const larga = 'x'.repeat(101);
    expect(
      validarCambioPassword({ actual: 'ClaveActual1', nueva: larga, confirmacion: larga })
    ).toEqual({ nueva: 'La contraseña nueva puede tener hasta 100 caracteres.' });
  });

  it('la confirmación debe coincidir con la nueva', () => {
    expect(validarCambioPassword({ ...VALIDA, confirmacion: 'OtraClave123' })).toEqual({
      confirmacion: 'Las contraseñas no coinciden.',
    });
  });

  it('acumula los errores por campo cuando hay varios', () => {
    expect(validarCambioPassword({ actual: '', nueva: 'corta', confirmacion: 'otra' })).toEqual({
      actual: 'Escribe tu contraseña actual.',
      nueva: 'La contraseña nueva debe tener al menos 8 caracteres.',
      confirmacion: 'Las contraseñas no coinciden.',
    });
  });
});

describe('mi-perfil: avisos y confirmación del cambio de correo (RF-018 RN-03/RN-05)', () => {
  it('el aviso previo es el texto exacto de la RN-03', () => {
    expect(AVISO_CAMBIO_CORREO).toBe(
      'Te enviaremos un correo de confirmación a la dirección nueva para comprobar que existe. Hasta que lo confirmes, seguirás entrando con tu correo actual.'
    );
  });

  it('el texto de identidad del alumno es el de la RN-01', () => {
    expect(TEXTO_IDENTIDAD_SOLO_LECTURA).toBe(
      'Si necesitas corregirlos, pídeselo a tu entrenador.'
    );
  });

  it('estadoConfirmacionCorreo distingue enlace inválido, correo en uso, sin conexión y error', () => {
    expect(estadoConfirmacionCorreo(apiError(404, 'El enlace no es válido o venció.'))).toBe(
      'invalido'
    );
    expect(estadoConfirmacionCorreo(apiError(409, 'Ese correo ya está en uso.'))).toBe('en-uso');
    expect(estadoConfirmacionCorreo(new ErrorDeConexion())).toBe('sin-conexion');
    expect(estadoConfirmacionCorreo(new Error('boom'))).toBe('error');
    expect(estadoConfirmacionCorreo(null)).toBe('error');
  });

  it('mensajeConfirmacionCorreo traduce cada estado a su copy', () => {
    expect(mensajeConfirmacionCorreo('invalido')).toBe(MENSAJE_ENLACE_CAMBIO_CORREO_INVALIDO);
    expect(mensajeConfirmacionCorreo('en-uso')).toBe(MENSAJE_CORREO_EN_USO);
    expect(mensajeConfirmacionCorreo('sin-conexion')).toBe(
      'No hay conexión a internet. Revisa tu red y vuelve a abrir el enlace.'
    );
    expect(mensajeConfirmacionCorreo('error')).toBe(
      'No pudimos confirmar tu correo. Inténtalo de nuevo en unos minutos.'
    );
  });
});

describe('mi-perfil: mensajeErrorAjustes (RF-018 §6)', () => {
  const POR_DEFECTO = 'No pudimos guardar tus datos. Inténtalo de nuevo.';

  it('un fallo de conexión usa el aviso honesto de Ajustes', () => {
    expect(mensajeErrorAjustes(new ErrorDeConexion(), POR_DEFECTO)).toBe(
      MENSAJE_AJUSTES_SIN_CONEXION
    );
  });

  it('conserva el mensaje del servidor pensado para el usuario', () => {
    expect(mensajeErrorAjustes(new Error('Tu contraseña actual no es correcta.'), POR_DEFECTO)).toBe(
      'Tu contraseña actual no es correcta.'
    );
  });

  it('un texto técnico (TypeError de null) cae en el mensaje por defecto', () => {
    expect(
      mensajeErrorAjustes(
        new Error("TypeError: Cannot read properties of null (reading 'x')"),
        POR_DEFECTO
      )
    ).toBe(POR_DEFECTO);
  });

  it('un valor que no es Error cae en el mensaje por defecto', () => {
    expect(mensajeErrorAjustes('algo inesperado', POR_DEFECTO)).toBe(POR_DEFECTO);
    expect(mensajeErrorAjustes(null, POR_DEFECTO)).toBe(POR_DEFECTO);
    expect(mensajeErrorAjustes({ message: 'Tu contraseña actual no es correcta.' }, POR_DEFECTO)).toBe(
      POR_DEFECTO
    );
  });
});
