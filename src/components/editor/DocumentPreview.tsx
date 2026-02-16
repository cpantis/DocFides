'use client';

import { useMemo } from 'react';
import { FileText, Check, Pencil, SkipForward } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { EditorField, FieldStatus } from '@/lib/hooks/use-editor-state';

interface DocumentPreviewProps {
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

/**
 * Left pane: document preview showing field positions with numbered badges.
 * Groups fields by section for visual organization.
 */
export function DocumentPreview({
  projectName,
  fields,
  currentFieldIndex,
  onFieldClick,
}: DocumentPreviewProps) {
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
    <div className="h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">{projectName}</h2>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          Template with {fields.length} fields
        </p>
      </div>

      {/* Document preview with field badges */}
      <div className="px-6 py-4">
        {sections.map(([sectionName, { fields: sectionFields, indices }]) => (
          <div key={sectionName} className="mb-6">
            {/* Section heading */}
            <div className="mb-3 border-b border-gray-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {sectionName}
              </h3>
            </div>

            {/* Fields in section */}
            <div className="space-y-2">
              {sectionFields.map((field, localIdx) => {
                const globalIdx = indices[localIdx]!;
                const isActive = globalIdx === currentFieldIndex;
                const StatusIcon = STATUS_ICONS[field.status];

                return (
                  <button
                    key={field.id}
                    onClick={() => onFieldClick(globalIdx)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all',
                      isActive
                        ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400'
                        : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    {/* Field number badge */}
                    <span
                      className={cn(
                        'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                        STATUS_COLORS[field.status],
                        isActive && field.status === 'pending' && 'bg-primary-100 text-primary-700 border-primary-400'
                      )}
                    >
                      {StatusIcon ? (
                        <StatusIcon className="h-3 w-3" />
                      ) : (
                        globalIdx + 1
                      )}
                    </span>

                    {/* Field content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700 line-clamp-1">
                          {field.label}
                        </span>
                        <span className={cn(
                          'rounded px-1 py-0.5 text-[10px] font-medium',
                          field.contentType === 'narrative'
                            ? 'bg-purple-50 text-purple-600'
                            : field.contentType === 'table_fill'
                            ? 'bg-orange-50 text-orange-600'
                            : field.contentType === 'computed'
                            ? 'bg-cyan-50 text-cyan-600'
                            : 'bg-gray-50 text-gray-500'
                        )}>
                          {field.contentType}
                        </span>
                      </div>

                      {/* Preview of current value */}
                      <p className={cn(
                        'mt-1 text-xs line-clamp-2',
                        field.status === 'skipped'
                          ? 'text-gray-300 line-through'
                          : field.currentValue
                          ? 'text-gray-500'
                          : 'text-gray-300 italic'
                      )}>
                        {field.currentValue || 'Not yet filled'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {fields.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-gray-200" />
            <p className="mt-3 text-sm text-gray-400">No template fields detected</p>
          </div>
        )}
      </div>
    </div>
  );
}
