import { test, expect } from '@playwright/test';

test('public clicker is paused behind a maintenance page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('IT-Clicker pausiert');
  await expect(page.getByRole('heading', { name: 'IT-Clicker ist pausiert' })).toBeVisible();
  await expect(page.getByText(/Diese Demo ist aktuell nicht .*ffentlich verf.*gbar\./)).toBeVisible();
  await expect(page.getByText('Gee-Corp Release Hold - 2026-06-12')).toBeVisible();
  await expect(page.getByText('DevOps Clicker')).toHaveCount(0);
  await expect(page.getByText('Release Train')).toHaveCount(0);
});
