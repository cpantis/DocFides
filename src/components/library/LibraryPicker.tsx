'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useState } from 'react';
import {
  BookOpen,
  Upload,
  Check,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLibrary, type LibraryItem } from '@/lib/hooks/use-library';

interface LibraryPickerProps {
  type: 'template' | 'model' | 'entity';
  onSelect: (item: LibraryItem) => void;
  onDeselect: () => void;
  selectedId?: string;
  children: React.ReactNode; // The existing UploadZone
}

export function LibraryPicker({ type, onSelect, onDeselect, selectedId, children }: LibraryPickerProps) {
  const t = useTranslations('library.picker');
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>(selectedId ? 'library' : 'upload');
  const { items, isLoading } = useLibrary(type);

  const readyItems = items.filter((item) => item.status === 'ready');
  const selectedItem = readyItems.find((item) => item._id === selectedId);

  return (
    <div>
      {/* Tab buttons */}
      <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-0.5">
        <button
          onClick={() => setActiveTab('library')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            activeTab === 'library'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <BookOpen className="h-3.5 w-3.5" />
          {t('libraryTab')}
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
            activeTab === 'upload'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Upload className="h-3.5 w-3.5" />
          {t('uploadTab')}
        </button>
      </div>

      {/* Library tab */}
      {activeTab === 'library' && (
        <div>
          {selectedItem && (
            <div className="mb-3 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-700">{selectedItem.name}</span>
                <span className="text-xs text-green-500">{t('selected')}</span>
              </div>
              <button
                onClick={onDeselect}
                className="rounded p-1 text-green-400 hover:bg-green-100 hover:text-green-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : readyItems.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 py-8">
              <BookOpen className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-400">{t('noReady')}</p>
              <Link
                href="/dashboard/library"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-500 hover:text-primary-700"
              >
                {t('goToLibrary')}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {readyItems.map((item) => (
                <button
                  key={item._id}
                  onClick={() => {
                    if (selectedId === item._id) {
                      onDeselect();
                    } else {
                      onSelect(item);
                    }
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all',
                    selectedId === item._id
                      ? 'border-primary-200 bg-primary-50'
                      : 'border-gray-100 bg-white hover:border-primary-100 hover:bg-gray-50'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{item.name}</p>
                    <p className="truncate text-xs text-gray-400">{item.originalFilename}</p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    {item.usageCount > 0 && (
                      <span className="text-xs text-gray-300">{item.usageCount}x</span>
                    )}
                    {selectedId === item._id ? (
                      <Check className="h-4 w-4 text-primary-600" />
                    ) : (
                      <span className="text-xs font-medium text-primary-500">{t('select')}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upload tab */}
      {activeTab === 'upload' && children}
    </div>
  );
}
