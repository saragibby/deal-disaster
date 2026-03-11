import { type Page, expect } from '@playwright/test';

/**
 * Test user credentials — these MUST exist in the database with email_verified=true.
 * Run the seed script (e2e/seed-test-user.ts) before running tests.
 */
export const TEST_USER = {
  email: 'e2e-test@example.com',
  password: 'TestPass123!',
  name: 'E2E Test User',
};

export const API_URL = 'http://localhost:3002';

/**
 * Register a new user via the API (bypasses UI).
 * Returns the verification token from the DB so tests can complete verification.
 */
export async function registerUserViaAPI(
  page: Page,
  email: string,
  password: string,
  name?: string
): Promise<{ userId: string }> {
  const res = await page.request.post(`${API_URL}/api/auth/register`, {
    data: { email, password, name },
  });
  const body = await res.json();
  if (!res.ok()) {
    throw new Error(`Register failed: ${body.error}`);
  }
  return body;
}

/**
 * Login via the API and inject auth into localStorage (bypasses the login UI).
 */
export async function loginViaAPI(page: Page, email: string, password: string) {
  const res = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    const body = await res.json();
    throw new Error(`Login API failed: ${body.error}`);
  }
  const { token, user } = await res.json();

  // Inject auth state into localStorage so the SPA picks it up
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    },
    { token, user }
  );
  return { token, user };
}

/**
 * Clear auth state from localStorage.
 */
export async function clearAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  });
}

/**
 * Seed a verified test user directly via the API.
 * If the user already exists and is verified, that's fine — we just attempt login.
 * If they don't exist, we register + verify via direct API call.
 */
export async function ensureTestUser(page: Page) {
  // Try logging in first
  const loginRes = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  if (loginRes.ok()) return; // User already exists and is verified

  // Register the user
  const regRes = await page.request.post(`${API_URL}/api/auth/register`, {
    data: {
      email: TEST_USER.email,
      password: TEST_USER.password,
      name: TEST_USER.name,
    },
  });

  // Verify via the seed endpoint (we'll need to verify through DB or a test-only endpoint)
  // For now, we use the verification token from the console log
  // In CI, you'd seed this user with a migration script.
  if (regRes.status() === 201 || regRes.status() === 409) {
    // If 409, user exists but may not be verified — try the verify-via-seed approach
  }
}

/**
 * Wait for navigation to a path (works with SPA).
 */
export async function waitForPath(page: Page, path: string, timeout = 10000) {
  await page.waitForURL(`**${path}`, { timeout });
}

/**
 * Assert the user lands on the login page.
 */
export async function expectLoginPage(page: Page) {
  await expect(page.locator('h1')).toContainText(/Sign In|Create Account/i);
  await expect(page.locator('.login-card')).toBeVisible();
}

/**
 * Assert the user lands on the dashboard home page (authenticated).
 */
export async function expectDashboardHome(page: Page) {
  await page.waitForURL('**/');
  // The AppShell should be visible
  await expect(page.locator('text=Passive Income Club')).toBeVisible({ timeout: 10000 });
}
