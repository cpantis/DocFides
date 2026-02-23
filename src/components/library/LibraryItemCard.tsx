'use client';

import { useTranslations } from 'next-intl';
import { FileText, Trash2, ChevronRight, Loader2, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { LibraryItemData } from '@/lib/hooks/use-library';
import type { ReactNode } from 'react';

interface LibraryItemCardProps {
  item: LibraryItemData;
  icon: ReactNode;
  translationPrefix: 'library.templates' | 'library.models';
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRetry?: (id: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-700',
  ready: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

export function LibraryItemCard({ item, icon, translationPrefix, onSelect, onDelete, onRetry }: LibraryItemCardProps) {
  const t = useTranslations(translationPrefix);

  const doc = item.documents[0];

  return (
    <div
      className="group relative flex cursor-pointer flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-primary-200 hover:shadow-md"
      onClick={() => onSelect(item._id)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50">
            {icon}
          </div>
          <div>
            <h3 className="font-heading text-sm font-semibold text-gray-900">
              {item.name}
            </h3>
            {item.description && (
              <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                {item.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {item.status === 'error' && onRetry && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRetry(item._id);
              }}
              className="rounded-lg p-1.5 text-amber-500 transition-all hover:bg-amber-50 hover:text-amber-600"
              title={t('retry')}
            >
              <RotateCw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item._id);
            }}
            className="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            title={t('confirmDelete')}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
            STATUS_STYLES[item.status] ?? STATUS_STYLES.draft
          )}
        >
          {item.status === 'processing' && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          {t(`status.${item.status}`)}
        </span>
      </div>

      {doc ? (
        <div className="mt-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs text-gray-600">
            <FileText className="h-3 w-3 flex-shrink-0 text-gray-400" />
            <span className="truncate">{doc.originalFilename}</span>
            <span className="ml-auto flex-shrink-0 text-gray-400">
              {(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB
            </span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">{t('noDocument')}</p>
      )}

      {item.usageCount > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          {t('usedInProjects', { count: item.usageCount })}
        </p>
      )}

      <div className="mt-3 flex items-center justify-end text-xs font-medium text-primary-600 opacity-0 transition-opacity group-hover:opacity-100">
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </div>
  );
}
