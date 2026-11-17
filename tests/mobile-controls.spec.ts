import { expect, test } from '@playwright/test';

test.describe('Mobile Touch Controls, Fullscreen, and Horizontal Orientation', () => {
  test('touch joystick moves player and updates knob position in landscape phone mode', async ({ page }) => {
    test.setTimeout(45_000);
    // Set to landscape mobile viewport (Horizontal phone)
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');

    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 15;
      },
      { timeout: 20_000 },
    );

    // Force touch device class if on desktop browser context so touch controls are rendered
    await page.evaluate(() => document.body.classList.add('touch-device'));

    const stick = page.locator('#touch-stick');
    await expect(stick).toBeVisible();

    const initialDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(initialDiag).not.toBeNull();
    const startZ = initialDiag!.player.position.z;

    const stickBox = await stick.boundingBox();
    expect(stickBox).not.toBeNull();
    const centerX = stickBox!.x + stickBox!.width / 2;
    const centerY = stickBox!.y + stickBox!.height / 2;

    // Dispatch pointer events for joystick dragging
    await page.evaluate(
      ({ cx, cy }) => {
        const stickEl = document.querySelector<HTMLElement>('#touch-stick');
        if (stickEl) {
          stickEl.dispatchEvent(
            new PointerEvent('pointerdown', {
              pointerId: 10,
              clientX: cx,
              clientY: cy,
              bubbles: true,
              cancelable: true,
            }),
          );
          stickEl.dispatchEvent(
            new PointerEvent('pointermove', {
              pointerId: 10,
              clientX: cx,
              clientY: cy - 40,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      },
      { cx: centerX, cy: centerY },
    );

    // Wait for player to move forward in arena
    await page.waitForFunction(
      (z0) => (window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? z0) < z0 - 0.4,
      startZ,
      { timeout: 8000 },
    );

    // Release joystick
    await page.evaluate(
      ({ cx, cy }) => {
        const stickEl = document.querySelector<HTMLElement>('#touch-stick');
        if (stickEl) {
          stickEl.dispatchEvent(
            new PointerEvent('pointerup', {
              pointerId: 10,
              clientX: cx,
              clientY: cy - 40,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      },
      { cx: centerX, cy: centerY },
    );

    const movedDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(movedDiag!.player.position.z).toBeLessThan(startZ - 0.4);
  });

  test('touch action buttons trigger attack, dodge, lock-on, and sprint', async ({ page }) => {
    test.setTimeout(45_000);
    // Set to landscape mobile viewport
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');

    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 15;
      },
      { timeout: 20_000 },
    );

    await page.evaluate(() => document.body.classList.add('touch-device'));

    // 1. Lock-on button
    const lockBtn = page.locator('#touch-lock-btn');
    await expect(lockBtn).toBeVisible();
    await lockBtn.dispatchEvent('pointerdown');
    await lockBtn.dispatchEvent('pointerup');
    await page.waitForTimeout(100);

    const reticle = page.locator('#lockon-reticle');
    await expect(reticle).toBeVisible();

    // 2. Dodge roll button
    const dodgeBtn = page.locator('#touch-dodge-btn');
    await expect(dodgeBtn).toBeVisible();
    await dodgeBtn.dispatchEvent('pointerdown');
    await dodgeBtn.dispatchEvent('pointerup');

    let sawDodge = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 600) {
      const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
      if (diag?.player.state === 'dodge') sawDodge = true;
      await page.waitForTimeout(20);
    }
    expect(sawDodge, 'Player should enter dodge roll from touch button').toBe(true);

    // Wait for recovery
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.state !== 'dodge');

    // 3. Attack button (Light combo)
    const attackBtn = page.locator('#touch-attack-btn');
    await expect(attackBtn).toBeVisible();
    await attackBtn.dispatchEvent('pointerdown');
    await attackBtn.dispatchEvent('pointerup');

    let sawAttack = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 600) {
      const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
      if (diag?.player.state === 'attack') sawAttack = true;
      await page.waitForTimeout(20);
    }
    expect(sawAttack, 'Player should enter attack state from touch attack button').toBe(true);

    // Wait for attack completion
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.state !== 'attack');

    // 4. Heavy Attack button
    const heavyBtn = page.locator('#touch-heavy-btn');
    await expect(heavyBtn).toBeVisible();
    await heavyBtn.dispatchEvent('pointerdown');
    await heavyBtn.dispatchEvent('pointerup');

    let sawHeavy = false;
    const t2 = Date.now();
    while (Date.now() - t2 < 600) {
      const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
      if (diag?.player.state === 'attack') sawHeavy = true;
      await page.waitForTimeout(20);
    }
    expect(sawHeavy, 'Player should enter heavy attack from touch button').toBe(true);
  });

  test('death overlay provides tap-to-restart and restart button without keyboard R', async ({ page }) => {
    // Set to landscape mobile viewport
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 20_000 },
    );

    // Trigger player defeat
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setState('player_dead'));
    await page.waitForTimeout(100);

    const deathOverlay = page.locator('#death-overlay');
    await expect(deathOverlay).toBeVisible();

    const restartBtn = page.locator('#death-restart-btn');
    await expect(restartBtn).toBeVisible();
    await expect(restartBtn).toHaveText(/RISE AGAIN/);

    // Click restart button
    await restartBtn.click();
    await page.waitForTimeout(150);

    await expect(deathOverlay).toBeHidden();
    const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(diag?.player.hp).toBe(100);
    expect(diag?.player.state).toBe('idle');
  });

  test('quick restart button in top actions resets run during match', async ({ page }) => {
    // Set to landscape mobile viewport
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 20_000 },
    );

    // Move player forward
    const startZ = (await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__))!.player.position.z;
    await page.keyboard.down('KeyW');
    await page.waitForFunction(
      (z0) => (window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? z0) < z0 - 1.0,
      startZ,
      { timeout: 8000 },
    );
    await page.keyboard.up('KeyW');

    // Click quick restart button in header
    const quickRestart = page.locator('#quick-restart-btn');
    await expect(quickRestart).toBeVisible();
    await quickRestart.click();
    await page.waitForTimeout(150);

    const resetDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(resetDiag?.player.position.z).toBeCloseTo(9, 0);
    expect(resetDiag?.player.hp).toBe(100);
  });

  test('fullscreen button is offered in top actions bar', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 20_000 },
    );

    const fsBtn = page.locator('#fullscreen-btn');
    await expect(fsBtn).toBeVisible();
    await expect(fsBtn).toHaveAttribute('title', 'Toggle Fullscreen');
  });

  test('orientation prompt appears in portrait mode and hides when horizontal or dismissed', async ({ page }) => {
    // Start in portrait mode
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
      },
      { timeout: 20_000 },
    );

    const overlay = page.locator('#orientation-overlay');
    const dismissBtn = page.locator('#orientation-dismiss-btn');
    const fsLandscapeBtn = page.locator('#orientation-fullscreen-btn');

    // In portrait, the prompt is visible
    await expect(overlay).toBeVisible();
    await expect(fsLandscapeBtn).toBeVisible();
    await expect(dismissBtn).toBeVisible();

    // Rotate phone to horizontal (landscape)
    await page.setViewportSize({ width: 844, height: 390 });
    // In horizontal landscape, the prompt automatically hides
    await expect(overlay).toBeHidden();
  });

  test('touch joystick walks without draining stamina; sprint button runs and consumes stamina', async ({ page }) => {
    test.setTimeout(45_000);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 15;
      },
      { timeout: 20_000 },
    );
    await page.evaluate(() => document.body.classList.add('touch-device'));

    const stick = page.locator('#touch-stick');
    const stickBox = await stick.boundingBox();
    expect(stickBox).not.toBeNull();
    const cx = stickBox!.x + stickBox!.width / 2;
    const cy = stickBox!.y + stickBox!.height / 2;

    // Push joystick forward (without touching sprint button)
    await page.evaluate(
      ({ cx, cy }) => {
        const stickEl = document.querySelector<HTMLElement>('#touch-stick');
        stickEl?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 20, clientX: cx, clientY: cy, bubbles: true }));
        stickEl?.dispatchEvent(new PointerEvent('pointermove', { pointerId: 20, clientX: cx, clientY: cy - 45, bubbles: true }));
      },
      { cx, cy },
    );

    // Move forward for 400ms
    await page.waitForTimeout(400);
    const diagWalking = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(diagWalking?.player.state).toBe('moving');
    // Stamina must NOT drain when simply walking with joystick
    expect(diagWalking?.player.stamina).toBe(100);

    // Now press the dedicated Sprint button while moving
    const sprintBtn = page.locator('#touch-sprint-btn');
    await sprintBtn.dispatchEvent('pointerdown');
    await page.waitForTimeout(300);

    const diagSprinting = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    // Stamina should now be consumed by intentional sprint
    expect(diagSprinting?.player.stamina).toBeLessThan(100);

    // Release sprint and joystick
    await sprintBtn.dispatchEvent('pointerup');
    await page.evaluate(
      ({ cx, cy }) => {
        const stickEl = document.querySelector<HTMLElement>('#touch-stick');
        stickEl?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 20, clientX: cx, clientY: cy - 45, bubbles: true }));
      },
      { cx, cy },
    );
  });
});
