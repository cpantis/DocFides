'use client';

import { useTranslations } from 'next-intl';
import { Building2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { FieldSuggestion } from '@/lib/hooks/use-editor-state';

interface EntitySelectorProps {
  fieldId: string;
  label: string;
  fieldNumber: number;
  suggestions: FieldSuggestion[];
  selectedEntity?: string;
  onSelect: (fieldId: string, entity: string, value: string) => void;
}

/**
 * Entity disambiguation card.
 * Shown when the Writing Agent provides multiple suggestions (one per entity).
 * User picks the correct entity, auto-filling related fields in the same section.
 */
export function EntitySelector({
  fieldId,
  label,
  fieldNumber,
  suggestions,
  selectedEntity,
  onSelect,
}: EntitySelectorProps) {
  const t = useTranslations('project.editor');

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
          {fieldNumber}
        </span>
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
      </div>

      <p className="mt-2 text-xs text-amber-700 font-medium">
        {t('multipleSuggestions')}
      </p>

      {/* Entity cards */}
      <div className="mt-3 space-y-2">
        {suggestions.map((suggestion) => {
          const isSelected = selectedEntity === suggestion.entity;
          return (
            <button
              key={suggestion.entity ?? suggestion.value}
              onClick={() =>
                onSelect(fieldId, suggestion.entity ?? 'unknown', suggestion.value)
              }
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-all',
                isSelected
                  ? 'border-green-400 bg-green-50 ring-1 ring-green-400'
                  : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-primary-50/30'
              )}
            >
              <div className="flex items-center gap-2">
                <Building2 className={cn(
                  'h-4 w-4',
                  isSelected ? 'text-green-600' : 'text-gray-400'
                )} />
                <span className={cn(
                  'text-xs font-semibold uppercase tracking-wider',
                  isSelected ? 'text-green-700' : 'text-gray-500'
                )}>
                  {suggestion.entity ?? 'Entity'}
                </span>
              </div>

              <p className="mt-1.5 text-sm text-gray-700 line-clamp-2">
                {suggestion.value}
              </p>

              {suggestion.sourceFile && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
                  <FileText className="h-3 w-3" />
                  {t('entitySource', { filename: suggestion.sourceFile })}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
