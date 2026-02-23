'use client';

import { useTranslations } from 'next-intl';
import { Save, Undo2, Loader2 } from 'lucide-react';
import { FieldCard } from './FieldCard';
import { EntitySelector } from './EntitySelector';
import type { EditorField } from '@/lib/hooks/use-editor-state';

interface SuggestionWizardProps {
  pageFields: EditorField[];
  pageFieldIndices: number[];
  currentFieldIndex: number;
  progress: { total: number; completed: number; percentage: number };
  isSaving: boolean;
  isRegenerating: string | null;
  hasUnsavedChanges: boolean;
  onGoToField: (index: number) => void;
  onAccept: (fieldId: string) => void;
  onEdit: (fieldId: string, value: string) => void;
  onSkip: (fieldId: string) => void;
  onRegenerate: (fieldId: string) => void;
  onUndo: (fieldId: string) => void;
  onUndoAll: () => void;
  onSave: () => void;
  onSelectEntity: (fieldId: string, entity: string, value: string) => void;
}

/**
 * Right-pane suggestion wizard: field list with progress bar,
 * navigation, and action buttons.
 */
export function SuggestionWizard({
  pageFields,
  pageFieldIndices,
  currentFieldIndex,
  progress,
  isSaving,
  isRegenerating,
  hasUnsavedChanges,
  onGoToField,
  onAccept,
  onEdit,
  onSkip,
  onRegenerate,
  onUndo,
  onUndoAll,
  onSave,
  onSelectEntity,
}: SuggestionWizardProps) {
  const t = useTranslations('project.editor');

  return (
    <div className="flex h-full flex-col">
      {/* Sticky header with progress */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            {t('title')}
          </h2>
          <span className="text-xs text-gray-500">
            {progress.completed}/{progress.total}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>

        {/* Actions */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? 'Saving...' : 'Save Progress'}
          </button>
          <button
            onClick={onUndoAll}
            disabled={!hasUnsavedChanges}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t('undoAll')}
          </button>
        </div>
      </div>

      {/* Field list — shows only fields for the current template page */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-3">
          {pageFields.map((field, localIdx) => {
            const globalIdx = pageFieldIndices[localIdx]!;
            const pageNumber = localIdx + 1;

            // Show EntitySelector for multi-suggestion fields that haven't been resolved
            if (field.suggestions.length > 1 && field.status === 'pending') {
              return (
                <EntitySelector
                  key={field.id}
                  fieldId={field.id}
                  label={field.label}
                  fieldNumber={pageNumber}
                  suggestions={field.suggestions}
                  selectedEntity={field.selectedEntity}
                  onSelect={onSelectEntity}
                />
              );
            }

            return (
              <FieldCard
                key={field.id}
                field={field}
                fieldNumber={pageNumber}
                isActive={globalIdx === currentFieldIndex}
                isRegenerating={isRegenerating === field.id}
                onAccept={onAccept}
                onEdit={onEdit}
                onSkip={onSkip}
                onRegenerate={onRegenerate}
                onUndo={onUndo}
                onClick={() => onGoToField(globalIdx)}
              />
            );
          })}

          {pageFields.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              {t('noFieldsOnPage')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
