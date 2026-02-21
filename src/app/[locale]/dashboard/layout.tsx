import { DashboardHeader } from '@/components/layout/DashboardHeader';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <div className="py-6">
        {children}
      </div>
    </div>
  );
}
