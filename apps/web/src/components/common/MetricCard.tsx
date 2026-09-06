import React from 'react';
import { LucideIcon } from 'lucide-react';

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
  const badgeStyles = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    danger: 'bg-destructive/15 text-destructive border-destructive/20',
    info: 'bg-primary/15 text-primary border-primary/20',
  };

  return (
    <div
      className={`p-5 rounded-2xl bg-card border border-border/80 shadow-xs hover:border-primary/40 transition-all ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <div className="p-2 rounded-xl bg-secondary/70 text-foreground">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-mono">
          {value}
        </span>
        {badge && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              badgeStyles[badge.variant || 'info']
            }`}
          >
            {badge.text}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
