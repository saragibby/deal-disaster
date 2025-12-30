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
