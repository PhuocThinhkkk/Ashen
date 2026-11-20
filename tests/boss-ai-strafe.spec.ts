import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { BOSS_ATTACKS } from '../src/combat/FrameCombat';
import { BossAI, BOSS_CONFIG, type PlayerCombatSnapshot } from '../src/entities/boss/BossAI';

test.describe('FromSoftware-Style Boss AI & Strafe Subgoal Stack', () => {
  // ---------------------------------------------------------------------------
  // 1. PURE LOGIC UNIT TESTS FOR GOAL-STACK, PUNISH, AND COMBO BRANCHING
  // ---------------------------------------------------------------------------
  test('BossAI initializes correctly and manages LIFO goal stack', () => {
    const mockBoss: any = {
      state: 'idle',
      stateTimer: 0,
      group: new THREE.Group(),
      distanceTo: () => 6.0,
      faceTarget: () => {},
      updateLocomotionWeights: () => {},
      startAttackAction: () => {},
      endAttackAction: () => {},
    };

    const ai = new BossAI(mockBoss);
    expect(ai.goalStack.length).toBe(0);
    expect(ai.attackCooldown).toBe(0);
    expect(ai.preferredOrbitRadius).toBe(5.5);
    expect(ai.maxTurnRate).toBeCloseTo(THREE.MathUtils.degToRad(BOSS_CONFIG.turnRateDegreesPerSec), 4);

    ai.pushSubgoal({ type: 'STRAFE_INSPECT', duration: 2.0 });
    expect(ai.getCurrentSubgoal()?.type).toBe('STRAFE_INSPECT');
    expect(ai.goalStack.length).toBe(1);

    const popped = ai.popSubgoal();
    expect(popped?.type).toBe('STRAFE_INSPECT');
    expect(ai.goalStack.length).toBe(0);
  });

  test('queueCombo constructs reverse LIFO stack: [ATTACK(followup), COMBO_CHECK, ATTACK(opener)]', () => {
    const mockBoss: any = {
      state: 'idle',
      stateTimer: 0,
      group: new THREE.Group(),
      rawClips: [],
      distanceTo: () => 2.5,
      faceTarget: () => {},
      updateLocomotionWeights: () => {},
      startAttackAction: () => {},
      endAttackAction: () => {},
    };

    const ai = new BossAI(mockBoss);
    ai.queueCombo(BOSS_ATTACKS.combo, BOSS_ATTACKS.downward, 4.2);

    expect(ai.goalStack.length).toBe(3);
    // Stack order (LIFO: index 2 is top/opener, index 1 is check, index 0 is followup)
    expect(ai.goalStack[0].type).toBe('ATTACK');
    expect(ai.goalStack[0].attack?.name).toBe(BOSS_ATTACKS.downward.name);

    expect(ai.goalStack[1].type).toBe('COMBO_CHECK');
    expect(ai.goalStack[1].maxDistance).toBe(4.2);

    expect(ai.goalStack[2].type).toBe('ATTACK');
    expect(ai.goalStack[2].attack?.name).toBe(BOSS_ATTACKS.combo.name);

    expect(mockBoss.state).toBe('windup');
    expect(mockBoss.currentAttack?.name).toBe(BOSS_ATTACKS.combo.name);
  });

  test('COMBO_CHECK aborts remaining attacks and transitions to STRAFE_INSPECT when player rolls out of range (> 4.2m)', () => {
    let distToPlayer = 5.0; // Player dodged out of range!
    const mockBoss: any = {
      state: 'idle',
      stateTimer: 0,
      group: new THREE.Group(),
      rawClips: [],
      distanceTo: () => distToPlayer,
      faceTarget: () => {},
      updateLocomotionWeights: () => {},
      startAttackAction: () => {},
      endAttackAction: () => {},
    };

    const ai = new BossAI(mockBoss);
    ai.queueCombo(BOSS_ATTACKS.combo, BOSS_ATTACKS.downward, 4.2);

    // Simulate completion of opener attack: opener finishes recovery and boss becomes idle
    mockBoss.state = 'idle';
    mockBoss.currentAttack = null;
    ai.popSubgoal(); // pops ATTACK (opener)
    expect(ai.getCurrentSubgoal()?.type).toBe('COMBO_CHECK');

    const playerSnapshot: PlayerCombatSnapshot = {
      position: new THREE.Vector3(0, 0, distToPlayer),
      velocity: new THREE.Vector3(),
      isHealing: false,
      isAttacking: false,
      isStaggered: false,
    };

    // Update AI: COMBO_CHECK executes
    ai.update(0.016, playerSnapshot);

    // Verify: stack was cleared of followup attack, cooldown applied (1.5-2.8s), and STRAFE_INSPECT pushed
    expect(ai.attackCooldown).toBeGreaterThanOrEqual(1.5);
    expect(ai.attackCooldown).toBeLessThanOrEqual(2.8);
    expect(ai.getCurrentSubgoal()?.type).toBe('STRAFE_INSPECT');
    expect(ai.goalStack.length).toBe(1);
  });

  test('COMBO_CHECK advances to follow-up attack when player remains within range (<= 4.2m)', () => {
    let distToPlayer = 3.0; // In range
    const mockBoss: any = {
      state: 'idle',
      stateTimer: 0,
      group: new THREE.Group(),
      rawClips: [],
      distanceTo: () => distToPlayer,
      faceTarget: () => {},
      updateLocomotionWeights: () => {},
      startAttackAction: () => {},
      endAttackAction: () => {},
    };

    const ai = new BossAI(mockBoss);
    ai.queueCombo(BOSS_ATTACKS.combo, BOSS_ATTACKS.downward, 4.2);

    // Simulate completion of opener attack: opener finishes recovery and boss becomes idle
    mockBoss.state = 'idle';
    mockBoss.currentAttack = null;
    ai.popSubgoal();
    expect(ai.getCurrentSubgoal()?.type).toBe('COMBO_CHECK');

    const playerSnapshot: PlayerCombatSnapshot = {
      position: new THREE.Vector3(0, 0, distToPlayer),
      velocity: new THREE.Vector3(),
      isHealing: false,
      isAttacking: false,
      isStaggered: false,
    };

    // Update AI: COMBO_CHECK pops and starts followup
    ai.update(0.016, playerSnapshot);

    expect(ai.getCurrentSubgoal()?.type).toBe('ATTACK');
    expect(ai.getCurrentSubgoal()?.attack?.name).toBe(BOSS_ATTACKS.downward.name);
    expect(mockBoss.state).toBe('windup');
    expect(mockBoss.currentAttack?.name).toBe(BOSS_ATTACKS.downward.name);
  });

  test('Frame-1 Punish: Immediately clears goalStack, resets attackCooldown = 0, and pushes jump attack when player drinks', () => {
    const mockBoss: any = {
      state: 'idle',
      stateTimer: 0,
      group: new THREE.Group(),
      rawClips: [],
      distanceTo: () => 5.5,
      faceTarget: () => {},
      updateLocomotionWeights: () => {},
      startAttackAction: () => {},
      endAttackAction: () => {},
    };

    const ai = new BossAI(mockBoss);
    ai.attackCooldown = 2.5;
    ai.pushSubgoal({ type: 'STRAFE_INSPECT', duration: 2.5 });

    const playerSnapshot: PlayerCombatSnapshot = {
      position: new THREE.Vector3(0, 0, 5.5),
      velocity: new THREE.Vector3(),
      isHealing: true, // FRAME 1 HEALING DETECTED!
      isAttacking: false,
      isStaggered: false,
    };

    ai.update(0.016, playerSnapshot);

    // Stack cleared and replaced with punish attack
    expect(ai.attackCooldown).toBe(0);
    expect(ai.goalStack.length).toBe(1);
    expect(ai.getCurrentSubgoal()?.type).toBe('ATTACK');
    expect(ai.getCurrentSubgoal()?.attack?.name).toBe(BOSS_ATTACKS.jump.name);
    expect(mockBoss.state).toBe('windup');
    expect(mockBoss.currentAttack?.name).toBe(BOSS_ATTACKS.jump.name);
  });

  test('Short raycaster / arena boundary inverts strafeDir when obstacle is hit', () => {
    const mockBoss: any = {
      state: 'idle',
      stateTimer: 0,
      group: new THREE.Group(),
      radius: 1.0,
      distanceTo: () => 5.5,
      faceTarget: () => {},
      updateLocomotionWeights: () => {},
      startAttackAction: () => {},
      endAttackAction: () => {},
    };
    mockBoss.group.position.set(19.5, 0, 0); // Near arena wall (radius 21.0)
    mockBoss.group.rotation.y = 0; // facing -Z, right vector is +X

    const ai = new BossAI(mockBoss);
    ai.strafeDir = 1; // strafing right towards +X (towards the wall)
    ai.pushSubgoal({ type: 'STRAFE_INSPECT', duration: 2.5, strafeDir: 1 });

    const playerSnapshot: PlayerCombatSnapshot = {
      position: new THREE.Vector3(19.5, 0, -5.5),
      velocity: new THREE.Vector3(),
      isHealing: false,
      isAttacking: false,
      isStaggered: false,
    };

    ai.update(0.016, playerSnapshot, null, 21.0);

    // Because futurePos (19.5 + 2.0 = 21.5) exceeds boundary limit (21 - 1 - 0.5 = 19.5),
    // strafeDir should immediately invert from 1 to -1!
    expect(ai.strafeDir).toBe(-1);
    expect(ai.getCurrentSubgoal()?.strafeDir).toBe(-1);
  });

  test('Clamped turn rate tracks during windup and freezes during active swing frames', () => {
    let faceTargetCalledCount = 0;
    const mockBoss: any = {
      state: 'windup',
      attackTimer: 0,
      group: new THREE.Group(),
      radius: 1.0,
      currentAttack: BOSS_ATTACKS.downward, // startup 0.65, active 0.3, recovery 0.8
      distanceTo: () => 3.0,
      faceTarget: (_pos: THREE.Vector3, _rate: number, _dt: number) => {
        faceTargetCalledCount++;
      },
      updateLocomotionWeights: () => {},
      startAttackAction: () => {},
      endAttackAction: () => {},
    };

    const ai = new BossAI(mockBoss);
    ai.pushSubgoal({ type: 'ATTACK', attack: BOSS_ATTACKS.downward });

    const playerSnapshot: PlayerCombatSnapshot = {
      position: new THREE.Vector3(0, 0, 3.0),
      velocity: new THREE.Vector3(),
      isHealing: false,
      isAttacking: false,
      isStaggered: false,
    };

    // 1. Windup frame (attackTimer = 0.3s < startup 0.95s)
    mockBoss.attackTimer = 0.3;
    ai.update(0.016, playerSnapshot);
    expect(mockBoss.state).toBe('windup');
    expect(ai.isAttackActiveFrames).toBe(false);
    expect(faceTargetCalledCount).toBe(1);

    // 2. Active frame (attackTimer = 1.0s >= startup 0.95s and < startup+active 1.17s)
    mockBoss.attackTimer = 1.0;
    ai.update(0.016, playerSnapshot);
    expect(mockBoss.state).toBe('active');
    expect(ai.isAttackActiveFrames).toBe(true); // ROTATION FROZEN!
    // faceTarget should NOT have been called during active frames
    expect(faceTargetCalledCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 2. IN-BROWSER PLAYWRIGHT INTEGRATION TESTS
  // ---------------------------------------------------------------------------
  test('Browser: Boss executes STRAFE_INSPECT with directional strafe animation blending', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.locator('#game-canvas')).toBeVisible();

    // Wait for game diagnostics ready
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
    });

    // Put boss directly into STRAFE_INSPECT via test hook
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setBossSubgoal?.({
        type: 'STRAFE_INSPECT',
        duration: 3.0,
        timer: 0,
        strafeDir: 1, // strafe right
      });
      window.__THREE_GAME_TEST_HOOKS__?.setBossAttackCooldown?.(2.5);
    });

    // Let the game run for several frames to allow locomotion weight damping
    await page.waitForTimeout(400);

    const diag = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getBossAIDiagnostics?.());
    expect(diag).not.toBeNull();
    expect(diag.subgoal).toBe('STRAFE_INSPECT');
    expect(diag.attackCooldown).toBeGreaterThan(0);
    expect(diag.locomotionMasterWeight).toBeGreaterThan(0.5);

    // During strafe right, strafeRight weight should be higher than idle or strafeLeft
    expect(diag.locomotionWeights.strafeRight).toBeGreaterThan(0.2);
    expect(diag.locomotionWeights.strafeLeft).toBeLessThan(0.1);

    // Now switch to strafe left
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setBossSubgoal?.({
        type: 'STRAFE_INSPECT',
        duration: 3.0,
        timer: 0,
        strafeDir: -1, // strafe left
      });
    });

    await page.waitForTimeout(400);
    const diagLeft = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getBossAIDiagnostics?.());
    expect(diagLeft.locomotionWeights.strafeLeft).toBeGreaterThan(0.2);
    expect(diagLeft.locomotionWeights.strafeRight).toBeLessThan(0.1);

    expect(consoleErrors).toEqual([]);
  });

  test('Browser: Frame-1 Punish interrupts strafing to execute gap-closing jump attack when player drinks', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.goto('/');
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
    });

    // Damage player slightly so healing is valid, put boss into STRAFE_INSPECT
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setPlayerHp?.(50);
      window.__THREE_GAME_TEST_HOOKS__?.setBossSubgoal?.({
        type: 'STRAFE_INSPECT',
        duration: 3.0,
        timer: 0,
        strafeDir: 1,
      });
      window.__THREE_GAME_TEST_HOOKS__?.setBossAttackCooldown?.(2.5);
    });

    // Trigger player drink/heal
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.triggerHeal?.();
    });

    // Within next frames, boss must immediately cancel strafe and switch to attack_jump
    await page.waitForFunction(() => {
      const diag = window.__THREE_GAME_TEST_HOOKS__?.getBossAIDiagnostics?.();
      return diag && diag.subgoal === 'ATTACK' && (diag.activeClip === 'attack_jump' || diag.subgoalData?.attack?.animationClip === 'attack_jump');
    }, { timeout: 3000 });

    const postPunishDiag = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getBossAIDiagnostics?.());
    expect(postPunishDiag.subgoal).toBe('ATTACK');
    expect(postPunishDiag.attackCooldown).toBe(0);
  });

  test('Browser: Mid-combo distance branching aborts Hit 2 if player rolls away (> 4.2m)', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.goto('/');
    await page.waitForFunction(() => {
      const d = window.__THREE_GAME_DIAGNOSTICS__;
      return d && d.assetsLoaded === true && (d.frame ?? 0) > 10;
    });

    // Queue combo: opener ('combo') -> check -> followup ('downward')
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.queueBossCombo?.('combo', 'downward');
    });

    // Confirm opener attack started
    const initialDiag = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getBossAIDiagnostics?.());
    expect(initialDiag.goalStack.length).toBe(3);

    // Teleport player out of range (> 4.2m)
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.setPlayerPosition?.({ x: 0, y: 0, z: 8.0 });
    });

    // Wait for opener attack to finish and COMBO_CHECK to execute
    await page.waitForFunction(() => {
      const diag = window.__THREE_GAME_TEST_HOOKS__?.getBossAIDiagnostics?.();
      // When out-of-range is detected, stack is cleared and STRAFE_INSPECT is pushed
      return diag && diag.subgoal === 'STRAFE_INSPECT';
    }, { timeout: 4000 });

    const branchedDiag = await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.getBossAIDiagnostics?.());
    expect(branchedDiag.subgoal).toBe('STRAFE_INSPECT');
    expect(branchedDiag.attackCooldown).toBeGreaterThan(0);
    // Followup attack was aborted
    expect(branchedDiag.goalStack.some((s: any) => s.attack?.name === BOSS_ATTACKS.downward.name)).toBe(false);
  });
});
