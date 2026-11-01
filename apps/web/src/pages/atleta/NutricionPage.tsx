/**
 * Módulo 6 · Nutrición: contenedor orquestador (fase B, SL3).
 *
 * Lee los parámetros de sesión, compone las secciones y conecta los hooks. Sin JSX de
 * detalle (R1): todo el detalle vive en `components/atleta/nutricion/`. §6 y textos intactos.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { VisorFoto } from '../../components/common/VisorFoto';
import { ErrorCargaReporteHoy } from '../../components/nutricion/ErrorCargaReporteHoy';
import { SelectorSemaforo } from '../../components/nutricion/SelectorSemaforo';
import { useVentanaCheckin } from '../../components/atleta/nutricion/use-ventana-checkin';
import { useMetasNutricionales } from '../../components/atleta/nutricion/use-metas-nutricionales';
import { useHistorialNutricional } from '../../components/atleta/nutricion/use-historial-nutricional';
import { useReporteHoy, type ValoresFormularioReporte } from '../../components/atleta/nutricion/use-reporte-hoy';
import { useFotosPlatos } from '../../components/atleta/nutricion/use-fotos-platos';
import { useGuardarReporte } from '../../components/atleta/nutricion/use-guardar-reporte';
import { EncabezadoReporteNutricional } from '../../components/atleta/nutricion/EncabezadoReporteNutricional';
import { AvisoVentanaReporte } from '../../components/atleta/nutricion/AvisoVentanaReporte';
import { SeccionMetasNutricionales } from '../../components/atleta/nutricion/SeccionMetasNutricionales';
import { ToleranciaDelDia } from '../../components/atleta/nutricion/ToleranciaDelDia';
import { FormularioDatosReporte } from '../../components/atleta/nutricion/FormularioDatosReporte';
import { DiarioFotografico } from '../../components/atleta/nutricion/DiarioFotografico';
import { AccionesGuardarReporte } from '../../components/atleta/nutricion/AccionesGuardarReporte';
import { GaleriaFotosDelDia } from '../../components/atleta/nutricion/GaleriaFotosDelDia';
import { CalendarioUltimos7Dias } from '../../components/atleta/nutricion/CalendarioUltimos7Dias';
import {
  clasificarTolerancia,
  etiquetaTipoComida,
  evaluarToleranciaNutricionalLocal,
  resumenMetas,
  resumenTotalesReportados,
  crearCalendarioNutricional,
  contarNoReportados,
} from '../../lib/nutricion-metas';
import { formatFechaLargaCalendario, ultimosDiasCalendario } from '../../lib/date-format';
import { SemaforoNutricional } from '@guachafit/shared';

export function NutricionPage() {
  const { user, isDemoMode } = useAuth();

  const { ahora, zonaPerfil, ventana, hoyLocal, timezoneCliente, puedeReportar } =
    useVentanaCheckin(user?.zonaHoraria, isDemoMode);

  // Formulario: sin color preseleccionado y sin valores precargados (D6); si ya reportó hoy,
  // `rehidratar` restaura lo registrado (un 0 se muestra como 0, solo `null` queda vacío).
  const [semaforo, setSemaforo] = useState<SemaforoNutricional | null>(null);
  const [aguaLitros, setAguaLitros] = useState('');
  const [calorias, setCalorias] = useState('');
  const [proteina, setProteina] = useState('');
  const [notas, setNotas] = useState('');

  const rehidratar = useCallback((valores: ValoresFormularioReporte) => {
    setSemaforo(valores.semaforo);
    setAguaLitros(valores.aguaLitros);
    setCalorias(valores.calorias);
    setProteina(valores.proteina);
    setNotas(valores.notas);
  }, []);

  const reporte = useReporteHoy(hoyLocal, timezoneCliente, isDemoMode, user?.id, rehidratar);
  const {
    existingCheckin, reporteRegistradoHoy, reporteEncolado, confirmandoEnvio,
    formularioBloqueado, fotosEncoladas, errorCargaReporte, mostrarErrorCarga,
    avisoVisible, errorSemaforo, setErrorSemaforo, grupoSemaforoRef,
    bloqueo, setBloqueo, urlCheckinHoy, cargarReporteHoy,
  } = reporte;

  // RN-01: metas del coach para mostrar objetivos y evaluar la tolerancia del día.
  const { metas, isCargandoMetas, metasError, cargarMetas } = useMetasNutricionales(
    isDemoMode,
    user?.id,
    ahora
  );

  const { historial, cargarHistorial } = useHistorialNutricional(isDemoMode, user?.id, hoyLocal, ahora);
  // RN-03: fotos de platos y visor.
  const fotos = useFotosPlatos(user?.id);
  const {
    fotos: fotosPlatos, isProcesandoFotos, fotosError, fotoVisor,
    setFotoVisor, inputRef: inputFotosRef, agregarFotos, quitarFoto, cambiarTipoComida,
  } = fotos;

  // RF-002/RN-03: guardado (payload, demo, cola offline, subida y errores).
  const { isLoading, handleSaveCheckin } = useGuardarReporte(
    {
      semaforo,
      aguaLitros,
      calorias,
      proteina,
      notas,
      limpiarCampos: () => {
        setAguaLitros('');
        setCalorias('');
        setProteina('');
        setNotas('');
      },
    },
    reporte,
    fotos,
    {
      hoyLocal,
      timezoneCliente,
      ahora,
      isDemoMode,
      alumnoId: user?.id,
      puedeReportar,
      formularioBloqueado,
    }
  );

  useEffect(() => {
    void cargarReporteHoy();
  }, [cargarReporteHoy]);

  useEffect(() => {
    void cargarMetas();
  }, [cargarMetas]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  // RF-012: pantalla de bloqueo cuando el ciclo de vida impide enviar el reporte (pausado).
  if (bloqueo && !isDemoMode) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <BloqueoAlumnoPanel bloqueo={bloqueo} onReintentar={() => setBloqueo(null)} />
      </div>
    );
  }

  // Tolerancia del día: la del POST (o del reporte ya registrado) contra las metas reales.
  const toleranciaHoy = existingCheckin
    ? evaluarToleranciaNutricionalLocal(existingCheckin.caloriasReportadas, existingCheckin.proteinaGramosReportada, metas)
    : null;
  const clasificacionTolerancia = toleranciaHoy ? clasificarTolerancia(toleranciaHoy) : null;

  const objetivos = resumenMetas(metas);
  const totalesReportados = resumenTotalesReportados(existingCheckin);
  const calendarioSemana = crearCalendarioNutricional(ultimosDiasCalendario(hoyLocal, 7), historial, hoyLocal);
  const diasNoReportadosSemana = contarNoReportados(calendarioSemana);
  const formularioDeshabilitado = formularioBloqueado || !puedeReportar;

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12">
      {/* Header */}
      <EncabezadoReporteNutricional />

      {/* Fallo al consultar el reporte de hoy (no "aún no hay reporte"), con reintento. */}
      {mostrarErrorCarga && errorCargaReporte && (
        <ErrorCargaReporteHoy
          mensaje={errorCargaReporte.mensaje}
          onReintentar={() => void cargarReporteHoy()}
        />
      )}

      {/* U4: estado honesto sin conexión. Con copia cacheada del check-in de hoy se avisa que
          es un dato guardado; sin ella, se declara el vacío en vez de simular normalidad. */}
      {!isDemoMode && existingCheckin && <AvisoDatosOffline url={urlCheckinHoy} />}
      {!isDemoMode && !existingCheckin && !reporteEncolado && !confirmandoEnvio && (
        <AvisoDatosOffline url={urlCheckinHoy} variante="sin-datos" />
      )}

      {/* RN-02: la ventana 18:00–23:59 se declara ANTES del formulario. */}
      {!isDemoMode && !ventana.permitido && <AvisoVentanaReporte zonaPerfil={zonaPerfil} />}

      {/* RN-01: metas del coach visibles para el alumno */}
      <SeccionMetasNutricionales
        isCargandoMetas={isCargandoMetas}
        metasError={metasError}
        metas={metas}
        objetivos={objetivos}
        onReintentarMetas={() => void cargarMetas()}
        tolerancia={
          existingCheckin && clasificacionTolerancia && toleranciaHoy ? (
            <ToleranciaDelDia
              checkin={existingCheckin}
              tolerancia={toleranciaHoy}
              clasificacion={clasificacionTolerancia}
              metas={metas}
            />
          ) : null
        }
      />

      {/* Semáforo del día: grupo con nombre; cada opción anuncia si está elegida. */}
      <SelectorSemaforo
        valor={semaforo}
        onCambiar={(valor) => {
          setSemaforo(valor);
          setErrorSemaforo(null);
        }}
        deshabilitado={formularioDeshabilitado}
        error={errorSemaforo}
        nota={
          reporteRegistradoHoy
            ? 'Tu reporte de hoy ya quedó registrado. Solo lectura; podrás registrar el próximo mañana.'
            : null
        }
        refGrupo={grupoSemaforoRef}
      />

      {/* Datos opcionales */}
      <FormularioDatosReporte
        aguaLitros={aguaLitros}
        calorias={calorias}
        proteina={proteina}
        notas={notas}
        deshabilitado={formularioDeshabilitado}
        onCambiarAgua={setAguaLitros}
        onCambiarCalorias={setCalorias}
        onCambiarProteina={setProteina}
        onCambiarNotas={setNotas}
      />

      {/* RN-03: diario fotográfico */}
      <DiarioFotografico
        fotos={fotosPlatos}
        isProcesandoFotos={isProcesandoFotos}
        fotosError={fotosError}
        formularioBloqueado={formularioBloqueado}
        inputRef={inputFotosRef}
        onElegirArchivos={(archivos) => void agregarFotos(archivos)}
        onQuitarFoto={quitarFoto}
        onCambiarTipoComida={cambiarTipoComida}
      />

      {/* Submit + avisos */}
      <AccionesGuardarReporte
        isLoading={isLoading}
        conFotos={fotosPlatos.length > 0}
        reporteRegistradoHoy={reporteRegistradoHoy}
        reporteEncolado={reporteEncolado}
        confirmandoEnvio={confirmandoEnvio}
        fotosEncoladas={fotosEncoladas}
        puedeReportar={puedeReportar} zonaPerfil={zonaPerfil}
        deshabilitado={formularioDeshabilitado}
        fechaRegistradaTexto={formatFechaLargaCalendario(existingCheckin?.fecha ?? hoyLocal) ?? hoyLocal}
        aviso={avisoVisible}
        isDemoMode={isDemoMode}
        onGuardar={() => void handleSaveCheckin()}
      />

      {/* Galería del día (RN-03): visible una vez registrado el reporte */}
      {existingCheckin && existingCheckin.fotosPlatos.length > 0 && (
        <GaleriaFotosDelDia
          checkin={existingCheckin}
          totales={totalesReportados}
          onAbrirFoto={(foto, fecha) => setFotoVisor({ foto, fecha })}
        />
      )}

      {/* §6: últimos 7 días, con los días cerrados sin reporte marcados como No reportado */}
      {calendarioSemana.length > 0 && (
        <CalendarioUltimos7Dias
          calendario={calendarioSemana}
          diasNoReportados={diasNoReportadosSemana}
          hoyLocal={hoyLocal}
          pendienteHoy={reporteEncolado || confirmandoEnvio}
        />
      )}

      {/* Visor accesible de las fotos del día */}
      {fotoVisor && (
        <VisorFoto
          foto={fotoVisor.foto}
          fecha={fotoVisor.fecha}
          etiqueta={etiquetaTipoComida(fotoVisor.foto.tipoComida)}
          onCerrar={() => setFotoVisor(null)}
        />
      )}
    </div>
  );
}
