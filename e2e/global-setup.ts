import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAILPIT_API = 'http://127.0.0.1:8025';

async function globalSetup() {
  // 1. Verify Mailpit is running
  console.log('🔧 E2E Global Setup: checking Mailpit...');
  try {
    const res = await fetch(`${MAILPIT_API}/api/v1/messages`);
    if (!res.ok) throw new Error(`Mailpit API responded ${res.status}`);
    console.log('✅ Mailpit is running');

    // Clear any leftover messages from previous runs
    await fetch(`${MAILPIT_API}/api/v1/messages`, { method: 'DELETE' });
    console.log('✅ Mailpit inbox cleared');
  } catch {
    console.error(
      '❌ Mailpit is not running. Start it with:\n' +
      '   mailpit --smtp-auth-accept-any --smtp-auth-allow-insecure --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025'
    );
    process.exit(1);
  }

  // 2. Seed test user
  console.log('🔧 Seeding test user...');
  execSync('npx tsx e2e/seed-test-user.ts', {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
  });
  console.log('✅ Global setup complete');
}

export default globalSetup;
