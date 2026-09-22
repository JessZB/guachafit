import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '../../lib/api-client';
import { CoachPublicoDTO, Modalidad, TipoDocumento } from '@guachafit/shared';
import {
  esFormatoCoachCodeValido,
  MENSAJE_COACH_NO_DISPONIBLE,
  normalizarCoachCode,
} from '../../lib/onboarding-links';
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
  const [fechaNacimiento, setFechaNacimiento] = useState('2000-01-01');
  const [telefonoWhatsapp, setTelefonoWhatsapp] = useState('+584121234567');
  const [modalidad, setModalidad] = useState<Modalidad>(Modalidad.PRESENCIAL);

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    if (estadoCoach !== 'valido' || !coachInfo) {
      setError(MENSAJE_COACH_NO_DISPONIBLE);
      return;
    }

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
          telefonoWhatsapp,
          modalidad,
        }),
        skipAuth: true,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Error al completar el registro. Verifica los datos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <div className="w-full max-w-lg space-y-6">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
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
            <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold">
              {error}
            </div>
          )}

          {success ? (
            <div className="p-6 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
              <h3 className="font-bold text-base text-foreground">¡Registro Exitoso!</h3>
              <p className="text-xs text-muted-foreground">
                Tu cuenta ha sido vinculada con el entrenador. Redirigiendo a la pantalla de
                ingreso...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
                <label className="text-xs font-bold text-primary">
                  Código del Entrenador (Coach Code)
                </label>
                <input
                  type="text"
                  required
                  value={coachCode}
                  onChange={(e) => setCoachCode(e.target.value.toUpperCase())}
                  placeholder="Código de tu entrenador"
                  className="w-full px-3 py-1.5 rounded-lg bg-background border border-primary/40 font-mono font-bold text-sm tracking-wider uppercase text-foreground focus:outline-hidden"
                />

                {estadoCoach === 'validando' && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Verificando código...</span>
                  </p>
                )}

                {estadoCoach === 'valido' && coachInfo && (
                  <p className="flex items-center gap-1.5 text-[11px] text-success font-semibold">
                    <UserCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Te vincularás con: {coachInfo.nombre}
                      {coachInfo.nombreComercial ? ` · ${coachInfo.nombreComercial}` : ''}
                    </span>
                  </p>
                )}

                {estadoCoach === 'invalido' && (
                  <p className="flex items-center gap-1.5 text-[11px] text-danger font-semibold">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>{MENSAJE_COACH_NO_DISPONIBLE}</span>
                  </p>
                )}

                {estadoCoach === 'vacio' && (
                  <p className="text-[11px] text-muted-foreground">
                    Pega o escribe el código que te compartió tu entrenador.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Nombres</label>
                  <input
                    type="text"
                    required
                    value={nombres}
                    onChange={(e) => setNombres(e.target.value)}
                    placeholder="Carlos Alberto"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Apellidos</label>
                  <input
                    type="text"
                    required
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    placeholder="Mendoza"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="carlos@email.com"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={100}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <label className="text-xs font-semibold text-foreground">Tipo Doc</label>
                  <select
                    value={tipoDocumento}
                    onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={TipoDocumento.V}>V-</option>
                    <option value={TipoDocumento.E}>E-</option>
                    <option value={TipoDocumento.PASAPORTE}>Pasaporte</option>
                  </select>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-xs font-semibold text-foreground">Número de Documento</label>
                  <input
                    type="text"
                    required
                    value={numeroDocumento}
                    onChange={(e) => setNumeroDocumento(e.target.value)}
                    placeholder="24123456"
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Fecha Nacimiento</label>
                  <input
                    type="date"
                    required
                    value={fechaNacimiento}
                    onChange={(e) => setFechaNacimiento(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Modalidad</label>
                  <select
                    value={modalidad}
                    onChange={(e) => setModalidad(e.target.value as Modalidad)}
                    className="w-full px-3 py-2 rounded-xl bg-background border border-border text-sm text-foreground focus:outline-hidden focus:border-primary"
                  >
                    <option value={Modalidad.PRESENCIAL}>Presencial (Gimnasio)</option>
                    <option value={Modalidad.REMOTO}>Remoto (Online)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || estadoCoach !== 'valido'}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? 'Registrando cuenta...' : 'Completar Registro'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
