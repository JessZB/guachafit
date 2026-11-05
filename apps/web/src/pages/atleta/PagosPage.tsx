import { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { useEstadoCuentaAlumno } from '../../components/atleta/pagos/use-estado-cuenta-alumno';
import { useReportePago } from '../../components/atleta/pagos/use-reporte-pago';
import { CabeceraPagos } from '../../components/atleta/pagos/CabeceraPagos';
import { AvisoSaldoAFavor } from '../../components/atleta/pagos/AvisoSaldoAFavor';
import { TarjetaResumenCuota } from '../../components/atleta/pagos/TarjetaResumenCuota';
import { SelectorAccionesPagos } from '../../components/atleta/pagos/SelectorAccionesPagos';
import { PestanaReportePago } from '../../components/atleta/pagos/PestanaReportePago';
import { FormularioReportePago } from '../../components/atleta/pagos/FormularioReportePago';
import { SubidaComprobantePago } from '../../components/atleta/pagos/SubidaComprobantePago';
import { PestanaHistorialPagos } from '../../components/atleta/pagos/PestanaHistorialPagos';
import { ModalComprobantePago } from '../../components/atleta/pagos/ModalComprobantePago';
import { EstadoCarga } from '../../components/ui/EstadoCarga';
import { EstadoError } from '../../components/ui/EstadoError';
import { EstadoVacio } from '../../components/ui/EstadoVacio';
import { Receipt } from 'lucide-react';

export function PagosPage() {
  const { isDemoMode } = useAuth();
  // R1: los datos viven en hooks (mismo mecanismo `apiClient` + `useState`, R9);
  // el contenedor solo orquesta vistas y conecta callbacks.
  const {
    cuota,
    tasa,
    tasaError,
    saldoAFavorUsd,
    isLoading,
    error,
    recargar: cargarDatos,
    paginaHistorial,
    tamanoHistorial,
    transaccionesHistorial,
    transaccionesTotal,
    isCargandoHistorial,
    errorHistorial,
    filtroEstadoHistorial,
    setFiltroEstadoHistorial,
    cambiarPaginaHistorial,
    cambiarTamanoHistorial,
    tasaEfectivaNum,
    etiquetaSinTasa,
    saldoVesProyectado,
    transaccionesFiltradas,
    urlHistorialActual,
  } = useEstadoCuentaAlumno();

  // Progressive Disclosure: 'hub' (selector) | 'nuevo-pago' | 'historial'
  const [vistaActiva, setVistaActiva] = useState<'hub' | 'nuevo-pago' | 'historial'>('hub');

  const {
    metodoPago,
    setMetodoPago,
    moneda,
    setMoneda,
    montoOriginal,
    setMontoOriginal,
    referenciaBancaria,
    setReferenciaBancaria,
    fechaOperacion,
    hoyLocal,
    alCambiarFecha,
    mostrarErrorFechaFutura,
    isSubmitting,
    formSuccess,
    formError,
    errorMonto,
    errorFecha,
    errorArchivo,
    errorReferencia,
    motivoRechazoCorreccion,
    iniciarNuevoPago,
    iniciarCorreccionPago,
    fileInputRef,
    selectedFile,
    previewUrl,
    handleFileChange,
    handleRemoveFile,
    handleReportarPago,
    pagoVesSinTasa,
    contravalorUsd,
  } = useReportePago({
    cuota,
    tasa,
    tasaError,
    alReportarExito: () => {
      setVistaActiva('historial');
      void cargarDatos();
    },
  });

  // N2: visor de comprobante (diálogo accesible en `ModalComprobantePago`).
  const [modalComprobante, setModalComprobante] = useState<{ url: string | null } | null>(null);

  if (isLoading) {
    return <EstadoCarga />;
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12">
      <CabeceraPagos tasaEfectiva={tasa?.tasaEfectiva} etiquetaSinTasa={etiquetaSinTasa} />

      {/* RF-006 RN-05: saldo a favor del alumno */}
      <AvisoSaldoAFavor saldoAFavorUsd={saldoAFavorUsd} tasaEfectiva={tasa?.tasaEfectiva} />

      {/* D2: error de carga honesto con reintento (sin cuota demo fuera del modo demo) */}
      {error && (
        <EstadoError mensaje={error} onReintentar={() => void cargarDatos()} />
      )}

      {/* D2: sin cuota emitida no se simula saldo; estado vacío honesto */}
      {!isLoading && !error && !cuota && vistaActiva === 'hub' && (
        <EstadoVacio
          titulo="Sin cuota vigente"
          icono={Receipt}
          detalle="Tu entrenador aún no ha emitido una cuota para este periodo. Si crees que es un error, contáctalo."
        />
      )}

      {/* U4: datos de cuenta servidos desde la caché del SW (sin conexión), con su antigüedad. */}
      {!isDemoMode && !error && (cuota || transaccionesHistorial.length > 0) && (
        <AvisoDatosOffline url={urlHistorialActual} />
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: HUB PRINCIPAL (Divulgación Progresiva - Nivel 1)                  */}
      {/* ========================================================================= */}
      {vistaActiva === 'hub' && (
        <div className="space-y-5">
          {/* Tarjeta de Resumen de Saldo */}
          <TarjetaResumenCuota
            cuota={cuota}
            tasaEfectivaNum={tasaEfectivaNum}
            saldoVesProyectado={saldoVesProyectado}
          />

          {/* Selector de Acciones: 2 Caminos Claros */}
          <SelectorAccionesPagos
            transaccionesTotal={transaccionesTotal}
            onReportar={() => {
              iniciarNuevoPago();
              setVistaActiva('nuevo-pago');
            }}
            onVerHistorial={() => setVistaActiva('historial')}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: FORMULARIO LIMPIO DE REPORTE (Sin modal invasivo)                 */}
      {/* ========================================================================= */}
      {vistaActiva === 'nuevo-pago' && (
        <PestanaReportePago
          onVolver={() => {
            iniciarNuevoPago();
            setVistaActiva('hub');
          }}
          formError={formError}
          formSuccess={formSuccess}
          motivoRechazo={motivoRechazoCorreccion}
        >
          <FormularioReportePago
            metodoPago={metodoPago}
            onMetodoPago={setMetodoPago}
            moneda={moneda}
            onMoneda={setMoneda}
            montoOriginal={montoOriginal}
            onMonto={setMontoOriginal}
            referenciaBancaria={referenciaBancaria}
            onReferencia={setReferenciaBancaria}
            fechaOperacion={fechaOperacion}
            hoyLocal={hoyLocal}
            onFecha={alCambiarFecha}
            onFechaInvalida={mostrarErrorFechaFutura}
            isSubmitting={isSubmitting}
            pagoVesSinTasa={pagoVesSinTasa}
            contravalorUsd={contravalorUsd}
            onSubmit={handleReportarPago}
            errorMonto={errorMonto}
            errorFecha={errorFecha}
            errorReferencia={errorReferencia}
            comprobante={
              <SubidaComprobantePago
                inputRef={fileInputRef}
                selectedFile={selectedFile}
                previewUrl={previewUrl}
                onArchivo={handleFileChange}
                onQuitar={handleRemoveFile}
                errorArchivo={errorArchivo}
              />
            }
          />
        </PestanaReportePago>
      )}

      {/* ========================================================================= */}
      {/* VISTA 3: HISTORIAL LIMPIO CON VISIBILIDAD DE RECHAZOS (UX Transparente)    */}
      {/* ========================================================================= */}
      {vistaActiva === 'historial' && (
        <PestanaHistorialPagos
          onVolver={() => setVistaActiva('hub')}
          onNuevoAbono={() => {
            iniciarNuevoPago();
            setVistaActiva('nuevo-pago');
          }}
          transaccionesTotal={transaccionesTotal}
          transaccionesHistorial={transaccionesHistorial}
          transaccionesFiltradas={transaccionesFiltradas}
          filtro={filtroEstadoHistorial}
          onFiltrar={setFiltroEstadoHistorial}
          errorHistorial={errorHistorial}
          pagina={paginaHistorial}
          tamano={tamanoHistorial}
          cargando={isCargandoHistorial}
          onCambiarPagina={cambiarPaginaHistorial}
          onCambiarTamano={cambiarTamanoHistorial}
          onVerComprobante={(url) => setModalComprobante({ url })}
          onCorregir={(tx) => {
            iniciarCorreccionPago(tx);
            setVistaActiva('nuevo-pago');
          }}
        />
      )}

      {/* Modal de Comprobante SigV4 */}
      <ModalComprobantePago
        comprobante={modalComprobante}
        isDemoMode={isDemoMode}
        onCerrar={() => setModalComprobante(null)}
      />
    </div>
  );
}
