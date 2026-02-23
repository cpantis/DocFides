'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';

export interface EntityDocument {
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

export interface Entity {
  _id: string;
  userId: string;
  type: 'entity';
  name: string;
  description?: string;
  documents: EntityDocument[];
  processedData?: Record<string, unknown>;
  status: 'draft' | 'processing' | 'ready' | 'error';
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function useEntities() {
  const { data, error, isLoading, mutate } = useSWR<{ data: Entity[] }>(
    '/api/library/entities',
    fetcher
  );

  return {
    entities: data?.data ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useEntity(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ data: Entity }>(
    id ? `/api/library/entities/${id}` : null,
    fetcher
  );

  return {
    entity: data?.data,
    isLoading,
    isError: !!error,
    mutate,
  };
}
