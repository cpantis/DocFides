import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { NewProjectContent } from '@/components/project/NewProjectContent';

export default async function NewProjectPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return <NewProjectContent />;
}
