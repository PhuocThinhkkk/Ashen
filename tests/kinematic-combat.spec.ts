import { expect, test } from '@playwright/test';
import {
  KINEMATIC_ACTIONS,
  getKinematicAction,
  toFrame,
  toTime,
} from '../src/combat/KinematicData';

test.describe('Kinematic Combat System & Action Configurations', () => {
  test('verifies all 14 kinematic actions are properly defined with phases, hitboxes, crossfades, vfx, and audio', () => {
    const requiredActionIds = [
      'kick',
      'attack_360',
      'attack_heavy',
      'attack_combo',
      'attack_jump',
      'hit',
      'dodge',
      'idle',
      'attack_light',
      'run',
      'strafe_left',
      'strafe_right',
      'walk_backward',
      'walk',
    ];

    for (const id of requiredActionIds) {
      const action = getKinematicAction(id);
      expect(action, `Action "${id}" must be defined in KINEMATIC_ACTIONS`).toBeDefined();
      expect(action!.fps).toBe(60);
      expect(action!.totalFrames).toBeGreaterThan(0);
      expect(action!.phases.length).toBeGreaterThanOrEqual(2);
      expect(action!.crossfadeDurationOut).toBeGreaterThan(0);
    }
  });

  test('verifies precise crossfade durations out of Recovery phase match blueprint specifications', () => {
    // Blueprint specified durations:
    expect(KINEMATIC_ACTIONS.attack_light.crossfadeDurationOut).toBe(0.15); // Fast attack out
    expect(KINEMATIC_ACTIONS.kick.crossfadeDurationOut).toBe(0.20);
    expect(KINEMATIC_ACTIONS.attack_heavy.crossfadeDurationOut).toBe(0.25);
    expect(KINEMATIC_ACTIONS.attack_360.crossfadeDurationOut).toBe(0.30);
    expect(KINEMATIC_ACTIONS.attack_combo.crossfadeDurationOut).toBe(0.35);
    expect(KINEMATIC_ACTIONS.attack_jump.crossfadeDurationOut).toBe(0.40); // Landing recover
    expect(KINEMATIC_ACTIONS.dodge.crossfadeDurationOut).toBe(0.20);
    expect(KINEMATIC_ACTIONS.hit.crossfadeDurationOut).toBe(0.20);
    expect(KINEMATIC_ACTIONS.run.crossfadeDurationOut).toBe(0.20);
  });

  test('verifies bone-socketed hitboxes and exact Impact frame windows', () => {
    // 1. Kick: LeftFoot, frames 36-47, peak frame 43
    const kick = KINEMATIC_ACTIONS.kick;
    expect(kick.hitbox?.boneName).toBe('mixamorig:LeftFoot');
    expect(kick.hitbox?.activeStartFrame).toBe(36);
    expect(kick.hitbox?.activeEndFrame).toBe(47);
    expect(kick.hitbox?.peakVelocityFrame).toBe(43);
    expect(kick.hitbox?.peakVelocityMs).toBe(9.5);

    // 2. Light Attack: RightHand, frames 36-44, peak frame 41
    const light = KINEMATIC_ACTIONS.attack_light;
    expect(light.hitbox?.boneName).toBe('mixamorig:RightHand');
    expect(light.hitbox?.activeStartFrame).toBe(36);
    expect(light.hitbox?.activeEndFrame).toBe(44);
    expect(light.hitbox?.peakVelocityFrame).toBe(41);
    expect(light.hitbox?.peakVelocityMs).toBe(53.9);

    // 3. Downward Slam: RightHand, frames 50-56, peak frame 52
    const downward = KINEMATIC_ACTIONS.attack_heavy;
    expect(downward.hitbox?.boneName).toBe('mixamorig:RightHand');
    expect(downward.hitbox?.activeStartFrame).toBe(50);
    expect(downward.hitbox?.activeEndFrame).toBe(56);
    expect(downward.hitbox?.peakVelocityFrame).toBe(52);
    expect(downward.hitbox?.peakVelocityMs).toBe(104.3);

    // 4. 360 Spin Heavy: RightHand, frames 56-64, peak frame 60
    const spin360 = KINEMATIC_ACTIONS.attack_360;
    expect(spin360.hitbox?.boneName).toBe('mixamorig:RightHand');
    expect(spin360.hitbox?.activeStartFrame).toBe(56);
    expect(spin360.hitbox?.activeEndFrame).toBe(64);
    expect(spin360.hitbox?.peakVelocityFrame).toBe(60);
    expect(spin360.hitbox?.peakVelocityMs).toBe(87.0);

    // 5. Jump Attack: RightHand, frames 103-109, peak frame 106
    const jump = KINEMATIC_ACTIONS.attack_jump;
    expect(jump.hitbox?.boneName).toBe('mixamorig:RightHand');
    expect(jump.hitbox?.activeStartFrame).toBe(103);
    expect(jump.hitbox?.activeEndFrame).toBe(109);
    expect(jump.hitbox?.peakVelocityFrame).toBe(106);
    expect(jump.hitbox?.peakVelocityMs).toBe(93.3);

    // 6. Combo: RightHand, 3 swing windows + finisher frames 158-164, peak frame 159
    const combo = KINEMATIC_ACTIONS.attack_combo;
    expect(combo.hitbox?.boneName).toBe('mixamorig:RightHand');
    expect(combo.hitbox?.activeWindows?.length).toBe(3);
    expect(combo.hitbox?.activeStartFrame).toBe(158);
    expect(combo.hitbox?.activeEndFrame).toBe(164);
    expect(combo.hitbox?.peakVelocityFrame).toBe(159);
    expect(combo.hitbox?.peakVelocityMs).toBe(81.6);
  });

  test('verifies root motion configuration for Jump Attack vs In-Place actions', () => {
    // Jump Attack has real root motion (-5.9m forward)
    expect(KINEMATIC_ACTIONS.attack_jump.rootMotion.type).toBe('Root Motion');
    expect(KINEMATIC_ACTIONS.attack_jump.rootMotion.deltaY).toBe(-5.9);

    // All other attacks are strictly In-Place
    expect(KINEMATIC_ACTIONS.kick.rootMotion.type).toBe('In-Place');
    expect(KINEMATIC_ACTIONS.attack_360.rootMotion.type).toBe('In-Place');
    expect(KINEMATIC_ACTIONS.attack_heavy.rootMotion.type).toBe('In-Place');
    expect(KINEMATIC_ACTIONS.attack_combo.rootMotion.type).toBe('In-Place');
    expect(KINEMATIC_ACTIONS.attack_light.rootMotion.type).toBe('In-Place');
    expect(KINEMATIC_ACTIONS.dodge.rootMotion.type).toBe('In-Place');
    expect(KINEMATIC_ACTIONS.idle.rootMotion.type).toBe('In-Place');
  });

  test('verifies VFX landing dust frames map to feet bones and peak velocity sparks map to peak frames', () => {
    // Jump attack landing dust at frame 99 on LeftFoot and RightFoot
    const jumpVfx = KINEMATIC_ACTIONS.attack_jump.vfx;
    expect(jumpVfx.landingDustFrames).toBeDefined();
    expect(jumpVfx.landingDustFrames![0].frame).toBe(99);
    expect(jumpVfx.landingDustFrames![0].bones).toContain('mixamorig:LeftFoot');
    expect(jumpVfx.landingDustFrames![0].bones).toContain('mixamorig:RightFoot');
    expect(jumpVfx.peakSparksFrame).toBe(106);
    expect(jumpVfx.peakSparksCount).toBeGreaterThanOrEqual(40);

    // Dodge roll landing dust at frame 106
    const rollVfx = KINEMATIC_ACTIONS.dodge.vfx;
    expect(rollVfx.landingDustFrames).toBeDefined();
    expect(rollVfx.landingDustFrames?.some((d) => d.frame === 106)).toBe(true);

    // Run footstep dust at frame 29
    const runVfx = KINEMATIC_ACTIONS.run.vfx;
    expect(runVfx.landingDustFrames).toBeDefined();
    expect(runVfx.landingDustFrames![0].frame).toBe(29);
  });

  test('verifies audio hooks are synchronized with peak velocity and footstep frames', () => {
    // Light attack swoosh at frame 35, peak impact at 41
    const lightAudio = KINEMATIC_ACTIONS.attack_light.audio;
    expect(lightAudio.peakSwooshFrame).toBe(35);
    expect(lightAudio.peakImpactFrame).toBe(41);

    // Jump attack leap swoosh at 58, landing footstep at 99, ground smash at 108
    const jumpAudio = KINEMATIC_ACTIONS.attack_jump.audio;
    expect(jumpAudio.peakSwooshFrame).toBe(58);
    expect(jumpAudio.footstepFrames?.some((f) => f.frame === 99)).toBe(true);
    expect(jumpAudio.peakImpactFrame).toBe(108);

    // Run footsteps at frames 5 and 29
    const runAudio = KINEMATIC_ACTIONS.run.audio;
    expect(runAudio.footstepFrames?.map((f) => f.frame)).toEqual([5, 29]);
  });

  test('verifies time <-> frame conversions', () => {
    expect(toFrame(0)).toBe(1);
    expect(toFrame(1 / 60)).toBe(2);
    expect(toFrame(41 / 60)).toBe(42);
    expect(toTime(1)).toBe(0);
    expect(toTime(61)).toBe(1.0);
  });
});

test.describe('In-Engine Kinematic Controller Runtime Validation', () => {
  test('verifies in-engine entity kinematic controllers, bone sockets, and hitboxes', async ({
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

    // Verify bone socket distances
    const playerWeaponDist = await page.evaluate(
      () => window.__THREE_GAME_TEST_HOOKS__?.getPlayerWeaponDistanceToHand?.() ?? 999,
    );
    const bossWeaponDist = await page.evaluate(
      () => window.__THREE_GAME_TEST_HOOKS__?.getBossWeaponDistanceToHand?.() ?? 999,
    );

    expect(playerWeaponDist).toBeLessThan(0.20);
    expect(bossWeaponDist).toBeLessThan(0.45);

    // Execute attack and verify combat response
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(
      () => window.__THREE_GAME_DIAGNOSTICS__?.player.state === 'attack',
      { timeout: 3000 },
    );

    const activeClip = await page.evaluate(
      () => window.__THREE_GAME_DIAGNOSTICS__?.player.activeClip,
    );
    expect(activeClip).toBe('attack_light');

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
