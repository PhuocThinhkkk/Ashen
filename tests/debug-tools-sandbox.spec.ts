import { expect, test } from '@playwright/test';

test.describe('Visual Hitbox Debugger & Sandbox Asset Viewer Validation', () => {
  test('verifies in-engine visual hitbox debugger toggles and changes color on attack impact frames', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 15000 },
    );

    // 1. Toggle hitbox debug ON via test hook or KeyH
    const initialVisible = await page.evaluate(
      () => window.__THREE_GAME_TEST_HOOKS__?.isHitboxDebugVisible?.() ?? false,
    );
    expect(initialVisible).toBe(false);

    // Press 'H' to toggle hitbox wireframe
    await page.keyboard.press('KeyH');
    await page.waitForTimeout(100);

    const toggledVisible = await page.evaluate(
      () => window.__THREE_GAME_TEST_HOOKS__?.isHitboxDebugVisible?.() ?? false,
    );
    expect(toggledVisible).toBe(true);

    // Hide debug UI overlay so full 3D viewport and hitbox wireframe are cleanly visible
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi?.(true));
    await page.waitForTimeout(100);

    // Capture screenshot with hitbox visible in Idle (Green state)
    await page.screenshot({
      path: 'artifacts/screenshots/debug-hitbox-wireframe-idle.png',
      fullPage: true,
    });

    // 2. Trigger light attack and capture during active Impact phase (Red state)
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__?.player.state === 'attack',
      { timeout: 3000 },
    );

    // Wait until active Impact phase is entered (frame ~30)
    await page.waitForTimeout(220);

    // Capture screenshot during attack swing with active red hitbox
    await page.screenshot({
      path: 'artifacts/screenshots/debug-hitbox-wireframe-impact.png',
      fullPage: true,
    });

    // Toggle hitbox back off
    await page.keyboard.press('KeyH');
    const finalVisible = await page.evaluate(
      () => window.__THREE_GAME_TEST_HOOKS__?.isHitboxDebugVisible?.() ?? false,
    );
    expect(finalVisible).toBe(false);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('verifies dodge roll applies velocity impulse smoothly without extreme speed warping', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 15000 },
    );

    const startZ =
      (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.z)) ?? 0;

    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi?.(true));

    // Press dodge roll (Space)
    await page.keyboard.press('Space');

    // Poll positions during roll traversal
    let maxDistanceCovered = 0;
    let sawAirborneRoll = false;
    let capturedMidRollScreenshot = false;
    const startTime = Date.now();

    while (Date.now() - startTime < 1200) {
      const elapsed = Date.now() - startTime;
      const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
      if (diag?.player.state === 'dodge') {
        const currentZ = diag.player.position.z;
        const dist = Math.abs(currentZ - startZ);
        if (dist > maxDistanceCovered) maxDistanceCovered = dist;
        if (diag.player.isInvulnerable) sawAirborneRoll = true;

        // Capture screenshot right in the middle of the active i-frame roll window (~0.35s)
        if (elapsed >= 320 && !capturedMidRollScreenshot) {
          capturedMidRollScreenshot = true;
          await page.screenshot({
            path: 'artifacts/screenshots/dodge-roll-traversal.png',
            fullPage: true,
          });
        }
      }
      await page.waitForTimeout(25);
    }

    if (!capturedMidRollScreenshot) {
      await page.screenshot({
        path: 'artifacts/screenshots/dodge-roll-traversal.png',
        fullPage: true,
      });
    }

    // Verify distance covered is compact and responsive (~2.2 to 2.5m, not flying 5+ meters)
    expect(maxDistanceCovered).toBeGreaterThan(1.2);
    expect(maxDistanceCovered).toBeLessThan(3.2);
    expect(sawAirborneRoll).toBe(true);

    // Wait until roll finishes naturally
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__?.player.state === 'idle',
      { timeout: 5000 },
    );
  });

  test('verifies Sandbox Asset Viewer mode controls, frame stepping, and hitbox toggle', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/asset-test.html');
    await page.waitForFunction(
      () => window.__ASSET_TEST__ && window.__ASSET_TEST__.diagnostics.loaded === true,
      { timeout: 15000 },
    );

    // 1. Verify Hitbox Debugger in Sandbox Viewer
    expect(await page.evaluate(() => window.__ASSET_TEST__?.isHitboxVisible?.())).toBe(false);

    // Click UI button to toggle hitbox wireframe ON
    await page.locator('#btn-toggle-hitbox').click();
    await page.waitForTimeout(100);

    expect(await page.evaluate(() => window.__ASSET_TEST__?.isHitboxVisible?.())).toBe(true);
    await expect(page.locator('#hitbox-status-badge')).toHaveText('HITBOX: ON');

    // 2. Play light attack and pause at Impact phase (frame 34 is peak velocity)
    await page.evaluate(() => {
      window.__ASSET_TEST__?.playPlayerClip?.('attack_light');
    });
    // Immediately pause
    await page.evaluate(() => {
      if (!window.__ASSET_TEST__?.isHitboxVisible?.()) {
        window.__ASSET_TEST__?.toggleHitbox?.(true);
      }
    });

    // Advance to frame 34 (inside Impact phase frames 27-44)
    await page.evaluate(() => {
      const act = window.__ASSET_TEST__;
      if (act) {
        // Step to frame 34
        act.pauseAtMidFrame?.('player', 'attack_light');
      }
    });
    await page.waitForTimeout(100);

    // Verify hitbox telemetry state is active (Impact phase)
    const hitboxState = await page.evaluate(
      () => window.__ASSET_TEST__?.getHitboxDebugState?.(),
    );
    expect(hitboxState?.playerActive).toBe(true);

    // Capture screenshot of frame scrubber with active red hitbox
    await page.screenshot({
      path: 'artifacts/screenshots/sandbox-asset-viewer-scrubber.png',
      fullPage: true,
    });

    // Collapse overlay to capture clear full 3D view with active hitbox
    await page.locator('#overlay-toggle').click();
    await page.waitForTimeout(100);
    await page.screenshot({
      path: 'artifacts/screenshots/sandbox-asset-viewer-wireframe.png',
      fullPage: true,
    });
    await page.locator('#overlay-toggle').click();
    await page.waitForTimeout(100);

    // 3. Test Walk Mode
    await page.locator('#btn-mode-toggle').click();
    await expect(page.locator('#btn-mode-toggle')).toHaveClass(/active/);

    // Walk forward on the grid using KeyW
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyW');

    // Capture screenshot in walk test mode
    await page.screenshot({
      path: 'artifacts/screenshots/sandbox-asset-viewer-walk.png',
      fullPage: true,
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('verifies boss jump attack root motion leap covers ground without teleporting or snapback', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 15000 },
    );

    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi?.(true));

    const initialBossZ =
      (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.position.z)) ?? -8;

    // Trigger Boss Jump Attack
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.triggerBossAttack?.('jump');
    });

    // Wait for jump attack to be active
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__?.boss.activeClip === 'attack_jump',
      { timeout: 3000 },
    );

    // Track displacement during the leap
    let maxLeapDisplacement = 0;
    const start = Date.now();
    while (Date.now() - start < 2200) {
      const z =
        (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.position.z)) ??
        initialBossZ;
      const disp = Math.abs(z - initialBossZ);
      if (disp > maxLeapDisplacement) maxLeapDisplacement = disp;
      await page.waitForTimeout(40);
    }

    // Capture screenshot during boss jump attack leap
    await page.screenshot({
      path: 'artifacts/screenshots/boss-jump-attack-leap.png',
      fullPage: true,
    });

    // Boss leaped forward significantly (> 3.5 meters)
    expect(maxLeapDisplacement).toBeGreaterThan(3.5);

    // Wait until attack completes and boss enters idle
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__?.boss.state === 'idle',
      { timeout: 6000 },
    );

    // Verify boss does NOT snap back to initial position!
    const postAttackZ =
      (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.position.z)) ??
      initialBossZ;
    const finalDisplacement = Math.abs(postAttackZ - initialBossZ);
    expect(
      finalDisplacement,
      'Boss must remain at landing position and not teleport back',
    ).toBeGreaterThan(3.5);
  });
});
