import React, { createContext, useContext, useState, useEffect } from 'react';
import { Rol, AuthUserDTO, AuthTokensResponseDTO, LoginUsuarioDTO } from '@guachafit/shared';
import { apiClient, setAuthToken, getAuthToken } from '../lib/api-client';
import { queryClient } from '../lib/query-client';

interface AuthContextType {
  user: AuthUserDTO | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginUsuarioDTO) => Promise<void>;
  demoLogin: (rol: Rol) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'guachafit_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserDTO | null>(() => {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(getAuthToken);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_STORAGE_KEY);
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
            email: 'atleta@guachafit.com',
            rol: Rol.ALUMNO,
            entrenadorId: '11111111-2222-3333-4444-555555555555',
          };

    const mockToken = 'mock_jwt_token_' + rol + '_' + Date.now();
    setAuthToken(mockToken);
    setToken(mockToken);
    setUser(demoUser);
  };

  const logout = () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
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
