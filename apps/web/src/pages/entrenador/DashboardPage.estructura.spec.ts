/**
 * UX-12 · Estructura de DashboardPage, ListasAlertaTemprana y fixture demo (Contrato E0–E4).
 */
import { describe, expect, it } from 'vitest';
import fuenteDashboard from './DashboardPage.tsx?raw';

describe('DashboardPage · estructura (UX-12)', () => {
  it('E2 · Datos fuera de la página: contiene useDashboardComando y no contiene apiClient, useEffect ni Carlos Mendoza', () => {
    expect(fuenteDashboard).toContain('useDashboardComando');
    expect(fuenteDashboard).not.toContain('apiClient');
    expect(fuenteDashboard).not.toContain('useEffect');
    expect(fuenteDashboard).not.toContain('Carlos Mendoza');
  });
});
