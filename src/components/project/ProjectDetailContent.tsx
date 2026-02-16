'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useProject } from '@/lib/hooks/use-projects';
import { ArrowLeft, Upload, Cpu, FileEdit, Download, FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ProjectDetailContentProps {
  projectId: string;
}

const steps = [
  { key: 'upload', icon: Upload, href: '/upload' },
  { key: 'processing', icon: Cpu, href: '/processing' },
  { key: 'editor', icon: FileEdit, href: '/editor' },
  { key: 'export', icon: Download, href: '/export' },
] as const;

const statusToStep: Record<string, number> = {
  draft: 0,
  uploading: 0,
  processing: 1,
  ready: 2,
  exported: 3,
};

export function ProjectDetailContent({ projectId }: ProjectDetailContentProps) {
  const t = useTranslations('project');
  const { project, isLoading } = useProject(projectId);

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
        <FileText className="h-12 w-12 text-gray-300" />
        <p className="mt-4 text-gray-500">Project not found</p>
        <Link href="/dashboard" className="mt-4 text-sm text-primary-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const currentStep = statusToStep[project.status] ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-5">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="mt-3 flex items-center justify-between">
            <h1 className="font-heading text-2xl font-bold text-gray-900">
              {project.name}
            </h1>
            <span className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              project.status === 'ready' ? 'bg-green-50 text-success' :
              project.status === 'processing' ? 'bg-amber-50 text-amber-600' :
              project.status === 'exported' ? 'bg-primary-50 text-primary-600' :
              'bg-gray-100 text-gray-600'
            )}>
              {t(`status.${project.status}`)}
            </span>
          </div>
        </div>
      </header>

      {/* Step navigation */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="mx-auto max-w-7xl">
          <nav className="flex gap-1">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const isAccessible = index <= currentStep;

              return (
                <Link
                  key={step.key}
                  href={isAccessible ? `/project/${projectId}${step.href}` : '#'}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-primary-600 text-primary-600'
                      : isCompleted
                      ? 'border-transparent text-success hover:text-success'
                      : 'border-transparent text-gray-400',
                    isAccessible && !isActive && 'hover:text-gray-600'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {step.key.charAt(0).toUpperCase() + step.key.slice(1)}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="text-center text-gray-500">
            <p className="text-sm">
              {project.status === 'draft' && 'Upload your documents to get started.'}
              {project.status === 'processing' && 'AI is processing your documents...'}
              {project.status === 'ready' && 'Your document is ready for review and editing.'}
              {project.status === 'exported' && 'Your document has been exported.'}
            </p>
            {project.status === 'draft' && (
              <Link
                href={`/project/${projectId}/upload`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                <Upload className="h-4 w-4" />
                Upload Documents
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
