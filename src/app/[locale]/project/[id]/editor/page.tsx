import { EditorPageContent } from '@/components/project/EditorPageContent';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <EditorPageContent projectId={id} />;
}
