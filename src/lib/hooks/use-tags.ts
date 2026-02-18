'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';

export interface Tag {
  _id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export function useTags() {
  const { data, error, isLoading, mutate } = useSWR<{ data: Tag[] }>(
    '/api/tags',
    fetcher
  );

  return {
    tags: data?.data ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}
