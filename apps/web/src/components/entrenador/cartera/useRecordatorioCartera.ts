/**
 * Prompt 73 (Ola 2, módulo `cartera`): estado y envío del recordatorio manual (RN-02).
 *
 * Recorte verbatim de `CarteraPage.tsx:83-88,162-244` (estado del modal, demo con la MISMA
 * regla anti-spam del servidor, POST y copiado del mensaje). Hook de datos: conserva el
 * mecanismo (`apiClient` directo, R9) y no toca JSX.
 */
import { useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { digitosWhatsApp } from '../../../lib/cartera-whatsapp';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import type {
  FilaCarteraDTO,
  RecordatorioManualResultadoDTO,
} from '@guachafit/shared';

export interface UsoRecordatorioCarteraOpciones {
  isDemoMode: boolean;
  recordatoriosDemo: Record<string, string>;
  setRecordatoriosDemo: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  recargar: () => void;
}

export function useRecordatorioCartera({
  isDemoMode,
  recordatoriosDemo,
  setRecordatoriosDemo,
  recargar,
}: UsoRecordatorioCarteraOpciones) {
  const [filaRecordatorio, setFilaRecordatorio] = useState<FilaCarteraDTO | null>(null);
  const [enviandoRecordatorio, setEnviandoRecordatorio] = useState(false);
  const [errorRecordatorio, setErrorRecordatorio] = useState<string | null>(null);
  const [resultadoRecordatorio, setResultadoRecordatorio] =
    useState<RecordatorioManualResultadoDTO | null>(null);
  const [copiado, setCopiado] = useState(false);

  const abrirRecordatorio = (fila: FilaCarteraDTO) => {
    setErrorRecordatorio(null);
    setResultadoRecordatorio(null);
    setFilaRecordatorio(fila);
  };

  const cerrarModalRecordatorio = () => {
    setFilaRecordatorio(null);
    setResultadoRecordatorio(null);
    setErrorRecordatorio(null);
    setCopiado(false);
  };

  // U3b: Escape, trampa de Tab, foco inicial y restore del foco al disparador (los dos modales
  // de la cartera compartían el overlay sin semántica de diálogo).
  const refModalRecordatorio = useDialogoAccesible({
    abierto: filaRecordatorio !== null,
    onCerrar: cerrarModalRecordatorio,
  });

  const handleEnviarRecordatorio = async () => {
    if (!filaRecordatorio) return;
    setEnviandoRecordatorio(true);
    setErrorRecordatorio(null);

    if (isDemoMode) {
      // La demo simula la MISMA regla anti-spam del servidor (cooldown de 6 h).
      const previo = recordatoriosDemo[filaRecordatorio.alumnoUsuarioId];
      if (previo) {
        setResultadoRecordatorio({
          enviado: false,
          motivo: 'cooldown_activo',
          mensaje: `Ya enviaste un recordatorio manual a ${filaRecordatorio.alumnoNombre} hace poco. Espera para no saturar al alumno (modo demo).`,
          mensajeSugerido: null,
          saldoPendienteUsd: filaRecordatorio.saldoPendienteUsd,
          saldoPendienteBs: null,
          ultimaGestionUtc: previo,
          proximoPermitidoUtc: null,
        });
      } else {
        const ahoraIso = new Date().toISOString();
        setRecordatoriosDemo((actuales) => ({
          ...actuales,
          [filaRecordatorio.alumnoUsuarioId]: ahoraIso,
        }));
        setResultadoRecordatorio({
          enviado: true,
          motivo: 'despachado',
          mensaje: `Recordatorio simulado para ${filaRecordatorio.alumnoNombre} (modo demo).`,
          mensajeSugerido: `Hola ${filaRecordatorio.alumnoNombre.split(' ')[0]}, tu mensualidad tiene un saldo pendiente de $${filaRecordatorio.saldoPendienteUsd} USD. Puedes reportar tu pago desde la app para mantener tu plan al día.`,
          saldoPendienteUsd: filaRecordatorio.saldoPendienteUsd,
          saldoPendienteBs: null,
          ultimaGestionUtc: ahoraIso,
          proximoPermitidoUtc: null,
        });
      }
      setEnviandoRecordatorio(false);
      return;
    }

    try {
      const resultado = await apiClient<RecordatorioManualResultadoDTO>(
        `/finanzas/cartera/clientes/${filaRecordatorio.alumnoUsuarioId}/recordatorio`,
        { method: 'POST' }
      );
      setResultadoRecordatorio(resultado);
      if (resultado.enviado) recargar();
    } catch (err: any) {
      setErrorRecordatorio(
        err?.message || 'No se pudo enviar el recordatorio. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setEnviandoRecordatorio(false);
    }
  };

  const copiarMensaje = async () => {
    if (!resultadoRecordatorio?.mensajeSugerido) return;
    try {
      await navigator.clipboard.writeText(resultadoRecordatorio.mensajeSugerido);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
      setErrorRecordatorio(
        'No se pudo copiar automáticamente. Selecciona el texto y cópialo manualmente.'
      );
    }
  };

  const telefonoWhatsApp = filaRecordatorio
    ? digitosWhatsApp(filaRecordatorio.telefonoWhatsapp)
    : null;

  return {
    filaRecordatorio,
    enviandoRecordatorio,
    errorRecordatorio,
    resultadoRecordatorio,
    copiado,
    telefonoWhatsApp,
    refModalRecordatorio,
    abrirRecordatorio,
    cerrarModalRecordatorio,
    handleEnviarRecordatorio,
    copiarMensaje,
  };
}

export type UsoRecordatorioCartera = ReturnType<typeof useRecordatorioCartera>;
