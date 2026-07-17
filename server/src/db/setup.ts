import { randomBytes } from 'crypto';
import { pool } from './pool.js';

const ASSET_DASHBOARD_OWNER_TENANT_ID = 'asset-dashboard';
const ASSET_DASHBOARD_OWNER_PLATFORM = 'asset-dashboard';

type AnalyzerOwnerTable = 'property_analyses' | 'saved_comparisons';

function generatePublicShareId(): string {
  return randomBytes(18).toString('base64url');
}

async function backfillAnalyzerOwnership(tableName: AnalyzerOwnerTable) {
  const beforeResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM ${tableName}`,
  );
  const beforeCount = beforeResult.rows[0].count;

  await pool.query(
    `UPDATE ${tableName}
     SET
       tenant_id = COALESCE(tenant_id, $1),
       platform = COALESCE(platform, $2),
       owner_user_id = COALESCE(owner_user_id, user_id)
     WHERE tenant_id IS NULL
        OR platform IS NULL
        OR owner_user_id IS NULL`,
    [ASSET_DASHBOARD_OWNER_TENANT_ID, ASSET_DASHBOARD_OWNER_PLATFORM],
  );

  const afterResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM ${tableName}`,
  );
  const afterCount = afterResult.rows[0].count;

  if (afterCount !== beforeCount) {
    throw new Error(
      `Analyzer ownership backfill changed ${tableName} row count from ${beforeCount} to ${afterCount}.`,
    );
  }

  const missingResult = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM ${tableName}
     WHERE tenant_id IS NULL
        OR platform IS NULL
        OR owner_user_id IS NULL`,
  );
  const missingCount = missingResult.rows[0].count;

  if (missingCount > 0) {
    throw new Error(
      `Analyzer ownership backfill left ${missingCount} ${tableName} rows without tenant, platform, or owner user fields.`,
    );
  }
}

async function backfillPropertyAnalysisPublicShareIds() {
  const result = await pool.query<{ id: number }>(
    `SELECT id
     FROM property_analyses
     WHERE is_shared = TRUE
       AND public_share_id IS NULL`,
  );

  for (const row of result.rows) {
    await pool.query(
      `UPDATE property_analyses
       SET public_share_id = $1
       WHERE id = $2
         AND public_share_id IS NULL`,
      [generatePublicShareId(), row.id],
    );
  }
}

async function backfillSavedComparisonMembers() {
  await pool.query(`
    INSERT INTO saved_comparison_members (comparison_id, analysis_id, position)
    SELECT sc.id, pa.id, slug_position.ordinality::int
    FROM saved_comparisons sc
    CROSS JOIN LATERAL unnest(sc.property_slugs) WITH ORDINALITY AS slug_position(slug, ordinality)
    JOIN property_analyses pa
      ON COALESCE(pa.tenant_id, $1) = COALESCE(sc.tenant_id, $1)
     AND COALESCE(pa.platform, $2) = COALESCE(sc.platform, $2)
     AND COALESCE(pa.owner_user_id, pa.user_id) = COALESCE(sc.owner_user_id, sc.user_id)
     AND pa.slug = slug_position.slug
    ON CONFLICT DO NOTHING
  `, [ASSET_DASHBOARD_OWNER_TENANT_ID, ASSET_DASHBOARD_OWNER_PLATFORM]);
}

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
    await backfillAnalyzerOwnership('saved_comparisons');
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
        public_share_id VARCHAR(64),
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
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS public_share_id VARCHAR(64)
    `);
    await backfillAnalyzerOwnership('property_analyses');
    await backfillPropertyAnalysisPublicShareIds();
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
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_property_analyses_public_share_id
      ON property_analyses(public_share_id)
      WHERE public_share_id IS NOT NULL
    `);
    console.log('✅ Property analyses table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_comparison_members (
        comparison_id INTEGER NOT NULL REFERENCES saved_comparisons(id) ON DELETE CASCADE,
        analysis_id INTEGER NOT NULL REFERENCES property_analyses(id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK (position >= 1 AND position <= 6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (comparison_id, analysis_id),
        UNIQUE (comparison_id, position)
      )
    `);
    await backfillSavedComparisonMembers();
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_saved_comparison_members_analysis
      ON saved_comparison_members(analysis_id)
    `);
    console.log('✅ Saved comparison membership table created');

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
