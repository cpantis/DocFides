import { NextResponse } from 'next/server';
import { auth, ensureDevUser } from '@/lib/auth/mock-auth';
import { connectToDatabase, User, Project } from '@/lib/db';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();
    await ensureDevUser();

    const user = await User.findOne({ clerkId: userId });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [projectsThisMonth, projectsWithCost] = await Promise.all([
      Project.countDocuments({
        userId,
        createdAt: { $gte: startOfMonth },
      }),
      Project.find(
        { userId, aiCost: { $gt: 0 } },
        { aiCost: 1 }
      ).lean(),
    ]);

    const totalCost = projectsWithCost.reduce(
      (sum, p) => sum + ((p as Record<string, unknown>).aiCost as number),
      0
    );
    const avgPerProject = projectsWithCost.length > 0
      ? totalCost / projectsWithCost.length
      : 0;

    // Estimate time saved: count of processed projects * 2.5 hours (conservative)
    const timeSavedHours = projectsThisMonth * 2.5;

    return NextResponse.json({
      data: {
        aiCost: {
          total: Math.round(totalCost * 10000) / 10000,
          avgPerProject: Math.round(avgPerProject * 10000) / 10000,
          projectsWithCost: projectsWithCost.length,
        },
        projectsThisMonth,
        timeSavedHours: Math.round(timeSavedHours * 10) / 10,
        recentActivity: [], // TODO: aggregate from audit log
      },
    });
  } catch (error) {
    console.error('[USER_STATS]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
