'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { useEditorState } from '@/lib/hooks/use-editor-state';
import { SplitScreen } from '@/components/editor/SplitScreen';
import { DocumentPreview } from '@/components/editor/DocumentPreview';
import { SuggestionWizard } from '@/components/editor/SuggestionWizard';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

interface EditorPageContentProps {
  projectId: string;
}

export function EditorPageContent({ projectId }: EditorPageContentProps) {
  const t = useTranslations('project.editor');
  const tc = useTranslations('common');
  const { project, isLoading } = useProject(projectId);

  const editor = useEditorState(projectId);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
        <p className="text-gray-500">Project not found</p>
        <Link href="/dashboard" className="mt-4 text-sm text-primary-600 hover:underline">
          {tc('back')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-heading text-lg font-bold text-gray-900">
              {t('title')}
            </h1>
            <p className="text-xs text-gray-400">{project.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress indicator */}
          <div className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
            <span className="font-mono text-xs">
              {editor.progress.completed}/{editor.progress.total}
            </span>
            <div className="h-1.5 w-24 rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${editor.progress.percentage}%` }}
              />
            </div>
          </div>

          {/* Export button */}
          <Link
            href={`/project/${projectId}/export`}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            {tc('export')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Split screen */}
      <div className="flex-1 overflow-hidden">
        <SplitScreen
          left={
            <DocumentPreview
              projectName={project.name}
              fields={editor.fields}
              currentFieldIndex={editor.currentFieldIndex}
              onFieldClick={editor.goToField}
            />
          }
          right={
            <SuggestionWizard
              fields={editor.fields}
              currentFieldIndex={editor.currentFieldIndex}
              progress={editor.progress}
              isSaving={editor.isSaving}
              isRegenerating={editor.isRegenerating}
              hasUnsavedChanges={editor.hasUnsavedChanges}
              onGoToField={editor.goToField}
              onAccept={editor.acceptField}
              onEdit={editor.editField}
              onSkip={editor.skipField}
              onRegenerate={editor.regenerateField}
              onUndo={editor.undoField}
              onUndoAll={editor.undoAll}
              onSave={editor.saveFields}
              onSelectEntity={editor.selectEntity}
            />
          }
        />
      </div>
    </div>
  );
}
