import * as THREE from 'three';
import { BOSS_ATTACKS, PLAYER_ATTACKS } from '../combat/FrameCombat';
import type { Game } from './Game';

export function installGameTestHooks(game: Game): void {
  const g = game as any;

  window.__THREE_GAME_TEST_HOOKS__ = {
    seed: (_n: number) => {},
    setPlayerHp: (hp: number) => {
      g.player.hp = hp;
      g.syncHud();
    },
    setState: (stateName: string) => {
      if (stateName === 'initial' || stateName === 'default') {
        g.resetRun();
      } else if (stateName === 'player_dead') {
        g.player.hp = 0;
        g.player.state = 'dead';
        g.player.playAction('death', 0.1, THREE.LoopOnce, true, 1.0);
        g.audio.stopBossMusic(1.5);
      } else if (stateName === 'boss_dead') {
        g.boss.hp = 0;
        g.boss.state = 'dead';
        g.boss.playAction('die', 0.1, THREE.LoopOnce, true, 1.0);
        g.audio.stopBossMusic(2.0);
      } else if (stateName === 'boss_phase2') {
        g.boss.hp = g.boss.maxHp * 0.45;
        g.boss.triggerPhase2(g.player.group.position);
        g.audio.transitionToBossPhase2();
      } else {
        throw new Error(`Unknown state: ${stateName}`);
      }
      g.syncHud();
      g.render();
      g.publishDiagnostics();
      return { state: stateName };
    },
    setPausedForScreenshot: (paused: boolean) => {
      g.pausedForScreenshot = paused;
      if (paused) {
        g.player.velocity.set(0, 0, 0);
      }
      g.render();
      g.publishDiagnostics();
    },
    hideDebugUi: (_hidden: boolean) => {
      g.settingsModal.close();
    },
    toggleHitboxDebug: (visible?: boolean) => {
      return g.toggleHitboxDebug(visible);
    },
    isHitboxDebugVisible: () => {
      return g.player.hitboxDebugger.isVisible;
    },
    setPlayerModel: async (modelId: string) => {
      await g.setPlayerModel(modelId);
      return { playerModel: modelId };
    },
    setBossModel: async (modelId: string) => {
      await g.setBossModel(modelId);
      return { bossModel: modelId };
    },
    getPlayerWeaponDistanceToHand: () => {
      if (!g.player.handBone || !g.player.swordObject) return 999;
      const handPos = new THREE.Vector3();
      const swordPos = new THREE.Vector3();
      g.player.handBone.updateMatrixWorld(true);
      g.player.swordObject.updateMatrixWorld(true);
      g.player.handBone.getWorldPosition(handPos);
      g.player.swordObject.getWorldPosition(swordPos);
      return handPos.distanceTo(swordPos);
    },
    getBossWeaponDistanceToHand: () => {
      if (!g.boss.handBone || !g.boss.greatswordGroup) return 999;
      const handPos = new THREE.Vector3();
      const swordPos = new THREE.Vector3();
      g.boss.handBone.updateMatrixWorld(true);
      g.boss.greatswordGroup.updateMatrixWorld(true);
      g.boss.handBone.getWorldPosition(handPos);
      g.boss.greatswordGroup.getWorldPosition(swordPos);
      return handPos.distanceTo(swordPos);
    },
    triggerHeal: () => {
      g.player.startDrink();
    },
    triggerPlayerDamage: (damage: number, isHeavy = false) => {
      return g.player.takeDamage(damage, isHeavy);
    },
    triggerJump: () => {
      g.player.startJump();
    },
    triggerMidAirAttack: (isHeavy = false) => {
      g.player.startMidAirAttack(isHeavy ? PLAYER_ATTACKS.heavy : PLAYER_ATTACKS.light1);
    },
    getPlayerJumpDiagnostics: () => ({
      isGrounded: g.player.isGrounded,
      verticalVelocity: g.player.verticalVelocity,
      isAirborneAttack: g.player.isAirborneAttack,
      tiltAngle: g.player.currentTiltAngle,
      posY: g.player.group.position.y,
      upperClip: g.player.currentUpperActionName,
      lowerClip: g.player.currentLowerActionName,
    }),
    getPlayerDrinkDiagnostics: () => {
      const drinkAction = g.player.upperActions.get('drinking');
      return {
        isDrinking: g.player.isDrinking,
        drinkTimer: g.player.drinkTimer,
        hasHealed: g.player.hasHealedDuringDrink,
        healCharges: g.player.healCharges,
        maxHealCharges: g.player.maxHealCharges,
        hp: g.player.hp,
        flaskVisible: g.player.flaskMesh ? g.player.flaskMesh.visible : false,
        upperClip: g.player.currentUpperActionName,
        lowerClip: g.player.currentLowerActionName,
        actionTime: drinkAction ? drinkAction.time : -1,
        actionDuration: drinkAction ? drinkAction.getClip().duration : -1,
        actionWeight: drinkAction ? drinkAction.getEffectiveWeight() : -1,
        actionRunning: drinkAction ? drinkAction.isRunning() : false,
        actionTimeScale: drinkAction ? drinkAction.getEffectiveTimeScale() : -1,
      };
    },
    triggerBossAttack: (attackKey: string) => {
      const atk = BOSS_ATTACKS[attackKey];
      if (atk) {
        g.boss.chooseAttack(atk);
      }
    },
    getBossAIDiagnostics: () => ({
      subgoal: g.boss.ai.getCurrentSubgoal()?.type ?? null,
      subgoalData: g.boss.ai.getCurrentSubgoal(),
      goalStack: g.boss.ai.goalStack.map((s: any) => ({ ...s })),
      attackCooldown: g.boss.ai.attackCooldown,
      strafeDir: g.boss.ai.strafeDir,
      isAttackActiveFrames: g.boss.ai.isAttackActiveFrames,
      locomotionWeights: { ...g.boss.currentWeights },
      locomotionMasterWeight: g.boss.locomotionMasterWeight,
      activeClip: g.boss.currentActionName,
      upperClip: g.boss.currentUpperActionName,
      lowerClip: g.boss.currentLowerActionName,
      turnDirection: g.boss.turnDirection,
      yaw: g.boss.group.rotation.y,
      locomotionWeightSum:
        (g.boss.idleAction?.isRunning() ? g.boss.idleAction.getEffectiveWeight() : 0) +
        (g.boss.walkForwardAction?.isRunning() ? g.boss.walkForwardAction.getEffectiveWeight() : 0) +
        (g.boss.walkBackAction?.isRunning() ? g.boss.walkBackAction.getEffectiveWeight() : 0) +
        (g.boss.strafeLeftAction?.isRunning() ? g.boss.strafeLeftAction.getEffectiveWeight() : 0) +
        (g.boss.strafeRightAction?.isRunning() ? g.boss.strafeRightAction.getEffectiveWeight() : 0),
      fullBodyActionRunningCount: Array.from((g.boss.actions as Map<string, THREE.AnimationAction>).values()).filter(
        (a) => a.isRunning() && a.enabled && a.getEffectiveWeight() > 0.05,
      ).length,
    }),
    queueBossCombo: (openerKey: string, followupKey: string) => {
      const opener = BOSS_ATTACKS[openerKey] || BOSS_ATTACKS.combo;
      const followup = BOSS_ATTACKS[followupKey] || BOSS_ATTACKS.downward;
      g.boss.ai.clearGoalStack();
      g.boss.ai.queueCombo(opener, followup);
    },
    setPlayerPosition: (pos: { x: number; y: number; z: number }) => {
      g.player.group.position.set(pos.x, pos.y, pos.z);
    },
    setBossPosition: (pos: { x: number; y: number; z: number }) => {
      g.boss.group.position.set(pos.x, pos.y, pos.z);
      g.publishDiagnostics();
    },
    setBossAttackCooldown: (cd: number) => {
      g.boss.ai.attackCooldown = cd;
    },
    setBossSubgoal: (subgoal: any) => {
      g.boss.ai.clearGoalStack();
      g.boss.ai.pushSubgoal(subgoal);
    },
    triggerGroundSlam: (pos?: any) => {
      const p = pos
        ? (pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z))
        : g.boss.group.position.clone().add(new THREE.Vector3(0, 0, 2));
      g.vfx.triggerGroundSlam(p, g.arena.floorMesh);
    },
    triggerBloodBurst: (pos?: any, dir?: any) => {
      const p = pos
        ? (pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z))
        : g.player.group.position.clone().add(new THREE.Vector3(0, 1, 0));
      const d = dir
        ? (dir instanceof THREE.Vector3 ? dir : new THREE.Vector3(dir.x, dir.y, dir.z))
        : new THREE.Vector3(0, 0.5, 1);
      g.vfx.spawnBloodBurst(p, d, true);
    },
    triggerHitSparks: (pos?: any, dir?: any) => {
      const p = pos
        ? (pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z))
        : g.player.group.position.clone().add(new THREE.Vector3(0, 1, 0));
      const d = dir
        ? (dir instanceof THREE.Vector3 ? dir : new THREE.Vector3(dir.x, dir.y, dir.z))
        : new THREE.Vector3(0, 0.8, 0.6).normalize();
      g.vfx.spawnHitSparks(p, d, true);
    },
    triggerSlashArc: (origin?: THREE.Vector3, rotation?: THREE.Euler, color?: number | string) => {
      const o = origin || g.player.group.position.clone().add(new THREE.Vector3(0, 1, 0));
      const r = rotation || new THREE.Euler(0, g.player.group.rotation.y, 0);
      g.vfx.spawnSlashArc(o, r, 1.2, color || 0xffe066);
    },
    getVfxSystem: () => g.vfx,
    getProfiler: () => g.profiler,
    triggerRestart: () => g.resetRun(),
    getInputController: () => g.input,
    getMusicState: () => g.audio.bossMusic.getState(),
    startBossMusic: () => g.audio.startBossMusic(),
    stopBossMusic: (fade?: number) => g.audio.stopBossMusic(fade),
    transitionToBossPhase2: () => g.audio.transitionToBossPhase2(),
    getMobileDeviceController: () => g.mobileDeviceController,
    getAudioDiagnostics: () => g.audio.getAudioDiagnostics(),
  };
}
