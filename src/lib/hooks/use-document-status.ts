'use client';

import useSWR from 'swr';

interface DocumentStatus {
  documentId: string;
  status: 'uploaded' | 'processing' | 'extracted' | 'failed';
  filename: string;
  role: string;
  confidence: number | null;
  language: string | null;
  blockCount: number;
  tableCount: number;
  processingTimeMs: number | null;
  errors: string[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useDocumentStatus(documentId: string | null) {
  const { data, error, isLoading } = useSWR<{ data: DocumentStatus }>(
    documentId ? `/api/documents/${documentId}/status` : null,
    fetcher,
    {
      refreshInterval: (latestData) => {
        // Poll every 2s while processing, stop once done
        const status = latestData?.data?.status;
        if (status === 'uploaded' || status === 'processing') return 2000;
        return 0;
      },
    }
  );

  return {
    status: data?.data,
    isLoading,
    isError: !!error,
  };
}

export type { DocumentStatus };
