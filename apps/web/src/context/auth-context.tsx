import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Rol, Modalidad, AuthUserDTO, AuthTokensResponseDTO, LoginUsuarioDTO } from '@guachafit/shared';
import {
  ApiError,
  apiClient,
  esTokenDemo,
  getAuthToken,
  registrarManejadorSesionExpirada,
  setAuthToken,
  setRefreshToken,
} from '../lib/api-client';
import { queryClient } from '../lib/query-client';
import { clearOfflineData } from '../lib/offline-db';
import { processOutboxQueue } from '../lib/offline-sync';
import { limpiarCachesRuntime } from '../lib/cache-runtime';
import { solicitarPersistenciaDeAlmacenamiento } from '../lib/pwa-instalacion';
import {
  CLAVES_SESION_LOCAL,
  asegurarUltimoUsuarioId,
  debeLimpiarDatosAlIniciarSesion,
  debeValidarSesion,
  leerUltimoUsuarioId,
  leerUsuarioGuardado,
} from '../lib/sesion-local';

interface AuthContextType {
  user: AuthUserDTO | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * true cuando la sesión actual proviene de un acceso explícito de demostración
   * ("Modo Alumno"/"Modo Coach"). Los datos demo SOLO pueden mostrarse con esta bandera activa.
   */
  isDemoMode: boolean;
  /** A1: aviso para la pantalla de login tras un cierre de sesión forzado (sesión vencida). */
  avisoSesion: string | null;
  descartarAvisoSesion: () => void;
  login: (credentials: LoginUsuarioDTO) => Promise<void>;
  demoLogin: (rol: Rol) => void;
  logout: () => Promise<void>;
  /**
   * ADR-019: refleja en la sesión la zona horaria recién guardada en el perfil. Solo se aplica si
   * la sesión sigue siendo del mismo usuario que la guardó.
   */
  actualizarZonaHoraria: (zonaHoraria: string, usuarioId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = CLAVES_SESION_LOCAL.usuario;
const DEMO_STORAGE_KEY = CLAVES_SESION_LOCAL.modoDemo;
const ULTIMO_USUARIO_KEY = CLAVES_SESION_LOCAL.ultimoUsuarioId;

function detectDemoMode(): boolean {
  try {
    if (localStorage.getItem(DEMO_STORAGE_KEY) === 'true') return true;
    return esTokenDemo(getAuthToken());
  } catch {
    return false;
  }
}

function quitarDeStorage(clave: string): void {
  try {
    localStorage.removeItem(clave);
  } catch {
    // Almacenamiento bloqueado: nada que limpiar.
  }
}

function guardarEnStorage(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Almacenamiento bloqueado: la sesión vive solo en memoria.
  }
}

/**
 * WU22 — higiene de sesión en dispositivo compartido.
 * Limpia la caché offline (Dexie) y las cachés runtime del Service Worker
 * (respuestas de API). Best-effort: un fallo NUNCA debe romper el logout.
 */
async function limpiarDatosLocalesDeSesion(): Promise<void> {
  try {
    await clearOfflineData();
  } catch (error) {
    console.warn('No se pudo limpiar la base de datos offline al cerrar sesión:', error);
  }
  try {
    await limpiarCachesRuntime();
  } catch (error) {
    console.warn('No se pudieron limpiar las cachés de API al cerrar sesión:', error);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // C9: un JSON corrupto en localStorage no rompe el arranque; se limpian las claves de sesión.
  const [user, setUser] = useState<AuthUserDTO | null>(() => leerUsuarioGuardado(localStorage));
  const [token, setToken] = useState<string | null>(getAuthToken);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(detectDemoMode);
  const [avisoSesion, setAvisoSesion] = useState<string | null>(null);
  const cerrandoSesionRef = useRef(false);

  useEffect(() => {
    if (user) {
      guardarEnStorage(USER_STORAGE_KEY, JSON.stringify(user));
      // Migración: una sesión restaurada de una versión previa registra su último usuario.
      asegurarUltimoUsuarioId(localStorage);
    } else {
      quitarDeStorage(USER_STORAGE_KEY);
    }
  }, [user]);

  // U1 (Ola 4): pide almacenamiento persistente al haber sesión (login nuevo o
  // restaurada) para que el SO no desaloje la cola offline ni la caché del Service
  // Worker. Best-effort: un rechazo no afecta la sesión ni la UI.
  useEffect(() => {
    if (user) {
      void solicitarPersistenciaDeAlmacenamiento();
    }
  }, [user]);

  /** Quita la sesión del almacenamiento y del estado (dispara la redirección de ProtectedRoute). */
  const borrarSesion = () => {
    setAuthToken(null);
    setRefreshToken(null);
    quitarDeStorage(DEMO_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setIsDemoMode(false);
  };

  /**
   * D3 — cierre de sesión ordenado: 1) cancela las consultas en vuelo, 2) espera la limpieza de
   * caché de consultas, IndexedDB y cachés de API, 3) recién entonces quita la sesión (lo que
   * navega a /login vía ProtectedRoute). Los tokens se retiran antes de esperar la limpieza para
   * que ninguna petición rezagada vuelva a salir autenticada.
   */
  const logout = async () => {
    if (cerrandoSesionRef.current) return;
    cerrandoSesionRef.current = true;
    try {
      await queryClient.cancelQueries();
      setAuthToken(null);
      setRefreshToken(null);
      queryClient.clear();
      await limpiarDatosLocalesDeSesion();
      quitarDeStorage(ULTIMO_USUARIO_KEY);
      setAvisoSesion(null);
      borrarSesion();
    } finally {
      cerrandoSesionRef.current = false;
    }
  };

  /**
   * A1 — sesión vencida (refresh rechazado o cuenta sin acceso). Se cierra la sesión y la pantalla
   * de login muestra el aviso. Los datos offline (cola sin sincronizar) se CONSERVAN: si vuelve a
   * entrar la misma persona no pierde su trabajo; si entra otra, el login los limpia (D2).
   */
  const cerrarSesionPorVencimiento = useCallback(async (mensaje: string) => {
    if (cerrandoSesionRef.current) return;
    cerrandoSesionRef.current = true;
    try {
      await queryClient.cancelQueries();
      setAuthToken(null);
      setRefreshToken(null);
      queryClient.clear();
      // El último usuario se asegura ANTES de borrar `guachafit_user` (D2 en el próximo login).
      asegurarUltimoUsuarioId(localStorage);
      setAvisoSesion(mensaje);
      borrarSesion();
    } finally {
      cerrandoSesionRef.current = false;
    }
  }, []);

  useEffect(() => {
    registrarManejadorSesionExpirada((mensaje) => {
      void cerrarSesionPorVencimiento(mensaje);
    });
    return () => registrarManejadorSesionExpirada(null);
  }, [cerrarSesionPorVencimiento]);

  // A1: valida la sesión con /auth/me al montar y al volver a primer plano (solo con red y fuera
  // del modo demo). El 401 lo resuelve el cliente (refresh + cierre); aquí se cubre el 403.
  // Sin red no se cierra la sesión: la app sigue en modo offline.
  useEffect(() => {
    const validarSesion = () => {
      const tokenActual = getAuthToken();
      const puedeValidar = debeValidarSesion({
        hayToken: !!tokenActual,
        esDemo: esTokenDemo(tokenActual) || detectDemoMode(),
        enLinea: typeof navigator === 'undefined' ? true : navigator.onLine,
        visible: typeof document === 'undefined' ? true : document.visibilityState === 'visible',
      });
      if (!puedeValidar) return;

      apiClient
        .get<{ usuario: AuthUserDTO }>('/auth/me')
        .then((respuesta) => {
          const usuario = respuesta?.usuario;
          if (!usuario || !getAuthToken()) return;
          // Refresca datos del perfil (modalidad, calendario) sin cambiar de identidad.
          setUser((actual) => (actual && actual.id === usuario.id ? { ...actual, ...usuario } : actual));
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 403) {
            void cerrarSesionPorVencimiento(error.message);
          }
        });
    };

    validarSesion();
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') validarSesion();
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  }, [cerrarSesionPorVencimiento]);

  const login = async (credentials: LoginUsuarioDTO) => {
    setIsLoading(true);
    try {
      const response = await apiClient<AuthTokensResponseDTO>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
        skipAuth: true,
      });

      // D2: si entra otra persona (o no había nadie registrado en el dispositivo), se limpian
      // los datos locales del usuario anterior ANTES de guardar la sesión nueva.
      if (debeLimpiarDatosAlIniciarSesion(leerUltimoUsuarioId(localStorage), response.usuario.id)) {
        await queryClient.cancelQueries();
        queryClient.clear();
        await limpiarDatosLocalesDeSesion();
      }

      setAuthToken(response.accessToken);
      setRefreshToken(response.refreshToken ?? null);
      guardarEnStorage(ULTIMO_USUARIO_KEY, response.usuario.id);
      quitarDeStorage(DEMO_STORAGE_KEY);
      setToken(response.accessToken);
      setUser(response.usuario);
      setIsDemoMode(false);
      setAvisoSesion(null);

      // Sesión vencida: la cola offline se conservó. Con la sesión nueva ya persistida (y tras la
      // limpieza si cambió de usuario), se envían los pendientes de la misma persona.
      void processOutboxQueue();
    } finally {
      setIsLoading(false);
    }
  };

  const demoLogin = (rol: Rol) => {
    const demoUser: AuthUserDTO =
      rol === Rol.ENTRENADOR
        ? {
            id: '11111111-2222-3333-4444-555555555555',
            email: 'coach@guachafit.com',
            rol: Rol.ENTRENADOR,
            entrenadorId: '11111111-2222-3333-4444-555555555555',
          }
        : {
            id: '99999999-8888-7777-6666-555555555555',
            email: 'alumno@guachafit.com',
            rol: Rol.ALUMNO,
            entrenadorId: '11111111-2222-3333-4444-555555555555',
            // RF-003 RN-03 (WU RF-003b): el alumno demo es remoto por defecto; la página de
            // progreso puede conmutar escenarios (remoto en ventana / fuera / presencial) con
            // fixtures locales, siempre tras `isDemoMode`.
            modalidad: Modalidad.REMOTO,
          };

    const mockToken = 'mock_jwt_token_' + rol + '_' + Date.now();
    setAuthToken(mockToken);
    setRefreshToken(null);
    setToken(mockToken);
    setUser(demoUser);
    guardarEnStorage(DEMO_STORAGE_KEY, 'true');
    setIsDemoMode(true);
    setAvisoSesion(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        isDemoMode,
        avisoSesion,
        descartarAvisoSesion: () => setAvisoSesion(null),
        login,
        demoLogin,
        logout,
        actualizarZonaHoraria: (zonaHoraria: string, usuarioId: string) =>
          setUser((actual) => (actual && actual.id === usuarioId ? { ...actual, zonaHoraria } : actual)),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
