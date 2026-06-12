import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
});

test('save, migrate, and reload state', async ({ page }) => {
  await page.goto('/');

  const savedState = await page.evaluate(() => {
    window.game.cycles = 321;
    window.game.totalClicks = 17;
    window.game.prestige = 2;
    window.game.selectedSound = 'none';
    window.game.save({ silent: true });
    return JSON.parse(localStorage.getItem('devopsClicker'));
  });

  expect(savedState.saveVersion).toBe(3);
  expect(savedState.cycles).toBe(321);
  expect(savedState.totalClicks).toBe(17);

  const exportedPayload = await page.evaluate(() => window.game.createExportPayload());
  expect(exportedPayload.meta.saveVersion).toBe(3);
  expect(exportedPayload.meta.game).toBe('devops-clicker');
  expect(exportedPayload.state.cycles).toBe(321);

  const restoredState = await page.evaluate(() => {
    const legacySave = {
      cycles: 777,
      totalClicks: 33,
      prestige: 4,
      upgrades: {},
      achievements: [],
      exportedAt: '2026-06-12T00:00:00.000Z',
      version: 2
    };
    localStorage.setItem('devopsClicker', JSON.stringify(legacySave));
    window.game.cycles = 0;
    window.game.totalClicks = 0;
    window.game.prestige = 0;
    window.game.load({ silent: true });
    return {
      cycles: window.game.cycles,
      totalClicks: window.game.totalClicks,
      prestige: window.game.prestige,
      stored: JSON.parse(localStorage.getItem('devopsClicker'))
    };
  });

  expect(restoredState.cycles).toBe(777);
  expect(restoredState.totalClicks).toBe(33);
  expect(restoredState.prestige).toBe(4);
  expect(restoredState.stored.saveVersion).toBe(3);
});
