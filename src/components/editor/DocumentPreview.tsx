'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Check, Pencil, SkipForward, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { EditorField, FieldStatus } from '@/lib/hooks/use-editor-state';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils/fetcher';

interface DocumentPreviewProps {
  projectId: string;
  projectName: string;
  fields: EditorField[];
  currentFieldIndex: number;
  onFieldClick: (index: number) => void;
}

const STATUS_COLORS: Record<FieldStatus, string> = {
  pending: 'bg-gray-100 text-gray-600 border-gray-300',
  accepted: 'bg-green-100 text-green-700 border-green-400',
  modified: 'bg-blue-100 text-blue-700 border-blue-400',
  skipped: 'bg-gray-100 text-gray-400 border-gray-300',
};

const STATUS_ICONS: Record<FieldStatus, typeof Check | null> = {
  pending: null,
  accepted: Check,
  modified: Pencil,
  skipped: SkipForward,
};

interface TextsResponse {
  data: {
    template: { filename: string; text: string }[];
    sources: { filename: string; text: string }[];
    model: { filename: string; text: string }[];
  };
}

/**
 * Left pane: shows REAL source document texts with collapsible sections,
 * followed by field status list.
 */
export function DocumentPreview({
  projectId,
  projectName,
  fields,
  currentFieldIndex,
  onFieldClick,
}: DocumentPreviewProps) {
  const t = useTranslations('project.editor');

  const { data: textsData } = useSWR<TextsResponse>(
    `/api/projects/${projectId}/texts`,
    fetcher
  );

  const sources = textsData?.data?.sources ?? [];
  const [expandedDocs, setExpandedDocs] = useState<Set<number>>(new Set([0]));

  const toggleDoc = (idx: number) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Group fields by section
  const sections = useMemo(() => {
    const grouped: Record<string, { fields: EditorField[]; indices: number[] }> = {};
    fields.forEach((field, idx) => {
      const section = field.section || 'General';
      if (!grouped[section]) {
        grouped[section] = { fields: [], indices: [] };
      }
      grouped[section]!.fields.push(field);
      grouped[section]!.indices.push(idx);
    });
    return Object.entries(grouped);
  }, [fields]);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">{projectName}</h2>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          {sources.length > 0
            ? t('sourceDocCount', { count: sources.length })
            : t('noSourceDocs')}
        </p>
      </div>

      <div className="px-6 py-4">
        {/* Source documents */}
        {sources.length > 0 ? (
          <div className="space-y-3">
            {sources.map((doc, docIdx) => {
              const isExpanded = expandedDocs.has(docIdx);
              const paragraphs = doc.text
                .split(/\n{2,}/)
                .map((p) => p.trim())
                .filter((p) => p.length > 0);

              return (
                <div
                  key={docIdx}
                  className="rounded-lg border border-gray-200 bg-white shadow-sm"
                >
                  {/* Document header — click to expand/collapse */}
                  <button
                    onClick={() => toggleDoc(docIdx)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                      {doc.filename}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {paragraphs.length} {t('paragraphs')}
                    </span>
                  </button>

                  {/* Document content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-6 py-4">
                      <div className="space-y-2.5">
                        {paragraphs.map((paragraph, pIdx) => (
                          <p
                            key={pIdx}
                            className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : textsData ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-gray-200" />
            <p className="mt-3 text-sm text-gray-400">{t('noSourceDocs')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-gray-200" />
            <p className="mt-3 text-sm text-gray-400">{t('loadingDocs')}</p>
          </div>
        )}

        {/* Field status list */}
        {fields.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
              {t('fieldStatus')}
            </h3>
            {sections.map(([sectionName, { fields: sectionFields, indices }]) => (
              <div key={sectionName} className="mb-4">
                <div className="mb-2 border-b border-gray-100 pb-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    {sectionName}
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {sectionFields.map((field, localIdx) => {
                    const globalIdx = indices[localIdx]!;
                    const isActive = globalIdx === currentFieldIndex;
                    const StatusIcon = STATUS_ICONS[field.status];

                    return (
                      <button
                        key={field.id}
                        onClick={() => onFieldClick(globalIdx)}
                        className={cn(
                          'flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-all',
                          isActive
                            ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400'
                            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                        )}
                      >
                        <span className={cn(
                          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                          STATUS_COLORS[field.status],
                          isActive && field.status === 'pending' && 'bg-primary-100 text-primary-700 border-primary-400'
                        )}>
                          {StatusIcon ? (
                            <StatusIcon className="h-3 w-3" />
                          ) : (
                            globalIdx + 1
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium text-gray-700 line-clamp-1">
                            {field.label}
                          </span>
                          {field.currentValue && (
                            <p className={cn(
                              'mt-0.5 text-[10px] line-clamp-1',
                              field.status === 'skipped' ? 'text-gray-300 line-through' : 'text-gray-400'
                            )}>
                              {field.currentValue}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
