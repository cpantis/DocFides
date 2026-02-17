'use client';

import { useTranslations } from 'next-intl';
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTags } from '@/lib/hooks/use-tags';
import { cn } from '@/lib/utils/cn';

interface DocumentTagBadgeProps {
  documentId: string;
  currentTagId?: string;
  onTagChange?: () => void;
}

export function DocumentTagBadge({ documentId, currentTagId, onTagChange }: DocumentTagBadgeProps) {
  const t = useTranslations('dashboard.tags');
  const { tags } = useTags();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentTag = tags.find((tag) => tag._id === currentTagId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const assignTag = async (tagId: string | null) => {
    setOpen(false);
    try {
      await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });
      onTagChange?.();
    } catch {
      // Error handled by API
    }
  };

  if (currentTag) {
    return (
      <div className="flex items-center gap-1">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: currentTag.color }}
        >
          {currentTag.name}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); assignTag(null); }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-white/20"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600"
      >
        {t('addLabel')}
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-20 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {tags.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">{t('noTags')}</p>
          ) : (
            tags.map((tag) => (
              <button
                key={tag._id}
                type="button"
                onClick={() => assignTag(tag._id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50',
                )}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
