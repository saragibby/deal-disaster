import { test, expect } from '@playwright/test';
import { TEST_USER, API_URL } from './helpers';

test.describe('Forgot Password Flow', () => {
  test('can navigate to forgot password form', async ({ page }) => {
    await page.goto('/login');

    const forgotBtn = page.locator('text=Forgot password');
    await expect(forgotBtn).toBeVisible();
    await forgotBtn.click();

    // Should show "Send Reset Link" button
    await expect(page.locator('button:has-text("Send Reset Link")')).toBeVisible();
    // Should show email input
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('submitting forgot password shows confirmation', async ({ page }) => {
    await page.goto('/login');

    await page.locator('text=Forgot password').click();
    await page.locator('input[type="email"]').fill(TEST_USER.email);
    await page.locator('button:has-text("Send Reset Link")').click();

    // Should show success message (server always returns success to avoid email enumeration)
    await expect(page.locator('.login-form__success')).toContainText(
      /reset link|been sent/i,
      { timeout: 10000 }
    );
  });

  test('forgot password works for non-existent email too', async ({ page }) => {
    await page.goto('/login');

    await page.locator('text=Forgot password').click();
    await page.locator('input[type="email"]').fill('nonexistent@example.com');
    await page.locator('button:has-text("Send Reset Link")').click();

    // Should still show a success-like message (no email enumeration)
    await expect(page.locator('.login-form__success')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Reset Password Page', () => {
  test('shows reset form with password fields', async ({ page }) => {
    await page.goto('/reset-password?token=some-token');

    await expect(page.locator('h1')).toContainText('Reset Password');
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await page.goto('/reset-password?token=some-token');

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill('NewPassword123!');
    await passwordInputs.nth(1).fill('DifferentPassword!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.login-form__error')).toContainText(
      /do not match/i
    );
  });

  test('shows error for password too short', async ({ page }) => {
    await page.goto('/reset-password?token=some-token');

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill('short');
    await passwordInputs.nth(1).fill('short');

    // The form has minLength={8} HTML5 validation, so clicking submit should
    // trigger the browser's built-in validation rather than our custom error.
    await page.locator('button[type="submit"]').click();

    // Check for either custom error or HTML5 validation message
    const hasCustomError = await page.locator('.login-form__error').isVisible({ timeout: 2000 }).catch(() => false);
    if (hasCustomError) {
      await expect(page.locator('.login-form__error')).toContainText(/at least 8 characters/i);
    } else {
      // HTML5 validation prevents submission — verify the input reports invalid
      const isInvalid = await passwordInputs.nth(0).evaluate(
        (el: HTMLInputElement) => !el.validity.valid
      );
      expect(isInvalid).toBe(true);
    }
  });

  test('shows error for invalid reset token', async ({ page }) => {
    await page.goto('/reset-password?token=invalid-token-xyz');

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill('NewPassword123!');
    await passwordInputs.nth(1).fill('NewPassword123!');
    await page.locator('button[type="submit"]').click();

    // Server will reject the invalid token
    await expect(page.locator('.login-form__error')).toBeVisible({ timeout: 10000 });
  });

  test('successful reset shows success and redirects to login (mocked)', async ({ page }) => {
    // Mock the reset-password API to return success
    await page.route(`${API_URL}/api/auth/reset-password`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Password reset successfully! You can now log in with your new password.',
        }),
      })
    );

    await page.goto('/reset-password?token=valid-mock-token');

    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill('NewPassword123!');
    await passwordInputs.nth(1).fill('NewPassword123!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.login-form__success')).toContainText(
      /reset successfully/i,
      { timeout: 10000 }
    );

    // Should redirect to login after timeout
    await page.waitForURL('**/login', { timeout: 10000 });
  });

  test('shows error when no token provided', async ({ page }) => {
    await page.goto('/reset-password');

    // Without a token, the submit button is disabled
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeDisabled();
  });
});
