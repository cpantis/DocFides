'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';
import type { LibraryItemType } from '@/lib/db/models/library-item';

export interface LibraryDocument {
  _id: string;
  originalFilename: string;
  format: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  mimeType: string;
  status: 'uploaded' | 'processing' | 'extracted' | 'failed';
  uploadedAt: string;
}

export interface LibraryItemData {
  _id: string;
  userId: string;
  type: LibraryItemType;
  name: string;
  description?: string;
  documents: LibraryDocument[];
  processedData?: Record<string, unknown>;
  status: 'draft' | 'processing' | 'ready' | 'error';
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

function useLibraryItems(type: LibraryItemType) {
  const endpoint = `/api/library/${type === 'template' ? 'templates' : type === 'model' ? 'models' : 'entities'}`;
  const { data, error, isLoading, mutate } = useSWR<{ data: LibraryItemData[] }>(
    endpoint,
    fetcher,
    {
      // Auto-refresh when any item is in 'processing' state
      refreshInterval: (latestData) => {
        const items = latestData?.data ?? [];
        const hasProcessing = items.some((item) => item.status === 'processing');
        return hasProcessing ? 3000 : 0;
      },
    }
  );

  return {
    items: data?.data ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}

function useLibraryItem(type: LibraryItemType, id: string | null) {
  const segment = type === 'template' ? 'templates' : type === 'model' ? 'models' : 'entities';
  const { data, error, isLoading, mutate } = useSWR<{ data: LibraryItemData }>(
    id ? `/api/library/${segment}/${id}` : null,
    fetcher
  );

  return {
    item: data?.data,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useTemplates() {
  return useLibraryItems('template');
}

export function useTemplate(id: string | null) {
  return useLibraryItem('template', id);
}

export function useModels() {
  return useLibraryItems('model');
}

export function useModel(id: string | null) {
  return useLibraryItem('model', id);
}
