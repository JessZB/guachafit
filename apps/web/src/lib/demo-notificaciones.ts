/**
 * RF-014/RF-015 (Ola 3 · N2b): fixtures demo de la campana y de la matriz de preferencias.
 *
 * SOLO se consumen con la bandera `isDemoMode` activa (§6.5 / ADR-012). Reproducen la forma exacta
 * de los DTO del API (`NotificacionInAppDTO`, `PreferenciasNotificacionDTO`) y se construyen
 * relativos a "ahora" para que la bandeja se vea fresca.
 *
 * La matriz se deriva de `matrizPreferenciasPorRol` de `@guachafit/shared`: si el contrato cambia,
 * el fixture cambia con él (cero listas paralelas).
 */
import {
  CANALES_OBLIGATORIOS_NOTIFICACION,
  PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
  Rol,
  matrizPreferenciasPorRol,
  type CampoPreferenciaNotificacion,
  type CategoriaPreferenciasDTO,
  type NotificacionInAppDTO,
  type PreferenciasNotificacionDTO,
} from '@guachafit/shared';

/** Mismos ids demo que `auth-context.tsx` (la bandeja demo pertenece al usuario demo). */
export const USUARIO_DEMO_COACH = '11111111-2222-3333-4444-555555555555';
export const USUARIO_DEMO_ALUMNO = '99999999-8888-7777-6666-555555555555';

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

function hace(ahora: Date, milisegundos: number): string {
  return new Date(ahora.getTime() - milisegundos).toISOString();
}

/**
 * Bandeja demo por rol: 4 avisos variados (2 sin leer) con categorías, enlaces y fechas distintas
 * para poder ver el agrupado por día, el punto de no leída y la navegación del `linkAccion`.
 */
export function buildDemoNotificacionesInApp(
  rol: Rol | string | null | undefined,
  ahora: Date = new Date()
): NotificacionInAppDTO[] {
  if (rol === Rol.ENTRENADOR || rol === Rol.SUPERADMIN) {
    return [
      {
        id: 'demo-notif-coach-1',
        usuarioId: USUARIO_DEMO_COACH,
        titulo: 'Nuevo pago por verificar',
        cuerpo: 'Se ha reportado un pago de 35.00 USD pendiente por conciliar.',
        tipoEvento: 'PAGO_REPORTADO',
        leida: false,
        linkAccion: '/finanzas/conciliacion',
        createdAtUtc: hace(ahora, 12 * MINUTO_MS),
      },
      {
        id: 'demo-notif-coach-2',
        usuarioId: USUARIO_DEMO_COACH,
        titulo: 'Nuevo alumno registrado',
        cuerpo: 'María Pérez se registró con tu enlace de invitación. Revisa su ficha para activarla.',
        tipoEvento: 'ALUMNO_REGISTRADO',
        leida: false,
        linkAccion: '/coach/alumnos/al-demo-1',
        createdAtUtc: hace(ahora, 3 * HORA_MS),
      },
      {
        id: 'demo-notif-coach-3',
        usuarioId: USUARIO_DEMO_COACH,
        titulo: 'Sesión completada',
        cuerpo: 'Carlos Rojas completó la sesión "Empuje A" al 100%.',
        tipoEvento: 'SESION_ALUMNO_FINALIZADA',
        leida: true,
        linkAccion: '/coach/alumnos/al-demo-2',
        createdAtUtc: hace(ahora, 26 * HORA_MS),
      },
      {
        id: 'demo-notif-coach-4',
        usuarioId: USUARIO_DEMO_COACH,
        titulo: 'Tu resumen semanal está listo',
        cuerpo: 'Adherencia de tus alumnos, cobros y cuotas por vencer de la semana.',
        tipoEvento: 'RESUMEN_SEMANAL_COACH',
        leida: true,
        linkAccion: '/coach',
        createdAtUtc: hace(ahora, 4 * DIA_MS),
      },
    ];
  }

  return [
    {
      id: 'demo-notif-alumno-1',
      usuarioId: USUARIO_DEMO_ALUMNO,
      titulo: '¡Pago verificado y aprobado!',
      cuerpo: 'Tu pago de 20.00 USD fue aprobado con éxito. Ya está abonado a tu cuota.',
      tipoEvento: 'PAGO_APROBADO',
      leida: false,
      linkAccion: '/finanzas',
      createdAtUtc: hace(ahora, 8 * MINUTO_MS),
    },
    {
      id: 'demo-notif-alumno-2',
      usuarioId: USUARIO_DEMO_ALUMNO,
      titulo: 'Nueva rutina asignada',
      cuerpo: 'Tu entrenador actualizó tu planificación: revisa los bloques de esta semana.',
      tipoEvento: 'RUTINA_ASIGNADA',
      leida: false,
      linkAccion: '/app/hoy',
      createdAtUtc: hace(ahora, 5 * HORA_MS),
    },
    {
      id: 'demo-notif-alumno-3',
      usuarioId: USUARIO_DEMO_ALUMNO,
      titulo: 'Tu cuota está por vencer',
      cuerpo: 'Tu cuota de septiembre vence en 3 días. Puedes reportar tu abono desde la app.',
      tipoEvento: 'CUOTA_POR_VENCER',
      leida: true,
      linkAccion: '/app/pagos',
      createdAtUtc: hace(ahora, 28 * HORA_MS),
    },
    {
      id: 'demo-notif-alumno-4',
      usuarioId: USUARIO_DEMO_ALUMNO,
      titulo: 'Nuevo inicio de sesión',
      cuerpo: 'Detectamos un inicio de sesión desde un dispositivo nuevo. Si no fuiste tú, cambia tu contraseña.',
      tipoEvento: 'SEGURIDAD_NUEVO_INICIO_SESION',
      leida: true,
      linkAccion: null,
      createdAtUtc: hace(ahora, 3 * DIA_MS),
    },
  ];
}

/** Variación demo sobre los defaults del contrato: un par de canales ya personalizados. */
const VARIACION_DEMO_POR_ROL: Record<Rol, Partial<Record<CampoPreferenciaNotificacion, boolean>>> = {
  [Rol.ALUMNO]: {
    notifyWorkoutsEmail: true,
    notifyCheckinsEmail: true,
  },
  [Rol.ENTRENADOR]: {
    notifyReportesProgresoEmail: true,
    digestWeeklyPush: true,
  },
  // El superadmin hereda la matriz del entrenador (mismo tablero operativo).
  [Rol.SUPERADMIN]: {
    notifyReportesProgresoEmail: true,
    digestWeeklyPush: true,
  },
};

/**
 * Preferencias demo completas para el rol: fila plana de 16 campos + matriz de presentación.
 * Los canales obligatorios (RN-01) se reportan SIEMPRE activos, igual que el mapeo real del API.
 */
export function buildDemoPreferenciasNotificacion(
  rol: Rol | string | null | undefined,
  ahora: Date = new Date()
): PreferenciasNotificacionDTO {
  const rolSeguro: Rol =
    rol === Rol.ENTRENADOR || rol === Rol.SUPERADMIN ? (rol as Rol) : Rol.ALUMNO;

  const valores: Record<CampoPreferenciaNotificacion, boolean> = {
    ...PREFERENCIAS_NOTIFICACION_POR_DEFECTO,
    ...VARIACION_DEMO_POR_ROL[rolSeguro],
  };

  const matriz: CategoriaPreferenciasDTO[] = matrizPreferenciasPorRol(rolSeguro).map((fila) => {
    const pushObligatorio = fila.canalesObligatorios.includes('push');
    const emailObligatorio = fila.canalesObligatorios.includes('email');
    return {
      id: fila.id,
      etiqueta: fila.etiqueta,
      push: pushObligatorio ? true : valores[fila.push],
      email: emailObligatorio ? true : valores[fila.email],
      canalesObligatorios: [...fila.canalesObligatorios],
    };
  });

  return {
    id: 'demo-preferencias-1',
    usuarioId: rolSeguro === Rol.ALUMNO ? USUARIO_DEMO_ALUMNO : USUARIO_DEMO_COACH,
    rol: rolSeguro,
    ...valores,
    notifySeguridadEmail: true,
    updatedAtUtc: ahora.toISOString(),
    matriz,
    canalesObligatorios: [...CANALES_OBLIGATORIOS_NOTIFICACION],
  };
}
