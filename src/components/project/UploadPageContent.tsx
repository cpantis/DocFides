'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { useTemplates, useModels, type LibraryItemData } from '@/lib/hooks/use-library';
import { useEntities } from '@/lib/hooks/use-entities';
import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Loader2,
  Shield,
} from 'lucide-react';
import { ModelDocBadge } from './ModelDocBadge';
import { UploadZone } from './UploadZone';
import { SourceDocumentList } from './SourceDocumentList';
import { LibraryPicker } from './LibraryPicker';

interface UploadPageContentProps {
  projectId: string;
}

export function UploadPageContent({ projectId }: UploadPageContentProps) {
  const t = useTranslations('project.upload');
  const tc = useTranslations('common');
  const { project, isLoading, mutate } = useProject(projectId);
  const { items: libraryTemplates, isLoading: templatesLoading } = useTemplates();
  const { items: libraryModels, isLoading: modelsLoading } = useModels();
  const { entities: libraryEntities, isLoading: entitiesLoading } = useEntities();
  const [sourceRefreshKey, setSourceRefreshKey] = useState(0);

  // Library selection state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);

  // Initialize selection from project libraryRefs when project loads
  const initDone = useState(false);
  if (project && !initDone[0]) {
    if (project.libraryRefs?.template?.libraryItemId) {
      setSelectedTemplateId(String(project.libraryRefs.template.libraryItemId));
    }
    if (project.libraryRefs?.model?.libraryItemId) {
      setSelectedModelId(String(project.libraryRefs.model.libraryItemId));
    }
    if (project.libraryRefs?.entities?.length) {
      setSelectedEntityIds(project.libraryRefs.entities.map((e: { libraryItemId: unknown }) => String(e.libraryItemId)));
    }
    initDone[1](true);
  }

  const refreshSources = () => {
    mutate();
    setSourceRefreshKey((k) => k + 1);
  };

  const linkLibrary = useCallback(async (type: 'template' | 'model' | 'entity', libraryItemId: string) => {
    try {
      await fetch(`/api/projects/${projectId}/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, libraryItemId }),
      });
      mutate();
    } catch {
      // silent
    }
  }, [projectId, mutate]);

  const unlinkLibrary = useCallback(async (type: 'template' | 'model' | 'entity', libraryItemId?: string) => {
    try {
      await fetch(`/api/projects/${projectId}/library`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, libraryItemId }),
      });
      mutate();
    } catch {
      // silent
    }
  }, [projectId, mutate]);

  const handleSelectTemplate = useCallback((item: LibraryItemData) => {
    setSelectedTemplateId(item._id);
    linkLibrary('template', item._id);
  }, [linkLibrary]);

  const handleRemoveTemplate = useCallback(() => {
    setSelectedTemplateId(null);
    unlinkLibrary('template');
  }, [unlinkLibrary]);

  const handleSelectModel = useCallback((item: LibraryItemData) => {
    setSelectedModelId(item._id);
    linkLibrary('model', item._id);
  }, [linkLibrary]);

  const handleRemoveModel = useCallback(() => {
    setSelectedModelId(null);
    unlinkLibrary('model');
  }, [unlinkLibrary]);

  const handleSelectEntity = useCallback((item: LibraryItemData) => {
    setSelectedEntityIds((prev) => {
      if (prev.includes(item._id)) return prev;
      return [...prev, item._id];
    });
    linkLibrary('entity', item._id);
  }, [linkLibrary]);

  const handleRemoveEntity = useCallback((entityId: string) => {
    setSelectedEntityIds((prev) => prev.filter((id) => id !== entityId));
    unlinkLibrary('entity', entityId);
  }, [unlinkLibrary]);

  // Convert entities to LibraryItemData shape for the picker
  const entityItemsForPicker: LibraryItemData[] = libraryEntities.map((e) => ({
    _id: e._id,
    userId: e.userId,
    type: 'entity' as const,
    name: e.name,
    description: e.description,
    documents: e.documents.map((d) => ({
      ...d,
    })),
    processedData: e.processedData,
    status: e.status,
    usageCount: e.usageCount,
    lastUsedAt: e.lastUsedAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));

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

  const sourceCount = project.sourceDocuments?.length ?? 0;
  const hasTemplate = !!project.templateDocument || !!selectedTemplateId;
  const hasSources = sourceCount > 0 || selectedEntityIds.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-4xl">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {project.name}
          </Link>
          <h1 className="mt-3 font-heading text-2xl font-bold text-gray-900">
            {t('title')}
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        {/* Upload instructions */}
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <div className="text-sm text-blue-700">
            <p>{t('uploadHint')}</p>
            <p className="mt-1 text-blue-600">{t('filenameHint')}</p>
          </div>
        </div>

        {/* Privacy notice */}
        <div className="flex items-start gap-3 rounded-xl border border-green-100 bg-green-50 p-4">
          <Shield className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
          <div className="text-sm text-green-700">
            <p className="font-medium">{t('privacyTitle')}</p>
            <p className="mt-1 text-green-600">{t('privacyDescription')}</p>
          </div>
        </div>

        {/* Template */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold text-gray-900">
              {t('templateLabel')}
            </h2>
            {(!!project.templateDocument || !!selectedTemplateId) && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                1 {t('uploaded')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('templateHint')}</p>
          <div className="mt-4">
            <LibraryPicker
              type="template"
              items={libraryTemplates}
              isLoading={templatesLoading}
              selectedId={selectedTemplateId}
              onSelect={handleSelectTemplate}
              onRemove={handleRemoveTemplate}
            >
              <UploadZone
                projectId={projectId}
                role="template"
                maxFiles={1}
                existingCount={project.templateDocument ? 1 : 0}
                onUploadComplete={() => mutate()}
              />
            </LibraryPicker>
          </div>
        </section>

        {/* Model (optional) */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold text-gray-900">
              {t('modelLabel')}
            </h2>
            <ModelDocBadge />
            {((project.modelDocuments?.length ?? 0) > 0 || !!selectedModelId) && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {selectedModelId ? 1 : project.modelDocuments?.length} {t('uploaded')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('modelHint')}</p>
          <div className="mt-4">
            <LibraryPicker
              type="model"
              items={libraryModels}
              isLoading={modelsLoading}
              selectedId={selectedModelId}
              onSelect={handleSelectModel}
              onRemove={handleRemoveModel}
            >
              <UploadZone
                projectId={projectId}
                role="model"
                maxFiles={2}
                existingCount={project.modelDocuments?.length ?? 0}
                onUploadComplete={() => mutate()}
              />
            </LibraryPicker>
          </div>
        </section>

        {/* Source Documents / Entities */}
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-bold text-gray-900">
              {t('sourceLabel')}
            </h2>
            {(sourceCount > 0 || selectedEntityIds.length > 0) && (
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {sourceCount + selectedEntityIds.length} {t('uploaded')}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('sourceHint')}</p>

          {/* Selected entities from library */}
          {selectedEntityIds.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedEntityIds.map((entityId) => {
                const entity = entityItemsForPicker.find((e) => e._id === entityId);
                if (!entity) return null;
                return (
                  <div
                    key={entityId}
                    className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100">
                      <span className="text-xs font-bold text-green-600">E</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-900">{entity.name}</p>
                      <p className="text-xs text-gray-500">{entity.documents.length} doc(s)</p>
                    </div>
                    <button
                      onClick={() => handleRemoveEntity(entityId)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <span className="text-xs">&times;</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Entity picker from library */}
          <div className="mt-4">
            <LibraryPicker
              type="entity"
              items={entityItemsForPicker}
              isLoading={entitiesLoading}
              selectedId={null}
              onSelect={handleSelectEntity}
              onRemove={() => {}}
            >
              <div>
                {/* Uploaded source documents with tag selectors */}
                <SourceDocumentList projectId={projectId} refreshKey={sourceRefreshKey} />

                <div className="mt-4">
                  <UploadZone
                    projectId={projectId}
                    role="source"
                    maxFiles={10}
                    existingCount={sourceCount}
                    onUploadComplete={refreshSources}
                  />
                </div>
              </div>
            </LibraryPicker>
          </div>
        </section>

        {/* Continue button */}
        <div className="flex justify-end">
          <Link
            href={hasSources && hasTemplate ? `/project/${projectId}/processing` : '#'}
            className={
              hasSources && hasTemplate
                ? 'inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700'
                : 'inline-flex items-center gap-2 rounded-xl bg-gray-200 px-6 py-3 text-sm font-semibold text-gray-400 cursor-not-allowed'
            }
          >
            {t('startProcessing')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
