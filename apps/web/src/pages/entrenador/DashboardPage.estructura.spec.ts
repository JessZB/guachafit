/**
 * UX-12 · Estructura de DashboardPage, ListasAlertaTemprana y fixture demo (Contrato E0–E4).
 */
import { describe, expect, it } from 'vitest';
import fuenteDashboard from './DashboardPage.tsx?raw';
import fuenteListas from '../../components/entrenador/dashboard/ListasAlertaTemprana.tsx?raw';
import fuenteDemo from '../../lib/dashboard-comando-demo.ts?raw';

describe('DashboardPage · estructura (UX-12)', () => {
  it('E0 · Cordura: el texto de DashboardPage.tsx no está vacío y contiene export function DashboardPage', () => {
    expect(fuenteDashboard.trim().length).toBeGreaterThan(0);
    expect(fuenteDashboard).toContain('export function DashboardPage');
  });

  it('E1 · Tope: DashboardPage.tsx tiene split(/\\r?\\n/).length <= 300', () => {
    const lineas = fuenteDashboard.split(/\r?\n/).length;
    expect(lineas).toBeLessThanOrEqual(300);
  });

  it('E2 · Datos fuera de la página: contiene useDashboardComando y no contiene apiClient, useEffect ni Carlos Mendoza', () => {
    expect(fuenteDashboard).toContain('useDashboardComando');
    expect(fuenteDashboard).not.toContain('apiClient');
    expect(fuenteDashboard).not.toContain('useEffect');
    expect(fuenteDashboard).not.toContain('Carlos Mendoza');
  });

  it('E3 · Fixture: dashboard-comando-demo.ts contiene export const DASHBOARD_COMANDO_DEMO y Carlos Mendoza', () => {
    expect(fuenteDemo).toContain('export const DASHBOARD_COMANDO_DEMO');
    expect(fuenteDemo).toContain('Carlos Mendoza');
  });

  it('E4 · Lista única: ListasAlertaTemprana.tsx contiene ListaRiesgoDashboard y no contiene .slice(', () => {
    expect(fuenteListas).toContain('ListaRiesgoDashboard');
    expect(fuenteListas).not.toContain('.slice(');
  });
});
