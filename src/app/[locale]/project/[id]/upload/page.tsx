import { UploadPageContent } from '@/components/project/UploadPageContent';

export default async function UploadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <UploadPageContent projectId={id} />;
}
