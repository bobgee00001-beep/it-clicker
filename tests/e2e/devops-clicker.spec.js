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
  await expect(page.getByRole('button', { name: 'Workers' })).toBeVisible();
  await expect(page.getByText(/Workers: 0 \(0\.0 clicks\/s\)/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Speichern/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Laden/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Deploy starten/ })).toBeVisible();
});

test('workers generate passive cycles from click power', async ({ page }) => {
  await page.goto('/');

  const setup = await page.evaluate(() => {
    window.game.cycles = 10000;
    window.game.buyUpgrade('junior');
    window.game.buyUpgrade('mouse');
    window.game.updateDisplay();
    return {
      clickPower: window.game.clickPower,
      workerRate: window.game.calculateWorkerClicksPerSecond(),
      workerCps: window.game.calculateWorkerCps()
    };
  });

  expect(setup.clickPower).toBe(4);
  expect(setup.workerRate).toBe(1);
  expect(setup.workerCps).toBe(4);

  const before = await page.evaluate(() => window.game.cycles);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.game.cycles);
  expect(after - before).toBeGreaterThan(3);
});
