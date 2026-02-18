'use client';

import { AlertCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      <AlertCircle className="h-12 w-12 text-red-400" />
      <h2 className="mt-4 text-lg font-semibold text-gray-900">
        Something went wrong loading the editor
      </h2>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        {error.message || 'An unexpected error occurred'}
      </p>
      <div className="mt-6 flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
