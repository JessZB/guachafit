/**
 * Conciliation tray (orchestrator container).
 *
 * Reads the route context (`isDemoMode`), wires the tray data, filter, and
 * action hooks, and composes the sections. Detail markup lives in
 * `components/entrenador/conciliacion/`; pure logic in `lib/conciliacion-*`.
 */
import React from 'react';
import { useAuth } from '../../context/auth-context';
import { Paginacion } from '../../components/common/Paginacion';
import { EncabezadoConciliacion } from '../../components/entrenador/conciliacion/EncabezadoConciliacion';
import { AvisosAccionConciliacion } from '../../components/entrenador/conciliacion/AvisosAccionConciliacion';
import { ErrorBandejaConciliacion } from '../../components/entrenador/conciliacion/ErrorBandejaConciliacion';
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
  const bandeja = useBandejaConciliacion(isDemoMode);
  const filtros = useFiltrosConciliacion(bandeja.transacciones);
  const acciones = useAccionesConciliacion(bandeja.marcarResuelta);

  return (
    <div className="space-y-6">
      <EncabezadoConciliacion total={bandeja.total} />

      <AvisosAccionConciliacion exito={acciones.actionSuccess} error={acciones.actionError} />

      {!bandeja.enCargaInicial && bandeja.error ? (
        <ErrorBandejaConciliacion mensaje={bandeja.error} onReintentar={() => bandeja.recargar()} />
      ) : bandeja.total === 0 ? (
        <BandejaVaciaConciliacion />
      ) : (
        <div className="space-y-4">
          <div className="px-1">
            <Paginacion
              pagina={bandeja.pagina}
              tamano={bandeja.tamano}
              total={bandeja.total}
              onCambiarPagina={bandeja.fijarPagina}
              onCambiarTamano={bandeja.fijarTamano}
              cargando={bandeja.cargando}
            />
          </div>

          <FiltrosConciliacion
            metodosPresentes={filtros.metodosPresentes}
            filtroMetodo={filtros.filtroMetodo}
            onCambiarMetodo={filtros.fijarFiltroMetodo}
            busqueda={filtros.busqueda}
            onCambiarBusqueda={filtros.fijarBusqueda}
            visibles={filtros.visibles.length}
            enPagina={bandeja.transacciones.length}
            total={bandeja.total}
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
          motivo={acciones.motivoRechazo}
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
