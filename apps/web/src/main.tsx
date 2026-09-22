import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { ThemeProvider } from './lib/theme';
import { AuthProvider } from './context/auth-context';
import { router } from './router';
import { registrarActualizacion } from './lib/pwa-registro';
import './index.css';

// U4 (Ola 4): registro del SW en modo `prompt` (aviso de versión nueva, sin recargas
// silenciosas). Se ejecuta antes de montar para que el gestor exista cuando la UI monte.
registrarActualizacion();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="guachafit-theme">
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
