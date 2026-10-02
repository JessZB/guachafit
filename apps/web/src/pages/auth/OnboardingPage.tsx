import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { CoachPublicoDTO, Modalidad, TipoDocumento } from '@guachafit/shared';
import {
  esErrorCorreoYaRegistrado,
  esFormatoCoachCodeValido,
  MENSAJE_COACH_NO_DISPONIBLE,
  normalizarCoachCode,
} from '../../lib/onboarding-links';
import {
  componerTelefonoWhatsapp,
  fechaLocalHoyISO,
  PREFIJO_PAIS_POR_DEFECTO,
  validarFechaNacimiento,
  validarTelefonoWhatsapp,
} from '../../lib/formulario-registro';
import { MENSAJE_ERROR_GENERICO } from '../../lib/mensajes-error';
import { CampoWhatsapp } from '../../components/common/CampoWhatsapp';
import {
  ArrowLeft,
  CheckCircle2,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Loader2,
} from 'lucide-react';

type EstadoValidacionCoach = 'vacio' | 'validando' | 'valido' | 'invalido';

/**
 * WU-E (RF-011 RN-06/RN-07): autorregistro público mediante deep link del coach.
 *
 * El código YA NO tiene un valor por defecto: se toma de la URL (`?coach=CODE`, con compatibilidad
 * para el alias legado `?coach_code=`) y se resuelve contra la API pública. Solo se permite enviar
 * el formulario cuando el código existe y la licencia del coach está vigente; el registro viaja con
 * ESE código validado, no con uno inventado por el cliente.
 */
export function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const codigoDeUrl = normalizarCoachCode(
    searchParams.get('coach') ?? searchParams.get('coach_code')
  );

  const [coachCode, setCoachCode] = useState(codigoDeUrl);
  const [coachInfo, setCoachInfo] = useState<CoachPublicoDTO | null>(null);
  const [estadoCoach, setEstadoCoach] = useState<EstadoValidacionCoach>('vacio');

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>(TipoDocumento.V);
  const [numeroDocumento, setNumeroDocumento] = useState('');
  // A2: sin datos precargados; el prefijo de país es visible y editable.
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [prefijoWhatsapp, setPrefijoWhatsapp] = useState(PREFIJO_PAIS_POR_DEFECTO);
  const [numeroWhatsapp, setNumeroWhatsapp] = useState('');
  const [errorWhatsapp, setErrorWhatsapp] = useState<string | null>(null);
  const [errorFecha, setErrorFecha] = useState<string | null>(null);
  const [modalidad, setModalidad] = useState<Modalidad>(Modalidad.PRESENCIAL);

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correoYaRegistrado, setCorreoYaRegistrado] = useState(false);
  // C7: la redirección tras el éxito se cancela si la pantalla se desmonta antes.
  const redireccionRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redireccionRef.current) clearTimeout(redireccionRef.current);
    },
    []
  );

  // Resolución pública del código (con debounce): al montar con `?coach=` y al editarlo a mano.
  useEffect(() => {
    const codigo = normalizarCoachCode(coachCode);

    if (codigo.length === 0) {
      setEstadoCoach('vacio');
      setCoachInfo(null);
      return;
    }

    if (!esFormatoCoachCodeValido(codigo)) {
      setEstadoCoach('invalido');
      setCoachInfo(null);
      return;
    }

    let cancelado = false;
    setEstadoCoach('validando');
    setCoachInfo(null);

    const timer = setTimeout(() => {
      apiClient<CoachPublicoDTO>(`/alumnos/coach/${encodeURIComponent(codigo)}`, {
        skipAuth: true,
      })
        .then((info) => {
          if (cancelado) return;
          setCoachInfo(info);
          setEstadoCoach('valido');
        })
        .catch(() => {
          if (cancelado) return;
          setCoachInfo(null);
          setEstadoCoach('invalido');
        });
    }, 400);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [coachCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCorreoYaRegistrado(false);

    if (estadoCoach !== 'valido' || !coachInfo) {
      setError(MENSAJE_COACH_NO_DISPONIBLE);
      return;
    }

    const errorTelefono = validarTelefonoWhatsapp(prefijoWhatsapp, numeroWhatsapp);
    const errorNacimiento = validarFechaNacimiento(fechaNacimiento);
    setErrorWhatsapp(errorTelefono);
    setErrorFecha(errorNacimiento);
    if (errorTelefono || errorNacimiento) return;

    setIsLoading(true);
    try {
      await apiClient('/alumnos/registro-publico', {
        method: 'POST',
        body: JSON.stringify({
          coachCode: coachInfo.coachCode,
          nombres,
          apellidos,
          email,
          password,
          tipoDocumento,
          numeroDocumento,
          fechaNacimiento,
          telefonoWhatsapp: componerTelefonoWhatsapp(prefijoWhatsapp, numeroWhatsapp),
          modalidad,
        }),
        skipAuth: true,
      });

      setSuccess(true);
      redireccionRef.current = setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err: any) {
      // C8: correo ya registrado → se ofrece ir a iniciar sesión.
      setCorreoYaRegistrado(esErrorCorreoYaRegistrado(err));
      setError(err?.message || MENSAJE_ERROR_GENERICO);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <div className="w-full max-w-lg space-y-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 min-h-11 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Volver al inicio de sesión</span>
        </Link>

        <div className="p-6 rounded-2xl bg-card border border-border shadow-md space-y-5">
          <div className="flex items-center gap-3 border-b border-border/80 pb-4">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground">Vincularse con Entrenador</h1>
              <p className="text-xs text-muted-foreground">
                Completa tu ficha para comenzar tu plan deportivo personalizado.
              </p>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold space-y-1"
            >
              <p>{error}</p>
              {correoYaRegistrado && (
                <Link
                  to="/login"
                  className="inline-flex items-center min-h-11 font-bold text-primary underline"
                >
                  Iniciar sesión
                </Link>
              )}
            </div>
          )}

          {success ? (
            <div className="p-6 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
              <h2 className="font-bold text-base text-foreground">¡Registro exitoso!</h2>
              <p className="text-xs text-muted-foreground">
                Tu cuenta quedó vinculada con tu entrenador. En unos segundos te llevamos a
                iniciar sesión.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 active:scale-95 transition-all"
              >
                Ir a iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
                <label htmlFor="onboarding-coach" className="text-xs font-bold text-primary">
                  Código de tu entrenador
                </label>
                <input
                  id="onboarding-coach"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  required
                  value={coachCode}
                  onChange={(e) => setCoachCode(e.target.value.toUpperCase())}
                  placeholder="Código de tu entrenador"
                  className="w-full min-h-11 px-3 py-1.5 rounded-lg bg-background border border-primary/40 font-mono font-bold text-sm tracking-wider uppercase text-foreground focus:outline-hidden"
                />

                {estadoCoach === 'validando' && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Verificando código...</span>
                  </p>
                )}

                {estadoCoach === 'valido' && coachInfo && (
                  <p className="flex items-center gap-1.5 text-xs text-success font-semibold">
                    <UserCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Te vincularás con: {coachInfo.nombre}
                      {coachInfo.nombreComercial ? ` · ${coachInfo.nombreComercial}` : ''}
                    </span>
                  </p>
                )}

                {estadoCoach === 'invalido' && (
                  <p className="flex items-center gap-1.5 text-xs text-danger font-semibold">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>{MENSAJE_COACH_NO_DISPONIBLE}</span>
                  </p>
                )}

                {estadoCoach === 'vacio' && (
                  <p className="text-xs text-muted-foreground">
                    Pega o escribe el código que te compartió tu entrenador.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="onboarding-nombres" className="text-xs font-semibold text-foreground">Nombres</label>
                  <input
                    id="onboarding-nombres"
                    autoComplete="given-name"
                    type="text"
                    required
                    value={nombres}
                    onChange={(e) => setNombres(e.target.value)}
                    placeholder="Carlos Alberto"
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="onboarding-apellidos" className="text-xs font-semibold text-foreground">Apellidos</label>
                  <input
                    id="onboarding-apellidos"
                    autoComplete="family-name"
                    type="text"
                    required
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    placeholder="Mendoza"
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="onboarding-email" className="text-xs font-semibold text-foreground">Correo electrónico</label>
                <input
                  id="onboarding-email"
                  autoComplete="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carlos@email.com"
                  className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="onboarding-password" className="text-xs font-semibold text-foreground">Contraseña</label>
                <input
                  id="onboarding-password"
                  autoComplete="new-password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={100}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <label htmlFor="onboarding-tipo-documento" className="text-xs font-semibold text-foreground">Tipo de documento</label>
                  <select
                    id="onboarding-tipo-documento"
                    value={tipoDocumento}
                    onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={TipoDocumento.V}>V-</option>
                    <option value={TipoDocumento.E}>E-</option>
                    <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <label htmlFor="onboarding-documento" className="text-xs font-semibold text-foreground">Número de documento</label>
                  <input
                    id="onboarding-documento"
                    autoComplete="off"
                    type="text"
                    required
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    placeholder="24123456"
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="onboarding-nacimiento" className="text-xs font-semibold text-foreground">Fecha de nacimiento</label>
                  <input
                    id="onboarding-nacimiento"
                    autoComplete="bday"
                    type="date"
                    required
                    max={fechaLocalHoyISO()}
                    value={fechaNacimiento}
                    onChange={(e) => {
                      setFechaNacimiento(e.target.value);
                      setErrorFecha(null);
                    }}
                    aria-invalid={errorFecha ? true : undefined}
                    aria-describedby={errorFecha ? 'onboarding-nacimiento-error' : undefined}
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                  {errorFecha && (
                    <p
                      id="onboarding-nacimiento-error"
                      role="alert"
                      className="text-xs font-semibold text-destructive"
                    >
                      {errorFecha}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label htmlFor="onboarding-modalidad" className="text-xs font-semibold text-foreground">Modalidad</label>
                  <select
                    id="onboarding-modalidad"
                    value={modalidad}
                    onChange={(e) => setModalidad(e.target.value as Modalidad)}
                    className="w-full min-h-11 px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={Modalidad.PRESENCIAL}>Presencial (Gimnasio)</option>
                    <option value={Modalidad.REMOTO}>Remoto (Online)</option>
                  </select>
                </div>
              </div>

              <CampoWhatsapp
                idBase="onboarding-whatsapp"
                prefijo={prefijoWhatsapp}
                numero={numeroWhatsapp}
                onCambiarPrefijo={(valor) => {
                  setPrefijoWhatsapp(valor);
                  setErrorWhatsapp(null);
                }}
                onCambiarNumero={(valor) => {
                  setNumeroWhatsapp(valor);
                  setErrorWhatsapp(null);
                }}
                error={errorWhatsapp}
              />

              <button
                type="submit"
                disabled={isLoading || estadoCoach !== 'valido'}
                className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? 'Creando tu cuenta...' : 'Crear mi cuenta'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
