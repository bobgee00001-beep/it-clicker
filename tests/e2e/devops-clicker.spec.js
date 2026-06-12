import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
});

test('restored clicker shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DevOps Clicker');
  await expect(page.getByText('DevOps Clicker')).toBeVisible();
  await expect(page.getByRole('button', { name: /Speichern/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Laden/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Deploy starten/ })).toBeVisible();
});
