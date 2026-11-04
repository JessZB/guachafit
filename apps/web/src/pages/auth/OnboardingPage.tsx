import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Modalidad, TipoDocumento } from '@guachafit/shared';
import { normalizarCoachCode } from '../../lib/onboarding-links';
import {
  fechaLocalHoyISO,
  PREFIJO_PAIS_POR_DEFECTO,
} from '../../lib/formulario-registro';
import { useValidacionCoach } from '../../components/auth/onboarding/use-validacion-coach';
import { useRegistroOnboarding } from '../../components/auth/onboarding/use-registro-onboarding';
import { CoachVinculado } from '../../components/auth/onboarding/CoachVinculado';
import { EnlaceRegistroNoValido } from '../../components/auth/onboarding/EnlaceRegistroNoValido';
import { VerificacionEnlace } from '../../components/auth/onboarding/VerificacionEnlace';
import { AlertaErrorRegistro } from '../../components/auth/onboarding/AlertaErrorRegistro';
import { ExitoRegistro } from '../../components/auth/onboarding/ExitoRegistro';
import { CampoWhatsapp } from '../../components/common/CampoWhatsapp';
import { ArrowLeft, UserPlus } from 'lucide-react';

/**
 * WU-E (RF-011 RN-06/RN-07): autorregistro público mediante deep link del coach.
 *
 * El código se toma de la URL (`?coach=CODE`, con compatibilidad para el alias legado
 * `?coach_code=`) y se resuelve contra la API pública (`useValidacionCoach`). Solo se
 * permite enviar cuando el código existe y la licencia del coach está vigente; el registro
 * viaja con ESE código validado, no con uno inventado por el cliente.
 *
 * D17: el código no se puede escribir ni editar. Sin código o con un código que la API no
 * resuelve (rotado, captación pausada, cupo lleno) se muestra la página de «enlace no
 * válido», sin formulario; un fallo de red o de servidor ofrece reintentar.
 */
export function OnboardingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const codigoDeUrl = normalizarCoachCode(
    searchParams.get('coach') ?? searchParams.get('coach_code')
  );

  const { estado: estadoCoach, coachInfo, reintentar } = useValidacionCoach(codigoDeUrl);

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
  const [modalidad, setModalidad] = useState<Modalidad>(Modalidad.PRESENCIAL);

  const {
    isLoading,
    success,
    error,
    correoYaRegistrado,
    errorWhatsapp,
    errorFecha,
    fijarErrorWhatsapp,
    fijarErrorFecha,
    registrar,
  } = useRegistroOnboarding(navigate);

  // Resolución pública del código (con debounce): vive en `useValidacionCoach`.

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void registrar(coachInfo ? coachInfo.coachCode : null, {
      nombres,
      apellidos,
      email,
      password,
      tipoDocumento,
      numeroDocumento,
      fechaNacimiento,
      prefijoWhatsapp,
      numeroWhatsapp,
      modalidad,
    });
  };

  if (estadoCoach === 'vacio') return <EnlaceRegistroNoValido motivo="sin-codigo" />;
  if (estadoCoach === 'invalido') return <EnlaceRegistroNoValido motivo="invalido" />;
  if (estadoCoach === 'validando' || estadoCoach === 'error') {
    return <VerificacionEnlace estado={estadoCoach} onReintentar={reintentar} />;
  }

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
            <AlertaErrorRegistro error={error} correoYaRegistrado={correoYaRegistrado} />
          )}

          {success ? (
            <ExitoRegistro />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {coachInfo && <CoachVinculado coachInfo={coachInfo} />}

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
                      fijarErrorFecha(null);
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
                  fijarErrorWhatsapp(null);
                }}
                onCambiarNumero={(valor) => {
                  setNumeroWhatsapp(valor);
                  fijarErrorWhatsapp(null);
                }}
                error={errorWhatsapp}
              />

              <button
                type="submit"
                disabled={isLoading}
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
