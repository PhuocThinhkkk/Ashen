import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { splitClipByBodyPart, isLowerBodyBone } from '../src/utils/AnimationSplitter';

test.describe('Upper/Lower Body Animation Layering & Masking Unit Tests', () => {
  test('splitClipByBodyPart correctly divides tracks into upper and lower body without losing tracks or freezing bones', () => {
    // Construct a synthetic AnimationClip with Mixamo humanoid bone tracks
    const boneNames = [
      'mixamorig:Hips',
      'mixamorig:LeftUpLeg',
      'mixamorig:LeftLeg',
      'mixamorig:LeftFoot',
      'mixamorig:LeftToeBase',
      'mixamorig:RightUpLeg',
      'mixamorig:RightLeg',
      'mixamorig:RightFoot',
      'mixamorig:RightToeBase',
      'mixamorig:Spine',
      'mixamorig:Spine1',
      'mixamorig:Spine2',
      'mixamorig:Neck',
      'mixamorig:Head',
      'mixamorig:LeftShoulder',
      'mixamorig:LeftArm',
      'mixamorig:LeftForeArm',
      'mixamorig:LeftHand',
      'mixamorig:LeftHandIndex1',
      'mixamorig:RightShoulder',
      'mixamorig:RightArm',
      'mixamorig:RightForeArm',
      'mixamorig:RightHand',
      'mixamorig:RightHandIndex1',
    ];

    const tracks: THREE.KeyframeTrack[] = [];
    const times = [0, 0.5, 1.0];
    const quatValues = [0, 0, 0, 1, 0, 0.1, 0, 0.99, 0, 0, 0, 1];
    const posValues = [0, 0, 0, 0, 0.1, 0, 0, 0, 0];

    // Hips has both position and rotation
    tracks.push(new THREE.VectorKeyframeTrack('mixamorig:Hips.position', times, posValues));
    tracks.push(new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', times, quatValues));

    for (let i = 1; i < boneNames.length; i++) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneNames[i]}.quaternion`, times, quatValues));
    }

    const testClip = new THREE.AnimationClip('TestFullBody', 1.0, tracks);
    const { upper, lower } = splitClipByBodyPart(testClip);

    // 1. Durations match original
    expect(upper.duration).toBe(1.0);
    expect(lower.duration).toBe(1.0);

    // 2. No tracks are lost
    expect(upper.tracks.length + lower.tracks.length).toBe(tracks.length);

    // 3. Lower body tracks contain Hips (position + rotation) and leg bones
    const lowerTrackNames = lower.tracks.map((t) => t.name);
    expect(lowerTrackNames).toContain('mixamorig:Hips.position');
    expect(lowerTrackNames).toContain('mixamorig:Hips.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:LeftUpLeg.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:LeftLeg.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:LeftFoot.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:LeftToeBase.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:RightUpLeg.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:RightLeg.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:RightFoot.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:RightToeBase.quaternion');

    // 4. Upper body tracks contain Spine, Neck, Head, Shoulders, Arms, Hands, Fingers
    const upperTrackNames = upper.tracks.map((t) => t.name);
    expect(upperTrackNames).toContain('mixamorig:Spine.quaternion');
    expect(upperTrackNames).toContain('mixamorig:Spine1.quaternion');
    expect(upperTrackNames).toContain('mixamorig:Spine2.quaternion');
    expect(upperTrackNames).toContain('mixamorig:Neck.quaternion');
    expect(upperTrackNames).toContain('mixamorig:Head.quaternion');
    expect(upperTrackNames).toContain('mixamorig:LeftShoulder.quaternion');
    expect(upperTrackNames).toContain('mixamorig:LeftArm.quaternion');
    expect(upperTrackNames).toContain('mixamorig:LeftForeArm.quaternion');
    expect(upperTrackNames).toContain('mixamorig:LeftHand.quaternion');
    expect(upperTrackNames).toContain('mixamorig:LeftHandIndex1.quaternion');
    expect(upperTrackNames).toContain('mixamorig:RightShoulder.quaternion');
    expect(upperTrackNames).toContain('mixamorig:RightArm.quaternion');
    expect(upperTrackNames).toContain('mixamorig:RightForeArm.quaternion');
    expect(upperTrackNames).toContain('mixamorig:RightHand.quaternion');
    expect(upperTrackNames).toContain('mixamorig:RightHandIndex1.quaternion');

    // 5. Zero overlap between upper and lower tracks
    for (const name of lowerTrackNames) {
      expect(upperTrackNames).not.toContain(name);
    }
  });

  test('isLowerBodyBone helper cleanly identifies leg vs upper bones with or without prefix', () => {
    expect(isLowerBodyBone('mixamorig:Hips')).toBe(true);
    expect(isLowerBodyBone('mixamorig:LeftUpLeg')).toBe(true);
    expect(isLowerBodyBone('mixamorig:RightFoot')).toBe(true);
    expect(isLowerBodyBone('LeftToeBase')).toBe(true);
    expect(isLowerBodyBone('thigh_L')).toBe(true);

    expect(isLowerBodyBone('mixamorig:Spine')).toBe(false);
    expect(isLowerBodyBone('mixamorig:Spine1')).toBe(false);
    expect(isLowerBodyBone('mixamorig:Neck')).toBe(false);
    expect(isLowerBodyBone('mixamorig:Head')).toBe(false);
    expect(isLowerBodyBone('mixamorig:RightHand')).toBe(false);
    expect(isLowerBodyBone('mixamorig:LeftArm')).toBe(false);
    expect(isLowerBodyBone('mixamorig:RightHandThumb1')).toBe(false);
  });
});

test.describe('In-Game Drinking-While-Walking & Jumping Combat Integration', () => {
  test('executes drinking while walking: upper body drinks, lower body walks, HP restores at 55%', async ({ page }) => {
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
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 30;
      },
      { timeout: 15_000 },
    );

    // Initial state check
    const initialDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(initialDiag).not.toBeNull();
    expect(initialDiag?.player.hp).toBe(200);

    // Damage the player slightly so healing is observable
    await page.evaluate(() => {
      (window as any).__THREE_GAME_TEST_HOOKS__?.setPlayerHp?.(60);
    });
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.player.hp ?? 100) === 60);

    const damagedHp = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.hp ?? 100);
    expect(damagedHp).toBe(60);

    // 1. Trigger Drink via KeyE while walking backward away from boss
    await page.keyboard.down('KeyS');
    await page.waitForTimeout(100);

    // Press E to trigger heal
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(100);

    // Verify drinking state active
    const drinkActive = await page.evaluate(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      const hooks = (window as any).__THREE_GAME_TEST_HOOKS__;
      const drinkInfo = hooks?.getPlayerDrinkDiagnostics?.();
      return {
        isDrinking: d?.player.isDrinking || drinkInfo?.isDrinking,
        upperClip: d?.player.upperClip || drinkInfo?.upperClip,
        lowerClip: d?.player.lowerClip || drinkInfo?.lowerClip,
        flaskVisible: drinkInfo?.flaskVisible,
      };
    });

    expect(drinkActive.isDrinking).toBe(true);
    expect(drinkActive.upperClip).toBe('drinking');
    expect(drinkActive.lowerClip).toBe('walk');
    expect(drinkActive.flaskVisible).toBe(true);

    // 2. Poll until ~55% progress where HP tick occurs
    let sawHealTick = false;
    const pollStart = Date.now();
    while (Date.now() - pollStart < 4000) {
      const currentHp = await page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d?.player.hp ?? 0;
      });
      if (currentHp > damagedHp) {
        sawHealTick = true;
        break;
      }
      await page.waitForTimeout(100);
    }

    expect(sawHealTick, 'Player HP recovery tick should trigger before drink finishes').toBe(true);

    // 3. Wait for drinking action to complete
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && !d.player.isDrinking;
      },
      { timeout: 5000 },
    );

    await page.keyboard.up('KeyS');

    // 4. Verify upper body smoothly returned to locomotion / idle and flask is hidden
    const postDrinkDiag = await page.evaluate(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      const hooks = (window as any).__THREE_GAME_TEST_HOOKS__;
      const drinkInfo = hooks?.getPlayerDrinkDiagnostics?.();
      return {
        isDrinking: d?.player.isDrinking,
        upperClip: d?.player.upperClip,
        flaskVisible: drinkInfo?.flaskVisible,
      };
    });

    expect(postDrinkDiag.isDrinking).toBe(false);
    expect(postDrinkDiag.flaskVisible).toBe(false);
    expect(postDrinkDiag.upperClip).not.toBe('drinking');

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes jumping, mid-air attacks, and procedural target-lock pitch tilt', async ({ page }) => {
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
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 15;
      },
      { timeout: 15_000 },
    );

    // 1. Lock on to boss
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(100);

    // 2. Trigger Jump via KeyF
    await page.keyboard.press('KeyF');

    // Poll during ascent
    let sawAirborne = false;
    let sawTiltAngle = false;
    let maxPosY = 0;
    let maxTilt = 0;

    const jumpStart = Date.now();
    while (Date.now() - jumpStart < 500) {
      const jumpDiag = await page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        const hooks = (window as any).__THREE_GAME_TEST_HOOKS__;
        const j = hooks?.getPlayerJumpDiagnostics?.();
        return {
          isGrounded: d?.player.isGrounded ?? j?.isGrounded,
          posY: d?.player.position.y ?? j?.posY,
          tiltAngle: d?.player.tiltAngle ?? j?.tiltAngle ?? 0,
        };
      });

      if (!jumpDiag.isGrounded && jumpDiag.posY > 0.1) {
        sawAirborne = true;
      }
      if (jumpDiag.posY > maxPosY) maxPosY = jumpDiag.posY;
      if (jumpDiag.tiltAngle > maxTilt) maxTilt = jumpDiag.tiltAngle;
      if (jumpDiag.tiltAngle > 0.05) sawTiltAngle = true;

      await page.waitForTimeout(30);
    }

    expect(sawAirborne, 'Player should become airborne during jump').toBe(true);
    expect(maxPosY, 'Player Y height should ascend above ground level').toBeGreaterThan(0.4);
    expect(sawTiltAngle, 'Target-lock pitch tilt should engage when airborne above target').toBe(true);
    expect(maxTilt, 'Downward pitch tilt must be clamped within 30 degrees (0.52 rad)').toBeLessThanOrEqual(0.53);

    // 3. Wait for landing
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.player.isGrounded === true && d.player.position.y === 0;
      },
      { timeout: 5000 },
    );

    // 4. Verify spine tilt resets smoothly to 0 upon landing
    await page.waitForTimeout(200);
    const landedTilt = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.tiltAngle ?? 0);
    expect(landedTilt).toBeLessThan(0.05);

    // 5. Test Mid-Air Attack Mixing
    // Jump again and trigger attack in mid-air
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(100);

    // Trigger light attack mid-air
    await page.keyboard.press('KeyJ');

    // Poll for mid-air attack
    let sawAirborneAttack = false;
    let sawUpperAttackLowerJump = false;
    const airAttackStart = Date.now();

    while (Date.now() - airAttackStart < 450) {
      const airDiag = await page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        const hooks = (window as any).__THREE_GAME_TEST_HOOKS__;
        const j = hooks?.getPlayerJumpDiagnostics?.();
        return {
          isAirborneAttack: d?.player.isAirborneAttack || j?.isAirborneAttack,
          upperClip: d?.player.upperClip || j?.upperClip,
          lowerClip: d?.player.lowerClip || j?.lowerClip,
        };
      });

      if (airDiag.isAirborneAttack) sawAirborneAttack = true;
      if (airDiag.upperClip === 'attack_light' && airDiag.lowerClip === 'jumping') {
        sawUpperAttackLowerJump = true;
      }
      await page.waitForTimeout(25);
    }

    expect(sawAirborneAttack, 'Player should enter mid-air attack state').toBe(true);
    expect(sawUpperAttackLowerJump, 'Upper body should play attack_light while lower body plays jumping').toBe(true);

    // Wait for clean landing recovery
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.player.isGrounded === true && !d.player.isAirborneAttack;
      },
      { timeout: 5000 },
    );

    // 6. Verify Lock-On Jump Attack aims downward & connects reliably against boss
    await page.keyboard.press('KeyY');
    await page.waitForTimeout(120);
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(80);
    const initialBossHp = await page.evaluate(() => {
      const hooks = (window as any).__THREE_GAME_TEST_HOOKS__;
      hooks?.setBossAttackCooldown?.(10);
      hooks?.setBossPosition?.({ x: 0, y: 0, z: 0 });
      hooks?.setPlayerPosition?.({ x: 0, y: 0, z: 2.5 });
      return window.__THREE_GAME_DIAGNOSTICS__?.boss.hp ?? 800;
    });
    await page.waitForTimeout(80);

    await page.keyboard.press('KeyF');
    await page.waitForTimeout(90);
    await page.keyboard.press('KeyJ');

    let capturedAirScreenshot = false;
    let peakJumpAttackTilt = 0;
    const connectStart = Date.now();
    while (Date.now() - connectStart < 750) {
      const state = await page.evaluate(() => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        const j = (window as any).__THREE_GAME_TEST_HOOKS__?.getPlayerJumpDiagnostics?.();
        return {
          tiltAngle: d?.player.tiltAngle ?? j?.tiltAngle ?? 0,
          isAirborneAttack: d?.player.isAirborneAttack ?? j?.isAirborneAttack ?? false,
          posY: d?.player.position.y ?? 0,
          bossHp: d?.boss.hp ?? 800,
        };
      });
      if (state.tiltAngle > peakJumpAttackTilt) peakJumpAttackTilt = state.tiltAngle;
      if (!capturedAirScreenshot && state.isAirborneAttack && state.posY > 0.7 && state.tiltAngle > 0.05) {
        await page.waitForTimeout(180);
        await page.screenshot({ path: 'artifacts/screenshots/player-jump-lockon-attack.png' });
        capturedAirScreenshot = true;
      }
      await page.waitForTimeout(25);
    }

    const postJumpBossHp = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.boss.hp ?? 800);
    expect(peakJumpAttackTilt, 'Lock-on jump attack must pitch spine downward toward boss').toBeGreaterThan(0.05);
    expect(postJumpBossHp, 'Lock-on jump attack must connect and damage the boss').toBeLessThan(initialBossHp);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('executes limited 2 heal charges per match with bottom-left potion HUD, empty state gating, and Y reset', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

    // 1. Verify bottom-left Potion HUD widget and initial 2 charges
    const potionHud = page.locator('#potion-hud');
    await expect(potionHud).toBeVisible();
    const badge = page.locator('#potion-charges-badge');
    await expect(badge).toHaveText('2');

    // 2. Damage player to 40 HP and position boss far away to avoid interrupt kill
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setPlayerHp?.(40);
      window.__THREE_GAME_TEST_HOOKS__?.setBossPosition?.({ x: 0, y: 0, z: -15 });
    });
    await page.waitForTimeout(50);

    // 3. First heal: press Key R
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d?.player.isDrinking === true;
    });

    // Wait for heal tick (~55% progress)
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.player.hp >= 80;
    });

    // Verify charge decremented to 1 when heal actually occurred
    await expect(badge).toHaveText('1');

    // Wait for first drink to complete
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.player.isDrinking === false;
    });

    // 4. Second heal: damage player again and keep boss far away, press Key R
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setPlayerHp?.(40);
      window.__THREE_GAME_TEST_HOOKS__?.setBossPosition?.({ x: 0, y: 0, z: -15 });
    });
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d?.player.isDrinking === true;
    });

    // Wait for second heal tick (~55% progress)
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.player.hp >= 80;
    });

    // Verify charge decremented to 0 and empty class is added when second heal occurred
    await expect(badge).toHaveText('0');
    await expect(potionHud).toHaveClass(/empty/);

    // Wait for second drink to complete
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.player.isDrinking === false;
    });

    // 5. Third attempt: try to heal with 0 charges
    await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setPlayerHp?.(35));
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(300);

    const zeroChargeDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(zeroChargeDiag?.player.isDrinking, 'Player must not drink when charges are 0').toBe(false);
    expect(zeroChargeDiag?.player.hp, 'Player HP must remain unchanged when charges are 0').toBe(35);
    await expect(badge).toHaveText('0');

    // 6. Reset match via Key Y
    await page.keyboard.press('KeyY');
    await page.waitForTimeout(150);

    const resetDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(resetDiag?.player.healCharges, 'Heal charges must reset to 2').toBe(2);
    expect(resetDiag?.player.hp, 'Player HP must reset to 200').toBe(200);
    await expect(badge).toHaveText('2');
    await expect(potionHud).not.toHaveClass(/empty/);

    // 7. Verify Controls Guide is accessible in settings tab
    const orientationOverlay = page.locator('#orientation-overlay');
    if (await orientationOverlay.isVisible().catch(() => false)) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(200);
    }
    await page.locator('#game-settings-btn').click({ force: true });
    await page.locator('.settings-tab-btn[data-tab="gameplay"]').click();
    await expect(page.locator('.controls-guide-grid')).toBeVisible();
    await expect(page.locator('.controls-guide-grid')).toContainText('Space (Tap)');
    await expect(page.locator('.controls-guide-grid')).toContainText('Drink Health Potion');

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('interrupting heal action via dodge or damage before heal tick does not decrease bottle of heal', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);

    const potionHud = page.locator('#potion-hud');
    await expect(potionHud).toBeVisible();
    const badge = page.locator('#potion-charges-badge');
    await expect(badge).toHaveText('2');

    // Keep boss far away and damage player to 50 HP
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setBossPosition?.({ x: 0, y: 0, z: -20 });
      window.__THREE_GAME_TEST_HOOKS__?.setPlayerHp?.(50);
    });
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.hp === 50);

    // 1. Test dodge-cancelling drinking before heal tick
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.isDrinking === true);

    // Charge has NOT decremented yet because heal tick has not occurred
    await expect(badge).toHaveText('2');

    // Immediately dodge roll to interrupt drinking
    await page.keyboard.press('Space');
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.player.state === 'dodge' && !d.player.isDrinking;
    });

    // Verify bottle of heal remains 2 because drink was interrupted before heal tick
    await expect(badge).toHaveText('2');
    const postDodgeDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(postDodgeDiag?.player.healCharges).toBe(2);
    expect(postDodgeDiag?.player.hp).toBe(50); // HP not healed

    // Wait for dodge recovery
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.state !== 'dodge');

    // 2. Test damage interrupt before heal tick
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.player.isDrinking === true);
    await expect(badge).toHaveText('2');

    // Simulate damage stagger interrupt via player takeDamage
    await page.evaluate(() => {
      const hooks = (window as any).__THREE_GAME_TEST_HOOKS__;
      if (hooks?.triggerPlayerDamage) {
        hooks.triggerPlayerDamage(10, false);
      }
    });

    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && !d.player.isDrinking && d.player.state === 'stagger';
    });

    // Verify bottle of heal remains 2
    await expect(badge).toHaveText('2');
    const postStaggerDiag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
    expect(postStaggerDiag?.player.healCharges).toBe(2);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('Boss dual-layer bone splitting isolates hips/legs to lower clip and spine/arms/swords to upper clip', () => {
    const boneNames = [
      'mixamorig:Hips',
      'mixamorig:LeftUpLeg',
      'mixamorig:LeftLeg',
      'mixamorig:LeftFoot',
      'mixamorig:RightUpLeg',
      'mixamorig:RightLeg',
      'mixamorig:RightFoot',
      'mixamorig:Spine',
      'mixamorig:Spine1',
      'mixamorig:Neck',
      'mixamorig:Head',
      'mixamorig:LeftArm',
      'mixamorig:LeftHand',
      'mixamorig:RightArm',
      'mixamorig:RightHand',
    ];

    const tracks: THREE.KeyframeTrack[] = [];
    const times = [0, 0.5, 1.0];
    const quatValues = [0, 0, 0, 1, 0, 0.1, 0, 0.99, 0, 0, 0, 1];
    tracks.push(new THREE.VectorKeyframeTrack('mixamorig:Hips.position', times, [0, 0, 0, 0, 0, 0, 0, 0, 0]));
    for (const b of boneNames) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, quatValues));
    }

    const turnClip = new THREE.AnimationClip('turn_left', 1.0, tracks);
    const { upper, lower } = splitClipByBodyPart(turnClip);

    const lowerTrackNames = lower.tracks.map((t) => t.name);
    const upperTrackNames = upper.tracks.map((t) => t.name);

    // Lower clip contains hips and leg tracks exclusively
    expect(lowerTrackNames).toContain('mixamorig:Hips.position');
    expect(lowerTrackNames).toContain('mixamorig:Hips.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:LeftUpLeg.quaternion');
    expect(lowerTrackNames).toContain('mixamorig:RightFoot.quaternion');

    // Upper clip contains spine, arms, and hands exclusively (dual sword hold)
    expect(upperTrackNames).toContain('mixamorig:Spine.quaternion');
    expect(upperTrackNames).toContain('mixamorig:Neck.quaternion');
    expect(upperTrackNames).toContain('mixamorig:LeftHand.quaternion');
    expect(upperTrackNames).toContain('mixamorig:RightHand.quaternion');

    // Mutually exclusive: 0 track overlap
    for (const name of lowerTrackNames) {
      expect(upperTrackNames).not.toContain(name);
    }
  });

  test('Boss lower-body turn layer preserves independent upper-body attack execution without resetting swords', () => {
    // Construct scene and mixer
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    const spine = new THREE.Bone();
    spine.name = 'mixamorig:Spine';
    const rightHand = new THREE.Bone();
    rightHand.name = 'mixamorig:RightHand';
    hips.add(spine);
    spine.add(rightHand);
    root.add(hips);

    const mixer = new THREE.AnimationMixer(root);

    // Create upper body attack clip and lower body turn clip
    const times = [0, 0.5, 1.0];
    const quatValues = [0, 0, 0, 1, 0, 0.1, 0, 0.99, 0, 0, 0, 1];

    const upperTracks = [
      new THREE.QuaternionKeyframeTrack('mixamorig:Spine.quaternion', times, quatValues),
      new THREE.QuaternionKeyframeTrack('mixamorig:RightHand.quaternion', times, quatValues),
    ];
    const upperAttackClip = new THREE.AnimationClip('attack_combo__upper', 1.0, upperTracks);

    const lowerTracks = [
      new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', times, quatValues),
    ];
    const lowerTurnClip = new THREE.AnimationClip('turn_left__lower', 1.0, lowerTracks);

    const attackAction = mixer.clipAction(upperAttackClip);
    attackAction.setLoop(THREE.LoopOnce, 1);
    attackAction.clampWhenFinished = true;
    attackAction.setEffectiveWeight(1.0);
    attackAction.play();

    const turnAction = mixer.clipAction(lowerTurnClip);
    turnAction.setLoop(THREE.LoopRepeat, Infinity);
    turnAction.setEffectiveWeight(1.0);
    turnAction.play();

    // Advance mixer simulation by 0.2s
    mixer.update(0.2);

    // Both actions run concurrently on their respective bone hierarchies with full weight
    expect(attackAction.isRunning()).toBe(true);
    expect(turnAction.isRunning()).toBe(true);
    expect(attackAction.getEffectiveWeight()).toBe(1.0);
    expect(turnAction.getEffectiveWeight()).toBe(1.0);

    // Attack action time progresses independently
    expect(attackAction.time).toBeCloseTo(0.2, 2);
  });

  test('Boss turnable attack plays upper attack and lower idle sub-clips concurrently preserving 2H greatsword stance', () => {
    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorig:Hips';
    const spine = new THREE.Bone();
    spine.name = 'mixamorig:Spine';
    const rightHand = new THREE.Bone();
    rightHand.name = 'mixamorig:RightHand';
    hips.add(spine);
    spine.add(rightHand);
    root.add(hips);

    const mixer = new THREE.AnimationMixer(root);

    const times = [0, 0.5, 1.0];
    const quatValues = [0, 0, 0, 1, 0, 0.1, 0, 0.99, 0, 0, 0, 1];

    const upperTracks = [
      new THREE.QuaternionKeyframeTrack('mixamorig:Spine.quaternion', times, quatValues),
      new THREE.QuaternionKeyframeTrack('mixamorig:RightHand.quaternion', times, quatValues),
    ];
    const upperAttackClip = new THREE.AnimationClip('attack_heavy__upper', 1.0, upperTracks);

    const lowerTracks = [
      new THREE.QuaternionKeyframeTrack('mixamorig:Hips.quaternion', times, quatValues),
    ];
    const lowerIdleClip = new THREE.AnimationClip('idle__lower', 1.0, lowerTracks);

    const attackAction = mixer.clipAction(upperAttackClip);
    attackAction.setLoop(THREE.LoopOnce, 1);
    attackAction.clampWhenFinished = true;
    attackAction.setEffectiveWeight(1.0);
    attackAction.play();

    const idleLowerAction = mixer.clipAction(lowerIdleClip);
    idleLowerAction.setLoop(THREE.LoopRepeat, Infinity);
    idleLowerAction.setEffectiveWeight(1.0);
    idleLowerAction.play();

    mixer.update(0.2);

    expect(attackAction.isRunning()).toBe(true);
    expect(idleLowerAction.isRunning()).toBe(true);
    expect(attackAction.getEffectiveWeight()).toBe(1.0);
    expect(idleLowerAction.getEffectiveWeight()).toBe(1.0);
  });
});
