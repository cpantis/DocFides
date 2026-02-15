import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="font-heading text-3xl font-bold text-gray-900">
        Project {id}
      </h1>
    </div>
  );
}
