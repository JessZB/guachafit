/**
 * RF-018 · Ajustes del entrenador: pestaña «Tasa» (UX-19).
 *
 * Contenedor: recibe el resultado de `useTasasCambio` (el estado vive en la página para que los
 * borradores sobrevivan al cambio de pestaña), formatea los números con `useFormatoNumero` y
 * reparte props a los componentes presentacionales. Estados: cargando, error de carga con
 * reintento, y la tasa con su resumen, el editor plegable y la calculadora.
 */
import { aTextoEntrada, etiquetaFuenteTasa, tasaGuardadaDe } from '../../../lib/ajustes-entrenador-tasas';
import { useFormatoNumero } from '../../../lib/use-formato-numero';
import { TarjetaAjustes } from '../../ajustes/CampoAjustes';
import { EstadoCarga } from '../../ui/EstadoCarga';
import { EstadoError } from '../../ui/EstadoError';
import { ConversorTasas } from './ConversorTasas';
import { FormularioTasa } from './FormularioTasa';
import { AvisoSinTasa, ResumenTasa } from './ResumenTasa';
import type { ResultadoTasasCambio } from './use-tasas-cambio';

/** Decimales con los que se muestra la tasa: los guardados, entre 2 y 4. */
function decimalesDeTasa(textoEditable: string): number {
  const decimales = textoEditable.split(/[.,]/)[1]?.length ?? 2;
  return Math.min(4, Math.max(2, decimales));
}

export function PestanaTasa({ tasas }: { tasas: ResultadoTasasCambio }) {
  const { formato, formatDecimal } = useFormatoNumero();
  const { tasaVigente } = tasas;
  const tasaGuardada = tasaGuardadaDe(tasaVigente);
  const tasaTexto = tasaGuardada
    ? formatDecimal(tasaGuardada, { decimales: decimalesDeTasa(aTextoEntrada(tasaGuardada, formato)) })
    : '';

  return (
    <TarjetaAjustes titulo="Tasa de cambio" descripcion="La tasa con la que cobras en bolívares.">
      {tasas.isLoadingTasas ? (
        <EstadoCarga texto="Cargando tasa…" claseContenedor="min-h-[120px]" />
      ) : tasas.tasasError ? (
        <EstadoError
          titulo="No pudimos cargar la tasa"
          mensaje={tasas.tasasError}
          onReintentar={() => void tasas.cargarTasas()}
        />
      ) : (
        <>
          {tasaGuardada ? (
            <ResumenTasa
              tasaTexto={tasaTexto}
              fuenteEtiqueta={etiquetaFuenteTasa(tasaVigente?.fuente)}
            />
          ) : (
            <AvisoSinTasa />
          )}

          <FormularioTasa
            hayTasaGuardada={Boolean(tasaGuardada)}
            hayCambios={tasas.hayCambios}
            fuenteSeleccionada={tasas.fuenteSeleccionada}
            tasaOficialBcvInput={tasas.tasaOficialBcvInput}
            tasaParaleloInput={tasas.tasaParaleloInput}
            tasaActivaInput={tasas.tasaActivaInput}
            errores={tasas.erroresCampos}
            errorGuardado={tasas.errorGuardado}
            tasaSuccessMsg={tasas.tasaSuccessMsg}
            isSavingTasa={tasas.isSavingTasa}
            onSeleccionarFuente={tasas.seleccionarFuente}
            onCambiarOficial={tasas.cambiarTasaOficial}
            onCambiarParalelo={tasas.cambiarTasaParalelo}
            onCambiarActiva={tasas.cambiarTasaActiva}
            onGuardar={() => void tasas.guardarTasa()}
          />

          {tasaGuardada && (
            <ConversorTasas
              tasaTexto={tasaTexto}
              calculadoraUsd={tasas.calculadoraUsd}
              calculadoraVes={tasas.calculadoraVes}
              onCambiarUsd={tasas.cambiarMontoUsd}
              onCambiarVes={tasas.cambiarMontoVes}
            />
          )}
        </>
      )}
    </TarjetaAjustes>
  );
}
