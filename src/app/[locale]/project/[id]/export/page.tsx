import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function ExportPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-heading text-2xl font-bold text-gray-900">
        Export Document
      </h1>
      {/* Export options will go here */}
    </div>
  );
}
