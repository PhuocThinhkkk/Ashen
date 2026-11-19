import { expect, test } from '@playwright/test';

test.describe('Soulslike Boss Fight Combat System', () => {
  test('executes full combat loop: movement, lock-on, dodge i-frames, attacks, damage, and instant restart', async ({
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
    await expect(page.locator('#game-canvas')).toBeVisible();

    // 1. Wait for game initialization
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 15;
      },
      { timeout: 15000 },
    );

    const initialDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(initialDiag).not.toBeNull();
    expect(initialDiag?.player.hp).toBe(100);
    expect(initialDiag?.player.stamina).toBe(100);
    expect(initialDiag?.boss.hp).toBe(420);

    // Capture arena start screenshot
    await page.screenshot({ path: 'artifacts/screenshots/combat-arena-start.png', fullPage: true });

    // 2. Test Movement & Sprint
    const startZ = initialDiag!.player.position.z;
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      (z0) => (window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? z0) < z0 - 0.5,
      startZ,
      { timeout: 8000 },
    );
    await page.keyboard.up('KeyW');

    const movedDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(movedDiag!.player.position.z).toBeLessThan(startZ - 0.5);

    // 3. Test Lock-On Target Toggle
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(100);
    const reticle = page.locator('#lockon-reticle');
    await expect(reticle).toBeVisible();

    // 4. Test Dodge Roll & Invincibility Frames (i-frames)
    await page.keyboard.press('Space');

    // Poll during the roll to capture dodge state and i-frames
    let sawInvulnerable = false;
    let sawDodgeState = false;
    const startTime = Date.now();
    while (Date.now() - startTime < 550) {
      const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
      if (diag?.player.state === 'dodge') sawDodgeState = true;
      if (diag?.player.isInvulnerable) sawInvulnerable = true;
      await page.waitForTimeout(25);
    }

    expect(sawDodgeState, 'Player should enter dodge roll state').toBe(true);
    expect(sawInvulnerable, 'Player should gain invincibility frames during roll').toBe(true);

    const postDodgeDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(postDodgeDiag!.player.stamina).toBeLessThan(90); // Stamina deducted

    // Wait for roll recovery to complete
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.state !== 'dodge');

    // 5. Test Approaching Boss & Landing Attack
    // Walk forward close to the boss
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        if (!d) return false;
        const p = d.player.position;
        const b = d.boss.position;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        return Math.sqrt(dx * dx + dz * dz) <= 2.5;
      },
      { timeout: 12000 },
    );
    await page.keyboard.up('KeyW');

    // Wait until player is ready to attack
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.player.state !== 'stagger' && d.player.stamina >= 20;
      },
      { timeout: 4000 },
    );

    // Press attack (Light Attack)
    await page.keyboard.press('KeyJ');

    // Verify boss took damage
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d ? d.boss.hp < 420 : false;
      },
      { timeout: 4000 },
    );

    const postAttackDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(postAttackDiag!.boss.hp).toBeLessThan(420);

    // Capture combat encounter screenshot
    await page.screenshot({ path: 'artifacts/screenshots/combat-boss-encounter.png', fullPage: true });

    // 6. Test Instant In-Engine Restart (KeyY)
    await page.keyboard.press('KeyY');
    await page.waitForTimeout(150);

    const resetDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(resetDiag!.player.hp).toBe(100);
    expect(resetDiag!.player.stamina).toBe(100);
    expect(resetDiag!.boss.hp).toBe(420);
    expect(resetDiag!.player.position.z).toBeCloseTo(9, 0);
    expect(resetDiag!.boss.position.z).toBeCloseTo(-8, 0);

    // 7. Verify Zero Console & Page Errors
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('displays YOU DIED screen on player defeat and resets with R', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

    // Trigger player defeat via test hooks
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('player_dead'));
    await page.waitForTimeout(100);

    const deathOverlay = page.locator('#death-overlay');
    await expect(deathOverlay).toBeVisible();
    await expect(page.locator('.death-title')).toHaveText('YOU DIED');

    await page.screenshot({ path: 'artifacts/screenshots/combat-death-screen.png', fullPage: true });

    // Press R to resurrect
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(150);

    await expect(deathOverlay).toBeHidden();
    const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(diag?.player.hp).toBe(100);
    expect(diag?.player.state).toBe('idle');
  });

  test('displays LEGEND VANQUISHED screen on boss defeat', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

    // Trigger boss defeat via test hooks
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('boss_dead'));
    await page.waitForTimeout(100);

    const victoryOverlay = page.locator('#victory-overlay');
    await expect(victoryOverlay).toBeVisible();
    await expect(page.locator('.victory-title')).toHaveText('LEGEND VANQUISHED');

    await page.screenshot({ path: 'artifacts/screenshots/combat-victory-screen.png', fullPage: true });

    // Press R to restart
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(150);

    await expect(victoryOverlay).toBeHidden();
    const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(diag?.boss.hp).toBe(420);
    expect(diag?.boss.state).toBe('idle');
  });
});
