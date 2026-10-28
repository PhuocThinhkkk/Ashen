import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const OUTPUT_DIR = path.resolve('artifacts', 'screenshots', 'animations');

test.describe('Automated Animation Mid-Frame Visual Validation Tool', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  test('iterates through all player and boss animations, pauses at mid-frame, and saves screenshots', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/asset-test.html');
    await expect(page.locator('#test-canvas')).toBeVisible();

    // 1. Wait for assets to load
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 15000 },
    );

    const diag = await page.evaluate(() => window.__ASSET_TEST__?.diagnostics);
    expect(diag).not.toBeNull();
    expect(diag?.loaded).toBe(true);

    const playerClips = diag?.player.clips ?? [];
    const bossClips = diag?.boss.clips ?? [];

    expect(playerClips.length).toBeGreaterThanOrEqual(7);
    expect(bossClips.length).toBeGreaterThanOrEqual(6);

    // Collapse overlay panel so viewport screenshots show full character models
    await page.locator('#overlay-toggle').click();
    await expect(page.locator('#overlay')).toHaveClass(/collapsed/);

    // 2. Loop through every Player animation, pause at mid-frame, and capture screenshot
    await page.evaluate(() => {
      window.__ASSET_TEST__?.setCamera('player');
    });
    await page.waitForTimeout(100);

    for (const clip of playerClips) {
      const midInfo = await page.evaluate(async (c) => {
        return await window.__ASSET_TEST__?.pauseAtMidFrame('player', c);
      }, clip);

      expect(midInfo?.duration).toBeGreaterThan(0);
      expect(midInfo?.midTime).toBeGreaterThan(0);

      const filePath = path.join(OUTPUT_DIR, `player-${clip}.png`);
      await page.screenshot({ path: filePath, fullPage: true });

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(1000);
    }

    // 3. Loop through every Boss animation, pause at mid-frame, and capture screenshot
    await page.evaluate(() => {
      window.__ASSET_TEST__?.setCamera('boss');
    });
    await page.waitForTimeout(100);

    for (const clip of bossClips) {
      const midInfo = await page.evaluate(async (c) => {
        return await window.__ASSET_TEST__?.pauseAtMidFrame('boss', c);
      }, clip);

      expect(midInfo?.duration).toBeGreaterThan(0);
      expect(midInfo?.midTime).toBeGreaterThan(0);

      const filePath = path.join(OUTPUT_DIR, `boss-${clip}.png`);
      await page.screenshot({ path: filePath, fullPage: true });

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(1000);
    }

    // 4. Test Samurai model mid-frame captures
    await page.evaluate(async () => {
      await window.__ASSET_TEST__?.switchPlayerModel('samurai');
      window.__ASSET_TEST__?.setCamera('player');
    });

    for (const clip of ['attack_light', 'dodge', 'idle']) {
      await page.evaluate(async (c) => {
        return await window.__ASSET_TEST__?.pauseAtMidFrame('player', c);
      }, clip);

      const filePath = path.join(OUTPUT_DIR, `samurai-${clip}.png`);
      await page.screenshot({ path: filePath, fullPage: true });

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(1000);
    }

    // 5. Test in-browser canvas capture utility
    const batchResult = await page.evaluate(async () => {
      return await window.__ASSET_TEST__?.captureAllAnimations();
    });
    expect(batchResult).not.toBeNull();
    expect(Object.keys(batchResult ?? {}).length).toBe(playerClips.length + bossClips.length);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
