import { pool } from './pool.js';

export async function setupDatabase() {
  try {
    console.log('🔨 Setting up database...');

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        avatar VARCHAR(500),
        password_hash VARCHAR(255),
        oauth_provider VARCHAR(50),
        oauth_id VARCHAR(255),
        phone_number VARCHAR(20),
        sms_opt_in BOOLEAN DEFAULT FALSE,
        email_newsletter_opt_in BOOLEAN DEFAULT FALSE,
        email_verified BOOLEAN DEFAULT FALSE,
        verification_token VARCHAR(255),
        verification_token_expires TIMESTAMP,
        reset_token VARCHAR(255),
        reset_token_expires TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(oauth_provider, oauth_id),
        CONSTRAINT auth_method_check CHECK (
          (password_hash IS NOT NULL AND oauth_provider IS NULL AND oauth_id IS NULL) OR
          (password_hash IS NULL AND oauth_provider IS NOT NULL AND oauth_id IS NOT NULL)
        )
      )
    `);
    console.log('✅ Users table created');

    // Create game_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER NOT NULL,
        cases_solved INTEGER NOT NULL,
        good_deals INTEGER NOT NULL,
        bad_deals_avoided INTEGER NOT NULL,
        mistakes INTEGER NOT NULL,
        red_flags_found INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Game sessions table created');

    // Create index on user_id for faster queries
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id 
      ON game_sessions(user_id)
    `);
    
    // Create indexes for token lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_verification_token 
      ON users(verification_token)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_reset_token 
      ON users(reset_token)
    `);
    console.log('✅ Indexes created');

    // Create chat_questions table for analytics
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_questions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        question TEXT NOT NULL,
        response_preview TEXT,
        asked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        session_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Chat questions table created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_questions_asked_at 
      ON chat_questions(asked_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_questions_user_id 
      ON chat_questions(user_id)
    `);
    console.log('✅ Chat questions indexes created');

    // Create feedback table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Feedback table created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_feedback_created_at 
      ON feedback(created_at DESC)
    `);
    console.log('✅ Feedback indexes created');

    // Create saved_comparisons table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_comparisons (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id VARCHAR(100) DEFAULT 'asset-dashboard',
        platform VARCHAR(50) DEFAULT 'asset-dashboard',
        owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        property_slugs TEXT[] NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      ALTER TABLE saved_comparisons ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) DEFAULT 'asset-dashboard'
    `);
    await pool.query(`
      ALTER TABLE saved_comparisons ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'asset-dashboard'
    `);
    await pool.query(`
      ALTER TABLE saved_comparisons ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
    `);
    await pool.query(`
      UPDATE saved_comparisons SET tenant_id = 'asset-dashboard' WHERE tenant_id IS NULL
    `);
    await pool.query(`
      UPDATE saved_comparisons SET platform = 'asset-dashboard' WHERE platform IS NULL
    `);
    await pool.query(`
      UPDATE saved_comparisons SET owner_user_id = user_id WHERE owner_user_id IS NULL
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_saved_comparisons_user
      ON saved_comparisons(user_id, updated_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_saved_comparisons_tenant_owner_updated
      ON saved_comparisons(tenant_id, owner_user_id, updated_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_saved_comparisons_tenant_owner_id
      ON saved_comparisons(tenant_id, owner_user_id, id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_saved_comparisons_platform_owner
      ON saved_comparisons(platform, owner_user_id)
    `);
    console.log('✅ Saved comparisons table created');

    // Create property_analyses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS property_analyses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id VARCHAR(100) DEFAULT 'asset-dashboard',
        platform VARCHAR(50) DEFAULT 'asset-dashboard',
        owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        slug VARCHAR(100) NOT NULL,
        zillow_url VARCHAR(1000) NOT NULL,
        zpid VARCHAR(50),
        source_url VARCHAR(1000),
        source_type VARCHAR(50) DEFAULT 'zillow',
        property_data JSONB NOT NULL,
        analysis_params JSONB NOT NULL,
        analysis_results JSONB NOT NULL,
        rental_comps JSONB,
        user_overrides JSONB,
        is_shared BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) DEFAULT 'asset-dashboard'
    `);
    await pool.query(`
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'asset-dashboard'
    `);
    await pool.query(`
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
    `);
    await pool.query(`
      UPDATE property_analyses SET tenant_id = 'asset-dashboard' WHERE tenant_id IS NULL
    `);
    await pool.query(`
      UPDATE property_analyses SET platform = 'asset-dashboard' WHERE platform IS NULL
    `);
    await pool.query(`
      UPDATE property_analyses SET owner_user_id = user_id WHERE owner_user_id IS NULL
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_property_analyses_user
      ON property_analyses(user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_property_analyses_zpid
      ON property_analyses(zpid)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_property_analyses_user_slug
      ON property_analyses(user_id, slug)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_property_analyses_tenant_owner_slug
      ON property_analyses(tenant_id, owner_user_id, slug)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_property_analyses_tenant_owner_created
      ON property_analyses(tenant_id, owner_user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_property_analyses_platform_owner
      ON property_analyses(platform, owner_user_id)
    `);
    console.log('✅ Property analyses table created');

    // Create leaderboard view
    await pool.query(`
      CREATE OR REPLACE VIEW leaderboard AS
      SELECT 
        u.id,
        u.name,
        u.email,
        MAX(g.points) as best_score,
        COUNT(g.id) as games_played,
        SUM(g.good_deals) as total_good_deals,
        SUM(g.bad_deals_avoided) as total_bad_deals_avoided
      FROM users u
      LEFT JOIN game_sessions g ON u.id = g.user_id
      GROUP BY u.id, u.name, u.email
      ORDER BY best_score DESC
    `);
    console.log('✅ Leaderboard view created');

    console.log('🎉 Database setup complete!');
  } catch (error) {
    console.error('❌ Error setting up database:', error);
    throw error;
  }
}

// Run setup if this file is executed directly
// Check if this is the main module using import.meta.url
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
