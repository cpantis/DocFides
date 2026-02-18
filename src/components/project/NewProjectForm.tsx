'use client';

import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from '@/i18n/navigation';
import { useState } from 'react';
import { Loader2, FolderPlus } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
});

type FormValues = z.infer<typeof formSchema>;

export function NewProjectForm() {
  const t = useTranslations('project');
  const tc = useTranslations('common');
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '' },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        throw new Error('Failed to create project');
      }

      const { data } = await response.json();
      router.push(`/project/${data._id}/upload`);
    } catch {
      setSubmitError(tc('error'));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          {t('name')}
        </label>
        <input
          {...register('name')}
          id="name"
          type="text"
          placeholder={t('namePlaceholder')}
          autoFocus
          className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
        {errors.name && (
          <p className="mt-1.5 text-sm text-error">{errors.name.message}</p>
        )}
      </div>

      {submitError && (
        <p className="text-sm text-error">{submitError}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderPlus className="h-4 w-4" />
          )}
          {t('create')}
        </button>
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          {tc('cancel')}
        </button>
      </div>
    </form>
  );
}
