import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UploadPageContent } from '@/components/project/UploadPageContent';

export default async function UploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;

  return <UploadPageContent projectId={id} />;
}
