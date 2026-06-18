import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.game && window.game.achievements);
});

test('EventLog extracts toast rendering from Game', async ({ page }) => {
  await page.evaluate(() => window.game.toast('Smoke test message', 'normal'));
  await expect(page.locator('#eventlogContent .eventlog-message:has-text("Smoke test message")')).toBeVisible();
});

test('Achievement unlock is triggered via state diff', async ({ page }) => {
  await page.evaluate(() => {
    window.game.totalClicks = 0;
    window.game.achievements = new Set();
    window.game.achievementProgress = {};
  });
  await expect.poll(async () => page.evaluate(() => window.game.achievements.size)).toBe(0);

  await page.evaluate(() => {
    window.game.totalClicks = 1;
    window.game.checkAchievements();
  });

  await expect.poll(async () => page.evaluate(() => window.game.achievements.size)).toBe(1);
  await expect(page.locator('#eventlogContent .eventlog-message:has-text("Erster Klick")')).toBeVisible();
});

test('evaluateAchievements is idempotent and returns a Set', async ({ page }) => {
  await page.evaluate(() => {
    window.game.totalClicks = 1;
    window.game.achievements = new Set();
    window.game.achievementProgress = {};
  });
  const result = await page.evaluate(() => {
    const r1 = window.game.evaluateAchievements();
    const r2 = window.game.evaluateAchievements();
    return { size1: r1.size, size2: r2.size, instanceOfSet: r1 instanceof Set };
  });
  expect(result.size1).toBe(1);
  expect(result.size2).toBe(0);
  expect(result.instanceOfSet).toBe(true);
});

test('eventLog filter by category works', async ({ page }) => {
  await page.evaluate(() => window.game.toast('Ticket smoke', 'normal', 'ticket'));
  await page.click('button[data-filter="ticket"]');
  await expect(page.locator('#eventlogContent .eventlog-message:has-text("Ticket smoke")')).toBeVisible();
});
