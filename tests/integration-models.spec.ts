import { expect, test } from '@playwright/test';

test.describe('Milestone 3 Main Game Model & Animation Integration', () => {
  test('verifies 3D models load, animations crossfade, weapons remain socketed, and combat functions flawlessly in main game', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('requestfailed', (req) => {
      failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });

    await page.goto('/');
    await expect(page.locator('#game-canvas')).toBeVisible();

    // 1. Wait for both GLB models to fully load
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 15000 },
    );

    const initialDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(initialDiag).not.toBeNull();
    expect(initialDiag?.assetsLoaded).toBe(true);
    expect(initialDiag?.player.loaded).toBe(true);
    expect(initialDiag?.boss.loaded).toBe(true);
    expect(initialDiag?.player.activeClip).toBe('HumanArmature|Idle_swordRight');
    expect(initialDiag?.boss.activeClip).toBe('idle');

    // Verify initial weapon attachments
    const playerWeaponDist = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getPlayerWeaponDistanceToHand?.() ?? 999);
    const bossWeaponDist = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getBossWeaponDistanceToHand?.() ?? 999);
    expect(playerWeaponDist).toBeLessThan(0.20);
    expect(bossWeaponDist).toBeLessThan(0.25);

    // Capture main game idle screenshot
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'artifacts/screenshots/main-game-idle.png', fullPage: true });

    // 2. Test Locomotion Transitions (Idle -> Walking -> Sprinting)
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(200);

    const walkDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(walkDiag?.player.state).toBe('moving');
    expect(walkDiag?.player.activeClip).toBe('HumanArmature|Walking');

    // Hold Shift for sprint
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(300);

    const sprintDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(sprintDiag?.player.activeClip).toBe('HumanArmature|Run');
    expect(sprintDiag?.player.speed).toBeGreaterThan(6.0);

    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);

    const postMoveDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(postMoveDiag?.player.state).toBe('idle');
    expect(postMoveDiag?.player.activeClip).toBe('HumanArmature|Idle_swordRight');

    // 3. Test Dodge Roll & Weapon Attachment during Roll
    await page.keyboard.press('Space');

    let sawRollClip = false;
    let maxRollWeaponDist = 0;
    const rollStart = Date.now();
    while (Date.now() - rollStart < 500) {
      const clip = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.activeClip);
      if (clip === 'HumanArmature|Roll_sword') sawRollClip = true;
      const dist = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getPlayerWeaponDistanceToHand?.() ?? 999);
      if (dist > maxRollWeaponDist) maxRollWeaponDist = dist;
      await page.waitForTimeout(30);
    }

    expect(sawRollClip, 'Dodge should trigger Roll_sword animation').toBe(true);
    expect(maxRollWeaponDist, 'Sword must stay firmly attached during roll').toBeLessThan(0.20);

    // 4. Test Lock-On & Approach Boss
    await page.keyboard.press('KeyQ');
    await expect(page.locator('#lockon-reticle')).toBeVisible();

    // Walk forward into melee combat range (dist <= 3.0)
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        if (!d) return false;
        const dx = d.player.position.x - d.boss.position.x;
        const dz = d.player.position.z - d.boss.position.z;
        return Math.sqrt(dx * dx + dz * dz) <= 3.0;
      },
      { timeout: 10000 },
    );
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);

    // Capture combat confrontation screenshot
    await page.screenshot({ path: 'artifacts/screenshots/main-game-combat.png', fullPage: true });

    // 5. Test Light Attack & Boss Damage
    const bossHpBeforeAttack = (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.hp)) ?? 420;
    await page.keyboard.press('KeyJ'); // Light attack

    // Check light attack animation
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.state === 'attack', { timeout: 2000 });
    const attackClip = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.activeClip);
    expect(attackClip).toBe('HumanArmature|Run_swordAttack');

    // Capture player attack screenshot
    await page.screenshot({ path: 'artifacts/screenshots/main-game-player-attack.png', fullPage: true });

    await page.waitForFunction(
      (hp) => (window.__THREE_GAME_DIAGNOSTICS__?.boss.hp ?? 420) < hp,
      bossHpBeforeAttack,
      { timeout: 4000 },
    );

    const postLightHp = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.hp ?? 420);
    expect(postLightHp).toBeLessThan(bossHpBeforeAttack);

    // Wait for boss punish window (recovery or idle) and player stamina to recharge
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return (
          d &&
          d.player.state === 'idle' &&
          d.player.stamina >= 35 &&
          (d.boss.state === 'recovery' || (d.boss.state === 'idle' && d.boss.hp > 0))
        );
      },
      { timeout: 8000 },
    );

    // 6. Test Heavy Attack
    const bossHpBeforeHeavy = (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.hp)) ?? postLightHp;
    await page.keyboard.press('KeyK'); // Heavy attack

    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.state === 'attack', { timeout: 2000 });
    const heavyClip = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.activeClip);
    expect(heavyClip).toBe('HumanArmature|swordAttackJump');

    await page.waitForFunction(
      (hp) => (window.__THREE_GAME_DIAGNOSTICS__?.boss.hp ?? 420) < hp,
      bossHpBeforeHeavy,
      { timeout: 5000 },
    );

    const postHeavyHp = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.hp ?? 420);
    expect(postHeavyHp).toBeLessThan(bossHpBeforeHeavy);

    // 7. Test Phase 2 Transition
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('boss_phase2'));
    await page.waitForTimeout(200);

    const phase2Diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(phase2Diag?.boss.isPhase2).toBe(true);
    expect(phase2Diag?.boss.activeClip).toBe('taunt');

    await page.screenshot({ path: 'artifacts/screenshots/main-game-boss-phase2.png', fullPage: true });

    // 8. Test Player Death Animation & YOU DIED overlay
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('player_dead'));
    await page.waitForTimeout(200);

    const playerDeadDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(playerDeadDiag?.player.state).toBe('dead');
    expect(playerDeadDiag?.player.activeClip).toBe('HumanArmature|Death');
    await expect(page.locator('#death-overlay')).toBeVisible();

    // 9. Test Instant In-Engine Restart (KeyR)
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(200);

    const resetDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(resetDiag?.player.hp).toBe(100);
    expect(resetDiag?.boss.hp).toBe(420);
    expect(resetDiag?.player.state).toBe('idle');
    expect(resetDiag?.player.activeClip).toBe('HumanArmature|Idle_swordRight');
    expect(resetDiag?.boss.activeClip).toBe('idle');
    await expect(page.locator('#death-overlay')).toBeHidden();

    // 10. Test Boss Defeat & Victory Overlay
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('boss_dead'));
    await page.waitForTimeout(200);

    const bossDeadDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(bossDeadDiag?.boss.state).toBe('dead');
    expect(bossDeadDiag?.boss.activeClip).toBe('die');
    await expect(page.locator('#victory-overlay')).toBeVisible();

    // Reset back
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(150);

    // 11. Verify zero errors and zero failed requests
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test('verifies boss attacks deal damage to player and dodge i-frames protect player', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#game-canvas')).toBeVisible();

    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.assetsLoaded === true);

    // Lock on and walk close to boss
    await page.keyboard.press('KeyQ');
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        if (!d) return false;
        const dx = d.player.position.x - d.boss.position.x;
        const dz = d.player.position.z - d.boss.position.z;
        return Math.sqrt(dx * dx + dz * dz) <= 3.0;
      },
      { timeout: 10000 },
    );
    await page.keyboard.up('KeyW');

    // Wait for boss to wind up and strike player
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d ? d.player.hp < 100 : false;
      },
      { timeout: 6000 },
    );

    const damagedDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(damagedDiag!.player.hp).toBeLessThan(100);

    // Reset run
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(200);

    const resetDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(resetDiag?.player.hp).toBe(100);

    // Test dodge roll i-frames flag
    await page.keyboard.press('Space');
    let hasInvulnerable = false;
    const start = Date.now();
    while (Date.now() - start < 500) {
      const isInv = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.isInvulnerable ?? false);
      if (isInv) hasInvulnerable = true;
      await page.waitForTimeout(25);
    }
    expect(hasInvulnerable, 'Player gains invulnerability frames during roll').toBe(true);
  });
});
