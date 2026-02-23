'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Library,
  FileText,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { LibraryItemData } from '@/lib/hooks/use-library';

interface LibraryPickerProps {
  type: 'template' | 'model' | 'entity';
  items: LibraryItemData[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (item: LibraryItemData) => void;
  onRemove: () => void;
  children: React.ReactNode; // The UploadZone rendered as the "upload new" tab
}

export function LibraryPicker({
  type,
  items,
  isLoading,
  selectedId,
  onSelect,
  onRemove,
  children,
}: LibraryPickerProps) {
  const tp = useTranslations('library.picker');
  const [activeTab, setActiveTab] = useState<'upload' | 'library'>(
    selectedId ? 'library' : 'upload'
  );

  const selectedItem = selectedId ? items.find((i) => i._id === selectedId) : null;

  // If an item is selected, show the selected state instead of tabs
  if (selectedItem) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100">
            <Check className="h-5 w-5 text-green-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-green-600">{tp('selected')}</span>
            </div>
            <p className="truncate text-sm font-semibold text-gray-900">{selectedItem.name}</p>
            {selectedItem.description && (
              <p className="truncate text-xs text-gray-500">{selectedItem.description}</p>
            )}
            {selectedItem.documents[0] && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                <FileText className="h-3 w-3" />
                <span>{selectedItem.documents[0].originalFilename}</span>
              </div>
            )}
          </div>
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
            title={tp('remove')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('upload')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'upload'
              ? 'border-b-2 border-primary-600 text-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {tp('tabUpload')}
        </button>
        <button
          onClick={() => setActiveTab('library')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
            activeTab === 'library'
              ? 'border-b-2 border-primary-600 text-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Library className="h-3.5 w-3.5" />
          {tp('tabLibrary')}
          {items.length > 0 && (
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
              {items.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="mt-4">
        {activeTab === 'upload' ? (
          children
        ) : (
          <LibraryList
            type={type}
            items={items}
            isLoading={isLoading}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  );
}

function LibraryList({
  type,
  items,
  isLoading,
  onSelect,
}: {
  type: 'template' | 'model' | 'entity';
  items: LibraryItemData[];
  isLoading: boolean;
  onSelect: (item: LibraryItemData) => void;
}) {
  const tp = useTranslations('library.picker');

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  // Only show items that have at least one document uploaded
  const readyItems = items.filter((i) => i.documents.length > 0);

  if (readyItems.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-gray-200 py-8">
        <Library className="h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-400">{tp('noItems')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {readyItems.map((item) => (
        <button
          key={item._id}
          onClick={() => onSelect(item)}
          className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-primary-200 hover:shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
            {item.description && (
              <p className="truncate text-xs text-gray-500">{item.description}</p>
            )}
            {item.documents[0] && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                <FileText className="h-3 w-3" />
                <span>{item.documents[0].originalFilename}</span>
                <span>&middot;</span>
                <span>{(item.documents[0].sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
              </div>
            )}
          </div>
          <span className="flex-shrink-0 text-xs font-medium text-primary-600">
            {tp(`select${type.charAt(0).toUpperCase() + type.slice(1)}` as 'selectTemplate' | 'selectModel' | 'selectEntity')}
          </span>
        </button>
      ))}
    </div>
  );
}
