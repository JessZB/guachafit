import React, { createContext, useContext, useState, useEffect } from 'react';
import { Rol, AuthUserDTO, AuthTokensResponseDTO, LoginUsuarioDTO } from '@guachafit/shared';
import { apiClient, setAuthToken, getAuthToken } from '../lib/api-client';
import { queryClient } from '../lib/query-client';
import { clearOfflineData } from '../lib/offline-db';
import { limpiarCachesRuntime } from '../lib/cache-runtime';
import { solicitarPersistenciaDeAlmacenamiento } from '../lib/pwa-instalacion';

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
  login: (credentials: LoginUsuarioDTO) => Promise<void>;
  demoLogin: (rol: Rol) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'guachafit_user';
const DEMO_STORAGE_KEY = 'guachafit_demo_mode';
const DEMO_TOKEN_PREFIX = 'mock_jwt_token_';

function detectDemoMode(): boolean {
  try {
    if (localStorage.getItem(DEMO_STORAGE_KEY) === 'true') return true;
    const token = getAuthToken();
    return !!token && token.startsWith(DEMO_TOKEN_PREFIX);
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserDTO | null>(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(getAuthToken);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(detectDemoMode);

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
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

  const login = async (credentials: LoginUsuarioDTO) => {
    setIsLoading(true);
    try {
      const response = await apiClient<AuthTokensResponseDTO>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
        skipAuth: true,
      });

      setAuthToken(response.accessToken);
      setToken(response.accessToken);
      setUser(response.usuario);
      localStorage.removeItem(DEMO_STORAGE_KEY);
      setIsDemoMode(false);
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
          };

    const mockToken = 'mock_jwt_token_' + rol + '_' + Date.now();
    setAuthToken(mockToken);
    setToken(mockToken);
    setUser(demoUser);
    localStorage.setItem(DEMO_STORAGE_KEY, 'true');
    setIsDemoMode(true);
  };

  /**
   * WU22 — higiene de logout en dispositivo compartido.
   * Limpia la caché offline (Dexie) y las cachés runtime del Service Worker
   * (respuestas de API). Best-effort: un fallo NUNCA debe romper el logout.
   */
  const limpiarDatosLocalesDeSesion = async () => {
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
  };

  const logout = () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    localStorage.removeItem(DEMO_STORAGE_KEY);
    setIsDemoMode(false);
    queryClient.clear();
    void limpiarDatosLocalesDeSesion();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        isDemoMode,
        login,
        demoLogin,
        logout,
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
