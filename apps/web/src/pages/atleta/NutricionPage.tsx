import React, { useState, useEffect, useCallback, useMemo, useReducer, useRef } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiClient, resolverUrlApi } from '../../lib/api-client';
import { resolverBloqueoAlumno, type BloqueoAlumno } from '../../lib/acceso-alumno';
import {
  queueOfflineMutation,
  queueCheckinNutricionalConFotos,
  subscribeToOutboxChanges,
  MAX_FOTOS_CHECKIN_NUTRICIONAL,
  type FotoCheckinEnCola,
} from '../../lib/offline-db';
import { BloqueoAlumnoPanel } from '../../components/common/BloqueoAlumnoPanel';
import { AvisoDatosOffline } from '../../components/common/AvisoDatosOffline';
import { VisorFoto } from '../../components/common/VisorFoto';
import { MiniaturaFotoPlato } from '../../components/common/MiniaturaFotoPlato';
import {
  AvisosReporteNutricional,
  type AvisoReporte,
} from '../../components/nutricion/AvisosReporteNutricional';
import { ErrorCargaReporteHoy } from '../../components/nutricion/ErrorCargaReporteHoy';
import { SelectorSemaforo } from '../../components/nutricion/SelectorSemaforo';
import {
  buscarCheckinNutricionalPendiente,
  clasificarErrorCargaReporteHoy,
  construirPayloadCheckinNutricional,
  debeMostrarErrorCargaReporte,
  siguienteEstadoReporte,
  ESTADO_REPORTE_INICIAL,
  type ErrorCargaReporte,
  decidirAccionErrorCheckinNutricional,
  evaluarVentanaCheckinLocal,
  obtenerStatusError,
  valoresFormularioDesdeCheckin,
  MENSAJE_ANTES_DE_VENTANA,
  MENSAJE_ELIGE_SEMAFORO,
  MENSAJE_ERROR_SUBIDA_FOTO,
  MENSAJE_FOTOS_MAXIMO_ALCANZADO,
  MENSAJE_FOTOS_RECORTADAS,
} from '../../lib/nutricion-checkin';
import { comprimirImagenAWebp } from '../../lib/imagen-comprimida';
import {
  clasificarTolerancia,
  etiquetaEstadoDia,
  etiquetaTipoComida,
  evaluarToleranciaNutricionalLocal,
  formatearDesviacionPct,
  metasConfiguradas,
  resumenMetas,
  resumenTotalesReportados,
  crearCalendarioNutricional,
  contarNoReportados,
} from '../../lib/nutricion-metas';
import { checkinsNutricionalesDemo, crearMetasNutricionalesDemo } from '../../lib/demo-nutricion';
import {
  fechaCalendarioLocal,
  formatFechaLargaCalendario,
  obtenerTimezoneDispositivo,
  sumarDiasCalendario,
  ultimosDiasCalendario,
} from '../../lib/date-format';
import {
  SemaforoNutricional,
  TipoComida,
  type CheckinNutricionalDetalleDTO,
  type FotoComidaDetalleDTO,
  type FotoComidaInputDTO,
  type MetasNutricionalesDetalleDTO,
  type PresignedUploadUrlResponseDTO,
  type ToleranciaNutricionalDTO,
} from '@guachafit/shared';
import {
  Utensils,
  Droplets,
  Camera,
  Check,
  Flame,
  Clock,
  Target,
  ImagePlus,
  Trash2,
  ExternalLink,
  Loader2,
  Gauge,
  AlertTriangle,
} from 'lucide-react';

/** Respuesta real del POST: el check-in hidratado + la tolerancia contra las metas del coach. */
interface RespuestaCheckinNutricional extends ToleranciaNutricionalDTO {
  checkin: CheckinNutricionalDetalleDTO;
}

/** Foto de plato elegida en el dispositivo, ya comprimida y con su vista previa local. */
interface FotoPlatoSeleccionada {
  id: string;
  tipoComida: TipoComida;
  archivo: File;
  previewUrl: string;
}

/** Formatos aceptados por el contrato de presign (`image/webp` | `image/jpeg`). */
const MIME_PERMITIDO_PRESIGN = ['image/webp', 'image/jpeg'];

/** Recorta el peso de una foto para UI: '842 KB' | '1.2 MB'. */
function formatearPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NutricionPage() {
  const { user, isDemoMode } = useAuth();

  // Reloj del dispositivo: la ventana RN-02 y el día local se reevalúan cada minuto para que un
  // cambio de hora no deje el formulario en un estado mentiroso.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const intervalo = window.setInterval(() => setAhora(new Date()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);

  const hoyLocal = fechaCalendarioLocal(ahora);
  const timezoneCliente = useMemo(() => obtenerTimezoneDispositivo(), []);
  const ventana = evaluarVentanaCheckinLocal(ahora);
  // En modo demo la simulación no se bloquea por horario (el banner demo declara el contexto);
  // en sesión real, fuera de ventana no se envía ni se encola nada.
  const puedeReportar = isDemoMode || ventana.permitido;

  // Sin color preseleccionado: el alumno elige cómo le fue (si ya reportó hoy, se rehidrata).
  const [semaforo, setSemaforo] = useState<SemaforoNutricional | null>(null);
  // D6: sin valores de fixture precargados en sesión real; el placeholder guía, no el dato.
  const [aguaLitros, setAguaLitros] = useState('');
  const [calorias, setCalorias] = useState('');
  const [proteina, setProteina] = useState('');
  const [notas, setNotas] = useState('');
  // Estado del reporte de hoy (RF-002 §6): transición pura en `siguienteEstadoReporte`.
  const [reporte, despacharReporte] = useReducer(siguienteEstadoReporte, ESTADO_REPORTE_INICIAL);
  const estadoReporte = reporte.estado;
  const fotosEncoladas = reporte.fotosEncoladas;
  const [avisoReporte, setAvisoReporte] = useState<AvisoReporte | null>(null);
  // Se intentó guardar sin elegir color: el error se muestra junto al semáforo, que recibe el foco.
  const [errorSemaforo, setErrorSemaforo] = useState<string | null>(null);
  const grupoSemaforoRef = useRef<HTMLFieldSetElement | null>(null);
  // Fallo al consultar el reporte de hoy que NO es "aún no hay reporte": se muestra con reintento.
  const [errorCargaReporte, setErrorCargaReporte] = useState<ErrorCargaReporte | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [existingCheckin, setExistingCheckin] = useState<CheckinNutricionalDetalleDTO | null>(null);
  // RF-012: alumno pausado no puede enviar reportes; la pantalla informativa reemplaza al formulario.
  const [bloqueo, setBloqueo] = useState<BloqueoAlumno | null>(null);

  // RN-01: metas del coach para mostrar objetivos y evaluar la tolerancia del día.
  const [metas, setMetas] = useState<MetasNutricionalesDetalleDTO | null>(null);
  const [isCargandoMetas, setIsCargandoMetas] = useState(false);
  const [metasError, setMetasError] = useState<string | null>(null);

  // RN-03: fotos de platos elegidas (comprimidas en cliente) y estado de su subida presignada.
  const [fotosPlatos, setFotosPlatos] = useState<FotoPlatoSeleccionada[]>([]);
  const [isProcesandoFotos, setIsProcesandoFotos] = useState(false);
  const [fotosError, setFotosError] = useState<string | null>(null);
  const [fotoVisor, setFotoVisor] = useState<{ foto: FotoComidaDetalleDTO; fecha: string } | null>(
    null
  );

  // §6: últimos días para reflejar el estado derivado `No reportado` en la propia vista del alumno.
  const [historial, setHistorial] = useState<CheckinNutricionalDetalleDTO[]>([]);

  const inputFotosRef = useRef<HTMLInputElement | null>(null);
  const fotosRef = useRef<FotoPlatoSeleccionada[]>([]);
  fotosRef.current = fotosPlatos;

  // Las vistas previas son object URLs: se liberan al desmontar la pantalla.
  useEffect(() => {
    return () => {
      fotosRef.current.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
    };
  }, []);

  const urlCheckinHoy = useMemo(
    () =>
      resolverUrlApi(
        `/nutricion/checkin/hoy?fecha=${hoyLocal}&timezoneCliente=${encodeURIComponent(
          timezoneCliente
        )}`
      ),
    [hoyLocal, timezoneCliente]
  );

  const reporteRegistradoHoy = Boolean(existingCheckin) || estadoReporte === 'saved';
  const reporteEncolado = estadoReporte === 'queued' && !reporteRegistradoHoy;
  const confirmandoEnvio = estadoReporte === 'confirmando' && !reporteRegistradoHoy;
  const formularioBloqueado = reporteRegistradoHoy || reporteEncolado || confirmandoEnvio;

  const cargarReporteHoy = useCallback(async () => {
    try {
      // U4: sin conexión no se corta la carga — el SW (NetworkFirst `api-cache`) puede servir
      // el último check-in guardado; el chip de frescura dirá de cuándo es.
      const data = await apiClient<CheckinNutricionalDetalleDTO | null>(
        `/nutricion/checkin/hoy?fecha=${hoyLocal}&timezoneCliente=${encodeURIComponent(timezoneCliente)}`
      );
      setErrorCargaReporte(null);
      if (!data) {
        despacharReporte({ tipo: 'carga', resultado: 'sin-reporte' });
        return;
      }
      // Rehidratación fiel: un 0 reportado se muestra como 0 (solo `null` queda vacío).
      const valores = valoresFormularioDesdeCheckin(data);
      setExistingCheckin(data);
      setSemaforo(valores.semaforo);
      setAguaLitros(valores.aguaLitros);
      setCalorias(valores.calorias);
      setProteina(valores.proteina);
      setNotas(valores.notas);
      despacharReporte({ tipo: 'carga', resultado: 'encontrado' });
    } catch (err) {
      // 404 = todavía no hay reporte; cualquier otro fallo se guarda y la pantalla decide si
      // mostrarlo (`debeMostrarErrorCargaReporte`).
      const error = clasificarErrorCargaReporteHoy(err, navigator.onLine);
      setErrorCargaReporte(error);
      despacharReporte({ tipo: 'carga', resultado: error ? 'error' : 'sin-reporte' });
    }
  }, [hoyLocal, timezoneCliente]);

  /**
   * RF-002 §6: el reporte encolado vive en la cola durable, no en memoria. Se lee al montar, cada
   * vez que la cola cambia y justo después de encolar (por si la cola ya lo envió antes).
   */
  const sincronizarPendienteHoy = useCallback(async () => {
    if (isDemoMode) return;
    const resultado = await buscarCheckinNutricionalPendiente(hoyLocal, user?.id);
    despacharReporte({ tipo: 'cola', resultado });
  }, [isDemoMode, hoyLocal, user?.id]);

  useEffect(() => {
    void sincronizarPendienteHoy();
    return subscribeToOutboxChanges(() => void sincronizarPendienteHoy());
  }, [sincronizarPendienteHoy]);

  // El pendiente salió de la cola: el formulario sigue bloqueado hasta saber si quedó registrado.
  useEffect(() => {
    if (estadoReporte === 'confirmando') void cargarReporteHoy();
  }, [estadoReporte, cargarReporteHoy]);

  const cargarMetas = useCallback(async () => {
    // Modo demo explícito: metas de ejemplo solo con la bandera activa.
    if (isDemoMode) {
      setMetas(crearMetasNutricionalesDemo(user?.id || 'demo-alumno', ahora));
      setMetasError(null);
      return;
    }
    setIsCargandoMetas(true);
    setMetasError(null);
    try {
      // 204 (sin metas) llega como null: estado honesto "sin metas configuradas".
      const data = await apiClient<MetasNutricionalesDetalleDTO | null>('/nutricion/metas');
      setMetas(data ?? null);
    } catch (err: any) {
      setMetas(null);
      setMetasError(
        err?.message || 'No se pudieron cargar tus metas. Revisa tu conexión e inténtalo de nuevo.'
      );
    } finally {
      setIsCargandoMetas(false);
    }
  }, [isDemoMode, user?.id, ahora]);

  const cargarHistorial = useCallback(async () => {
    if (!user?.id) return;
    const desde = sumarDiasCalendario(hoyLocal, -6);
    if (isDemoMode) {
      setHistorial(checkinsNutricionalesDemo(user.id, ahora));
      return;
    }
    try {
      const data = await apiClient<CheckinNutricionalDetalleDTO[]>(
        `/nutricion/alumnos/${user.id}/checkins?desde=${desde}&hasta=${hoyLocal}`
      );
      setHistorial(Array.isArray(data) ? data : []);
    } catch {
      // El historial es contexto, no el reporte: un fallo deja la tira vacía sin ruido
      // (el reporte de hoy, que es el dato crítico, tiene su propio aviso honesto).
      setHistorial([]);
    }
  }, [isDemoMode, user?.id, hoyLocal, ahora]);

  useEffect(() => {
    void cargarReporteHoy();
  }, [cargarReporteHoy]);

  useEffect(() => {
    void cargarMetas();
  }, [cargarMetas]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  // Tolerancia del día: la del POST (o del reporte ya registrado) contra las metas reales.
  const toleranciaHoy: ToleranciaNutricionalDTO | null = existingCheckin
    ? evaluarToleranciaNutricionalLocal(
        existingCheckin.caloriasReportadas,
        existingCheckin.proteinaGramosReportada,
        metas
      )
    : null;
  const clasificacionTolerancia = toleranciaHoy ? clasificarTolerancia(toleranciaHoy) : null;

  const agregarFotos = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return;
    setFotosError(null);

    const espacioDisponible = MAX_FOTOS_CHECKIN_NUTRICIONAL - fotosPlatos.length;
    if (espacioDisponible <= 0) {
      setFotosError(MENSAJE_FOTOS_MAXIMO_ALCANZADO);
      return;
    }

    const seleccionados = Array.from(archivos).slice(0, espacioDisponible);
    if (archivos.length > espacioDisponible) {
      setFotosError(MENSAJE_FOTOS_RECORTADAS);
    }

    setIsProcesandoFotos(true);
    try {
      const nuevas: FotoPlatoSeleccionada[] = [];
      for (const archivo of seleccionados) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
          throw new Error('Formato inválido: elige una foto JPG, PNG o WebP.');
        }
        // RN-03/RNF-001: la compresión ocurre en el dispositivo ANTES de pedir la presigned URL.
        const comprimida = await comprimirImagenAWebp(archivo);
        if (!MIME_PERMITIDO_PRESIGN.includes(comprimida.type)) {
          throw new Error(
            'No pudimos optimizar esta foto en tu navegador. Prueba con una imagen JPG o WebP.'
          );
        }
        nuevas.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tipoComida: TipoComida.ALMUERZO,
          archivo: comprimida,
          previewUrl: URL.createObjectURL(comprimida),
        });
      }
      setFotosPlatos((previas) => [...previas, ...nuevas]);
    } catch (err: any) {
      setFotosError(err?.message || 'No se pudieron procesar las fotos seleccionadas.');
    } finally {
      setIsProcesandoFotos(false);
      if (inputFotosRef.current) inputFotosRef.current.value = '';
    }
  };

  const quitarFoto = (id: string) => {
    setFotosError(null);
    setFotosPlatos((previas) => {
      const foto = previas.find((item) => item.id === id);
      if (foto) URL.revokeObjectURL(foto.previewUrl);
      return previas.filter((item) => item.id !== id);
    });
  };

  /**
   * Sube cada foto comprimida a la bóveda y devuelve el mapa foto→storageKey. `claves` se
   * actualiza tras CADA subida: si una foto posterior falla por red, el progreso ya conseguido
   * viaja a la cola (el reintento no vuelve a subir esas fotos).
   */
  const subirFotosDePlatos = async (
    fotos: FotoPlatoSeleccionada[],
    claves: Map<string, string> = new Map()
  ): Promise<Map<string, string>> => {
    if (!user?.id) {
      throw new Error('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
    }
    for (const foto of fotos) {
      const presigned = await apiClient<PresignedUploadUrlResponseDTO>(
        '/antropometria/presigned-upload-url',
        {
          method: 'POST',
          body: JSON.stringify({
            modulo: 'comidas',
            alumnoId: user.id,
            mimeType: foto.archivo.type,
          }),
        }
      );
      const respuesta = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': foto.archivo.type },
        body: foto.archivo,
      });
      if (!respuesta.ok) {
        // Sin `status` HTTP: offline-sync lo trata como fallo de red y la evidencia se encola.
        throw new Error(MENSAJE_ERROR_SUBIDA_FOTO);
      }
      claves.set(foto.id, presigned.storageKey);
    }
    return claves;
  };

  /** Galería local del día en modo demo: las vistas previas elegidas son la evidencia visible. */
  const construirCheckinDemo = (
    semaforoElegido: SemaforoNutricional
  ): CheckinNutricionalDetalleDTO => {
    const fotos: FotoComidaDetalleDTO[] = fotosPlatos.map((foto, indice) => ({
      id: `demo-foto-hoy-${indice}`,
      checkinId: 'demo-checkin-hoy',
      tipoComida: foto.tipoComida,
      storageKey: `comidas/demo/${hoyLocal}/demo-${indice}.webp`,
      fotoUrl: foto.previewUrl,
      createdAtUtc: ahora.toISOString(),
    }));
    return {
      id: 'demo-checkin-hoy',
      alumnoId: user?.id || 'demo-alumno',
      fecha: hoyLocal,
      semaforo: semaforoElegido,
      caloriasReportadas: calorias ? Number(calorias) : null,
      proteinaGramosReportada: proteina ? Number(proteina) : null,
      aguaLitros: aguaLitros || null,
      notasAlumno: notas || null,
      fotosPlatos: fotos,
      createdAtUtc: ahora.toISOString(),
      updatedAtUtc: ahora.toISOString(),
    };
  };

  const handleSaveCheckin = async () => {
    // Defensivo: los controles ya están deshabilitados en estos estados.
    if (formularioBloqueado || !puedeReportar) return;
    if (!semaforo) {
      setErrorSemaforo(MENSAJE_ELIGE_SEMAFORO);
      grupoSemaforoRef.current?.focus();
      return;
    }

    setIsLoading(true);
    setAvisoReporte(null);
    setFotosError(null);

    // Validación de contrato ANTES de cualquier llamada: nada inválido viaja a la API ni a la cola.
    let payload;
    try {
      payload = construirPayloadCheckinNutricional(
        {
          semaforo,
          fecha: hoyLocal,
          timezoneCliente,
          aguaLitros,
          calorias,
          proteina,
          notas,
        },
        ahora
      );
    } catch (err: any) {
      setIsLoading(false);
      despacharReporte({ tipo: 'rechazado' });
      setAvisoReporte({ tono: 'error', texto: err?.message || 'Revisa los datos del reporte.' });
      return;
    }

    // MODO DEMO EXPLÍCITO (isDemoMode): éxito local simulado con la bandera demo visible, sin
    // llamar a la API real (el token demo es simbólico). La tolerancia del día se calcula contra
    // las metas demo con el mismo evaluador que usa el servidor.
    if (isDemoMode) {
      setExistingCheckin(construirCheckinDemo(semaforo));
      despacharReporte({ tipo: 'guardado' });
      setIsLoading(false);
      return;
    }

    // RF-002 §6/RN-03: la evidencia con fotos NUNCA se pierde. Si no hay red (o la subida falla
    // por red/5xx), el reporte completo —datos + blobs comprimidos— entra a la cola durable y se
    // sincroniza solo: primero las fotos (presign + PUT) y después el check-in con sus claves.
    const clavesSubidas = new Map<string, string>();

    const construirFotosEnCola = (): FotoCheckinEnCola[] =>
      fotosPlatos.map((foto) => ({
        tipoComida: foto.tipoComida,
        nombre: foto.archivo.name,
        contentType: foto.archivo.type,
        blob: foto.archivo,
        storageKey: clavesSubidas.get(foto.id) ?? null,
      }));

    /** La evidencia ya está a salvo en la cola: se limpia el formulario y su memoria de previews. */
    const limpiarFormularioEncolado = () => {
      fotosRef.current.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
      setFotosPlatos([]);
      setFotosError(null);
      setAguaLitros('');
      setCalorias('');
      setProteina('');
      setNotas('');
    };

    const encolar = async () => {
      if (fotosPlatos.length > 0) {
        if (!user?.id) {
          throw new Error('No se pudo identificar tu sesión. Vuelve a iniciar sesión e inténtalo de nuevo.');
        }
        await queueCheckinNutricionalConFotos(payload, construirFotosEnCola(), user.id);
        limpiarFormularioEncolado();
      } else {
        await queueOfflineMutation(
          '/nutricion/checkin-diario',
          'POST',
          payload,
          'Reporte nutricional del día',
          undefined,
          { alumnoId: user?.id }
        );
      }
      despacharReporte({ tipo: 'encolado', fotos: fotosPlatos.length });
      // Carrera: si la cola ya lo envió antes de este punto, la relectura lo deja en confirmación.
      void sincronizarPendienteHoy();
    };

    // Sin conexión: el reporte (con o sin fotos) va directo a la cola; nada toca la red.
    if (!navigator.onLine) {
      try {
        await encolar();
      } catch (err: any) {
        despacharReporte({ tipo: 'rechazado' });
        setAvisoReporte({
          tono: 'error',
          texto:
            err?.message ||
            'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // RN-03: con conexión, las fotos se suben ANTES del check-in.
    if (fotosPlatos.length > 0) {
      try {
        await subirFotosDePlatos(fotosPlatos, clavesSubidas);
      } catch (err: any) {
        const status = obtenerStatusError(err);
        if (status >= 400 && status < 500) {
          // Rechazo de contrato del presign: reintentar no ayuda y encolar sería mentir.
          setIsLoading(false);
          setFotosError(err?.message || 'No se pudieron subir las fotos. Inténtalo de nuevo.');
          return;
        }
        // Fallo de red/5xx: la evidencia (con el progreso ya subido) se encola para reintento.
        try {
          await encolar();
        } catch {
          despacharReporte({ tipo: 'rechazado' });
          setAvisoReporte({
            tono: 'error',
            texto: 'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
          });
        } finally {
          setIsLoading(false);
        }
        return;
      }
    }

    const fotosPlatosSubidas: FotoComidaInputDTO[] = fotosPlatos
      .map((foto) => {
        const storageKey = clavesSubidas.get(foto.id);
        return storageKey ? { tipoComida: foto.tipoComida, storageKey } : null;
      })
      .filter((foto): foto is FotoComidaInputDTO => foto !== null);

    const payloadConFotos =
      fotosPlatosSubidas.length > 0 ? { ...payload, fotosPlatos: fotosPlatosSubidas } : payload;

    try {
      // 2xx es el ÚNICO resultado que cuenta como éxito (RF-002: sin éxito fabricado).
      await apiClient<RespuestaCheckinNutricional>('/nutricion/checkin-diario', {
        method: 'POST',
        body: JSON.stringify(payloadConFotos),
      });
      await cargarReporteHoy();
      despacharReporte({ tipo: 'guardado' });
    } catch (err) {
      // RF-012: el bloqueo de ciclo de vida tiene su propia pantalla (no es un error de datos).
      const bloqueoDetectado = resolverBloqueoAlumno(err);
      if (bloqueoDetectado) {
        setBloqueo(bloqueoDetectado);
        return;
      }
      const decision = decidirAccionErrorCheckinNutricional(err, true);
      if (decision.accion === 'encolar') {
        // Fallo de red/5xx: la cola offline reintenta; nunca se declara "registrado".
        try {
          await encolar();
        } catch {
          despacharReporte({ tipo: 'rechazado' });
          setAvisoReporte({
            tono: 'error',
            texto: 'No se pudo guardar el reporte en el dispositivo. Inténtalo de nuevo.',
          });
        }
      } else if (decision.accion === 'refrescar') {
        // 409: el reporte de hoy ya existía; se refleja el estado real del servidor.
        await cargarReporteHoy();
        setAvisoReporte({ tono: 'info', texto: decision.mensaje });
      } else {
        despacharReporte({ tipo: 'rechazado' });
        setAvisoReporte({ tono: 'error', texto: decision.mensaje });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // RF-012: pantalla de bloqueo cuando el ciclo de vida impide enviar el reporte (pausado).
  if (bloqueo && !isDemoMode) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <BloqueoAlumnoPanel bloqueo={bloqueo} onReintentar={() => setBloqueo(null)} />
      </div>
    );
  }

  const objetivos = resumenMetas(metas);
  const totalesReportados = resumenTotalesReportados(existingCheckin);
  const calendarioSemana = crearCalendarioNutricional(
    ultimosDiasCalendario(hoyLocal, 7),
    historial,
    hoyLocal
  );
  const diasNoReportadosSemana = contarNoReportados(calendarioSemana);
  const formularioDeshabilitado = formularioBloqueado || !puedeReportar;
  const mostrarErrorCarga = !isDemoMode && debeMostrarErrorCargaReporte(estadoReporte, errorCargaReporte);
  // Aviso del guardado (rechazo, 409…) o, si no hay, el que dejó la máquina de estados.
  const avisoVisible: AvisoReporte | null =
    avisoReporte ?? (reporte.aviso ? { tono: 'info', texto: reporte.aviso } : null);

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-24 lg:pb-12">
      {/* Header */}
      <div className="p-6 rounded-3xl bg-card border border-border shadow-md space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
          <Utensils className="h-4 w-4" />
          <span>Reporte de hoy</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
          Mi Comida de Hoy
        </h1>
        <p className="text-xs text-muted-foreground">
          Marca cómo te fue hoy en menos de 10 segundos.
        </p>
      </div>

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

      {/* RN-02: la ventana 18:00–23:59 se declara ANTES del formulario; fuera de ella no se
          envía ni se encola nada (el día quedará No reportado). */}
      {!isDemoMode && !ventana.permitido && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-3xl bg-warning/10 border border-warning/30 text-warning"
        >
          <Clock className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-foreground">El reporte aún no está abierto</p>
            <p className="text-xs text-muted-foreground">{MENSAJE_ANTES_DE_VENTANA}</p>
          </div>
        </div>
      )}

      {/* RN-01: metas del coach visibles para el alumno */}
      <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border/80 pb-3">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="font-bold text-sm text-foreground">Tus objetivos nutricionales</h2>
        </div>

        {isCargandoMetas && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando tus metas…
          </p>
        )}

        {metasError && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-destructive/10 border border-destructive/25">
            <p className="text-xs text-destructive font-semibold">{metasError}</p>
            <button
              type="button"
              onClick={() => void cargarMetas()}
              className="shrink-0 min-h-11 px-3 rounded-xl bg-secondary text-foreground text-xs font-bold hover:bg-secondary/80 cursor-pointer"
            >
              Reintentar
            </button>
          </div>
        )}

        {!isCargandoMetas && !metasError && !metasConfiguradas(metas) && (
          <p className="text-xs text-muted-foreground">
            Tu entrenador todavía no configuró metas. Puedes registrar tu día igualmente.
          </p>
        )}

        {!metasError && objetivos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {objetivos.map((objetivo) => (
              <div
                key={objetivo.etiqueta}
                className="p-3 rounded-2xl bg-secondary/40 border border-border"
              >
                <span className="block text-xs font-semibold uppercase text-muted-foreground">
                  {objetivo.etiqueta}
                </span>
                <p className="text-base font-black font-mono text-foreground mt-0.5">
                  {objetivo.valor}
                </p>
              </div>
            ))}
          </div>
        )}

        {!metasError && (metas?.recursos?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Recursos de tu coach
            </span>
            <ul className="space-y-1.5">
              {metas!.recursos.map((recurso) => (
                <li key={recurso.storageKey ?? recurso.url ?? recurso.titulo}>
                  {recurso.url ? (
                    <a
                      href={recurso.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-11 text-xs font-bold text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span>{recurso.titulo}</span>
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 min-h-11 text-xs font-semibold text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <span>
                        {recurso.titulo} · el enlace no está disponible; pídele a tu coach que lo
                        vuelva a subir
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Resultado de tolerancia del reporte ya registrado (Escenario 3) */}
        {existingCheckin && clasificacionTolerancia && (
          <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border space-y-2">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary shrink-0" />
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  clasificacionTolerancia.tono === 'success'
                    ? 'bg-success/15 text-success border-success/30'
                    : clasificacionTolerancia.tono === 'warning'
                    ? 'bg-warning/15 text-warning border-warning/30'
                    : clasificacionTolerancia.tono === 'danger'
                    ? 'bg-destructive/15 text-destructive border-destructive/30'
                    : 'bg-secondary text-muted-foreground border-border'
                }`}
              >
                {clasificacionTolerancia.texto}
              </span>
            </div>
            <ul className="space-y-1">
              {toleranciaHoy?.desviacionCaloriasPct !== undefined && (
                <li className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    Calorías: {existingCheckin.caloriasReportadas ?? '—'} /{' '}
                    {metas?.caloriasObjetivo ?? '—'} kcal
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {formatearDesviacionPct(toleranciaHoy.desviacionCaloriasPct)}
                  </span>
                </li>
              )}
              {toleranciaHoy?.desviacionProteinasPct !== undefined && (
                <li className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    Proteína: {existingCheckin.proteinaGramosReportada ?? '—'} /{' '}
                    {metas?.proteinaGramosObjetivo ?? '—'} g
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {formatearDesviacionPct(toleranciaHoy.desviacionProteinasPct)}
                  </span>
                </li>
              )}
            </ul>
            <p className="text-xs text-muted-foreground">
              Margen de tolerancia: ±10 % de las metas de tu entrenador.
            </p>
          </div>
        )}
      </section>

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

      {/* Optional Details (Water, Calories, Notes) */}
      <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <Droplets className="h-4 w-4 text-primary" />
          <span>Agua, calorías y proteína (opcional)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="nutricion-agua" className="text-xs font-semibold text-muted-foreground">
              Agua (Litros)
            </label>
            <input
              id="nutricion-agua"
              type="text"
              inputMode="decimal"
              disabled={formularioDeshabilitado}
              value={aguaLitros}
              onChange={(e) => setAguaLitros(e.target.value)}
              placeholder="2.50"
              className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="nutricion-calorias" className="text-xs font-semibold text-muted-foreground">
              Calorías (kcal)
            </label>
            <input
              id="nutricion-calorias"
              type="text"
              inputMode="numeric"
              disabled={formularioDeshabilitado}
              value={calorias}
              onChange={(e) => setCalorias(e.target.value)}
              placeholder="2200"
              className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="nutricion-proteina" className="text-xs font-semibold text-muted-foreground">
              Proteína (g)
            </label>
            <input
              id="nutricion-proteina"
              type="text"
              inputMode="numeric"
              disabled={formularioDeshabilitado}
              value={proteina}
              onChange={(e) => setProteina(e.target.value)}
              placeholder="160"
              className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm font-mono text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label htmlFor="nutricion-notas" className="text-xs font-semibold text-muted-foreground">
              Notas breves
            </label>
            <span className="text-xs text-muted-foreground">{notas.length}/280</span>
          </div>
          <textarea
            id="nutricion-notas"
            rows={2}
            maxLength={280}
            disabled={formularioDeshabilitado}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej: Mucha energía hoy, cena fuera de casa pero cuidé proteína."
            className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary resize-none disabled:opacity-60"
          />
        </div>
      </div>

      {/* RN-03: diario fotográfico (1–4 fotos comprimidas en el dispositivo) */}
      <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm text-foreground">Diario fotográfico del día</h3>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {fotosPlatos.length}/{MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Adjunta de 1 a {MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos de tus comidas principales. Se optimizan en tu dispositivo antes de
          subirse.
        </p>

        {!formularioBloqueado && (
          <>
            <input
              ref={inputFotosRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => void agregarFotos(e.target.files)}
            />
            <button
              type="button"
              disabled={fotosPlatos.length >= MAX_FOTOS_CHECKIN_NUTRICIONAL || isProcesandoFotos}
              onClick={() => inputFotosRef.current?.click()}
              className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-secondary border border-border text-foreground font-bold text-xs hover:bg-secondary/70 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcesandoFotos ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              <span>
                {isProcesandoFotos
                  ? 'Optimizando fotos…'
                  : fotosPlatos.length >= MAX_FOTOS_CHECKIN_NUTRICIONAL
                  ? `Máximo de ${MAX_FOTOS_CHECKIN_NUTRICIONAL} fotos alcanzado`
                  : 'Añadir foto de una comida'}
              </span>
            </button>
          </>
        )}

        {fotosError && (
          <p
            role="alert"
            className="text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/25 rounded-2xl px-3 py-2"
          >
            {fotosError}
          </p>
        )}

        {fotosPlatos.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {fotosPlatos.map((foto) => (
              <li key={foto.id} className="space-y-1.5">
                <div className="relative aspect-3/4 rounded-2xl overflow-hidden border border-border bg-background/60">
                  <img
                    src={foto.previewUrl}
                    alt={`Vista previa de ${etiquetaTipoComida(foto.tipoComida)}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
                <label className="sr-only" htmlFor={`tipo-comida-${foto.id}`}>
                  Comida de la foto
                </label>
                <select
                  id={`tipo-comida-${foto.id}`}
                  value={foto.tipoComida}
                  disabled={formularioBloqueado}
                  onChange={(e) =>
                    setFotosPlatos((previas) =>
                      previas.map((item) =>
                        item.id === foto.id
                          ? { ...item, tipoComida: e.target.value as TipoComida }
                          : item
                      )
                    )
                  }
                  className="w-full min-h-11 px-2 rounded-xl bg-background border border-border text-xs font-semibold text-foreground focus:outline-hidden focus:border-primary disabled:opacity-60"
                >
                  {Object.values(TipoComida).map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {etiquetaTipoComida(tipo)}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatearPeso(foto.archivo.size)}
                  </span>
                  <button
                    type="button"
                    disabled={formularioBloqueado}
                    onClick={() => quitarFoto(foto.id)}
                    aria-label={`Quitar foto de ${etiquetaTipoComida(foto.tipoComida)}`}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Submit + avisos */}
      <div className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-4">
        <button
          type="button"
          onClick={handleSaveCheckin}
          disabled={isLoading || formularioDeshabilitado}
          className="w-full min-h-11 py-3 px-4 rounded-xl bg-primary text-primary-foreground font-black text-sm tracking-wide shadow-md shadow-primary/20 hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : reporteRegistradoHoy ? (
            <Check className="h-4 w-4" />
          ) : (
            <Flame className="h-4 w-4" />
          )}
          <span>
            {isLoading
              ? fotosPlatos.length > 0
                ? 'Subiendo fotos y guardando…'
                : 'Guardando…'
              : reporteRegistradoHoy
              ? 'Reporte de hoy ya registrado'
              : confirmandoEnvio
              ? 'Comprobando tu reporte…'
              : reporteEncolado
              ? fotosEncoladas > 0
                ? 'Guardado sin conexión · pendiente de envío (con fotos)'
                : 'Guardado sin conexión · pendiente de envío'
              : !puedeReportar
              ? 'Disponible a partir de las 18:00'
              : 'Guardar reporte nutricional'}
          </span>
        </button>

        <AvisosReporteNutricional
          reporteRegistradoHoy={reporteRegistradoHoy}
          fechaRegistradaTexto={
            formatFechaLargaCalendario(existingCheckin?.fecha ?? hoyLocal) ?? hoyLocal
          }
          reporteEncolado={reporteEncolado}
          confirmando={confirmandoEnvio}
          fotosEncoladas={fotosEncoladas}
          aviso={avisoVisible}
        />

        {isDemoMode && (
          <p className="text-center text-xs text-muted-foreground">
            Modo demo: el reporte es una simulación local con datos de ejemplo y no viaja a la API.
          </p>
        )}
      </div>

      {/* Galería del día (RN-03): visible una vez registrado el reporte */}
      {existingCheckin && existingCheckin.fotosPlatos.length > 0 && (
        <section className="p-5 sm:p-6 rounded-3xl bg-card border border-border shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm text-foreground">
              Fotos de hoy ({existingCheckin.fotosPlatos.length})
            </h3>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {existingCheckin.fotosPlatos.map((foto) => (
              <li key={foto.id}>
                <MiniaturaFotoPlato
                  foto={foto}
                  fechaTexto={formatFechaLargaCalendario(existingCheckin.fecha) ?? existingCheckin.fecha}
                  onAbrir={() => setFotoVisor({ foto, fecha: existingCheckin.fecha })}
                />
              </li>
            ))}
          </ul>
          {totalesReportados.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {totalesReportados.map((total) => `${total.etiqueta}: ${total.valor}`).join(' · ')}
            </p>
          )}
        </section>
      )}

      {/* §6: últimos 7 días, con los días cerrados sin reporte marcados como No reportado */}
      {calendarioSemana.length > 0 && (
        <section className="p-5 rounded-3xl bg-card border border-border shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold text-sm text-foreground">Tus últimos 7 días</h3>
            {diasNoReportadosSemana > 0 && (
              <span className="text-xs font-semibold text-muted-foreground">
                {diasNoReportadosSemana} día{diasNoReportadosSemana === 1 ? '' : 's'} sin reporte
              </span>
            )}
          </div>
          <ul className="grid grid-cols-7 gap-1.5">
            {[...calendarioSemana].reverse().map((dia) => {
              // RF-002 §6: el día con reporte encolado no declara éxito ni "No reportado":
              // queda pendiente de sincronizar hasta que quede confirmado.
              const etiqueta =
                (reporteEncolado || confirmandoEnvio) && dia.fecha === hoyLocal
                  ? { texto: 'Pendiente de sincronizar', tono: 'warning' as const }
                  : etiquetaEstadoDia(dia.estado);
              return (
                <li key={dia.fecha} className="text-center">
                  <span
                    title={`${formatFechaLargaCalendario(dia.fecha) ?? dia.fecha}: ${etiqueta.texto}`}
                    className={`flex h-11 w-full items-center justify-center rounded-xl border text-xs font-bold ${
                      etiqueta.tono === 'success'
                        ? 'bg-success/15 text-success border-success/30'
                        : etiqueta.tono === 'warning'
                        ? 'bg-warning/15 text-warning border-warning/30'
                        : etiqueta.tono === 'danger'
                        ? 'bg-destructive/15 text-destructive border-destructive/30'
                        : etiqueta.tono === 'info'
                        ? 'bg-info/15 text-info border-info/30'
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    {dia.fecha.slice(8)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground truncate">
                    {etiqueta.texto}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Un día sin reporte no afecta tu racha de entrenamiento.
          </p>
        </section>
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
