/**
 * Prompt 73 (Ola 2, módulo `cartera`): estado y envío del recordatorio manual (RN-02).
 *
 * Recorte verbatim de `CarteraPage.tsx:83-88,162-244` (estado del modal, demo con la MISMA
 * regla anti-spam del servidor, POST y copiado del mensaje). Hook de datos: conserva el
 * mecanismo (`apiClient` directo, R9) y no toca JSX.
 *
 * UX-09b: la vista previa (GET, solo de lectura) se pide al abrir el modal y al reintentar, nunca
 * por fila de la tabla (evita N+1). En demo se calcula en local con los mismos textos que el
 * envío simulado, para que lo que se previsualiza sea lo que se "envía".
 */
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import { digitosWhatsApp } from '../../../lib/cartera-whatsapp';
import { useDialogoAccesible } from '../../../lib/use-dialogo-accesible';
import type {
  FilaCarteraDTO,
  RecordatorioManualResultadoDTO,
  VistaPreviaRecordatorioDTO,
} from '@guachafit/shared';

export interface UsoRecordatorioCarteraOpciones {
  isDemoMode: boolean;
  recordatoriosDemo: Record<string, string>;
  setRecordatoriosDemo: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  recargar: () => void;
}

const MENSAJE_ERROR_VISTA_PREVIA =
  'No se pudo preparar el mensaje. Revisa tu conexión e inténtalo de nuevo.';

// Textos demo compartidos por la vista previa y el envío simulado (no duplicar literales).
const textoCooldownDemo = (nombre: string) =>
  `Ya enviaste un recordatorio manual a ${nombre} hace poco. Espera para no saturar al alumno (modo demo).`;

const textoEnviadoDemo = (nombre: string) => `Recordatorio simulado para ${nombre} (modo demo).`;

const mensajeRecordatorioDemo = (fila: FilaCarteraDTO) =>
  `Hola ${fila.alumnoNombre.split(' ')[0]}, tu mensualidad tiene un saldo pendiente de $${fila.saldoPendienteUsd} USD. Puedes reportar tu pago desde la app para mantener tu plan al día.`;

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
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaRecordatorioDTO | null>(null);
  const [cargandoVistaPrevia, setCargandoVistaPrevia] = useState(false);
  const [errorVistaPrevia, setErrorVistaPrevia] = useState<string | null>(null);

  // Cada apertura, reintento o cierre cambia el id: una respuesta con id viejo se descarta
  // (abrir → cerrar → abrir no debe pintar la vista previa de la primera apertura).
  const solicitudVistaPreviaRef = useRef(0);
  // Temporizador del aviso "Copiado ✓"; se limpia al cerrar y al desmontar (sin timers huérfanos).
  const temporizadorCopiadoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarTemporizadorCopiado = () => {
    if (temporizadorCopiadoRef.current !== null) {
      clearTimeout(temporizadorCopiadoRef.current);
      temporizadorCopiadoRef.current = null;
    }
  };

  // Al desmontar se invalidan las peticiones en vuelo y se cancela el temporizador pendiente.
  useEffect(
    () => () => {
      solicitudVistaPreviaRef.current += 1;
      if (temporizadorCopiadoRef.current !== null) clearTimeout(temporizadorCopiadoRef.current);
    },
    []
  );

  const prepararVistaPrevia = async (fila: FilaCarteraDTO) => {
    const solicitud = ++solicitudVistaPreviaRef.current;
    setErrorVistaPrevia(null);
    setVistaPrevia(null);

    if (isDemoMode) {
      // Demo sin red: misma regla anti-spam que el servidor (cooldown de 6 h).
      const previo = recordatoriosDemo[fila.alumnoUsuarioId];
      setVistaPrevia(
        previo
          ? {
              puedeEnviar: false,
              motivo: 'cooldown_activo',
              mensaje: textoCooldownDemo(fila.alumnoNombre),
              titulo: null,
              cuerpo: null,
              saldoPendienteUsd: fila.saldoPendienteUsd,
              saldoPendienteBs: null,
              proximoPermitidoUtc: null,
            }
          : {
              puedeEnviar: true,
              motivo: 'listo',
              mensaje: 'Listo para enviar (modo demo).',
              titulo: 'Recordatorio de pago',
              cuerpo: mensajeRecordatorioDemo(fila),
              saldoPendienteUsd: fila.saldoPendienteUsd,
              saldoPendienteBs: null,
              proximoPermitidoUtc: null,
            }
      );
      setCargandoVistaPrevia(false);
      return;
    }

    setCargandoVistaPrevia(true);
    try {
      const respuesta = await apiClient<VistaPreviaRecordatorioDTO>(
        `/finanzas/cartera/clientes/${fila.alumnoUsuarioId}/recordatorio/vista-previa`
      );
      if (solicitud !== solicitudVistaPreviaRef.current) return;
      setVistaPrevia(respuesta);
    } catch (err: any) {
      if (solicitud !== solicitudVistaPreviaRef.current) return;
      setErrorVistaPrevia(err?.message || MENSAJE_ERROR_VISTA_PREVIA);
    } finally {
      if (solicitud === solicitudVistaPreviaRef.current) setCargandoVistaPrevia(false);
    }
  };

  const abrirRecordatorio = (fila: FilaCarteraDTO) => {
    setErrorRecordatorio(null);
    setResultadoRecordatorio(null);
    setFilaRecordatorio(fila);
    void prepararVistaPrevia(fila);
  };

  const reintentarVistaPrevia = () => {
    if (filaRecordatorio) void prepararVistaPrevia(filaRecordatorio);
  };

  const cerrarModalRecordatorio = () => {
    solicitudVistaPreviaRef.current += 1;
    limpiarTemporizadorCopiado();
    setFilaRecordatorio(null);
    setResultadoRecordatorio(null);
    setErrorRecordatorio(null);
    setCopiado(false);
    setVistaPrevia(null);
    setCargandoVistaPrevia(false);
    setErrorVistaPrevia(null);
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
          mensaje: textoCooldownDemo(filaRecordatorio.alumnoNombre),
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
          mensaje: textoEnviadoDemo(filaRecordatorio.alumnoNombre),
          mensajeSugerido: mensajeRecordatorioDemo(filaRecordatorio),
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
      limpiarTemporizadorCopiado();
      temporizadorCopiadoRef.current = setTimeout(() => {
        temporizadorCopiadoRef.current = null;
        setCopiado(false);
      }, 2500);
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
    vistaPrevia,
    cargandoVistaPrevia,
    errorVistaPrevia,
    reintentarVistaPrevia,
    refModalRecordatorio,
    abrirRecordatorio,
    cerrarModalRecordatorio,
    handleEnviarRecordatorio,
    copiarMensaje,
  };
}

export type UsoRecordatorioCartera = ReturnType<typeof useRecordatorioCartera>;
