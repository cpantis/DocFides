import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ProcessingPageContent } from '@/components/project/ProcessingPageContent';

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;

  return <ProcessingPageContent projectId={id} />;
}
