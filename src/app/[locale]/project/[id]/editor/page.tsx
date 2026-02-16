import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { EditorPageContent } from '@/components/project/EditorPageContent';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;

  return <EditorPageContent projectId={id} />;
}
