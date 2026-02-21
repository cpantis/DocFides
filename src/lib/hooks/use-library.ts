'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';

export interface LibraryItem {
  _id: string;
  userId: string;
  type: 'template' | 'model' | 'entity';
  name: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  fileHash: string;
  storageKey: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  processedData?: Record<string, unknown>;
  processingError?: string;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface LibraryResponse {
  data: LibraryItem[];
}

export function useLibrary(type?: 'template' | 'model' | 'entity') {
  const url = type ? `/api/library?type=${type}` : '/api/library';
  const { data, error, isLoading, mutate } = useSWR<LibraryResponse>(
    url,
    fetcher,
    { refreshInterval: 5000 }
  );

  return {
    items: data?.data ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useLibraryItem(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ data: LibraryItem }>(
    id ? `/api/library/${id}` : null,
    fetcher
  );

  return {
    item: data?.data,
    isLoading,
    isError: !!error,
    mutate,
  };
}
