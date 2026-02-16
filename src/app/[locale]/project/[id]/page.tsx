import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ProjectDetailContent } from '@/components/project/ProjectDetailContent';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;

  return <ProjectDetailContent projectId={id} />;
}
