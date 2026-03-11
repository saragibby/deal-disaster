import { test, expect } from '@playwright/test';
import { API_URL } from './helpers';

test.describe('Email Verification Page', () => {
  test('shows error when no token is provided', async ({ page }) => {
    await page.goto('/verify-email');

    await expect(page.locator('h1')).toContainText('Email Verification');
    await expect(page.locator('.login-form__error')).toContainText(
      /invalid verification link|please check your email/i
    );
  });

  test('shows error for invalid token', async ({ page }) => {
    await page.goto('/verify-email?token=invalid-token-12345');

    await expect(page.locator('h1')).toContainText('Email Verification');
    // API will return an error for a bad token
    await expect(page.locator('.login-form__error')).toBeVisible({ timeout: 10000 });
  });

  test('shows success message for valid token (mocked)', async ({ page }) => {
    // Mock the verify-email API to return success
    await page.route(`${API_URL}/api/auth/verify-email?token=valid-mock-token`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Email verified successfully! You can now log in.',
          email: 'test@example.com',
        }),
      })
    );

    await page.goto('/verify-email?token=valid-mock-token');

    await expect(page.locator('h1')).toContainText('Email Verification');
    await expect(page.locator('.login-form__success')).toContainText(
      /verified successfully/i,
      { timeout: 10000 }
    );
    await expect(page.locator('text=Redirecting to login')).toBeVisible();

    // Should redirect to login after 3 seconds
    await page.waitForURL('**/login', { timeout: 10000 });
  });

  test('shows "Go to Login" button on error', async ({ page }) => {
    await page.goto('/verify-email?token=bad-token');

    await expect(page.locator('.login-form__error')).toBeVisible({ timeout: 10000 });
    const goToLogin = page.locator('button:has-text("Go to Login")');
    await expect(goToLogin).toBeVisible();

    await goToLogin.click();
    await page.waitForURL('**/login', { timeout: 5000 });
  });
});

test.describe('Registration Flow', () => {
  test('can fill in registration form', async ({ page }) => {
    await page.goto('/login');

    // Switch to register mode
    const createAccountLink = page.locator('text=Create Account').or(page.locator('text=Sign up'));
    if (await createAccountLink.isVisible({ timeout: 3000 })) {
      await createAccountLink.click();
    }

    // Should show name field when in register mode
    await expect(page.locator('input[placeholder*="name" i]')).toBeVisible({ timeout: 5000 });
  });

  test('shows validation error for short password', async ({ page }) => {
    await page.goto('/login');

    // Switch to register mode
    const createAccountLink = page.locator('text=Create Account').or(page.locator('text=Sign up'));
    if (await createAccountLink.isVisible({ timeout: 3000 })) {
      await createAccountLink.click();
    }

    // Fill form with short password
    const nameInput = page.locator('input[placeholder*="name" i]');
    if (await nameInput.isVisible({ timeout: 2000 })) {
      await nameInput.fill('Test User');
    }
    await page.locator('input[type="email"]').fill('newuser@example.com');
    await page.locator('input[type="password"]').fill('short');
    await page.locator('button[type="submit"]').click();

    // Should show an error (either HTML5 validation or server error)
    // The server requires min 8 chars
    const errorVisible = await page.locator('.login-form__error').isVisible({ timeout: 5000 });
    if (!errorVisible) {
      // HTML5 validation may have prevented submission — that's also fine
      const validationMsg = await page.locator('input[type="password"]').evaluate(
        (el: HTMLInputElement) => el.validationMessage
      );
      expect(validationMsg).toBeTruthy();
    }
  });

  test('successful registration shows verification message', async ({ page }) => {
    const uniqueEmail = `e2e-register-${Date.now()}@example.com`;

    await page.goto('/login');

    // Switch to register mode
    const createAccountLink = page.locator('text=Create Account').or(page.locator('text=Sign up'));
    if (await createAccountLink.isVisible({ timeout: 3000 })) {
      await createAccountLink.click();
    }

    // Fill registration form
    const nameInput = page.locator('input[placeholder*="name" i]');
    if (await nameInput.isVisible({ timeout: 2000 })) {
      await nameInput.fill('Test Registrant');
    }
    await page.locator('input[type="email"]').fill(uniqueEmail);
    await page.locator('input[type="password"]').fill('TestPass123!');
    await page.locator('button[type="submit"]').click();

    // Should show success message about checking email
    await expect(page.locator('.login-form__success')).toContainText(
      /check your email|verification/i,
      { timeout: 10000 }
    );
  });

  test('shows error when registering with existing email', async ({ page }) => {
    await page.goto('/login');

    // Switch to register mode
    const createAccountLink = page.locator('text=Create Account').or(page.locator('text=Sign up'));
    if (await createAccountLink.isVisible({ timeout: 3000 })) {
      await createAccountLink.click();
    }

    // Try to register with the seeded test user email
    const nameInput = page.locator('input[placeholder*="name" i]');
    if (await nameInput.isVisible({ timeout: 2000 })) {
      await nameInput.fill('Duplicate User');
    }
    await page.locator('input[type="email"]').fill('e2e-test@example.com');
    await page.locator('input[type="password"]').fill('TestPass123!');
    await page.locator('button[type="submit"]').click();

    // Should show error about duplicate email
    await expect(page.locator('.login-form__error')).toContainText(
      /already registered/i,
      { timeout: 10000 }
    );
  });
});
