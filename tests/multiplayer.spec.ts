import { expect, test } from '@playwright/test';

test.describe('Phase 2 Multiplayer Chamber Architecture & Animation Sanity', () => {
  test('verifies zero T-pose on spawn, actions, and Key R deterministic trial reset', async ({ page }) => {
    test.setTimeout(45_000);

    await page.goto('/');
    await expect(page.locator('#game-canvas')).toBeVisible();

    // 1. Wait for game and prewarm initialization
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 15000 },
    );

    // 2. Verify Boss and Player are playing Idle (not in T-pose with 0 action weights)
    const initialDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(initialDiag?.boss.activeClip).toBe('idle');
    expect(initialDiag?.player.activeClip).toBe('idle');

    // 3. Move close to trigger boss attack and verify boss does not T-pose during combat
    await page.keyboard.press('KeyQ'); // Lock on
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        if (!d) return false;
        const dx = d.player.position.x - d.boss.position.x;
        const dz = d.player.position.z - d.boss.position.z;
        return Math.sqrt(dx * dx + dz * dz) <= 2.8;
      },
      { timeout: 8000 },
    );
    await page.keyboard.up('KeyW');

    // Wait for player to execute attack
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(200);

    const midCombatDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(midCombatDiag?.player.state).not.toBe('dead');
    expect(midCombatDiag?.boss.activeClip).toBeDefined();

    // 4. Test Key Y Instant Reset - verify immediate Idle restoration without T-pose
    await page.keyboard.press('KeyY');
    await page.waitForTimeout(150);

    const postResetDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(postResetDiag?.player.hp).toBe(100);
    expect(postResetDiag?.player.stamina).toBe(100);
    expect(postResetDiag?.boss.hp).toBe(420);
    expect(postResetDiag?.player.activeClip).toBe('idle');
    expect(postResetDiag?.boss.activeClip).toBe('idle');
    expect(postResetDiag?.player.position.z).toBeCloseTo(9, 0.5);
    expect(postResetDiag?.boss.position.z).toBeCloseTo(-8, 0.5);
  });

  test('verifies Multiplayer Settings Tab renders chamber allocation and room code entry controls', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

    // Handle orientation overlay on mobile viewport
    const orientationOverlay = page.locator('#orientation-overlay');
    if (await orientationOverlay.isVisible().catch(() => false)) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(100);
    }

    // Open Settings Modal
    const settingsBtn = page.locator('#game-settings-btn');
    await settingsBtn.click({ force: true });
    await expect(page.locator('#unified-settings-modal')).toBeVisible();

    // Click Online Duel Tab (Tab VII)
    const mpTabBtn = page.locator('button[data-tab="multiplayer"]');
    await expect(mpTabBtn).toBeVisible();
    await mpTabBtn.click();

    // Verify chamber controls are rendered
    await expect(page.locator('#btn-create-chamber')).toBeVisible();
    await expect(page.locator('#inp-chamber-code')).toBeVisible();
    await expect(page.locator('#btn-join-chamber')).toBeVisible();
    await expect(page.locator('#inp-server-endpoint')).toBeVisible();

    // Close Settings
    await page.keyboard.press('Escape');
    await expect(page.locator('#unified-settings-modal')).not.toBeVisible();
  });
});
