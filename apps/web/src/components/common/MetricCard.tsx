import { LucideIcon } from 'lucide-react';
import { BadgeEstado } from '../ui/BadgeEstado';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: {
    text: string;
    variant?: 'success' | 'warning' | 'danger' | 'info';
  };
  className?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  className = '',
}: MetricCardProps) {
  return (
    <div
      className={`flex flex-col min-w-0 p-5 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-primary/40 transition-all ${className}`}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <span className="min-w-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-snug break-words">
          {title}
        </span>
        {Icon && (
          <div className="p-2 rounded-xl bg-secondary/70 text-foreground shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono break-words">
          {value}
        </span>
        {badge && (
          <BadgeEstado tono={badge.variant ?? 'info'}>{badge.text}</BadgeEstado>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1.5 leading-snug break-words">{subtitle}</p>
      )}
    </div>
  );
}
