import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      refetchOnWindowFocus: false,
      // WU25a: la paginación server-side usa `keepPreviousData`; con 1 reintento basta para
      // absorber un fallo de red puntual sin dejar la página en error más tiempo del necesario.
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          // Don't retry on client errors (4xx)
          if (error.status >= 400 && error.status < 500) {
            return false;
          }
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
