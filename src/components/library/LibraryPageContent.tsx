'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useState, useRef } from 'react';
import {
  BookOpen,
  FileText,
  Palette,
  Users,
  Plus,
  Upload,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowLeft,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLibrary, type LibraryItem } from '@/lib/hooks/use-library';

type TabType = 'template' | 'model' | 'entity';

const TAB_CONFIG = {
  template: { icon: FileText, label: 'templates' },
  model: { icon: Palette, label: 'models' },
  entity: { icon: Users, label: 'entities' },
} as const;

const STATUS_CONFIG = {
  uploaded: { icon: Upload, color: 'bg-blue-50 text-blue-600', dot: 'bg-blue-400' },
  processing: { icon: Loader2, color: 'bg-amber-50 text-amber-600', dot: 'bg-amber-400' },
  ready: { icon: CheckCircle2, color: 'bg-green-50 text-green-600', dot: 'bg-green-400' },
  failed: { icon: AlertCircle, color: 'bg-red-50 text-red-600', dot: 'bg-red-400' },
} as const;

export function LibraryPageContent() {
  const t = useTranslations('library');
  const tc = useTranslations('common');
  const [activeTab, setActiveTab] = useState<TabType>('template');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items, isLoading, isError, mutate } = useLibrary(activeTab);

  const handleUpload = async (file: File) => {
    if (!uploadName.trim()) {
      setUploadError(t('nameRequired'));
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', activeTab);
      formData.append('name', uploadName.trim());

      const res = await fetch('/api/library', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      setShowUpload(false);
      setUploadName('');
      mutate();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/library/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        console.error(`[Library] Delete failed: ${res.status}`);
      }
      mutate();
    } catch (error) {
      console.error('[Library] Delete failed:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-gray-500 transition-colors hover:text-primary-600"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <BookOpen className="h-6 w-6 text-primary-600" />
            <h1 className="font-heading text-2xl font-bold text-gray-900">
              {t('title')}
            </h1>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" />
            {t('addItem')}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          {(Object.keys(TAB_CONFIG) as TabType[]).map((tab) => {
            const config = TAB_CONFIG[tab];
            const Icon = config.icon;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon className="h-4 w-4" />
                {t(`tabs.${config.label}`)}
              </button>
            );
          })}
        </div>

        {/* Description */}
        <p className="mt-4 text-sm text-gray-500">{t(`descriptions.${activeTab}`)}</p>

        {/* Error */}
        {isError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{tc('error')}</span>
            <button
              onClick={() => mutate()}
              className="ml-auto text-xs font-medium underline hover:no-underline"
            >
              {tc('retry')}
            </button>
          </div>
        )}

        {/* Upload dialog */}
        {showUpload && (
          <div className="mt-6 rounded-2xl border border-primary-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-gray-900">
                {t('uploadTitle', { type: t(`tabs.${TAB_CONFIG[activeTab].label}`) })}
              </h3>
              <button onClick={() => { setShowUpload(false); setUploadError(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('itemName')}</label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder={t('itemNamePlaceholder')}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.tiff,.tif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? tc('processing') : t('selectFile')}
                </button>
              </div>

              {uploadError && (
                <p className="text-sm text-red-600">{uploadError}</p>
              )}
            </div>
          </div>
        )}

        {/* Items grid */}
        {isLoading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-2xl border-2 border-dashed border-gray-200 py-16">
            <BookOpen className="h-12 w-12 text-gray-300" />
            <p className="mt-4 text-gray-500">{t('noItems')}</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
            >
              <Plus className="h-4 w-4" />
              {t('addItem')}
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <LibraryItemCard key={item._id} item={item} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryItemCard({ item, onDelete }: { item: LibraryItem; onDelete: (id: string) => void }) {
  const t = useTranslations('library');
  const config = STATUS_CONFIG[item.status];
  const StatusIcon = config.icon;

  return (
    <div className="group rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:border-primary-100 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-heading text-lg font-semibold text-gray-900">
            {item.name}
          </h3>
          <p className="mt-1 truncate text-sm text-gray-500">{item.originalFilename}</p>
        </div>
        <button
          onClick={() => onDelete(item._id)}
          className="rounded-lg p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', config.color)}>
          <StatusIcon className={cn('h-3 w-3', item.status === 'processing' && 'animate-spin')} />
          {t(`status.${item.status}`)}
        </span>
        {item.usageCount > 0 && (
          <span className="text-xs text-gray-400">
            {t('usedCount', { count: item.usageCount })}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-gray-50 pt-4 text-xs text-gray-400">
        <span>{formatFileSize(item.sizeBytes)}</span>
        <span>{formatTimeAgo(new Date(item.createdAt))}</span>
        {item.status === 'failed' && item.processingError && (
          <span className="ml-auto flex items-center gap-1 text-red-400" title={item.processingError}>
            <AlertCircle className="h-3 w-3" />
            {t('processingFailed')}
          </span>
        )}
        {item.status === 'failed' && (
          <button
            onClick={async () => {
              await fetch(`/api/library/${item._id}`, { method: 'PUT', body: JSON.stringify({ name: item.name }), headers: { 'Content-Type': 'application/json' } });
            }}
            className="ml-auto flex items-center gap-1 text-primary-500 hover:text-primary-700"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
