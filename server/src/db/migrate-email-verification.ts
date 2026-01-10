import { pool } from './pool.js';

async function migrate() {
  try {
    console.log('🔄 Applying email verification migration...');
    
    // Add new columns to users table
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP,
      ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
      ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP
    `);
    console.log('✅ Columns added to users table');
    
    // Set email_verified to true for existing OAuth users
    await pool.query(`
      UPDATE users 
      SET email_verified = TRUE 
      WHERE oauth_provider IS NOT NULL
    `);
    console.log('✅ OAuth users marked as verified');
    
    // Create indexes for faster token lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_verification_token 
      ON users(verification_token)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_reset_token 
      ON users(reset_token)
    `);
    console.log('✅ Indexes created');
    
    console.log('🎉 Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
