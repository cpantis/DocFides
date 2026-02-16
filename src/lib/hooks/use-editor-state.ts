'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';

export type FieldStatus = 'pending' | 'accepted' | 'modified' | 'skipped';

export interface FieldSuggestion {
  entity?: string;
  value: string;
  sourceFile?: string;
}

export interface EditorField {
  id: string;
  label: string;
  hint: string;
  expectedType: 'text' | 'number' | 'date' | 'list' | 'narrative';
  contentType: 'copy' | 'narrative' | 'table_fill' | 'computed' | 'conditional';
  section: string;
  suggestions: FieldSuggestion[];
  confidence: number;
  status: FieldStatus;
  currentValue: string;
  originalValue: string;
  selectedEntity?: string;
}

export interface EditorSnapshot {
  fieldId: string;
  previousValue: string;
  previousStatus: FieldStatus;
  previousEntity?: string;
}

interface EditorState {
  fields: EditorField[];
  currentFieldIndex: number;
  undoStack: EditorSnapshot[];
  isSaving: boolean;
  isRegenerating: string | null;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Main editor state management hook.
 * Fetches field completions from project and manages user interactions.
 */
export function useEditorState(projectId: string) {
  const { data: projectData, mutate: mutateProject } = useSWR<{ data: Record<string, unknown> }>(
    projectId ? `/api/projects/${projectId}` : null,
    fetcher
  );

  const [state, setState] = useState<EditorState>({
    fields: [],
    currentFieldIndex: 0,
    undoStack: [],
    isSaving: false,
    isRegenerating: null,
  });

  const [initialized, setInitialized] = useState(false);

  // Initialize fields from project data
  if (projectData?.data && !initialized) {
    const project = projectData.data;
    const fieldCompletions = (project.fieldCompletions ?? {}) as Record<string, unknown>;
    const templateSchema = (project.templateSchema ?? {}) as Record<string, unknown>;
    const qualityReport = (project.qualityReport ?? {}) as Record<string, unknown>;
    const fieldScores = (qualityReport.field_scores ?? {}) as Record<string, Record<string, number>>;

    const schemaFields = (templateSchema.fields ?? []) as Record<string, unknown>[];
    const completions = (fieldCompletions.fields ?? fieldCompletions) as Record<string, unknown>;

    const editorFields: EditorField[] = schemaFields.map((sf, idx) => {
      const fieldId = (sf.id as string) ?? `field_${idx}`;
      const completion = completions[fieldId];
      const scores = fieldScores[fieldId];
      const avgConfidence = scores
        ? Math.round(
            ((scores.accuracy ?? 0) + (scores.style ?? 0) +
              (scores.completeness ?? 0) + (scores.coherence ?? 0)) / 4
          )
        : 80;

      let suggestions: FieldSuggestion[] = [];
      let primaryValue = '';

      if (typeof completion === 'string') {
        suggestions = [{ value: completion }];
        primaryValue = completion;
      } else if (Array.isArray(completion)) {
        suggestions = (completion as Record<string, unknown>[]).map((s) => ({
          entity: s.entity as string | undefined,
          value: (s.value as string) ?? '',
          sourceFile: s.source_file as string | undefined,
        }));
        primaryValue = suggestions[0]?.value ?? '';
      } else if (typeof completion === 'object' && completion !== null) {
        const c = completion as Record<string, unknown>;
        if (Array.isArray(c.suggestions)) {
          suggestions = (c.suggestions as Record<string, unknown>[]).map((s) => ({
            entity: s.entity as string | undefined,
            value: (s.value as string) ?? '',
            sourceFile: s.source_file as string | undefined,
          }));
          primaryValue = suggestions[0]?.value ?? '';
        } else {
          const val = (c.value as string) ?? (c.text as string) ?? '';
          suggestions = [{ value: val }];
          primaryValue = val;
        }
      }

      return {
        id: fieldId,
        label: (sf.hint as string) ?? (sf.id as string) ?? `Field ${idx + 1}`,
        hint: (sf.userHint as string) ?? (sf.hint as string) ?? '',
        expectedType: (sf.expectedType as EditorField['expectedType']) ?? 'text',
        contentType: (sf.contentType as EditorField['contentType']) ?? 'copy',
        section: ((sf.location as Record<string, unknown>)?.section as string) ?? '',
        suggestions,
        confidence: avgConfidence,
        status: 'pending' as FieldStatus,
        currentValue: primaryValue,
        originalValue: primaryValue,
        selectedEntity: suggestions.length > 1 ? undefined : suggestions[0]?.entity,
      };
    });

    setState((prev) => ({ ...prev, fields: editorFields }));
    setInitialized(true);
  }

  // Navigation
  const goToField = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      currentFieldIndex: Math.max(0, Math.min(index, prev.fields.length - 1)),
    }));
  }, []);

  const goToNextPending = useCallback(() => {
    setState((prev) => {
      const nextIdx = prev.fields.findIndex(
        (f, i) => i > prev.currentFieldIndex && f.status === 'pending'
      );
      if (nextIdx !== -1) {
        return { ...prev, currentFieldIndex: nextIdx };
      }
      // Wrap around
      const wrapIdx = prev.fields.findIndex((f) => f.status === 'pending');
      if (wrapIdx !== -1) {
        return { ...prev, currentFieldIndex: wrapIdx };
      }
      return prev;
    });
  }, []);

  // Field actions
  const acceptField = useCallback((fieldId: string) => {
    setState((prev) => {
      const idx = prev.fields.findIndex((f) => f.id === fieldId);
      if (idx === -1) return prev;

      const field = prev.fields[idx]!;
      const snapshot: EditorSnapshot = {
        fieldId,
        previousValue: field.currentValue,
        previousStatus: field.status,
        previousEntity: field.selectedEntity,
      };

      const updatedFields = [...prev.fields];
      updatedFields[idx] = { ...field, status: 'accepted' };

      return {
        ...prev,
        fields: updatedFields,
        undoStack: [...prev.undoStack, snapshot],
      };
    });
  }, []);

  const editField = useCallback((fieldId: string, newValue: string) => {
    setState((prev) => {
      const idx = prev.fields.findIndex((f) => f.id === fieldId);
      if (idx === -1) return prev;

      const field = prev.fields[idx]!;
      const snapshot: EditorSnapshot = {
        fieldId,
        previousValue: field.currentValue,
        previousStatus: field.status,
        previousEntity: field.selectedEntity,
      };

      const updatedFields = [...prev.fields];
      updatedFields[idx] = { ...field, status: 'modified', currentValue: newValue };

      return {
        ...prev,
        fields: updatedFields,
        undoStack: [...prev.undoStack, snapshot],
      };
    });
  }, []);

  const skipField = useCallback((fieldId: string) => {
    setState((prev) => {
      const idx = prev.fields.findIndex((f) => f.id === fieldId);
      if (idx === -1) return prev;

      const field = prev.fields[idx]!;
      const snapshot: EditorSnapshot = {
        fieldId,
        previousValue: field.currentValue,
        previousStatus: field.status,
        previousEntity: field.selectedEntity,
      };

      const updatedFields = [...prev.fields];
      updatedFields[idx] = { ...field, status: 'skipped' };

      return {
        ...prev,
        fields: updatedFields,
        undoStack: [...prev.undoStack, snapshot],
      };
    });
  }, []);

  const selectEntity = useCallback((fieldId: string, entity: string, value: string) => {
    setState((prev) => {
      const idx = prev.fields.findIndex((f) => f.id === fieldId);
      if (idx === -1) return prev;

      const field = prev.fields[idx]!;
      const snapshot: EditorSnapshot = {
        fieldId,
        previousValue: field.currentValue,
        previousStatus: field.status,
        previousEntity: field.selectedEntity,
      };

      const updatedFields = [...prev.fields];
      updatedFields[idx] = {
        ...field,
        status: 'accepted',
        currentValue: value,
        selectedEntity: entity,
      };

      // Auto-fill related fields in same section with same entity
      const sectionFields = updatedFields.filter(
        (f, i) =>
          i !== idx &&
          f.section === field.section &&
          f.status === 'pending' &&
          f.suggestions.length > 1
      );

      for (const relField of sectionFields) {
        const relIdx = updatedFields.indexOf(relField);
        const matchingSuggestion = relField.suggestions.find((s) => s.entity === entity);
        if (matchingSuggestion) {
          updatedFields[relIdx] = {
            ...relField,
            status: 'accepted',
            currentValue: matchingSuggestion.value,
            selectedEntity: entity,
          };
        }
      }

      return {
        ...prev,
        fields: updatedFields,
        undoStack: [...prev.undoStack, snapshot],
      };
    });
  }, []);

  // Undo
  const undoField = useCallback((fieldId: string) => {
    setState((prev) => {
      const snapshotIdx = [...prev.undoStack].reverse().findIndex((s) => s.fieldId === fieldId);
      if (snapshotIdx === -1) return prev;

      const actualIdx = prev.undoStack.length - 1 - snapshotIdx;
      const snapshot = prev.undoStack[actualIdx]!;
      const fieldIdx = prev.fields.findIndex((f) => f.id === fieldId);
      if (fieldIdx === -1) return prev;

      const updatedFields = [...prev.fields];
      updatedFields[fieldIdx] = {
        ...updatedFields[fieldIdx]!,
        status: snapshot.previousStatus,
        currentValue: snapshot.previousValue,
        selectedEntity: snapshot.previousEntity,
      };

      const updatedStack = prev.undoStack.filter((_, i) => i !== actualIdx);

      return { ...prev, fields: updatedFields, undoStack: updatedStack };
    });
  }, []);

  const undoAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => ({
        ...f,
        status: 'pending' as FieldStatus,
        currentValue: f.originalValue,
        selectedEntity: f.suggestions.length > 1 ? undefined : f.suggestions[0]?.entity,
      })),
      undoStack: [],
    }));
  }, []);

  // Save to backend
  const saveFields = useCallback(async () => {
    setState((prev) => ({ ...prev, isSaving: true }));
    try {
      const fieldUpdates = state.fields
        .filter((f) => f.status !== 'pending')
        .map((f) => ({
          fieldId: f.id,
          status: f.status,
          value: f.currentValue,
          selectedEntity: f.selectedEntity,
        }));

      await fetch(`/api/projects/${projectId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fieldUpdates }),
      });

      await mutateProject();
    } finally {
      setState((prev) => ({ ...prev, isSaving: false }));
    }
  }, [projectId, state.fields, mutateProject]);

  // Regenerate single field
  const regenerateField = useCallback(async (fieldId: string) => {
    setState((prev) => ({ ...prev, isRegenerating: fieldId }));
    try {
      const res = await fetch(`/api/projects/${projectId}/fields/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldId }),
      });

      if (res.ok) {
        const result = await res.json();
        const newValue = (result.data?.value as string) ?? '';

        setState((prev) => {
          const idx = prev.fields.findIndex((f) => f.id === fieldId);
          if (idx === -1) return prev;

          const field = prev.fields[idx]!;
          const updatedFields = [...prev.fields];
          updatedFields[idx] = {
            ...field,
            currentValue: newValue,
            suggestions: [{ value: newValue }],
            status: 'pending',
          };

          return { ...prev, fields: updatedFields };
        });
      }
    } finally {
      setState((prev) => ({ ...prev, isRegenerating: null }));
    }
  }, [projectId]);

  // Computed values
  const currentField = state.fields[state.currentFieldIndex];

  const progress = useMemo(() => {
    const total = state.fields.length;
    const completed = state.fields.filter((f) => f.status !== 'pending').length;
    return { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [state.fields]);

  const hasUnsavedChanges = state.undoStack.length > 0;

  return {
    fields: state.fields,
    currentField,
    currentFieldIndex: state.currentFieldIndex,
    progress,
    isSaving: state.isSaving,
    isRegenerating: state.isRegenerating,
    hasUnsavedChanges,
    goToField,
    goToNextPending,
    acceptField,
    editField,
    skipField,
    selectEntity,
    undoField,
    undoAll,
    saveFields,
    regenerateField,
  };
}
