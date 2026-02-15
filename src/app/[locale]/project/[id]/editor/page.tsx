import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function EditorPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="h-screen">
      {/* SplitScreen editor will go here */}
      <div className="flex items-center justify-center h-full text-gray-500">
        Split-screen editor placeholder
      </div>
    </div>
  );
}
