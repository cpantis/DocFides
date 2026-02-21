/**
 * Database seed script for development/testing.
 * Usage: npm run db:seed
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import mongoose from 'mongoose';

// Load .env.local since tsx doesn't auto-load it
const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.local not found — rely on existing env vars
}

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
