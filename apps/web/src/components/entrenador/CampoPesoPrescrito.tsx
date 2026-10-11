import React, { useId, useRef, useState } from 'react';
import {
  componerPesoPrescrito,
  filtrarEntradaPeso,
  interpretarPesoPrescrito,
} from '../../lib/entrada-numerica';
import { normalizarPesoPrescritoTexto } from '../../lib/weight-unit';

/**
 * Campo de carga prescrita del coach (RF-017, lote E3): número en kg filtrado al teclear
 * (0–999, hasta 2 decimales) o "Peso corporal". Sin texto libre: cada dato tiene su control.
 * Compartido por el modal de prescripción de la ficha del alumno y el editor de plantillas.
 *
 * El borrador local conserva estados intermedios como '60,' mientras se escribe; hacia
 * fuera solo sale el valor compuesto ('60.5', 'Corporal' o '').
 */
export function CampoPesoPrescrito({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (nuevoValor: string) => void;
}) {
  const idInput = useId();
  const idError = useId();
  const interpretado = interpretarPesoPrescrito(valor);
  const esCorporal = interpretado.modo === 'corporal';

  const [borrador, setBorrador] = useState(interpretado.numero);
  // Último valor emitido: si el padre cambia `valor` por otra vía, el borrador se resincroniza.
  const ultimoEmitido = useRef(valor);
  if (valor !== ultimoEmitido.current) {
    ultimoEmitido.current = valor;
    if (componerPesoPrescrito({ modo: 'numero', numero: borrador, textoCorporal: '' }) !== valor) {
      setBorrador(interpretado.numero);
    }
  }

  const emitir = (nuevoValor: string) => {
    ultimoEmitido.current = nuevoValor;
    onChange(nuevoValor);
  };

  const cambiarNumero = (texto: string) => {
    const filtrado = filtrarEntradaPeso(texto, borrador, 'kg');
    if (filtrado === borrador) return;
    setBorrador(filtrado);
    emitir(componerPesoPrescrito({ modo: 'numero', numero: filtrado, textoCorporal: '' }));
  };

  const alternarCorporal = () => {
    if (esCorporal) {
      setBorrador('');
      emitir('');
    } else {
      emitir(componerPesoPrescrito({ modo: 'corporal', numero: '', textoCorporal: '' }));
    }
  };

  const { error } = esCorporal ? { error: undefined } : normalizarPesoPrescritoTexto(valor);

  return (
    <div className="flex flex-col items-center gap-1">
      <label htmlFor={idInput} className="text-xs font-medium text-muted-foreground">
        Peso (kg)
      </label>
      <input
        id={idInput}
        type="text"
        inputMode="decimal"
        value={esCorporal ? '' : borrador}
        disabled={esCorporal}
        onChange={(e) => cambiarNumero(e.target.value)}
        placeholder={esCorporal ? '—' : '60'}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? idError : undefined}
        className={`h-11 sm:h-9 w-20 sm:w-24 px-2 rounded-lg bg-background border text-center font-mono font-semibold text-sm text-foreground focus:outline-hidden focus:border-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'border-destructive/70' : 'border-border'
        }`}
      />
      <button
        type="button"
        role="switch"
        aria-checked={esCorporal}
        onClick={alternarCorporal}
        title={esCorporal && interpretado.textoCorporal !== 'Corporal' ? interpretado.textoCorporal : undefined}
        className="min-h-11 sm:min-h-8 inline-flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary rounded-md"
      >
        <span
          aria-hidden="true"
          className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
            esCorporal ? 'bg-primary' : 'bg-secondary border border-border'
          }`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-background shadow-xs transition-transform ${
              esCorporal ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </span>
        <span>Peso corporal</span>
      </button>
      {error && (
        <span id={idError} className="text-xs font-semibold text-destructive text-center max-w-28 leading-tight">
          {error}
        </span>
      )}
    </div>
  );
}
