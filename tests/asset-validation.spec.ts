import { expect, test } from '@playwright/test';

test.describe('Milestone 3 Asset & Animation Validation Gate', () => {
  test('loads HunterG4, G4Ax, and enemy_2, verifies skeletons, sockets, and animations', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/asset-test.html');
    await expect(page.locator('#test-canvas')).toBeVisible();

    // 1. Wait for assets to finish loading
    await page.waitForFunction(
      () => {
        const testObj = window.__ASSET_TEST__;
        return testObj && (testObj.diagnostics.loaded || testObj.diagnostics.error !== null);
      },
      { timeout: 15000 },
    );

    const diag = await page.evaluate(() => window.__ASSET_TEST__?.diagnostics);
    expect(diag).not.toBeNull();
    expect(diag?.error).toBeNull();
    expect(diag?.loaded).toBe(true);

    // 2. Validate Player Skeleton & Weapon Socket
    expect(diag?.player.bonesCount).toBeGreaterThanOrEqual(30);
    expect(diag?.player.handBoneFound).toBe(true);
    expect(diag?.player.weaponAttached).toBe(true);
    expect(diag?.player.height).toBeGreaterThan(1.6);
    expect(diag?.player.height).toBeLessThan(1.9);

    // Verify player clips
    const requiredPlayerClips = [
      'idle',
      'walk',
      'run',
      'dodge',
      'attack_light',
      'attack_heavy',
      'death',
    ];
    for (const clip of requiredPlayerClips) {
      expect(diag?.player.clips).toContain(clip);
    }

    // 3. Validate Boss Skeleton & Clips
    expect(diag?.boss.bonesCount).toBeGreaterThanOrEqual(50);
    expect(diag?.boss.handBoneFound).toBe(true);
    expect(diag?.boss.height).toBeGreaterThan(1.8);
    expect(diag?.boss.height).toBeLessThan(3.0);

    const requiredBossClips = ['idle', 'walking', 'attack_heavy', 'special', 'hit', 'die'];
    for (const clip of requiredBossClips) {
      expect(diag?.boss.clips).toContain(clip);
    }

    // 4. Capture Initial Idle Screenshot
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'artifacts/screenshots/asset-validation-idle.png', fullPage: true });

    // 5. Test Weapon Attachment Stability during sword attack Animation
    await page.evaluate(() => window.__ASSET_TEST__?.playPlayerClip('attack_light'));

    // Sample distance between axe and hand bone throughout attack animation
    const distances: number[] = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(60);
      const d = await page.evaluate(() => window.__ASSET_TEST__?.getWeaponDistanceToHand() ?? 999);
      distances.push(d);
    }

    // Verify weapon remained firmly attached (relative socket offset ~0.05m, never detached)
    for (const d of distances) {
      expect(d).toBeLessThan(0.20);
    }

    // Capture Player Attack Screenshot
    await page.screenshot({ path: 'artifacts/screenshots/asset-validation-player-attack.png', fullPage: true });

    // 6. Test Boss Attack Animation
    await page.evaluate(() => window.__ASSET_TEST__?.playBossClip('attack_heavy'));
    await page.waitForTimeout(300);

    const activeBossClip = await page.evaluate(() => window.__ASSET_TEST__?.diagnostics.boss.activeClip);
    expect(activeBossClip).toBe('attack_heavy');

    // Capture Boss Attack Screenshot
    await page.screenshot({ path: 'artifacts/screenshots/asset-validation-boss-attack.png', fullPage: true });

    // 7. Verify Zero Console & Page Errors
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
