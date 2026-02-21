import { ExportPageContent } from '@/components/project/ExportPageContent';

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ExportPageContent projectId={id} />;
}
