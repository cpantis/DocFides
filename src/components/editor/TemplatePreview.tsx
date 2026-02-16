'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Copy, BookOpen, Table2, Calculator, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { EditorField, FieldStatus } from '@/lib/hooks/use-editor-state';

interface TemplatePreviewProps {
  projectName: string;
  fields: EditorField[];
  currentFieldIndex: number;
  onFieldClick: (index: number) => void;
}

/**
 * Content type configuration for color-coded field badges.
 */
const CONTENT_TYPE_CONFIG = {
  copy: {
    label: 'Copy',
    icon: Copy,
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-300',
    fill: 'bg-slate-50',
  },
  narrative: {
    label: 'Narrative',
    icon: BookOpen,
    bg: 'bg-purple-100',
    text: 'text-purple-600',
    border: 'border-purple-300',
    fill: 'bg-purple-50',
  },
  table_fill: {
    label: 'Table',
    icon: Table2,
    bg: 'bg-orange-100',
    text: 'text-orange-600',
    border: 'border-orange-300',
    fill: 'bg-orange-50',
  },
  computed: {
    label: 'Computed',
    icon: Calculator,
    bg: 'bg-cyan-100',
    text: 'text-cyan-600',
    border: 'border-cyan-300',
    fill: 'bg-cyan-50',
  },
  conditional: {
    label: 'Conditional',
    icon: GitBranch,
    bg: 'bg-amber-100',
    text: 'text-amber-600',
    border: 'border-amber-300',
    fill: 'bg-amber-50',
  },
} as const;

/**
 * Status indicator colors for field fill.
 */
const STATUS_FILL: Record<FieldStatus, string> = {
  pending: 'bg-yellow-50 border-yellow-200',
  accepted: 'bg-green-50 border-green-200',
  modified: 'bg-blue-50 border-blue-200',
  skipped: 'bg-gray-50 border-gray-200',
};

/**
 * Template preview showing a visual representation of the blank template
 * with color-coded field placeholders and hints.
 *
 * Each field is shown as a highlighted zone indicating:
 * - Content type (copy/narrative/table/computed/conditional) via color
 * - Current status (pending/accepted/modified/skipped) via fill
 * - Field number and hint text
 * - Estimated length indicator
 */
export function TemplatePreview({
  projectName,
  fields,
  currentFieldIndex,
  onFieldClick,
}: TemplatePreviewProps) {
  const t = useTranslations('project.editor');

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

  // Count fields by content type for legend
  const typeCounts = useMemo(() => {
    const counts: Partial<Record<EditorField['contentType'], number>> = {};
    for (const field of fields) {
      counts[field.contentType] = (counts[field.contentType] ?? 0) + 1;
    }
    return counts;
  }, [fields]);

  return (
    <div className="h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">{projectName}</h2>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          {t('templatePreviewSubtitle', { count: fields.length })}
        </p>

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

      {/* Template body */}
      <div className="px-6 py-4">
        {/* Simulated document */}
        <div className="mx-auto max-w-[600px] rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Document header */}
          <div className="border-b border-gray-100 px-6 py-4">
            <div className="h-2 w-32 rounded bg-gray-200" />
            <div className="mt-2 h-2 w-48 rounded bg-gray-100" />
          </div>

          {/* Sections with field placeholders */}
          <div className="px-6 py-4">
            {sections.map(([sectionName, { fields: sectionFields, indices }]) => (
              <div key={sectionName} className="mb-6 last:mb-0">
                {/* Section heading */}
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    {sectionName}
                  </h3>
                </div>

                {/* Simulated paragraph lines before fields */}
                <div className="mb-2 space-y-1">
                  <div className="h-1.5 w-full rounded bg-gray-100" />
                  <div className="h-1.5 w-4/5 rounded bg-gray-100" />
                </div>

                {/* Field placeholders */}
                <div className="space-y-2">
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
                          'group relative w-full rounded-lg border-2 border-dashed p-3 text-left transition-all',
                          STATUS_FILL[field.status],
                          isActive && 'ring-2 ring-primary-500 ring-offset-1 border-primary-400',
                          !isActive && `hover:${typeConfig.border}`
                        )}
                      >
                        {/* Field number badge */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
                                typeConfig.bg, typeConfig.text
                              )}
                            >
                              {globalIdx + 1}
                            </span>
                            <Icon className={cn('h-3 w-3', typeConfig.text)} />
                            <span className="text-xs font-medium text-gray-700">
                              {field.label}
                            </span>
                          </div>
                          <span className={cn(
                            'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                            typeConfig.bg, typeConfig.text
                          )}>
                            {typeConfig.label}
                          </span>
                        </div>

                        {/* Hint */}
                        {field.hint && (
                          <p className="mt-1 text-[10px] text-gray-400 italic line-clamp-1">
                            {field.hint}
                          </p>
                        )}

                        {/* Visual placeholder lines */}
                        <div className="mt-2 space-y-1">
                          {field.contentType === 'narrative' ? (
                            // Multi-line for narrative fields
                            <>
                              <div className={cn('h-1.5 w-full rounded', typeConfig.fill)} />
                              <div className={cn('h-1.5 w-11/12 rounded', typeConfig.fill)} />
                              <div className={cn('h-1.5 w-4/5 rounded', typeConfig.fill)} />
                            </>
                          ) : field.contentType === 'table_fill' ? (
                            // Grid for table fields
                            <div className="flex gap-1">
                              {[1, 2, 3].map((i) => (
                                <div key={i} className={cn('h-3 flex-1 rounded', typeConfig.fill)} />
                              ))}
                            </div>
                          ) : (
                            // Single line for simple fields
                            <div className={cn('h-1.5 w-3/5 rounded', typeConfig.fill)} />
                          )}
                        </div>

                        {/* Current value preview if set */}
                        {field.currentValue && field.status !== 'pending' && (
                          <p className={cn(
                            'mt-2 rounded px-2 py-1 text-[10px]',
                            field.status === 'accepted' && 'bg-green-50 text-green-700',
                            field.status === 'modified' && 'bg-blue-50 text-blue-700',
                            field.status === 'skipped' && 'bg-gray-50 text-gray-400 line-through',
                          )}>
                            {field.currentValue.slice(0, 80)}
                            {field.currentValue.length > 80 && '...'}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Simulated text after fields */}
                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full rounded bg-gray-100" />
                  <div className="h-1.5 w-2/3 rounded bg-gray-100" />
                </div>
              </div>
            ))}

            {fields.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText className="h-12 w-12 text-gray-200" />
                <p className="mt-3 text-sm text-gray-400">{t('noFields')}</p>
              </div>
            )}
          </div>

          {/* Document footer */}
          <div className="border-t border-gray-100 px-6 py-3">
            <div className="h-1.5 w-24 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
