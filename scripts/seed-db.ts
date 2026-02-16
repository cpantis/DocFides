/**
 * Database seed script for development/testing.
 * Usage: npm run db:seed
 */

import mongoose from 'mongoose';

const MOCK_USER = {
  clerkId: 'dev-user-001',
  email: 'dev@docfides.pro',
  name: 'Dev User',
  role: 'user',
  plan: 'professional',
  credits: {
    total: 100,
    used: 0,
    resetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
  },
  isActive: true,
};

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[Seed] Connected to MongoDB');

  // Seed mock user (upsert to avoid duplicates)
  const userCollection = mongoose.connection.collection('users');
  await userCollection.updateOne(
    { clerkId: MOCK_USER.clerkId },
    {
      $set: MOCK_USER,
      $setOnInsert: { createdAt: new Date() },
      $currentDate: { updatedAt: true },
    },
    { upsert: true }
  );
  console.log('[Seed] Mock user created/updated:', MOCK_USER.email);

  console.log('[Seed] Database seeded successfully');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
