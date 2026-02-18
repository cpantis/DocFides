'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { FileText, Clock, CheckCircle2, Upload, Loader2, MoreHorizontal, Trash2, ArrowRight } from 'lucide-react';
import { useState } from 'react';

interface ProjectCardProps {
  id: string;
  name: string;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'exported';
  sourceCount: number;
  updatedAt: string;
  aiCost?: number;
  onDelete?: (id: string) => void;
}

const statusConfig = {
  draft: { icon: FileText, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  uploading: { icon: Upload, color: 'bg-blue-50 text-blue-600', dot: 'bg-blue-400' },
  processing: { icon: Loader2, color: 'bg-amber-50 text-amber-600', dot: 'bg-amber-400' },
  ready: { icon: CheckCircle2, color: 'bg-green-50 text-green-600', dot: 'bg-green-400' },
  exported: { icon: CheckCircle2, color: 'bg-primary-50 text-primary-600', dot: 'bg-primary-400' },
} as const;

export function ProjectCard({ id, name, status, sourceCount, updatedAt, aiCost, onDelete }: ProjectCardProps) {
  const t = useTranslations('project');
  const [menuOpen, setMenuOpen] = useState(false);

  const config = statusConfig[status];
  const StatusIcon = config.icon;
  const timeAgo = formatTimeAgo(new Date(updatedAt));

  return (
    <div className="group relative rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-primary-100 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <Link href={`/project/${id}`} className="block">
            <h3 className="truncate font-heading text-lg font-semibold text-gray-900 group-hover:text-primary-600">
              {name}
            </h3>
          </Link>

          <div className="mt-2 flex items-center gap-3">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', config.color)}>
              <StatusIcon className={cn('h-3 w-3', status === 'processing' && 'animate-spin')} />
              {t(`status.${status}`)}
            </span>
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-36 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                <Link
                  href={`/project/${id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <ArrowRight className="h-4 w-4" />
                  Open
                </Link>
                {onDelete && (
                  <button
                    onClick={() => { onDelete(id); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center gap-4 border-t border-gray-50 pt-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          {sourceCount} files
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {timeAgo}
        </span>
        {aiCost != null && aiCost > 0 && (
          <span className="ml-auto font-mono text-[11px] text-gray-300">
            ${aiCost.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
