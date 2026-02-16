/**
 * Database migration script.
 * Usage: npm run db:migrate
 */

import mongoose from 'mongoose';

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[Migrate] Connected to MongoDB');

  // TODO: Add migrations as needed
  // Example: add indexes, update schemas, transform data

  console.log('[Migrate] Migrations completed');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('[Migrate] Error:', err);
  process.exit(1);
});
