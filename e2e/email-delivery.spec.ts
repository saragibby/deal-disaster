import { test, expect } from '@playwright/test';
import {
  waitForEmail,
  getMessageDetail,
  extractUrlWithPath,
  clearMailpit,
} from './mailpit';
import { TEST_USER, API_URL } from './helpers';

test.describe('Email Delivery: Registration Verification', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('registration sends a verification email with a valid link', async ({ page }) => {
    const uniqueEmail = `e2e-verify-${Date.now()}@example.com`;

    // 1. Register via the UI
    await page.goto('/login');
    const createAccountLink = page.locator('text=Create Account').or(page.locator('text=Sign up'));
    if (await createAccountLink.isVisible({ timeout: 3000 })) {
      await createAccountLink.click();
    }

    const nameInput = page.locator('input[placeholder*="name" i]');
    if (await nameInput.isVisible({ timeout: 2000 })) {
      await nameInput.fill('Verify Tester');
    }
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').fill('TestPass123!');
    await page.locator('button[type="submit"]').click();

    // Should see success message
    await expect(page.locator('.login-form__success')).toContainText(
      /check your email|verification/i,
      { timeout: 10000 }
    );

    // 2. Check Mailpit for the verification email
    const msg = await waitForEmail(uniqueEmail, {
      subjectContains: 'Verify Your Email',
      timeout: 15000,
    });
    expect(msg.Subject).toContain('Verify Your Email');
    expect(msg.To[0].Address).toBe(uniqueEmail);

    // 3. Get the full email and extract the verification link
    const detail = await getMessageDetail(msg.ID);
    expect(detail.HTML).toBeTruthy();

    const verifyUrl = extractUrlWithPath(detail.HTML, '/verify-email');
    expect(verifyUrl).toBeTruthy();
    expect(verifyUrl).toContain('token=');

    // 4. Visit the verification link — should verify the email
    const url = new URL(verifyUrl!);
    await page.goto(`${url.pathname}${url.search}`);

    // The verify page shows a success message then auto-redirects to /login after 3s.
    // Wait for either the success message or the redirect to login.
    await page.waitForURL('**/login', { timeout: 15000 });

    // 5. Now login with the new account should work
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').fill('TestPass123!');
    await page.locator('button[type="submit"]').click();

    // Should land on dashboard
    await page.waitForURL('**/', { timeout: 10000 });
    await expect(page.locator('.app-shell__logo-text')).toBeVisible({ timeout: 10000 });
  });

  test('verification email contains correct branding', async ({ page }) => {
    const uniqueEmail = `e2e-brand-${Date.now()}@example.com`;

    // Register via API
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: { email: uniqueEmail, password: 'TestPass123!', name: 'Brand Check' },
    });

    // Wait for email
    const msg = await waitForEmail(uniqueEmail, { subjectContains: 'Verify' });
    const detail = await getMessageDetail(msg.ID);

    // Check email content
    expect(detail.HTML).toContain('Passive Income Club');
    expect(detail.HTML).toContain('Verify Email Address');
    expect(detail.HTML).toContain('/verify-email?token=');
    expect(detail.Text).toContain('verify your email');
  });

  test('unverified user cannot login', async ({ page }) => {
    const uniqueEmail = `e2e-unverified-${Date.now()}@example.com`;

    // Register (creates unverified user)
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: { email: uniqueEmail, password: 'TestPass123!', name: 'Unverified' },
    });

    // Try to login — should fail because email not verified
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').fill('TestPass123!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.login-form__error')).toContainText(
      /verify your email/i,
      { timeout: 10000 }
    );
  });

  test('resend verification sends a new email', async ({ page }) => {
    const uniqueEmail = `e2e-resend-${Date.now()}@example.com`;

    // Register via API
    await page.request.post(`${API_URL}/api/auth/register`, {
      data: { email: uniqueEmail, password: 'TestPass123!', name: 'Resend Test' },
    });

    // Wait for the first email to arrive
    await waitForEmail(uniqueEmail, { subjectContains: 'Verify' });
    await clearMailpit();

    // Request resend via API
    const resendRes = await page.request.post(`${API_URL}/api/auth/resend-verification`, {
      data: { email: uniqueEmail },
    });
    expect(resendRes.ok()).toBeTruthy();

    // A new verification email should arrive
    const msg = await waitForEmail(uniqueEmail, { subjectContains: 'Verify', timeout: 15000 });
    expect(msg.Subject).toContain('Verify Your Email');

    // The new email's link should also work
    const detail = await getMessageDetail(msg.ID);
    const verifyUrl = extractUrlWithPath(detail.HTML, '/verify-email');
    expect(verifyUrl).toBeTruthy();
    expect(verifyUrl).toContain('token=');
  });
});

test.describe('Email Delivery: Password Reset', () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test('forgot password sends a reset email with a valid link', async ({ page }) => {
    // 1. Request password reset via the UI
    await page.goto('/login');
    await page.locator('text=Forgot password').click();
    await page.locator('input[type="email"]').fill(TEST_USER.email);
    await page.locator('button:has-text("Send Reset Link")').click();

    await expect(page.locator('.login-form__success')).toContainText(
      /reset link|been sent/i,
      { timeout: 10000 }
    );

    // 2. Check Mailpit for the reset email
    const msg = await waitForEmail(TEST_USER.email, {
      subjectContains: 'Password Reset',
      timeout: 15000,
    });
    expect(msg.Subject).toContain('Password Reset');
    expect(msg.To[0].Address).toBe(TEST_USER.email);

    // 3. Get the full email and extract the reset link
    const detail = await getMessageDetail(msg.ID);
    expect(detail.HTML).toBeTruthy();

    const resetUrl = extractUrlWithPath(detail.HTML, '/reset-password');
    expect(resetUrl).toBeTruthy();
    expect(resetUrl).toContain('token=');

    // 4. Visit the reset link — should show the reset form
    const url = new URL(resetUrl!);
    await page.goto(`${url.pathname}${url.search}`);

    await expect(page.locator('h1')).toContainText('Reset Password');

    // 5. Complete the password reset
    const newPassword = 'NewTestPass456!';
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(newPassword);
    await passwordInputs.nth(1).fill(newPassword);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.login-form__success')).toContainText(
      /reset successfully/i,
      { timeout: 10000 }
    );

    // 6. Should redirect to login
    await page.waitForURL('**/login', { timeout: 10000 });

    // 7. Login with the new password should work
    await page.locator('input[type="email"]').fill(TEST_USER.email);
    await page.locator('input[type="password"]').fill(newPassword);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL('**/', { timeout: 10000 });
    await expect(page.locator('.app-shell__logo-text')).toBeVisible({ timeout: 10000 });

    // 8. Restore original password for other tests
    // (Re-seed the test user)
    const { execSync } = await import('child_process');
    execSync('npx tsx e2e/seed-test-user.ts', { stdio: 'inherit' });
  });

  test('reset email contains correct branding and security notice', async ({ page }) => {
    // Request reset via API
    await page.request.post(`${API_URL}/api/auth/forgot-password`, {
      data: { email: TEST_USER.email },
    });

    // Wait for email
    const msg = await waitForEmail(TEST_USER.email, { subjectContains: 'Password Reset' });
    const detail = await getMessageDetail(msg.ID);

    // Check email content
    expect(detail.HTML).toContain('Passive Income Club');
    expect(detail.HTML).toContain('Reset Password');
    expect(detail.HTML).toContain('/reset-password?token=');
    expect(detail.HTML).toContain('Security Notice');
    expect(detail.Text).toContain('reset your password');
  });

  test('used reset token cannot be reused', async ({ page }) => {
    // Request reset via API
    await page.request.post(`${API_URL}/api/auth/forgot-password`, {
      data: { email: TEST_USER.email },
    });

    // Get the reset email and extract token
    const msg = await waitForEmail(TEST_USER.email, { subjectContains: 'Password Reset' });
    const detail = await getMessageDetail(msg.ID);
    const resetUrl = extractUrlWithPath(detail.HTML, '/reset-password');
    expect(resetUrl).toBeTruthy();

    const url = new URL(resetUrl!);
    const token = url.searchParams.get('token')!;

    // Use the token to reset password via API
    const resetRes = await page.request.post(`${API_URL}/api/auth/reset-password`, {
      data: { token, password: 'TempPassword123!' },
    });
    expect(resetRes.ok()).toBeTruthy();

    // Try to reuse the same token — should fail
    const reuseRes = await page.request.post(`${API_URL}/api/auth/reset-password`, {
      data: { token, password: 'AnotherPassword123!' },
    });
    expect(reuseRes.ok()).toBeFalsy();
    const body = await reuseRes.json();
    expect(body.error).toContain('Invalid or expired');

    // Restore the test user password
    const { execSync } = await import('child_process');
    execSync('npx tsx e2e/seed-test-user.ts', { stdio: 'inherit' });
  });
});
