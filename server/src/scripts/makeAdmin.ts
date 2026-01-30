import { pool } from '../db/pool.js';

async function makeUserAdmin(email: string) {
  try {
    console.log(`\n🔐 Making user ${email} an admin...`);

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, email, name, is_admin FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }

    const user = userResult.rows[0];

    if (user.is_admin) {
      console.log(`ℹ️  User ${email} is already an admin`);
      process.exit(0);
    }

    // Make user admin
    await pool.query(
      'UPDATE users SET is_admin = TRUE WHERE id = $1',
      [user.id]
    );

    console.log(`✅ Successfully granted admin privileges to ${user.name || email}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error making user admin:', error);
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error('❌ Usage: npm run make-admin <email>');
  console.error('   Example: npm run make-admin user@example.com');
  process.exit(1);
}

makeUserAdmin(email);
