import * as THREE from 'three';
import { PlayerCharacter } from '../../entities/PlayerCharacter';
import { BossCharacter } from '../../entities/BossCharacter';
import { PLAYER_ATTACKS, BOSS_ATTACKS } from '../../combat/FrameCombat';
import { getKinematicAction } from '../../combat/KinematicData';
import { CONFIG } from '../config';
import type { DuelSpacing } from '../types';
import { TrajectoryVisualizer } from './TrajectoryVisualizer';
import { DuelCombatResolver } from './DuelCombatResolver';
import { WeaponHitboxVisualizer } from '../../combat/WeaponHitboxVisualizer';
import type { InputController } from '../../core/InputController';
import type { CombatInputs } from '../../core/types';
import type { SoulslikeCamera } from '../../systems/SoulslikeCamera';
import { GlideResetController } from '../common/GlideResetController';

export interface DuelTelemetryUpdate {
  distance: number;
  playerState: string;
  playerHp: number;
  isPlayerInvulnerable: boolean;
  bossState: string;
  bossHp: number;
  isBossHitboxActive: boolean;
  bossReach: number;
  playerDispText?: string;
  bossDispText?: string;
  activeActionName?: string;
  currentFrame?: number;
  totalFrames?: number;
  damageStartFrame?: number;
  damageEndFrame?: number;
  isDamageActive?: boolean;
}

export class CombatDuelStage {
  public logicPlayer: PlayerCharacter | null = null;
  public logicBoss: BossCharacter | null = null;
  public readonly trajectory: TrajectoryVisualizer;
  public readonly playerWeaponVisualizer = new WeaponHitboxVisualizer(1.4, 0.16);
  public readonly bossWeaponVisualizer = new WeaponHitboxVisualizer(2.2, 0.22);

  public autoResetEnabled = true;
  public bossAiMode: 'dummy' | 'duel' = 'dummy';

  public readonly playerGlide = new GlideResetController(CONFIG.track2.playerHome);
  public readonly bossGlide = new GlideResetController(CONFIG.track2.bossHome);

  constructor(scene: THREE.Scene) {
    this.trajectory = new TrajectoryVisualizer(scene);
  }

  public async init(scene: THREE.Scene): Promise<void> {
    this.logicPlayer = new PlayerCharacter('knight');
    await this.logicPlayer.loadPromise;
    this.logicPlayer.group.position.copy(CONFIG.track2.playerHome);
    this.logicPlayer.group.rotation.y = 0;
    scene.add(this.logicPlayer.group);

    this.logicBoss = new BossCharacter('titan');
    await this.logicBoss.loadPromise;
    this.logicBoss.group.position.copy(CONFIG.track2.bossHome);
    this.logicBoss.group.rotation.y = 0; // ModelScene already has Math.PI, group rot 0 faces -Z
    scene.add(this.logicBoss.group);

    scene.add(this.playerWeaponVisualizer.group);
    scene.add(this.bossWeaponVisualizer.group);
  }

  public async switchPlayerModel(modelId: 'knight' | 'samurai'): Promise<void> {
    if (!this.logicPlayer) return;
    await this.logicPlayer.loadModel(modelId);
    this.logicPlayer.group.position.copy(CONFIG.track2.playerHome);
    this.logicPlayer.group.rotation.y = 0;
  }

  /**
   * [Purpose]: Initiates a player combat action (attack, dodge, drink, jump) and auto-aligns facing toward the boss.
   * @condition Triggered via UI combat action buttons, keyboard shortcuts, or Playwright test actions.
   * @param actionKey Combat action identifier string and onCombatLog callback for event messaging.
   * @returns Mutates player state, triggers kinematic movement, and records trajectory starting coordinates.
   */
  public triggerPlayerAction(actionKey: string, onCombatLog: (text: string) => void): void {
    if (!this.logicPlayer) return;
    if (this.logicPlayer.state === 'dead') {
      this.logicPlayer.hp = this.logicPlayer.maxHp;
      this.logicPlayer.state = 'idle';
    }

    this.playerGlide.onActionStart(this.logicPlayer.group.position);
    this.trajectory.startPlayerAction(this.playerGlide.actionStartPos);

    this.logicPlayer.hasHitCurrentSwing = false;

    // Orient towards Boss
    const toBoss = new THREE.Vector3().subVectors(
      this.logicBoss ? this.logicBoss.group.position : CONFIG.track2.bossHome,
      this.logicPlayer.group.position,
    );
    this.logicPlayer.group.rotation.y = Math.atan2(toBoss.x, toBoss.z);

    if (actionKey === 'light1') {
      this.logicPlayer.startAttack(PLAYER_ATTACKS.light1, 1);
    } else if (actionKey === 'light2') {
      this.logicPlayer.startAttack(PLAYER_ATTACKS.light2, 2);
    } else if (actionKey === 'light3') {
      this.logicPlayer.startAttack(PLAYER_ATTACKS.light3, 3);
    } else if (actionKey === 'combo') {
      this.logicPlayer.startAttack(PLAYER_ATTACKS.light1, 1);
      let step = 1;
      const comboInterval = setInterval(() => {
        if (!this.logicPlayer || this.logicPlayer.state !== 'attack') {
          clearInterval(comboInterval);
          return;
        }
        if (this.logicPlayer.attackPhase === 'recovery') {
          step++;
          if (step === 2) this.logicPlayer.startAttack(PLAYER_ATTACKS.light2, 2);
          else if (step === 3) {
            this.logicPlayer.startAttack(PLAYER_ATTACKS.light3, 3);
            clearInterval(comboInterval);
          }
        }
      }, 40);
    } else if (actionKey === 'heavy') {
      this.logicPlayer.startAttack(PLAYER_ATTACKS.heavy, 1);
    } else if (actionKey === 'dodge_fwd') {
      this.logicPlayer.startDodge(undefined, 0, new THREE.Vector3(0, 0, 1));
    } else if (actionKey === 'dodge_back') {
      this.logicPlayer.startDodge(undefined, 0, new THREE.Vector3(0, 0, -1));
    } else if (actionKey === 'drink') {
      this.logicPlayer.startDrink();
    }

    onCombatLog(`Player initiated ${actionKey}`);
  }

  public triggerBossAction(actionKey: string, onCombatLog: (text: string) => void): void {
    if (!this.logicBoss) return;
    if (this.logicBoss.state === 'dead') {
      this.logicBoss.hp = this.logicBoss.maxHp;
      this.logicBoss.state = 'idle';
    }

    this.bossGlide.onActionStart(this.logicBoss.group.position);
    this.trajectory.startBossAction(this.bossGlide.actionStartPos);

    this.logicBoss.hasHitCurrentSwing = false;

    // Orient towards Player
    const toPlayer = new THREE.Vector3().subVectors(
      this.logicPlayer ? this.logicPlayer.group.position : CONFIG.track2.playerHome,
      this.logicBoss.group.position,
    );
    this.logicBoss.group.rotation.y = Math.atan2(toPlayer.x, toPlayer.z) + Math.PI;

    const atk = BOSS_ATTACKS[actionKey] || BOSS_ATTACKS.downward;
    this.logicBoss.chooseAttack(atk);

    onCombatLog(`Boss initiated ${atk.name}`);
  }

  public resetPositions(onCombatLog: (text: string) => void): void {
    if (this.logicPlayer) {
      this.logicPlayer.group.position.copy(CONFIG.track2.playerHome);
      this.logicPlayer.group.rotation.y = 0;
      this.logicPlayer.hp = this.logicPlayer.maxHp;
      this.logicPlayer.stamina = this.logicPlayer.maxStamina;
      this.logicPlayer.state = 'idle';
      this.logicPlayer.playAction('idle', 0.15, THREE.LoopRepeat, false, 1.0);
    }
    if (this.logicBoss) {
      this.logicBoss.group.position.copy(CONFIG.track2.bossHome);
      this.logicBoss.group.rotation.y = 0;
      this.logicBoss.hp = this.logicBoss.maxHp;
      this.logicBoss.poise = this.logicBoss.maxPoise;
      this.logicBoss.state = 'idle';
      this.logicBoss.stateTimer = 0;
      this.logicBoss.playAction('idle', 0.15, THREE.LoopRepeat, false, 1.0);
    }
    if (this.logicPlayer) {
      this.playerGlide.reset(this.logicPlayer.group);
    }
    if (this.logicBoss) {
      this.bossGlide.reset(this.logicBoss.group);
    }
    this.trajectory.clear();
    onCombatLog('↺ Both duel models reset to home marks.');
  }

  public getSpacing(): DuelSpacing {
    return {
      distance:
        this.logicPlayer && this.logicBoss
          ? this.logicPlayer.group.position.distanceTo(this.logicBoss.group.position)
          : 0,
      playerPos: this.logicPlayer ? this.logicPlayer.group.position.clone() : new THREE.Vector3(),
      bossPos: this.logicBoss ? this.logicBoss.group.position.clone() : new THREE.Vector3(),
    };
  }

  public toggleAutoReset(enabled?: boolean): boolean {
    this.autoResetEnabled = enabled !== undefined ? enabled : !this.autoResetEnabled;
    return this.autoResetEnabled;
  }

  public toggleBossAiMode(): 'dummy' | 'duel' {
    this.bossAiMode = this.bossAiMode === 'dummy' ? 'duel' : 'dummy';
    return this.bossAiMode;
  }

  public setHitboxVisible(visible: boolean): void {
    if (this.logicPlayer && this.logicPlayer.hitboxDebugger) {
      this.logicPlayer.hitboxDebugger.setVisible(visible);
    }
    if (this.logicBoss) {
      this.logicBoss.swordHitboxDebugger?.setVisible(visible);
      this.logicBoss.footHitboxDebugger?.setVisible(visible);
    }
    this.playerWeaponVisualizer.setVisible(visible);
    this.bossWeaponVisualizer.setVisible(visible);
  }

  public stepFrame(deltaSeconds: number): void {
    if (this.logicPlayer && this.logicPlayer.mixer) this.logicPlayer.mixer.update(deltaSeconds);
    if (this.logicBoss && this.logicBoss.mixer) this.logicBoss.mixer.update(deltaSeconds);
    if (this.logicPlayer && this.logicPlayer.kinematicController) {
      this.logicPlayer.kinematicController.update(deltaSeconds, this.logicPlayer.group.rotation.y);
    }
    if (this.logicBoss && this.logicBoss.kinematicController) {
      this.logicBoss.kinematicController.update(deltaSeconds, this.logicBoss.group.rotation.y);
    }
  }

  /**
   * [Purpose]: Advances 60Hz duel simulation step including locomotion, AI decision tree, combat kinematics, and hitboxes.
   * @condition Called every frame within the main asset-test render loop when Track 2 duel is active.
   * @param delta Frame delta time in seconds, elapsed timestamp, roam mode flag, controllers, and callbacks.
   * @returns Updates player and boss state machines, applies root-motion kinematics, and emits telemetry.
   */
  public update(
    delta: number,
    elapsed: number,
    isRoamMode: boolean,
    inputController: InputController | null,
    soulslikeCamera: SoulslikeCamera | null,
    onCombatLog: (text: string) => void,
    onTelemetryUpdate: (data: DuelTelemetryUpdate) => void,
  ): void {
    if (!this.logicPlayer || !this.logicBoss) return;

    // 1. Player Update
    if (isRoamMode && inputController && soulslikeCamera) {
      const lockedTarget = soulslikeCamera.isLockedOn ? this.logicBoss.group.position : null;
      const roamInputs: CombatInputs = {
        move: new THREE.Vector2(),
        sprint: false,
        dodge: false,
        lightAttack: false,
        heavyAttack: false,
        toggleLockOn: false,
        restart: false,
      };
      inputController.readInputs(roamInputs);

      const mouseDelta = new THREE.Vector2();
      inputController.consumeMouseDelta(mouseDelta);

      if (roamInputs.restart) {
        this.resetPositions(onCombatLog);
      }
      if (roamInputs.toggleLockOn) {
        soulslikeCamera.toggleLockOn(this.logicBoss.group.position);
      }

      this.logicPlayer.update(
        delta,
        elapsed,
        roamInputs,
        soulslikeCamera.yaw,
        lockedTarget,
        CONFIG.arena.radius,
      );
      soulslikeCamera.handleMouseMove(mouseDelta.x, mouseDelta.y);
      soulslikeCamera.update(delta, this.logicPlayer.group.position, CONFIG.arena.radius);
    } else {
      const dummyInputs: CombatInputs = {
        move: new THREE.Vector2(),
        sprint: false,
        dodge: false,
        lightAttack: false,
        heavyAttack: false,
        toggleLockOn: false,
        restart: false,
      };
      this.logicPlayer.update(
        delta,
        elapsed,
        dummyInputs,
        0,
        this.logicBoss.group.position,
        CONFIG.arena.radius,
      );
    }

    // 2. Boss Update
    if (this.bossAiMode === 'dummy') {
      if (!this.bossGlide.isActionActive) {
        this.logicBoss.state = 'idle';
        this.logicBoss.stateTimer = 0;
        this.logicBoss.ai.clearGoalStack();
        this.logicBoss.ai.attackCooldown = 999;
        this.logicBoss.group.position.copy(CONFIG.track2.bossHome);
        const toP = new THREE.Vector3().subVectors(
          this.logicPlayer.group.position,
          this.logicBoss.group.position,
        );
        this.logicBoss.group.rotation.y = Math.atan2(toP.x, toP.z) + Math.PI;
      }
    }
    this.logicBoss.update(
      delta,
      elapsed,
      this.logicPlayer.group.position,
      CONFIG.arena.radius,
    );

    // 3. Combat Hit Collisions
    DuelCombatResolver.resolve(
      this.logicPlayer,
      this.logicBoss,
      onCombatLog,
      (pt) => {
        this.bossWeaponVisualizer.showContactPoint(pt);
        this.playerWeaponVisualizer.showContactPoint(pt);
      },
    );

    // 4. Update Weapon 3D Yellow Visualizers
    const pBlade = this.logicPlayer.getWeaponBladeSegment();
    const bBlade = this.logicBoss.getWeaponBladeSegment();
    this.playerWeaponVisualizer.update(pBlade, this.logicPlayer.isHitboxActive(), delta);
    this.bossWeaponVisualizer.update(bBlade, this.logicBoss.isHitboxActive(), delta);

    // 5. Trajectory Tracking & Auto-Reset
    this.updateTrajectoryAndReset(delta);

    // 6. Active Damage Frame Calculations
    let activeActionName = 'None';
    let currentFrame = 0;
    let totalFrames = 0;
    let damageStartFrame = 0;
    let damageEndFrame = 0;
    let isDamageActive = false;

    if (this.logicPlayer.state === 'attack') {
      activeActionName = `Player: ${this.logicPlayer.currentAttack?.name || 'Slash'}`;
      const clipName = this.logicPlayer.currentAttack?.isHeavy ? 'attack_heavy' : 'attack_light';
      const cfg = getKinematicAction(clipName);
      if (cfg) {
        currentFrame = this.logicPlayer.kinematicController?.currentFrame || 1;
        totalFrames = cfg.totalFrames;
        damageStartFrame = cfg.hitbox?.activeStartFrame || 27;
        damageEndFrame = cfg.hitbox?.activeEndFrame || 44;
        isDamageActive = this.logicPlayer.isHitboxActive();
      }
    } else if (
      this.logicBoss.state === 'windup' ||
      this.logicBoss.state === 'active' ||
      this.logicBoss.state === 'recovery'
    ) {
      activeActionName = `Boss: ${this.logicBoss.currentAttack?.name || 'Attack'}`;
      const clipName = this.logicBoss.currentAttack?.animationClip || 'attack_heavy';
      const cfg = getKinematicAction(clipName);
      if (cfg) {
        currentFrame = this.logicBoss.kinematicController?.currentFrame || 1;
        totalFrames = cfg.totalFrames;
        damageStartFrame = cfg.hitbox?.activeStartFrame || 32;
        damageEndFrame = cfg.hitbox?.activeEndFrame || 48;
        isDamageActive = this.logicBoss.isHitboxActive();
      }
    } else if (this.logicPlayer.state === 'dodge') {
      activeActionName = 'Player: Dodge Roll';
      currentFrame = Math.round(this.logicPlayer.dodgeTimer * 60) + 1;
      totalFrames = 120;
      damageStartFrame = 33; // i-frames start
      damageEndFrame = 90;   // i-frames end
      isDamageActive = this.logicPlayer.isInvulnerable;
    }

    // 7. Broadcast Telemetry
    const dist = this.logicPlayer.group.position.distanceTo(this.logicBoss.group.position);
    const reach = this.logicBoss.currentAttack ? this.logicBoss.currentAttack.range : 4.0;

    onTelemetryUpdate({
      distance: dist,
      playerState: this.logicPlayer.state,
      playerHp: this.logicPlayer.hp,
      isPlayerInvulnerable: this.logicPlayer.isInvulnerable,
      bossState: this.logicBoss.state,
      bossHp: this.logicBoss.hp,
      isBossHitboxActive: this.logicBoss.isHitboxActive(),
      bossReach: reach,
      playerDispText: this.playerGlide.lastDispText,
      bossDispText: this.bossGlide.lastDispText,
      activeActionName,
      currentFrame,
      totalFrames,
      damageStartFrame,
      damageEndFrame,
      isDamageActive,
    });
  }

  private updateTrajectoryAndReset(delta: number): void {
    if (!this.logicPlayer || !this.logicBoss) return;

    if (this.playerGlide.isActionActive) {
      this.trajectory.recordPlayerPoint(this.logicPlayer.group.position);
      if (this.logicPlayer.state === 'idle') {
        this.playerGlide.onActionEnd(this.logicPlayer.group.position, this.autoResetEnabled, false);
      }
    }

    if (this.bossGlide.isActionActive) {
      this.trajectory.recordBossPoint(this.logicBoss.group.position);
      if (this.logicBoss.state === 'idle') {
        this.bossGlide.onActionEnd(this.logicBoss.group.position, this.autoResetEnabled, true);
      }
    }

    this.playerGlide.updateGlide(delta, this.logicPlayer.group);
    this.bossGlide.updateGlide(delta, this.logicBoss.group);
  }
}
