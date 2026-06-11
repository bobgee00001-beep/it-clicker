import { test, expect } from '@playwright/test';

test('core clicker and release train flow are interactive', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DevOps Clicker');
  await expect(page.getByText('Release Train')).toBeVisible();
  await page.locator('#clickBtn').click();
  await expect(page.locator('#resourceDisplay')).toContainText(/CPU Cycles: [1-9]/);
  await page.locator('#deployBtn').click();
  await expect(page.locator('#releaseStatusText')).not.toHaveText('idle');
  await expect(page.locator('#releaseTrack .release-step.active')).toHaveCount(1);
});

test('save and load keep release counters stable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#clickBtn').click();
  await page.getByRole('button', { name: /Speichern/ }).click();
  await page.reload();
  await page.getByRole('button', { name: /Laden/ }).click();
  await expect(page.locator('#releaseSuccesses')).toBeVisible();
});
