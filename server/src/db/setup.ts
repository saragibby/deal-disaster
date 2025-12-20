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
if (require.main === module) {
  setupDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
