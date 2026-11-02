import { expect, test } from '@playwright/test';

test.describe('Dual-Track 4-Model Asset & Combat Logic Test Suite', () => {
  test('initializes 4 models across dual tracks and verifies home spacing', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/asset-test.html');
    await expect(page.locator('#test-canvas')).toBeVisible();

    // 1. Wait for all 4 models to load
    await page.waitForFunction(
      () => {
        const testObj = window.__ASSET_TEST__;
        return testObj && testObj.diagnostics.loaded === true;
      },
      { timeout: 20000 },
    );

    // 2. Validate Duel Spacing between Model 3 (Logic Player) and Model 4 (Logic Boss)
    const spacing = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
    expect(spacing).toBeDefined();
    expect(spacing!.distance).toBeGreaterThan(3.8);
    expect(spacing!.distance).toBeLessThan(4.2);
    expect(spacing!.playerPos.x).toBeCloseTo(4.8, 0);
    expect(spacing!.playerPos.z).toBeCloseTo(-2.0, 0);
    expect(spacing!.bossPos.x).toBeCloseTo(4.8, 0);
    expect(spacing!.bossPos.z).toBeCloseTo(2.0, 0);

    // 3. Switch camera to overview to show all 4 models simultaneously
    await page.evaluate(() => window.__ASSET_TEST__?.setCamera('overview'));
    await page.waitForTimeout(500);

    await page.screenshot({
      path: 'artifacts/screenshots/dual-track-overview-4-models.png',
      fullPage: true,
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes Player dodge roll with real spatial displacement and auto-reset', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 20000 },
    );

    await page.evaluate(() => window.__ASSET_TEST__?.setCamera('duel'));
    await page.waitForTimeout(300);

    const initialSpacing = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
    const initialPlayerZ = initialSpacing!.playerPos.z;

    // Trigger Dodge Roll Forward (+2.35m forward displacement towards Boss)
    await page.locator('#btn-act-dodge-fwd').click();

    let maxDisplacement = 0;
    const startTime = Date.now();
    let capturedMidRoll = false;

    while (Date.now() - startTime < 1200) {
      const cur = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
      const disp = Math.abs(cur!.playerPos.z - initialPlayerZ);
      if (disp > maxDisplacement) maxDisplacement = disp;

      if (disp > 1.2 && !capturedMidRoll) {
        capturedMidRoll = true;
        await page.screenshot({
          path: 'artifacts/screenshots/dual-track-player-dodge.png',
          fullPage: true,
        });
      }
      await page.waitForTimeout(25);
    }

    // Displacement should reach ~2.35m curve
    expect(maxDisplacement).toBeGreaterThan(1.8);
    expect(maxDisplacement).toBeLessThan(2.7);

    // Wait for 1.0s landing pause and auto-reset glide back to home
    await page.waitForFunction(
      () => {
        const s = window.__ASSET_TEST__?.getDuelSpacing?.();
        return s && Math.abs(s.playerPos.z - (-2.0)) < 0.15;
      },
      { timeout: 6000 },
    );
  });

  test('executes Boss Downward Cleave and verifies lunge impulse & combat hit', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 20000 },
    );

    // Switch to side profile view for clear inspection
    await page.locator('button[data-cam="side"]').click();
    await page.waitForTimeout(300);

    const initialSpacing = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
    const initialBossZ = initialSpacing!.bossPos.z;

    // Click Downward Cleave button
    await page.locator('#btn-act-boss-downward').click();

    let maxLunge = 0;
    const startTime = Date.now();
    let capturedLunge = false;

    while (Date.now() - startTime < 2200) {
      const cur = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
      const lunge = initialBossZ - cur!.bossPos.z; // Lunges towards player (-Z direction)
      if (lunge > maxLunge) maxLunge = lunge;

      if (lunge > 1.5 && !capturedLunge) {
        capturedLunge = true;
        await page.screenshot({
          path: 'artifacts/screenshots/dual-track-boss-cleave-sideview.png',
          fullPage: true,
        });
      }
      await page.waitForTimeout(30);
    }

    // Forward impulse for Downward Cleave is 2.8m
    expect(maxLunge).toBeGreaterThan(1.8);
    expect(maxLunge).toBeLessThan(3.2);

    // Verify combat hit was logged
    const hitLogText = await page.locator('#tel-hit-log').innerText();
    expect(hitLogText.length).toBeGreaterThan(0);
  });

  test('toggles Third-Person Game Roam mode and verifies banner and camera control', async ({ page }) => {
    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 20000 },
    );

    const roamBanner = page.locator('#roam-banner');
    await expect(roamBanner).toBeHidden();

    // Click 3rd-Person Roam button
    await page.locator('button[data-cam="roam"]').click();
    await expect(roamBanner).toBeVisible();

    // Take screenshot showing playable roam banner
    await page.screenshot({
      path: 'artifacts/screenshots/dual-track-roam-mode.png',
      fullPage: true,
    });

    // Press Escape to exit roam mode
    await page.keyboard.press('Escape');
    await expect(roamBanner).toBeHidden();
  });
});
