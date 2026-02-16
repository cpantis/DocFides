'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Copy, BookOpen, Table2, Calculator, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { EditorField, FieldStatus } from '@/lib/hooks/use-editor-state';
import useSWR from 'swr';

interface TemplatePreviewProps {
  projectId: string;
  projectName: string;
  fields: EditorField[];
  currentFieldIndex: number;
  onFieldClick: (index: number) => void;
}

const CONTENT_TYPE_CONFIG = {
  copy: { label: 'Copy', icon: Copy, bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-300' },
  narrative: { label: 'Narrative', icon: BookOpen, bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-300' },
  table_fill: { label: 'Table', icon: Table2, bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-300' },
  computed: { label: 'Computed', icon: Calculator, bg: 'bg-cyan-100', text: 'text-cyan-600', border: 'border-cyan-300' },
  conditional: { label: 'Conditional', icon: GitBranch, bg: 'bg-amber-100', text: 'text-amber-600', border: 'border-amber-300' },
} as const;

const STATUS_FILL: Record<FieldStatus, string> = {
  pending: 'border-yellow-300 bg-yellow-50',
  accepted: 'border-green-300 bg-green-50',
  modified: 'border-blue-300 bg-blue-50',
  skipped: 'border-gray-300 bg-gray-50',
};

interface TextsResponse {
  data: {
    template: { filename: string; text: string; tables: Record<string, unknown>[] }[];
    sources: { filename: string; text: string }[];
    model: { filename: string; text: string }[];
  };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Template preview showing the REAL extracted document text
 * with field annotations shown as inline cards between paragraphs.
 */
export function TemplatePreview({
  projectId,
  projectName,
  fields,
  currentFieldIndex,
  onFieldClick,
}: TemplatePreviewProps) {
  const t = useTranslations('project.editor');

  const { data: textsData } = useSWR<TextsResponse>(
    `/api/projects/${projectId}/texts`,
    fetcher
  );

  const templateText = textsData?.data?.template?.[0]?.text ?? null;
  const templateFilename = textsData?.data?.template?.[0]?.filename ?? '';

  // Split text into paragraphs
  const paragraphs = useMemo(() => {
    if (!templateText) return [];
    return templateText
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }, [templateText]);

  // Group fields by section for the field sidebar
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

  // Count fields by content type for legend
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<EditorField['contentType'], number>> = {};
    for (const field of fields) {
      counts[field.contentType] = (counts[field.contentType] ?? 0) + 1;
    }
    return counts;
  }, [fields]);

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">{projectName}</h2>
        </div>
        {templateFilename && (
          <p className="mt-0.5 text-xs text-gray-400">{templateFilename}</p>
        )}

        {/* Color legend */}
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(CONTENT_TYPE_CONFIG).map(([type, config]) => {
            const count = typeCounts[type as EditorField['contentType']];
            if (!count) return null;
            const Icon = config.icon;
            return (
              <div
                key={type}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  config.bg, config.text
                )}
              >
                <Icon className="h-2.5 w-2.5" />
                {config.label} ({count})
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-6 py-4">
        {/* Actual document content */}
        {templateText ? (
          <div className="mx-auto max-w-[640px]">
            {/* Document paper */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="px-8 py-6">
                {/* Render real text paragraphs */}
                <div className="space-y-3">
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
            </div>

            {/* Field annotations below the document */}
            <div className="mt-6">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                {t('detectedFields', { count: fields.length })}
              </h3>
              <div className="space-y-4">
                {sections.map(([sectionName, { fields: sectionFields, indices }]) => (
                  <div key={sectionName}>
                    <p className="mb-2 text-[11px] font-semibold text-gray-500">{sectionName}</p>
                    <div className="space-y-1.5">
                      {sectionFields.map((field, localIdx) => {
                        const globalIdx = indices[localIdx]!;
                        const isActive = globalIdx === currentFieldIndex;
                        const typeConfig = CONTENT_TYPE_CONFIG[field.contentType] ?? CONTENT_TYPE_CONFIG.copy;
                        const Icon = typeConfig.icon;

                        return (
                          <button
                            key={field.id}
                            onClick={() => onFieldClick(globalIdx)}
                            className={cn(
                              'flex w-full items-center gap-2.5 rounded-lg border-2 border-dashed px-3 py-2 text-left transition-all',
                              STATUS_FILL[field.status],
                              isActive && 'ring-2 ring-primary-500 ring-offset-1 border-primary-400'
                            )}
                          >
                            <span className={cn(
                              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold',
                              typeConfig.bg, typeConfig.text
                            )}>
                              {globalIdx + 1}
                            </span>
                            <Icon className={cn('h-3 w-3 flex-shrink-0', typeConfig.text)} />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700">
                              {field.label}
                            </span>
                            {field.currentValue && field.status !== 'pending' && (
                              <span className="max-w-[120px] truncate text-[10px] text-gray-400">
                                {field.currentValue}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Loading or no text */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-gray-200" />
            <p className="mt-3 text-sm text-gray-400">
              {textsData ? t('noTemplateText') : t('loadingTemplate')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
