import { connectToDatabase, Tag } from '@/lib/db';

const DEFAULT_TAGS = [
  { name: 'Administrator', color: '#6366f1' },
  { name: 'Asociat', color: '#8b5cf6' },
  { name: 'Beneficiar', color: '#22c55e' },
  { name: 'Împuternicit', color: '#f97316' },
  { name: 'Reprezentant legal', color: '#3b82f6' },
];

/**
 * Ensure default tags exist for a user.
 * Called on first project creation or when user visits tags page.
 * Idempotent — skips tags that already exist.
 */
export async function ensureDefaultTags(userId: string): Promise<void> {
  await connectToDatabase();

  const existingCount = await Tag.countDocuments({ userId });
  if (existingCount > 0) return;

  const ops = DEFAULT_TAGS.map((tag) => ({
    insertOne: {
      document: { userId, name: tag.name, color: tag.color },
    },
  }));

  try {
    await Tag.bulkWrite(ops, { ordered: false });
  } catch {
    // Ignore duplicate key errors (concurrent creation)
  }
}
