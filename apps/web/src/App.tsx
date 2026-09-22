import { useState, useEffect } from 'react';
import { useTheme } from './lib/theme';
import { Moon, Sun, Laptop, Dumbbell, ShieldCheck, Wifi, WifiOff } from 'lucide-react';

export function App() {
  const { theme, setTheme } = useTheme();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-between p-6 sm:p-12 max-w-5xl mx-auto">
      {/* Header */}
      <header className="w-full flex items-center justify-between py-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
            <Dumbbell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tight text-foreground">
              GUACHAFIT
            </h1>
            <p className="text-xs text-muted-foreground font-medium">High-Performance Training & Ops</p>
          </div>
        </div>

        {/* Connectivity & Theme Controls */}
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isOnline
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-warning/10 text-warning border border-warning/20'
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
          </div>

          <div className="flex items-center bg-secondary/50 rounded-lg p-1 border border-border">
            <button
              onClick={() => setTheme('light')}
              className={`p-1.5 rounded-md transition-colors ${
                theme === 'light' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Modo Claro"
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-1.5 rounded-md transition-colors ${
                theme === 'dark' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Modo Oscuro (OLED)"
            >
              <Moon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme('system')}
              className={`p-1.5 rounded-md transition-colors ${
                theme === 'system' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Sistema"
            >
              <Laptop className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="w-full my-auto py-12 flex flex-col items-center text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
          <ShieldCheck className="h-4 w-4" />
          <span>Spec-Driven Development Monorepo Inicializado</span>
        </div>

        <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-3xl">
          Entrenamiento, nutrición y gestión de alumnos sin fricción.
        </h2>

        <p className="text-muted-foreground text-base sm:text-lg max-w-2xl">
          Arquitectura desacoplada offline-first, registro antropométrico de alta precisión,
          y conciliación financiera con deuda maestra en USD.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-3xl pt-8 text-left">
          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/50 transition-colors">
            <h3 className="font-bold text-foreground mb-1">Entrenamiento Offline</h3>
            <p className="text-xs text-muted-foreground">
              Registro local en IndexedDB con sincronización optimista y resolución de conflictos.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/50 transition-colors">
            <h3 className="font-bold text-foreground mb-1">Control Antropométrico</h3>
            <p className="text-xs text-muted-foreground">
              Almacenamiento seguro en Cloudflare R2 con RLS y cifrado de notas médicas privadas.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-card border border-border shadow-sm hover:border-primary/50 transition-colors">
            <h3 className="font-bold text-foreground mb-1">Gestión Financiera</h3>
            <p className="text-xs text-muted-foreground">
              Soporte multi-moneda (USD/VES) con tasas BCV históricas y pagos idempotentes.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full py-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
        <p>© 2026 GUACHAFIT. Todos los derechos reservados.</p>
        <p className="font-mono">Stack: React 19 • Tailwind v4 • NestJS 11 • PostgreSQL 16</p>
      </footer>
    </main>
  );
}
export default App;
