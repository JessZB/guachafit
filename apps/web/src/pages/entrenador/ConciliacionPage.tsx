/**
 * Conciliation tray (orchestrator container).
 *
 * Estados honestos (UX-05, §6.6):
 * - carga inicial: `EstadoCarga` anunciado, sin contador ni "Bandeja al Día" falsos;
 * - vacío real: solo con respuesta del servidor sin transacciones;
 * - error sin datos: `EstadoError` a pantalla completa con reintento;
 * - recarga fallida con datos: la lista se conserva y `AvisoErrorRecarga` ofrece reintentar;
 * - sin conexión con datos: `AvisoDatosOffline` y sin alerta de recarga.
 *
 * Reads the route context (`isDemoMode`), wires the tray data, filter, and
 * action hooks, and composes the sections. Detail markup lives in
 * `components/entrenador/conciliacion/`; pure logic in `lib/conciliacion-*`.
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { Paginacion } from '../../components/common/Paginacion';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { AvisoErrorRecarga } from '../../components/common/AvisoErrorRecarga';
import { EstadoCarga } from '../../components/ui/EstadoCarga';
import { EstadoError } from '../../components/ui/EstadoError';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { useFormatoNumero } from '../../lib/use-formato-numero';
import { EncabezadoConciliacion } from '../../components/entrenador/conciliacion/EncabezadoConciliacion';
import { AvisosAccionConciliacion } from '../../components/entrenador/conciliacion/AvisosAccionConciliacion';
import { BandejaVaciaConciliacion } from '../../components/entrenador/conciliacion/BandejaVaciaConciliacion';
import { FiltrosConciliacion } from '../../components/entrenador/conciliacion/FiltrosConciliacion';
import { SinResultadosConciliacion } from '../../components/entrenador/conciliacion/SinResultadosConciliacion';
import { TarjetaTransaccionConciliacion } from '../../components/entrenador/conciliacion/TarjetaTransaccionConciliacion';
import { DialogoAprobacionConciliacion } from '../../components/entrenador/conciliacion/DialogoAprobacionConciliacion';
import { ModalRechazoConciliacion } from '../../components/entrenador/conciliacion/ModalRechazoConciliacion';
import { VisorComprobanteConciliacion } from '../../components/entrenador/conciliacion/VisorComprobanteConciliacion';
import { useBandejaConciliacion } from '../../components/entrenador/conciliacion/use-bandeja-conciliacion';
import { useFiltrosConciliacion } from '../../components/entrenador/conciliacion/use-filtros-conciliacion';
import { useAccionesConciliacion } from '../../components/entrenador/conciliacion/use-acciones-conciliacion';

export function ConciliacionPage() {
  const { isDemoMode } = useAuth();
  const { isOnline } = useFrescuraOffline(null);
  const bandeja = useBandejaConciliacion(isDemoMode);
  // `?q=` llega desde Control de cobros ("Revisar en bandeja"): es un traspaso de un solo uso.
  // Sirve de búsqueda de partida y se retira de la URL al montar, sin entrada nueva en el historial.
  const [searchParams, setSearchParams] = useSearchParams();
  const filtros = useFiltrosConciliacion(bandeja.transacciones, searchParams.get('q') ?? '');
  React.useEffect(() => {
    if (!searchParams.has('q')) return;
    setSearchParams(
      (actuales) => {
        const siguientes = new URLSearchParams(actuales);
        siguientes.delete('q');
        return siguientes;
      },
      { replace: true }
    );
    // Solo al montar: `q` es la búsqueda de partida, no un estado sincronizado con la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const acciones = useAccionesConciliacion(bandeja.marcarResuelta);
  const { formatMonto } = useFormatoNumero();
  const refLista = React.useRef<HTMLDivElement>(null);

  // The pagination sits below the list, so after a page change the viewport would stay
  // at the bottom. Bring the top of the list back into view. Page-size changes do not scroll.
  const cambiarPagina = (pagina: number) => {
    bandeja.fijarPagina(pagina);
    const movimientoReducido =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Optional call: jsdom does not implement scrollIntoView.
    refLista.current?.scrollIntoView?.({
      behavior: movimientoReducido ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="space-y-6">
      {/* Sin respuesta del servidor el contador no existe: no se pinta un "0" falso */}
      <EncabezadoConciliacion total={bandeja.tieneDatos ? bandeja.total : null} />

      <AvisosAccionConciliacion
        exito={acciones.actionSuccess}
        error={acciones.actionError}
        onCerrarExito={acciones.cerrarExito}
      />

      {/* Sin conexión con datos guardados: el aviso de frescura de la pantalla */}
      {bandeja.tieneDatos && <AvisoDatosOffline />}

      {/* Recarga fallida con la lista visible: aviso inline (sin alerta de recarga offline) */}
      {bandeja.tieneDatos && bandeja.error && isOnline && (
        <AvisoErrorRecarga
          mensaje="No se pudo actualizar la bandeja. Los pagos mostrados pueden estar desactualizados."
          onReintentar={() => bandeja.recargar()}
        />
      )}

      {/* Sin conexión y sin datos: el error no es definitivo; la consulta se reintenta al reconectar */}
      {!bandeja.tieneDatos && bandeja.error && !isOnline ? (
        <AvisoDatosOffline variante="sin-datos" />
      ) : !bandeja.tieneDatos && bandeja.error ? (
        <EstadoError
          titulo="No pudimos cargar la bandeja"
          mensaje={bandeja.error}
          onReintentar={() => bandeja.recargar()}
        />
      ) : !bandeja.tieneDatos ? (
        <EstadoCarga texto="Cargando la bandeja de pagos" claseContenedor="min-h-[200px]" />
      ) : bandeja.total === 0 ? (
        <BandejaVaciaConciliacion />
      ) : (
        <div ref={refLista} className="space-y-4">
          <FiltrosConciliacion
            metodosPresentes={filtros.metodosPresentes}
            filtroMetodo={filtros.filtroMetodo}
            onCambiarMetodo={filtros.fijarFiltroMetodo}
            busqueda={filtros.busqueda}
            onCambiarBusqueda={filtros.fijarBusqueda}
            visibles={filtros.visibles.length}
            enPagina={bandeja.transacciones.length}
            hayFiltroActivo={filtros.hayFiltroActivo}
            onLimpiar={filtros.limpiarFiltros}
          />

          {filtros.visibles.length === 0 ? (
            <SinResultadosConciliacion onLimpiar={filtros.limpiarFiltros} />
          ) : (
            filtros.visibles.map((tx) => (
              <TarjetaTransaccionConciliacion
                key={tx.id}
                tx={tx}
                onVerComprobante={acciones.verComprobante}
                onRechazar={acciones.iniciarRechazo}
                onAprobar={acciones.iniciarAprobacion}
              />
            ))
          )}

          <div className="px-1">
            <Paginacion
              pagina={bandeja.pagina}
              tamano={bandeja.tamano}
              total={bandeja.total}
              onCambiarPagina={cambiarPagina}
              onCambiarTamano={bandeja.fijarTamano}
              cargando={bandeja.cargando}
            />
          </div>
        </div>
      )}

      <DialogoAprobacionConciliacion
        pago={acciones.pagoPorAprobar}
        aprobando={acciones.aprobando}
        onCancelar={acciones.cancelarAprobacion}
        onConfirmar={acciones.confirmarAprobacion}
      />

      {acciones.rejectingTx && (
        <ModalRechazoConciliacion
          alumno={acciones.rejectingTx.clienteNombre || 'Alumno'}
          montoTexto={formatMonto(acciones.rejectingTx.montoEquivalenteUsd, 'USD', { conCodigo: true })}
          motivo={acciones.motivoRechazo}
          procesando={acciones.rechazando}
          error={acciones.errorRechazo}
          onCambiarMotivo={acciones.fijarMotivoRechazo}
          onCerrar={acciones.cerrarRechazo}
          onConfirmar={acciones.confirmarRechazo}
        />
      )}

      {acciones.viewingComprobanteTx && (
        <VisorComprobanteConciliacion
          tx={acciones.viewingComprobanteTx}
          isDemoMode={isDemoMode}
          imagenFallida={acciones.comprobanteImgError}
          onImagenError={acciones.marcarImagenFallida}
          onCerrar={acciones.cerrarVisor}
          onRechazar={acciones.rechazarDesdeVisor}
          onAprobar={acciones.aprobarDesdeVisor}
        />
      )}
    </div>
  );
}
