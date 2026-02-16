/**
 * Mock authentication for development/testing without Clerk.
 * Replace with real Clerk auth when ready for production.
 *
 * To switch back to Clerk:
 *   1. Replace all `import { auth } from '@/lib/auth/mock-auth'`
 *      with `import { auth } from '@clerk/nextjs/server'`
 *   2. Restore ClerkProvider in layout.tsx
 *   3. Restore clerkMiddleware in middleware.ts
 *   4. Restore UserButton in DashboardHeader.tsx
 */

const MOCK_USER_ID = 'dev-user-001';

export async function auth(): Promise<{ userId: string }> {
  return { userId: MOCK_USER_ID };
}

export const MOCK_USER = {
  id: MOCK_USER_ID,
  name: 'Dev User',
  email: 'dev@docfides.pro',
} as const;

/**
 * Ensures the dev user exists in MongoDB.
 * Call this from API routes that need a User document (e.g., /api/user/stats).
 */
export async function ensureDevUser(): Promise<void> {
  const { connectToDatabase, User } = await import('@/lib/db');
  await connectToDatabase();

  const existing = await User.findOne({ clerkId: MOCK_USER_ID });
  if (!existing) {
    await User.create({
      clerkId: MOCK_USER_ID,
      email: MOCK_USER.email,
      name: MOCK_USER.name,
      role: 'user',
      plan: 'free',
    });
  }
}
