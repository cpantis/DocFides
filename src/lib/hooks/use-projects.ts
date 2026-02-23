'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';

interface LibraryRefData {
  libraryItemId: string;
  name: string;
  processedData?: Record<string, unknown>;
  copiedAt: string;
}

interface Project {
  _id: string;
  name: string;
  status: 'draft' | 'uploading' | 'processing' | 'ready' | 'exported';
  sourceDocuments: string[];
  templateDocument?: string;
  modelDocuments: string[];
  libraryRefs?: {
    template?: LibraryRefData;
    model?: LibraryRefData;
    entities?: LibraryRefData[];
  };
  aiCost?: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsResponse {
  data: Project[];
}

export function useProjects() {
  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>(
    '/api/projects',
    fetcher
  );

  return {
    projects: data?.data ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}

export function useProject(id: string) {
  const { data, error, isLoading, mutate } = useSWR<{ data: Project }>(
    id ? `/api/projects/${id}` : null,
    fetcher
  );

  return {
    project: data?.data,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export type { Project };
