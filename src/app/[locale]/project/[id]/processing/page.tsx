import { ProcessingPageContent } from '@/components/project/ProcessingPageContent';

export default async function ProcessingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ProcessingPageContent projectId={id} />;
}
