/**
 * Seeds a verified test user into the database for E2E tests.
 * Run with: npx tsx e2e/seed-test-user.ts
 */
import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../server/.env') });

const TEST_USER = {
  email: 'e2e-test@example.com',
  password: 'TestPass123!',
  name: 'E2E Test User',
};

async function seed() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('amazonaws.com')
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const passwordHash = await bcrypt.hash(TEST_USER.password, 10);

    // Upsert: create if not exists, update if exists
    await pool.query(
      `INSERT INTO users (email, password_hash, name, email_verified)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = $2,
         name = $3,
         email_verified = true,
         verification_token = NULL,
         verification_token_expires = NULL`,
      [TEST_USER.email, passwordHash, TEST_USER.name]
    );

    console.log(`✅ Test user seeded: ${TEST_USER.email}`);
  } catch (error) {
    console.error('❌ Failed to seed test user:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
