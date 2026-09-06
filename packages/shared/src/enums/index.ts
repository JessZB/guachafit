// =============================================================================
// ENUMS DE DOMINIO Y CONTRATOS COMPARTIDOS - GUACHAFIT
// Fuente de verdad: 03_Dominio/ y 05_Arquitectura/02_Esquema_Base_de_Datos_PostgreSQL.md
// =============================================================================

export enum Rol {
  SUPERADMIN = 'superadmin',
  ENTRENADOR = 'entrenador',
  ALUMNO = 'alumno',
}

export enum EstadoUsuario {
  ACTIVO = 'activo',
  INACTIVO = 'inactivo',
  BLOQUEADO = 'bloqueado',
}

export enum EstadoLicencia {
  ACTIVA = 'activa',
  SUSPENDIDA_SUPERADMIN = 'suspendida_superadmin',
}

export enum TipoDocumento {
  V = 'V_',
  E = 'E_',
  PASAPORTE = 'PASAPORTE',
}

export enum EstadoAlumno {
  ACTIVO = 'activo',
  INACTIVO_PAUSADO = 'inactivo_pausado',
  SUSPENDIDO_PAGO = 'suspendido_pago',
}

export enum Modalidad {
  PRESENCIAL = 'presencial',
  REMOTO = 'remoto',
}

export enum EstadoSesion {
  PLANIFICADA = 'planificada',
  EN_PROGRESO = 'en_progreso',
  COMPLETADA = 'completada',
  OMITIDA = 'omitida',
}

export enum SemaforoNutricional {
  CUMPLIDO = 'cumplido',
  PARCIAL = 'parcial',
  NO_CUMPLIDO = 'no_cumplido',
}

export enum TipoComida {
  DESAYUNO = 'desayuno',
  ALMUERZO = 'almuerzo',
  CENA = 'cena',
  SNACK = 'snack',
}

export enum OrigenAntropometria {
  PRESENCIAL_VERIFICADO = 'presencial_verificado',
  REMOTO_AUTOREPORTE = 'remoto_autoreporte',
}

export enum EstadoMedicion {
  PENDIENTE_APROBACION = 'pendiente_aprobacion',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
}

export enum AnguloFoto {
  FRONTAL = 'frontal',
  LATERAL = 'lateral',
  POSTERIOR = 'posterior',
}

export enum PeriodoEvolucion {
  UN_MES = '1M',
  TRES_MESES = '3M',
  SEIS_MESES = '6M',
  UN_ANIO = '1A',
  TODO = 'todo',
}

export enum ModuloUpload {
  ANTROPOMETRIA = 'antropometria',
  COMIDAS = 'comidas',
  COMPROBANTES = 'comprobantes',
}

export enum EstadoCuota {
  EMITIDA = 'emitida',
  ABONADA_PARCIAL = 'abonada_parcial',
  AL_DIA = 'al_dia',
  PENDIENTE_REVISION = 'pendiente_revision',
  VENCIDA = 'vencida',
  ANULADA = 'anulada',
}

export enum Moneda {
  USD = 'USD',
  VES = 'VES',
}

export enum MetodoPago {
  PAGO_MOVIL = 'pago_movil',
  TRANSFERENCIA_BANCARIA = 'transferencia_bancaria',
  EFECTIVO_USD = 'efectivo_usd',
  EFECTIVO_VES = 'efectivo_ves',
  ZELLE = 'zelle',
  BINANCE_USDT = 'binance_usdt',
  OTRO = 'otro',
}

export enum EstadoConciliacion {
  PENDIENTE = 'pendiente',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
}

export enum PlataformaDispositivo {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

export enum TemaUi {
  SYSTEM = 'system',
  DARK = 'dark',
  LIGHT = 'light',
}

export { TemaUi as TemaUI };

export enum SemaforoAdherencia {
  VERDE = 'verde',
  AMARILLO = 'amarillo',
  ROJO = 'rojo',
}
