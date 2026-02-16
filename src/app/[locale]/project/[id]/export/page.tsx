import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ExportPageContent } from '@/components/project/ExportPageContent';

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;

  return <ExportPageContent projectId={id} />;
}
