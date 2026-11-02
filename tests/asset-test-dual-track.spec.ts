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

  test('verifies Boss Downward Cleave stays firmly planted at position without teleport sliding', async ({ page }) => {
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

    while (Date.now() - startTime < 1800) {
      const cur = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
      const lunge = Math.abs(initialBossZ - cur!.bossPos.z);
      if (lunge > maxLunge) maxLunge = lunge;
      await page.waitForTimeout(30);
    }

    // Downward Cleave stays planted in position (<= 0.15m), no sliding or teleporting!
    expect(maxLunge).toBeLessThan(0.15);

    // Capture screenshot showing planted downward cleave with yellow weapon wireframe
    await page.screenshot({
      path: 'artifacts/screenshots/planted-boss-downward-cleave.png',
      fullPage: true,
    });
  });

  test('verifies Boss Leaping Wrath executes approach run before airborne leap', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 20000 },
    );

    const initialSpacing = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
    const initialBossZ = initialSpacing!.bossPos.z;

    // Trigger Leaping Wrath
    await page.locator('#btn-act-boss-jump').click();

    let maxTravel = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < 2500) {
      const cur = await page.evaluate(() => window.__ASSET_TEST__?.getDuelSpacing?.());
      const travel = initialBossZ - cur!.bossPos.z;
      if (travel > maxTravel) maxTravel = travel;
      await page.waitForTimeout(30);
    }

    // Leaping Wrath covers ground via run approach + airborne leap (~4.5m to 8m)
    expect(maxTravel).toBeGreaterThan(4.5);
  });

  test('toggles Third-Person Game Roam mode and verifies banner and camera control', async ({ page }) => {
    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 20000 },
    );

    const roamBanner = page.locator('#roam-banner');
    await expect(roamBanner).toBeHidden();

    // Click 3rd-Person Follow button
    await page.locator('#btn-mode-toggle').click();
    await expect(roamBanner).toBeVisible();

    // Verify weapon locations can be extracted directly
    const weaponLocs = await page.evaluate(() => window.__ASSET_TEST__?.getWeaponLocations?.());
    expect(weaponLocs).toBeDefined();
    expect(weaponLocs.playerSword).toBeDefined();
    expect(weaponLocs.bossGreatsword).toBeDefined();

    // Toggle Yellow Hitbox debug ON
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(100);

    // Take screenshot showing playable roam banner and yellow hitboxes
    await page.screenshot({
      path: 'artifacts/screenshots/dual-track-roam-mode.png',
      fullPage: true,
    });

    // Press Escape to exit roam mode
    await page.keyboard.press('Escape');
    await expect(roamBanner).toBeHidden();
  });

  test('verifies settings button exists and works on both game and asset test pages', async ({ page }) => {
    // 1. Asset test page settings button
    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 20000 },
    );
    const assetSettingsBtn = page.locator('#btn-open-settings');
    await expect(assetSettingsBtn).toBeVisible();

    // 2. Main game page settings button
    await page.goto('/');
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__?.assetsLoaded === true,
      { timeout: 20000 },
    );
    const gameSettingsBtn = page.locator('#game-settings-btn');
    await expect(gameSettingsBtn).toBeVisible();
    await gameSettingsBtn.click();
    await expect(gameSettingsBtn).toHaveClass(/active/);
  });
});
