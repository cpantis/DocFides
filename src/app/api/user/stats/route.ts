import { NextResponse } from 'next/server';
import { auth, ensureDevUser } from '@/lib/auth/mock-auth';
import { connectToDatabase, User, Project, Generation } from '@/lib/db';

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

    const [projectsThisMonth, generations] = await Promise.all([
      Project.countDocuments({
        userId,
        createdAt: { $gte: startOfMonth },
      }),
      Generation.find({
        userId,
        createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    const totalCost = generations.reduce((sum, g) => sum + (g.aiCostUsd ?? 0), 0);
    const avgCostPerDoc = generations.length > 0 ? totalCost / generations.length : 0;

    // Estimate time saved: count of accepted fields * 3 min / 60
    const timeSavedHours = projectsThisMonth * 2.5; // Conservative placeholder

    return NextResponse.json({
      data: {
        credits: {
          total: user.credits.total,
          used: user.credits.used,
          percentUsed: user.credits.total > 0
            ? Math.round((user.credits.used / user.credits.total) * 100)
            : 0,
        },
        projectsThisMonth,
        avgCostPerDoc: Math.round(avgCostPerDoc * 100) / 100,
        timeSavedHours: Math.round(timeSavedHours * 10) / 10,
        recentActivity: [], // TODO: aggregate from audit log
      },
    });
  } catch (error) {
    console.error('[USER_STATS]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
