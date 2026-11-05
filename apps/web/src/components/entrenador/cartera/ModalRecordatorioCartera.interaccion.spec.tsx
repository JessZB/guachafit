// @vitest-environment jsdom
/**
 * 01 · UX-09b · ModalRecordatorioCartera (Contrato B).
 *
 * Props nuevas: vistaPrevia, cargandoVistaPrevia, errorVistaPrevia, onReintentarVistaPrevia y saldoTexto.
 *
 * B1: Cargando: cargandoVistaPrevia: true -> role="status" con "Preparando el mensaje" y "Enviar recordatorio" disabled.
 * B2: Listo: vistaPrevia listo -> textbox "Mensaje que se enviará" con readOnly y value === cuerpo, botón habilitado.
 * B3: No se puede: puedeEnviar: false -> mensaje en role="status", botón disabled, no existe textbox "Mensaje que se enviará".
 * B4: Error: errorVistaPrevia -> role="alert" con texto, botón "Reintentar" llama onReintentarVistaPrevia, botón disabled.
 * B5: Resultado anunciado: resultado -> mensaje en role="status" y no existe "Enviar recordatorio".
 * B6: Copiado anunciado: aria-live="polite" presente siempre tras resultado; con copiado=true contiene "Mensaje copiado".
 * B7: WhatsApp avisa: link con nombre "Abrir WhatsApp..." y aria-describedby a texto visible con "fuera de la app".
 * B8: Objetivos táctiles: min-h-11 en botones y links; cierre cabecera "Cerrar recordatorio" con min-h-11 y min-w-11; type="button".
 * B9: Saldo y pantallas bajas: muestra saldoTexto ($50,00 USD); dialog con max-h-[90vh] y overflow-y-auto.
 * B10: Ids únicos: no id="mensaje-recordatorio"; dos modales no repiten ids.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  EstadoCuota,
  type FilaCarteraDTO,
  type RecordatorioManualResultadoDTO,
  type VistaPreviaRecordatorioDTO,
} from '@guachafit/shared';
import {
  ModalRecordatorioCartera,
  type ModalRecordatorioCarteraProps,
} from './ModalRecordatorioCartera';

afterEach(() => {
  cleanup();
});

type PropsModalRecordatorio = ModalRecordatorioCarteraProps & {
  vistaPrevia?: VistaPreviaRecordatorioDTO | null;
  cargandoVistaPrevia?: boolean;
  errorVistaPrevia?: string | null;
  onReintentarVistaPrevia?: () => void;
  saldoTexto?: string;
};

function fixtureFila(parcial: Partial<FilaCarteraDTO> = {}): FilaCarteraDTO {
  return {
    alumnoUsuarioId: 'u-001',
    alumnoPerfilId: 'p-001',
    alumnoNombre: 'Carlos Mendoza',
    cuotaId: 'c-001',
    estadoCuota: EstadoCuota.VENCIDA,
    fechaCorteUtc: '2026-10-01T00:00:00.000Z',
    saldoPendienteUsd: '50.00',
    saldoPendienteBs: null,
    tasaAplicada: null,
    diasAtraso: 5,
    diasRestantes: null,
    ultimaGestionUtc: null,
    planNombre: 'Plan Mensual',
    periodo: '2026-10',
    pagoId: null,
    montoReportado: null,
    monedaOriginal: null,
    metodoPago: null,
    referenciaBancaria: null,
    comprobanteUrl: null,
    fechaReporteUtc: null,
    diasEspera: null,
    telefonoWhatsapp: '+58 412-1234567',
    proximoCorte: null,
    saldoAFavorUsd: '0.00',
    ...parcial,
  };
}

function montarModal(propsParciales: Partial<PropsModalRecordatorio> = {}) {
  const propsPorDefecto: PropsModalRecordatorio = {
    fila: fixtureFila(),
    resultado: null,
    error: null,
    enviando: false,
    copiado: false,
    telefonoWhatsApp: '+58 412-1234567',
    onCerrar: vi.fn(),
    onEnviar: vi.fn(),
    onCopiar: vi.fn(),
    vistaPrevia: null,
    cargandoVistaPrevia: false,
    errorVistaPrevia: null,
    onReintentarVistaPrevia: vi.fn(),
    saldoTexto: '$50,00 USD',
    ...propsParciales,
  };

  return {
    ...render(<ModalRecordatorioCartera {...(propsPorDefecto as ModalRecordatorioCarteraProps)} />),
    props: propsPorDefecto,
  };
}

describe('Contrato B · ModalRecordatorioCartera', () => {
  it('B1 · cargando: role="status" con "Preparando el mensaje" y botón enviar disabled', () => {
    montarModal({ cargandoVistaPrevia: true });

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Preparando el mensaje');

    const botonEnviar = screen.getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(true);
  });

  it('B2 · listo: textbox "Mensaje que se enviará" con readOnly y valor, botón enviar habilitado', () => {
    const vistaPrevia: VistaPreviaRecordatorioDTO = {
      puedeEnviar: true,
      motivo: 'listo',
      mensaje: 'Listo para enviar.',
      titulo: 'Recordatorio de pago',
      cuerpo: 'Hola Carlos, tu mensualidad tiene un saldo pendiente de $50,00 USD.',
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      proximoPermitidoUtc: null,
    };

    montarModal({ vistaPrevia });

    const textarea = screen.getByLabelText('Mensaje que se enviará') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect(textarea.value).toBe(vistaPrevia.cuerpo);

    const botonEnviar = screen.getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(false);
  });

  it('B3 · no se puede: mensaje dentro de role="status", botón enviar disabled y no hay textbox de envío', () => {
    const vistaPrevia: VistaPreviaRecordatorioDTO = {
      puedeEnviar: false,
      motivo: 'cooldown_activo',
      mensaje: 'Ya enviaste un recordatorio hace poco.',
      titulo: null,
      cuerpo: null,
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      proximoPermitidoUtc: '2026-10-30T18:00:00.000Z',
    };

    montarModal({ vistaPrevia });

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Ya enviaste un recordatorio hace poco.');

    const botonEnviar = screen.getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByLabelText('Mensaje que se enviará')).toBeNull();
  });

  it('B4 · error: role="alert" con errorVistaPrevia, botón Reintentar llama onReintentarVistaPrevia y botón enviar disabled', () => {
    const onReintentar = vi.fn();
    montarModal({
      errorVistaPrevia: 'Sin conexión',
      onReintentarVistaPrevia: onReintentar,
    });

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('Sin conexión');

    const botonReintentar = screen.getByRole('button', { name: 'Reintentar' });
    fireEvent.click(botonReintentar);
    expect(onReintentar).toHaveBeenCalledTimes(1);

    const botonEnviar = screen.getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.hasAttribute('disabled')).toBe(true);
  });

  it('B5 · resultado anunciado: resultado en role="status" y no existe "Enviar recordatorio"', () => {
    const resultado: RecordatorioManualResultadoDTO = {
      enviado: true,
      motivo: 'despachado',
      mensaje: 'Recordatorio enviado a Carlos Mendoza.',
      mensajeSugerido: 'Hola Carlos, mensaje enviado.',
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      ultimaGestionUtc: '2026-10-30T10:00:00.000Z',
      proximoPermitidoUtc: null,
    };

    montarModal({ resultado });

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Recordatorio enviado a Carlos Mendoza.');
    expect(screen.queryByRole('button', { name: 'Enviar recordatorio' })).toBeNull();
  });

  it('B6 · copiado anunciado: región aria-live="polite" presente siempre tras resultado; anuncia cuando copiado es true', () => {
    const resultado: RecordatorioManualResultadoDTO = {
      enviado: true,
      motivo: 'despachado',
      mensaje: 'Recordatorio enviado.',
      mensajeSugerido: 'Texto enviado.',
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      ultimaGestionUtc: '2026-10-30T10:00:00.000Z',
      proximoPermitidoUtc: null,
    };

    const { unmount } = montarModal({ resultado, copiado: false });

    const regionLive1 = document.querySelector('[aria-live="polite"]');
    expect(regionLive1).toBeTruthy();
    expect(regionLive1?.textContent).not.toContain('Mensaje copiado');

    unmount();

    montarModal({ resultado, copiado: true });
    const regionLive2 = document.querySelector('[aria-live="polite"]');
    expect(regionLive2).toBeTruthy();
    expect(regionLive2?.textContent).toContain('Mensaje copiado');
  });

  it('B7 · WhatsApp avisa: nombre empieza por "Abrir WhatsApp" y aria-describedby apunta a texto con "fuera de la app"', () => {
    const resultado: RecordatorioManualResultadoDTO = {
      enviado: true,
      motivo: 'despachado',
      mensaje: 'Recordatorio enviado.',
      mensajeSugerido: 'Texto enviado.',
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      ultimaGestionUtc: '2026-10-30T10:00:00.000Z',
      proximoPermitidoUtc: null,
    };

    montarModal({ resultado, telefonoWhatsApp: '+58 412-1234567' });

    const linkWa = screen.getByRole('link', { name: /^Abrir WhatsApp/i });
    expect(linkWa).toBeTruthy();

    const descId = linkWa.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();

    const descEl = document.getElementById(descId!);
    expect(descEl).toBeTruthy();
    expect(descEl?.textContent).toContain('fuera de la app');
  });

  it('B8 · objetivos táctiles: min-h-11 en botones y enlaces; cierre cabecera con min-h-11 y min-w-11; type="button"', () => {
    const vistaPrevia: VistaPreviaRecordatorioDTO = {
      puedeEnviar: true,
      motivo: 'listo',
      mensaje: 'Listo.',
      titulo: 'Recordatorio',
      cuerpo: 'Texto.',
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      proximoPermitidoUtc: null,
    };

    const { unmount } = montarModal({
      vistaPrevia,
      errorVistaPrevia: 'Error',
      onReintentarVistaPrevia: vi.fn(),
    });

    const botonCancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(botonCancelar.getAttribute('class')).toContain('min-h-11');
    expect(botonCancelar.getAttribute('type')).toBe('button');

    const botonEnviar = screen.getByRole('button', { name: 'Enviar recordatorio' });
    expect(botonEnviar.getAttribute('class')).toContain('min-h-11');
    expect(botonEnviar.getAttribute('type')).toBe('button');

    const botonReintentar = screen.getByRole('button', { name: 'Reintentar' });
    expect(botonReintentar.getAttribute('class')).toContain('min-h-11');
    expect(botonReintentar.getAttribute('type')).toBe('button');

    const botonCerrarCabecera = screen.getByRole('button', { name: 'Cerrar recordatorio' });
    expect(botonCerrarCabecera.getAttribute('class')).toContain('min-h-11');
    expect(botonCerrarCabecera.getAttribute('class')).toContain('min-w-11');
    expect(botonCerrarCabecera.getAttribute('type')).toBe('button');

    unmount();

    // Comprobar con resultado: Cerrar, Copiar mensaje, link WhatsApp
    montarModal({
      resultado: {
        enviado: true,
        motivo: 'despachado',
        mensaje: 'Enviado.',
        mensajeSugerido: 'Texto.',
        saldoPendienteUsd: '50.00',
        saldoPendienteBs: null,
        ultimaGestionUtc: null,
        proximoPermitidoUtc: null,
      },
      telefonoWhatsApp: '+58 412-1234567',
    });

    const botonCerrar = screen.getByRole('button', { name: 'Cerrar' });
    expect(botonCerrar.getAttribute('class')).toContain('min-h-11');

    const botonCopiar = screen.getByRole('button', { name: 'Copiar mensaje' });
    expect(botonCopiar.getAttribute('class')).toContain('min-h-11');

    const linkWa = screen.getByRole('link', { name: /^Abrir WhatsApp/i });
    expect(linkWa.getAttribute('class')).toContain('min-h-11');
  });

  it('B9 · saldo y pantallas bajas: muestra saldoTexto ($50,00 USD) y dialog tiene max-h-[90vh] overflow-y-auto', () => {
    montarModal({
      saldoTexto: '$50,00 USD',
    });

    expect(screen.getByText(/Saldo pendiente:/i).textContent).toContain('$50,00 USD');
    expect(screen.queryByText('$50.00 USD')).toBeNull();

    const dialog = screen.getByRole('dialog');
    const clases = dialog.getAttribute('class') ?? '';
    expect(clases).toContain('max-h-[90vh]');
    expect(clases).toContain('overflow-y-auto');
  });

  it('B10 · ids únicos: no id="mensaje-recordatorio" y dos modales no repiten ningún id', () => {
    const resultado: RecordatorioManualResultadoDTO = {
      enviado: true,
      motivo: 'despachado',
      mensaje: 'Enviado.',
      mensajeSugerido: 'Texto sugerido.',
      saldoPendienteUsd: '50.00',
      saldoPendienteBs: null,
      ultimaGestionUtc: null,
      proximoPermitidoUtc: null,
    };

    const { container: c1 } = montarModal({ resultado, telefonoWhatsApp: '+58 412-1234567' });

    expect(document.getElementById('mensaje-recordatorio')).toBeNull();

    const { container: c2 } = render(
      <ModalRecordatorioCartera
        fila={fixtureFila({ alumnoUsuarioId: 'u-002', alumnoNombre: 'Valeria' })}
        resultado={resultado}
        error={null}
        enviando={false}
        copiado={false}
        telefonoWhatsApp="+58 412-7654321"
        onCerrar={vi.fn()}
        onEnviar={vi.fn()}
        onCopiar={vi.fn()}
        vistaPrevia={null}
        cargandoVistaPrevia={false}
        errorVistaPrevia={null}
        onReintentarVistaPrevia={vi.fn()}
        saldoTexto="$50,00 USD"
      />
    );

    const idsC1 = Array.from(c1.querySelectorAll('[id]')).map((el) => el.id);
    const idsC2 = Array.from(c2.querySelectorAll('[id]')).map((el) => el.id);

    const interseccion = idsC1.filter((id) => idsC2.includes(id));
    expect(interseccion).toEqual([]);
  });
});
