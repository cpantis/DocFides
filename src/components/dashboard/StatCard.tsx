import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  className?: string;
}

export function StatCard({ title, value, icon: Icon, trend, subtitle, className }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl border border-gray-100 bg-white p-6 shadow-sm', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        <div className="rounded-xl bg-primary-50 p-3">
          <Icon className="h-5 w-5 text-primary-600" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span className={cn(
            'text-xs font-semibold',
            trend === 'up' ? 'text-success' : trend === 'down' ? 'text-error' : 'text-gray-400'
          )}>
            {trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192'}
          </span>
          <span className="text-xs text-gray-400">vs last month</span>
        </div>
      )}
    </div>
  );
}
