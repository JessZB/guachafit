// @vitest-environment happy-dom
/**
 * UX-12 · MetricCard badge unificado con BadgeEstado (Contrato M1–M3).
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricCard } from './MetricCard';
import { BadgeEstado } from '../ui/BadgeEstado';

describe('MetricCard · badge unificado con BadgeEstado (UX-12)', () => {
  afterEach(() => {
    cleanup();
  });

  it('M1 · Badge unificado: variant="danger" produce el mismo className que BadgeEstado tono="danger"', () => {
    render(<MetricCard title="T" value="1" badge={{ text: 'Alerta', variant: 'danger' }} />);
    const classNameMetric = screen.getByText('Alerta').className;
    cleanup();

    render(<BadgeEstado tono="danger">Alerta</BadgeEstado>);
    const classNameEstado = screen.getByText('Alerta').className;

    expect(classNameMetric).toBe(classNameEstado);
  });

  it('M2 · Variantes: success, warning e info coinciden con BadgeEstado', () => {
    const variantes: Array<'success' | 'warning' | 'info'> = ['success', 'warning', 'info'];

    for (const v of variantes) {
      cleanup();
      render(<MetricCard title="T" value="1" badge={{ text: `Texto-${v}`, variant: v }} />);
      const classNameMetric = screen.getByText(`Texto-${v}`).className;
      cleanup();

      render(<BadgeEstado tono={v}>{`Texto-${v}`}</BadgeEstado>);
      const classNameEstado = screen.getByText(`Texto-${v}`).className;

      expect(classNameMetric).toBe(classNameEstado);
    }
  });

  it('M3 · Sin variante: badge sin variant produce el mismo className que BadgeEstado tono="info"', () => {
    render(<MetricCard title="T" value="1" badge={{ text: 'X' }} />);
    const classNameMetric = screen.getByText('X').className;
    cleanup();

    render(<BadgeEstado tono="info">X</BadgeEstado>);
    const classNameEstado = screen.getByText('X').className;

    expect(classNameMetric).toBe(classNameEstado);
  });
});
