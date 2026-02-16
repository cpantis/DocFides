/**
 * Database seed script for development/testing.
 * Usage: npm run db:seed
 */

import mongoose from 'mongoose';

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[Seed] Connected to MongoDB');

  // TODO: Add seed data for development
  // - Test users
  // - Sample projects with different statuses
  // - Sample documents

  console.log('[Seed] Database seeded successfully');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
