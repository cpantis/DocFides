'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Pencil, RotateCcw, SkipForward, Undo2, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { ConfidenceBadge } from '@/components/project/ConfidenceBadge';
import type { EditorField, FieldStatus } from '@/lib/hooks/use-editor-state';

interface FieldCardProps {
  field: EditorField;
  fieldNumber: number;
  isActive: boolean;
  isRegenerating: boolean;
  onAccept: (fieldId: string) => void;
  onEdit: (fieldId: string, value: string) => void;
  onSkip: (fieldId: string) => void;
  onRegenerate: (fieldId: string) => void;
  onUndo: (fieldId: string) => void;
  onClick: () => void;
}

const STATUS_STYLES: Record<FieldStatus, { bg: string; badge: string; icon: typeof Check }> = {
  pending: { bg: 'border-gray-200', badge: '', icon: Check },
  accepted: { bg: 'border-green-300 bg-green-50/30', badge: 'bg-green-100 text-green-700', icon: Check },
  modified: { bg: 'border-blue-300 bg-blue-50/30', badge: 'bg-blue-100 text-blue-700', icon: Pencil },
  skipped: { bg: 'border-gray-300 bg-gray-50/50', badge: 'bg-gray-100 text-gray-500', icon: SkipForward },
};

export function FieldCard({
  field,
  fieldNumber,
  isActive,
  isRegenerating,
  onAccept,
  onEdit,
  onSkip,
  onRegenerate,
  onUndo,
  onClick,
}: FieldCardProps) {
  const t = useTranslations('project.editor');
  const tc = useTranslations('common');
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(field.currentValue);

  const statusStyle = STATUS_STYLES[field.status];

  const handleStartEdit = () => {
    setEditValue(field.currentValue);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    onEdit(field.id, editValue);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue(field.currentValue);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 transition-all cursor-pointer',
        statusStyle.bg,
        isActive && 'ring-2 ring-primary-500 ring-offset-1',
        !isActive && 'hover:border-gray-300'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
            {fieldNumber}
          </span>
          <h3 className="text-sm font-semibold text-gray-900 line-clamp-1">
            {field.label}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {field.status !== 'pending' && (
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusStyle.badge)}>
              {t(field.status)}
            </span>
          )}
          <ConfidenceBadge score={field.confidence} showLabel={false} size="sm" />
        </div>
      </div>

      {/* Hint */}
      {field.hint && (
        <p className="mt-1.5 text-xs text-gray-400 line-clamp-1">{field.hint}</p>
      )}

      {/* Suggestion / Edit area */}
      <div className="mt-3">
        {isEditing ? (
          <div className="space-y-2">
            {field.expectedType === 'narrative' ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
            ) : (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
            )}
            <div className="flex gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                className="flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
              >
                <Check className="h-3 w-3" />
                {t('accept')}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
                className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <X className="h-3 w-3" />
                {tc('cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={cn(
              'rounded-lg bg-white/60 px-3 py-2 text-sm text-gray-700 border border-gray-100',
              field.status === 'skipped' && 'line-through text-gray-400',
              field.expectedType === 'narrative' && 'line-clamp-4',
              field.expectedType !== 'narrative' && 'line-clamp-2'
            )}>
              {field.currentValue || '—'}
            </p>

            {/* Action buttons */}
            {isActive && field.status !== 'skipped' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {field.status === 'pending' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAccept(field.id); }}
                    className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    <Check className="h-3 w-3" />
                    {t('accept')}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <Pencil className="h-3 w-3" />
                  {t('edit')}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRegenerate(field.id); }}
                  disabled={isRegenerating}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isRegenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  {t('regenerate')}
                </button>
                {field.status === 'pending' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSkip(field.id); }}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-50"
                  >
                    <SkipForward className="h-3 w-3" />
                    {t('skip')}
                  </button>
                )}
              </div>
            )}

            {/* Undo button for non-pending fields */}
            {isActive && field.status !== 'pending' && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); onUndo(field.id); }}
                  className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  <Undo2 className="h-3 w-3" />
                  {t('undoField')}
                </button>
                {field.status !== 'skipped' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Pencil className="h-3 w-3" />
                    {t('edit')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
