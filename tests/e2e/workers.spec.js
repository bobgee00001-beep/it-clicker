import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(() => {
    window.game.cycles = 0;
    window.game.upgrades = {};
    window.game.workerEarned = 0;
    window.game.totalClicks = 0;
    window.game.totalEarned = 0;
    window.game.clickPower = window.game.calculateClickPower();
    window.game.updateDisplay();
    window.game.save({ silent: true });
  });
  await page.reload();
  await page.waitForFunction(() => window.game && window.game.upgrades);
});

test('hire a worker from the Workers tab', async ({ page }) => {
  await page.evaluate(() => {
    window.game.cycles = 1000;
    window.game.updateDisplay();
  });

  await page.getByRole('button', { name: 'Workers' }).click();

  const internItem = page.locator('.upgrade-item').filter({ hasText: 'Intern' });
  await expect(internItem).toBeVisible();

  const internsBefore = await page.evaluate(() => window.game.upgrades['intern'] || 0);
  expect(internsBefore).toBe(0);

  await page.evaluate(() => {
    window.game.buyUpgrade('intern');
  });

  const internsAfter = await page.evaluate(() => window.game.upgrades['intern'] || 0);
  expect(internsAfter).toBe(1);

  const workerCount = await page.evaluate(() => window.game.calculateWorkerCount());
  expect(workerCount).toBeGreaterThanOrEqual(1);
});

test('workers generate automatic cycle growth over time', async ({ page }) => {
  await page.evaluate(() => {
    window.game.cycles = 1000;
    window.game.buyUpgrade('intern');
    window.game.updateDisplay();
  });

  const workerCps = await page.evaluate(() => window.game.calculateWorkerCps());
  expect(workerCps).toBeGreaterThan(0);

  const before = await page.evaluate(() => window.game.cycles);
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.game.cycles);
  expect(after).toBeGreaterThan(before);

  const workerEarned = await page.evaluate(() => window.game.workerEarned);
  expect(workerEarned).toBeGreaterThan(0);
});

test('worker state persists after save and load', async ({ page }) => {
  await page.evaluate(() => {
    window.game.cycles = 10000;
    window.game.buyUpgrade('intern');
    window.game.buyUpgrade('junior');
    window.game.updateDisplay();
    window.game.save({ silent: true });
  });

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('devopsClicker');
    return JSON.parse(raw);
  });

  expect(saved.upgrades.intern).toBe(1);
  expect(saved.upgrades.junior).toBe(1);
  expect(saved.workerEarned).toBeDefined();

  await page.evaluate(() => {
    window.game.cycles = 0;
    window.game.upgrades = {};
    window.game.workerEarned = 0;
    window.game.load({ silent: true });
  });

  const restoredIntern = await page.evaluate(() => window.game.upgrades['intern']);
  const restoredJunior = await page.evaluate(() => window.game.upgrades['junior']);
  expect(restoredIntern).toBe(1);
  expect(restoredJunior).toBe(1);

  const restoredWorkerCps = await page.evaluate(() => window.game.calculateWorkerCps());
  expect(restoredWorkerCps).toBeGreaterThan(0);
});

test('worker state persists after page reload', async ({ page }) => {
  await page.evaluate(() => {
    window.game.cycles = 20000;
    window.game.buyUpgrade('intern');
    window.game.buyUpgrade('senior');
    window.game.updateDisplay();
    window.game.save({ silent: true });
  });

  const internBefore = await page.evaluate(() => window.game.upgrades['intern'] || 0);
  const seniorBefore = await page.evaluate(() => window.game.upgrades['senior'] || 0);
  expect(internBefore).toBe(1);
  expect(seniorBefore).toBe(1);

  await page.evaluate(() => window.game.save({ silent: true }));

  await page.reload();
  await page.waitForFunction(() => window.game && window.game.upgrades);

  const internAfter = await page.evaluate(() => window.game.upgrades['intern'] || 0);
  const seniorAfter = await page.evaluate(() => window.game.upgrades['senior'] || 0);
  expect(internAfter).toBe(1);
  expect(seniorAfter).toBe(1);

  const workerCps = await page.evaluate(() => window.game.calculateWorkerCps());
  expect(workerCps).toBeGreaterThan(0);
});

test('no duplicate timers or CPS inflation after reload', async ({ page }) => {
  await page.evaluate(() => {
    window.game.cycles = 5000;
    window.game.buyUpgrade('intern');
    window.game.updateDisplay();
    window.game.save({ silent: true });
  });

  const cpsBefore = await page.evaluate(() => window.game.calculateWorkerCps());
  expect(cpsBefore).toBeGreaterThan(0);

  await page.evaluate(() => window.game.save({ silent: true }));

  await page.reload();
  await page.waitForFunction(() => window.game && window.game.upgrades);

  await page.waitForTimeout(1000);

  const cpsAfter = await page.evaluate(() => window.game.calculateWorkerCps());

  const tolerance = cpsBefore * 0.3 + 0.5;
  expect(cpsAfter).toBeLessThan(cpsBefore + tolerance);
  expect(cpsAfter).toBeGreaterThan(0);

  const cyclesSnapshot = await page.evaluate(() => window.game.cycles);
  await page.waitForTimeout(1500);
  const cyclesAfter = await page.evaluate(() => window.game.cycles);
  const delta = cyclesAfter - cyclesSnapshot;

  const maxExpectedDelta = (cpsAfter + tolerance) * 2;
  expect(delta).toBeLessThan(maxExpectedDelta);

  const internCount = await page.evaluate(() => window.game.upgrades['intern'] || 0);
  expect(internCount).toBe(1);
});