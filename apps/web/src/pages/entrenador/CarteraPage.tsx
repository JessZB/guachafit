import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartera } from '../../components/entrenador/cartera/useCartera';
import { useRecordatorioCartera } from '../../components/entrenador/cartera/useRecordatorioCartera';
import { useCobroCartera } from '../../components/entrenador/cartera/useCobroCartera';
import { CabeceraCartera } from '../../components/entrenador/cartera/CabeceraCartera';
import { ResumenCartera } from '../../components/entrenador/cartera/ResumenCartera';
import { PestanasCartera } from '../../components/entrenador/cartera/PestanasCartera';
import { BuscadorCartera } from '../../components/entrenador/cartera/BuscadorCartera';
import { ModalRecordatorioCartera } from '../../components/entrenador/cartera/ModalRecordatorioCartera';
import { ModalCobroCartera } from '../../components/entrenador/cartera/ModalCobroCartera';
import { Paginacion } from '../../components/common/Paginacion';
import { TablaCartera } from '../../components/entrenador/TablaCartera';
import { PESTANAS_CARTERA, hayTasaProyectable } from '../../lib/cartera';
import { AlertCircle } from 'lucide-react';

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
    setCobradosDemo,
    recordatoriosDemo,
    setRecordatoriosDemo,
  } = useCartera();
  const navigate = useNavigate();

  // Recordatorio manual (RN-02)
  const {
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
  } = useRecordatorioCartera({
    isDemoMode,
    recordatoriosDemo,
    setRecordatoriosDemo,
    recargar,
  });

  // Cobro directo en efectivo (RN-01)
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
  } = useCobroCartera({ isDemoMode, setCobradosDemo, recargar });

  // U3b: el estado de las pestañas vive en la URL (`?pestana=`).
  const pestanaActiva = PESTANAS_CARTERA.find((p) => p.clave === pestana)!;

  const sinTasa = !hayTasaProyectable(resumen);

  return (
    <div className="space-y-6">
      <CabeceraCartera />

      {/* KPIs del RF-009 (cartera completa, no la página) */}
      {resumen && <ResumenCartera resumen={resumen} />}

      {/* Error honesto con reintento */}
      {!isLoading && error && (
        <div className="p-8 rounded-3xl bg-card border border-destructive/30 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => recargar()}
            className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {!error && (
        <PestanasCartera pestana={pestana} resumen={resumen} onCambiar={cambiarPestana}>
          {/* Búsqueda server-side + estado de la página */}
          <BuscadorCartera
            busqueda={busqueda}
            onCambiarBusqueda={setBusqueda}
            isLoading={isLoading}
            visibles={items.length}
            total={total}
            etiquetaPestana={pestanaActiva.etiqueta}
            sinTasa={sinTasa}
          />

          {isLoading ? (
            <div className="p-10 rounded-3xl bg-card border border-border text-center space-y-3">
              <div className="animate-pulse space-y-3">
                <div className="h-4 w-40 bg-secondary rounded mx-auto" />
                <div className="h-3 w-64 bg-secondary/70 rounded mx-auto" />
              </div>
              <p className="text-xs text-muted-foreground">Cargando cartera de alumnos...</p>
            </div>
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
                onRevisarPago={() => navigate('/coach/conciliacion')}
              />
            </div>
          )}
        </PestanasCartera>
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
