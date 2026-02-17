'use client';

import useSWR from 'swr';

export interface Tag {
  _id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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
