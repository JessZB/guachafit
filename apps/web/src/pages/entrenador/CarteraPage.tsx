import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CLAVE_PENDIENTES_NAVEGACION } from '../../lib/insignias-pendientes';
import { useCartera } from '../../components/entrenador/cartera/useCartera';
import { useRecordatorioCartera } from '../../components/entrenador/cartera/useRecordatorioCartera';
import { useCobroCartera } from '../../components/entrenador/cartera/useCobroCartera';
import { CabeceraCartera } from '../../components/entrenador/cartera/CabeceraCartera';
import { ResumenCartera } from '../../components/entrenador/cartera/ResumenCartera';
import { EsqueletoKpisCartera, EsqueletoFilasCartera } from '../../components/entrenador/cartera/EsqueletoCartera';
import { PestanasCartera } from '../../components/entrenador/cartera/PestanasCartera';
import { BuscadorCartera } from '../../components/entrenador/cartera/BuscadorCartera';
import { ModalRecordatorioCartera } from '../../components/entrenador/cartera/ModalRecordatorioCartera';
import { ModalCobroCartera } from '../../components/entrenador/cartera/ModalCobroCartera';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { AvisoErrorRecarga } from '../../components/common/AvisoErrorRecarga';
import { EstadoError } from '../../components/ui/EstadoError';
import { Paginacion } from '../../components/common/Paginacion';
import { TablaCartera } from '../../components/entrenador/TablaCartera';
import { PESTANAS_CARTERA, hayTasaProyectable } from '../../lib/cartera';
import { resumenDeCobro } from '../../lib/cobro-sala';
import { useFrescuraOffline } from '../../lib/use-frescura-offline';
import { useFormatoNumero } from '../../lib/use-formato-numero';

/**
 * Estados honestos (UX-05, §6.6): con datos, la tabla y los KPI se conservan ante una recarga
 * fallida (aviso inline con reintento); sin datos y con error, solo el bloque de error con
 * reintento; mientras carga, esqueletos y no un aviso de tasa que aún no se sabe si aplica.
 */
export function CarteraPage() {
  const {
    isDemoMode,
    pestana,
    pagina,
    tamano,
    busqueda,
    q,
    setPagina,
    setTamano,
    setBusqueda,
    cambiarPestana,
    items,
    total,
    cargando,
    error,
    recargar,
    resumen,
    isLoading,
    tieneDatos,
    setCobradosDemo,
    recordatoriosDemo,
    setRecordatoriosDemo,
  } = useCartera();
  const navigate = useNavigate();
  const { isOnline } = useFrescuraOffline(null);
  const { formatMonto } = useFormatoNumero();

  // Recordatorio manual (RN-02)
  const {
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
  } = useRecordatorioCartera({
    isDemoMode,
    recordatoriosDemo,
    setRecordatoriosDemo,
    recargar,
  });

  // Cobro directo en efectivo (RN-01). Un cobro real baja la mora: la insignia se invalida con la recarga.
  const queryClient = useQueryClient();
  const recargarTrasCobro = () => {
    recargar();
    queryClient.invalidateQueries({ queryKey: [CLAVE_PENDIENTES_NAVEGACION] });
  };
  const {
    cobro,
    enviandoCobro,
    errorCobro,
    cobroSinPlan,
    exitoCobro,
    refModalCobro,
    abrirCobro,
    cerrarModalCobro,
    cambiarMonto,
    cambiarMoneda,
    cambiarFecha,
    handleRegistrarCobro,
  } = useCobroCartera({ isDemoMode, setCobradosDemo, recargar: recargarTrasCobro });

  // U3b: el estado de las pestañas vive en la URL (`?pestana=`).
  const pestanaActiva = PESTANAS_CARTERA.find((p) => p.clave === pestana)!;

  // Mientras carga el resumen no se sabe si hay tasa: el aviso solo aparece con el resumen en mano.
  const sinTasa = resumen !== null && !hayTasaProyectable(resumen);
  // Solo esas pestañas muestran bolívares, así que solo ahí tiene sentido el aviso.
  const avisoSinTasa = sinTasa && (pestana === 'mora' || pestana === 'por_vencer');

  // Modal de recordatorio: saldo en USD y, si la fila lo trae, su equivalente en Bs.
  const saldoTextoRecordatorio = filaRecordatorio
    ? `${formatMonto(filaRecordatorio.saldoPendienteUsd, 'USD', { conCodigo: true })}${
        filaRecordatorio.saldoPendienteBs
          ? ` · ${formatMonto(filaRecordatorio.saldoPendienteBs, 'VES')}`
          : ''
      }`
    : '';

  // Modal de cobro: saldo formateado y resumen de lo que se registrará (D1)
  const saldoTexto = cobro
    ? formatMonto(cobro.fila.saldoPendienteUsd, 'USD', { conCodigo: true })
    : '';
  const resumenCobro = cobro
    ? resumenDeCobro(
        cobro.monto,
        cobro.moneda,
        cobro.fila.tasaAplicada ?? resumen?.tasaVigente,
        formatMonto
      )
    : null;

  return (
    <div className="space-y-6">
      <CabeceraCartera />

      {/* Sin conexión y sin datos: el error no es definitivo; la consulta se reintenta al reconectar */}
      {!tieneDatos && error && !isOnline ? (
        <AvisoDatosOffline variante="sin-datos" />
      ) : !tieneDatos && error ? (
        <EstadoError
          titulo="No pudimos cargar la cartera"
          mensaje={error}
          onReintentar={() => recargar()}
        />
      ) : (
        <>
          {/* Sin conexión con datos guardados: el aviso de frescura de la pantalla */}
          {tieneDatos && <AvisoDatosOffline />}

          {/* Recarga fallida con la tabla visible: aviso inline (sin alerta de recarga offline) */}
          {tieneDatos && error && isOnline && (
            <AvisoErrorRecarga
              mensaje="No se pudo actualizar la cartera. Los datos mostrados pueden estar desactualizados."
              onReintentar={() => recargar()}
            />
          )}

          {/* KPIs del RF-009 (cartera completa, no la página); esqueleto mientras llega el resumen */}
          {resumen ? <ResumenCartera resumen={resumen} /> : <EsqueletoKpisCartera />}

          <PestanasCartera pestana={pestana} resumen={resumen} onCambiar={cambiarPestana}>
            {/* Búsqueda server-side + estado de la página */}
            <BuscadorCartera
              busqueda={busqueda}
              onCambiarBusqueda={setBusqueda}
              isLoading={isLoading}
              visibles={items.length}
              total={total}
              etiquetaPestana={pestanaActiva.etiqueta}
              sinTasa={avisoSinTasa}
            />

            {isLoading ? (
              <EsqueletoFilasCartera />
            ) : (
              <div className="space-y-4">
                {total > 0 && (
                  <div className="px-1">
                    <Paginacion
                      pagina={pagina}
                      tamano={tamano}
                      total={total}
                      onCambiarPagina={setPagina}
                      onCambiarTamano={setTamano}
                      cargando={cargando}
                    />
                  </div>
                )}

                <TablaCartera
                  pestana={pestana}
                  filas={items}
                  buscando={q.trim().length > 0}
                  onRecordatorio={abrirRecordatorio}
                  onCobrar={abrirCobro}
                  onVerFicha={(fila) => {
                    if (fila.alumnoPerfilId) {
                      navigate(`/coach/alumnos/${fila.alumnoPerfilId}`);
                    }
                  }}
                  onRevisarPago={(fila) =>
                    navigate(`/coach/conciliacion?q=${encodeURIComponent(fila.alumnoNombre)}`)
                  }
                />
              </div>
            )}
          </PestanasCartera>
        </>
      )}

      {/* Modal de recordatorio manual (RN-02) */}
      {filaRecordatorio && (
        <ModalRecordatorioCartera
          fila={filaRecordatorio}
          resultado={resultadoRecordatorio}
          error={errorRecordatorio}
          enviando={enviandoRecordatorio}
          copiado={copiado}
          telefonoWhatsApp={telefonoWhatsApp}
          vistaPrevia={vistaPrevia}
          cargandoVistaPrevia={cargandoVistaPrevia}
          errorVistaPrevia={errorVistaPrevia}
          onReintentarVistaPrevia={reintentarVistaPrevia}
          saldoTexto={saldoTextoRecordatorio}
          dialogRef={refModalRecordatorio}
          onCerrar={cerrarModalRecordatorio}
          onEnviar={handleEnviarRecordatorio}
          onCopiar={copiarMensaje}
        />
      )}

      {/* Modal de cobro directo en efectivo (RN-01) */}
      {cobro && (
        <ModalCobroCartera
          cobro={cobro}
          error={errorCobro}
          exito={exitoCobro}
          enviando={enviandoCobro}
          sinPlan={cobroSinPlan}
          sinTasa={sinTasa}
          tasaVigente={resumen?.tasaVigente}
          resumen={resumenCobro}
          saldoTexto={saldoTexto}
          dialogRef={refModalCobro}
          onCerrar={cerrarModalCobro}
          onCambiarMonto={cambiarMonto}
          onCambiarMoneda={cambiarMoneda}
          onCambiarFecha={cambiarFecha}
          onRegistrar={handleRegistrarCobro}
        />
      )}
    </div>
  );
}
