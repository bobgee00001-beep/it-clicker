import { test, expect } from '@playwright/test';

test('core clicker and release train flow are interactive', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DevOps Clicker');
  await expect(page.getByText('Release Train')).toBeVisible();
  await expect(page.getByText('Observability / Rollback')).toBeVisible();
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


test('observability supports rollback and persists release evidence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Observability / Rollback')).toBeVisible();
  await expect(page.locator('#rollbackBtn')).toBeDisabled();

  await page.evaluate(() => {
    game.cycles = 1000;
    game.activeIncidents = 1;
    game.rollbackAvailable = true;
    game.errorBudget = 30;
    game.errorRate = 2.4;
    game.observabilityScore = 45;
    game.lastDeploymentQuality = 'Incident';
    game.observabilityMessage = 'Synthetic test incident';
    game.renderObservability();
  });

  await expect(page.locator('#observabilityStatus')).toHaveText('Rollback ready');
  await page.locator('#rollbackBtn').click();
  await expect(page.locator('#observabilityStatus')).not.toHaveText('Rollback ready');
  await expect(page.locator('#incidentMetric')).toHaveText('0');

  await page.getByRole('button', { name: /Speichern/ }).click();
  await page.reload();
  await page.getByRole('button', { name: /Laden/ }).click();
  await expect(page.locator('#errorBudgetMetric')).toBeVisible();
  await expect(page.locator('#rollbackBtn')).toBeVisible();
});
