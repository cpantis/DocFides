import { ProjectDetailContent } from '@/components/project/ProjectDetailContent';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;

  return <ProjectDetailContent projectId={id} />;
}
