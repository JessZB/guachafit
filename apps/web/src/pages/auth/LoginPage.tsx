import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/auth-context';
import { Rol } from '@guachafit/shared';
import { Dumbbell, ShieldCheck, ArrowRight, Sparkles, UserCheck, Lock } from 'lucide-react';

export function LoginPage() {
  const { login, demoLogin, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login({ email, password });
      // El aterrizaje por rol vive en un solo lugar: RootRedirect ("/").
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Credenciales inválidas. Por favor intente de nuevo.');
    }
  };

  const handleDemo = (rol: Rol) => {
    demoLogin(rol);
    // El aterrizaje por rol vive en un solo lugar: RootRedirect ("/").
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-xl shadow-primary/25 mb-1">
            <Dumbbell className="h-8 w-8" />
          </div>
          <h1 className="font-black text-3xl tracking-tight">GUACHAFIT</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Entrena, sigue a tus alumnos y controla tus cobros en un solo lugar.
          </p>
        </div>

        {/* Quick Demo Access Box */}
        <div className="p-4 rounded-2xl bg-card border border-primary/30 shadow-md space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
            <Sparkles className="h-4 w-4" />
            <span>Acceso Inmediato de Demostración</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Explora la app completa sin necesidad de ingresar credenciales:
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={() => handleDemo(Rol.ENTRENADOR)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Modo Coach</span>
            </button>
            <button
              onClick={() => handleDemo(Rol.ALUMNO)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-secondary text-foreground font-bold text-xs border border-border hover:bg-secondary/80 active:scale-95 transition-all cursor-pointer"
            >
              <UserCheck className="h-4 w-4" />
              <span>Modo Alumno</span>
            </button>
          </div>
        </div>

        {/* Credentials Form */}
        <div className="p-6 rounded-2xl bg-card border border-border shadow-xs space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Ingreso con Cuenta
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-destructive/15 border border-destructive/30 text-destructive text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Correo Electrónico</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alumno@guachafit.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Contraseña</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border text-foreground text-sm focus:outline-hidden focus:border-primary transition-colors pr-10"
                />
                <Lock className="h-4 w-4 text-muted-foreground absolute right-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:brightness-110 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isLoading ? 'Iniciando sesión...' : 'Entrar a la Plataforma'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-muted-foreground">
            ¿Tienes un código de tu entrenador?{' '}
            <Link to="/onboarding" className="text-primary font-bold hover:underline">
              Vincular cuenta aquí
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
