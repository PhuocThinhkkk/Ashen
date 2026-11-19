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
    expect(initialDiag?.player.hp).toBe(100);

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

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
