'use client';

import { FileText } from 'lucide-react';
import { DocumentTagBadge } from './DocumentTagBadge';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';

interface SourceDoc {
  _id: string;
  originalFilename: string;
  status: string;
  format: string;
  sizeBytes: number;
  tagId?: string;
}

interface SourceDocumentListProps {
  projectId: string;
  /** Increment this to force SWR revalidation after uploads */
  refreshKey?: number;
}

export function SourceDocumentList({ projectId, refreshKey }: SourceDocumentListProps) {
  const { data, mutate } = useSWR<{ data: SourceDoc[] }>(
    `/api/projects/${projectId}/documents?role=source&v=${refreshKey ?? 0}`,
    fetcher
  );

  const docs = data?.data ?? [];
  if (docs.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      {docs.map((doc) => (
        <div
          key={doc._id}
          className="flex items-center gap-2.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
        >
          <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
            {doc.originalFilename}
          </span>
          <DocumentTagBadge
            documentId={doc._id}
            currentTagId={doc.tagId}
            onTagChange={() => mutate()}
          />
          <span className="flex-shrink-0 text-xs text-gray-400">
            {(doc.sizeBytes / (1024 * 1024)).toFixed(1)} MB
          </span>
        </div>
      ))}
    </div>
  );
}
