import * as THREE from 'three';
import { PlayerCharacter } from '../../entities/PlayerCharacter';
import { BossCharacter } from '../../entities/BossCharacter';
import { PLAYER_ATTACKS, BOSS_ATTACKS } from '../../combat/FrameCombat';
import { CONFIG } from '../config';
import type { DuelSpacing } from '../types';
import { TrajectoryVisualizer } from './TrajectoryVisualizer';
import { DuelCombatResolver } from './DuelCombatResolver';
import type { InputController, CombatInputs } from '../../core/InputController';
import type { SoulslikeCamera } from '../../systems/SoulslikeCamera';

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
}

export class CombatDuelStage {
  public logicPlayer: PlayerCharacter | null = null;
  public logicBoss: BossCharacter | null = null;
  public readonly trajectory: TrajectoryVisualizer;

  public autoResetEnabled = true;
  public bossAiMode: 'dummy' | 'duel' = 'dummy';

  private isPlayerActionActive = false;
  private isBossActionActive = false;
  private readonly playerActionStartPos = new THREE.Vector3();
  private readonly bossActionStartPos = new THREE.Vector3();
  private playerLandingTimer = -1;
  private bossLandingTimer = -1;
  private playerResetGlide = -1;
  private bossResetGlide = -1;

  private lastPlayerDispText = 'Δ0.00m';
  private lastBossDispText = 'Δ0.00m';

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
  }

  public async switchPlayerModel(modelId: 'knight' | 'samurai'): Promise<void> {
    if (!this.logicPlayer) return;
    await this.logicPlayer.loadModel(modelId);
    this.logicPlayer.group.position.copy(CONFIG.track2.playerHome);
    this.logicPlayer.group.rotation.y = 0;
  }

  public triggerPlayerAction(actionKey: string, onCombatLog: (text: string) => void): void {
    if (!this.logicPlayer) return;
    if (this.logicPlayer.state === 'dead') {
      this.logicPlayer.hp = this.logicPlayer.maxHp;
      this.logicPlayer.state = 'idle';
    }

    this.playerLandingTimer = -1;
    this.playerResetGlide = -1;

    this.playerActionStartPos.copy(this.logicPlayer.group.position);
    this.trajectory.startPlayerAction(this.playerActionStartPos);

    this.isPlayerActionActive = true;
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
    }

    onCombatLog(`Player initiated ${actionKey}`);
  }

  public triggerBossAction(actionKey: string, onCombatLog: (text: string) => void): void {
    if (!this.logicBoss) return;
    if (this.logicBoss.state === 'dead') {
      this.logicBoss.hp = this.logicBoss.maxHp;
      this.logicBoss.state = 'idle';
    }

    this.bossLandingTimer = -1;
    this.bossResetGlide = -1;

    this.bossActionStartPos.copy(this.logicBoss.group.position);
    this.trajectory.startBossAction(this.bossActionStartPos);

    this.isBossActionActive = true;
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
    this.isPlayerActionActive = false;
    this.isBossActionActive = false;
    this.playerLandingTimer = -1;
    this.bossLandingTimer = -1;
    this.playerResetGlide = -1;
    this.bossResetGlide = -1;
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
      if (this.logicBoss.state === 'idle') {
        this.logicBoss.stateTimer = 0;
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
    DuelCombatResolver.resolve(this.logicPlayer, this.logicBoss, onCombatLog);

    // 4. Trajectory Tracking & Auto-Reset
    this.updateTrajectoryAndReset(delta);

    // 5. Broadcast Telemetry
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
      playerDispText: this.lastPlayerDispText,
      bossDispText: this.lastBossDispText,
    });
  }

  private updateTrajectoryAndReset(delta: number): void {
    if (!this.logicPlayer || !this.logicBoss) return;

    if (this.isPlayerActionActive) {
      this.trajectory.recordPlayerPoint(this.logicPlayer.group.position);
      if (this.logicPlayer.state === 'idle') {
        this.isPlayerActionActive = false;
        const dist = this.logicPlayer.group.position.distanceTo(this.playerActionStartPos);
        const deltaZ = this.logicPlayer.group.position.z - this.playerActionStartPos.z;
        this.lastPlayerDispText = `Δ${dist.toFixed(2)}m (Z:${deltaZ >= 0 ? '+' : ''}${deltaZ.toFixed(2)}m)`;
        if (this.autoResetEnabled) {
          this.playerLandingTimer = 1.0;
        }
      }
    }

    if (this.isBossActionActive) {
      this.trajectory.recordBossPoint(this.logicBoss.group.position);
      if (this.logicBoss.state === 'idle') {
        this.isBossActionActive = false;
        const dist = this.logicBoss.group.position.distanceTo(this.bossActionStartPos);
        const deltaZ = this.bossActionStartPos.z - this.logicBoss.group.position.z;
        this.lastBossDispText = `Δ${dist.toFixed(2)}m (Z:${deltaZ >= 0 ? '+' : ''}${deltaZ.toFixed(2)}m)`;
        if (this.autoResetEnabled) {
          this.bossLandingTimer = 1.0;
        }
      }
    }

    // Auto-Reset Timers & Glide: Player
    if (this.playerLandingTimer > 0) {
      this.playerLandingTimer -= delta;
      if (this.playerLandingTimer <= 0) {
        this.playerResetGlide = 0;
      }
    }
    if (this.playerResetGlide >= 0) {
      this.playerResetGlide += delta * 2.5;
      this.logicPlayer.group.position.lerp(
        CONFIG.track2.playerHome,
        Math.min(1.0, this.playerResetGlide),
      );
      if (this.playerResetGlide >= 1.0) {
        this.logicPlayer.group.position.copy(CONFIG.track2.playerHome);
        this.logicPlayer.group.rotation.y = 0;
        this.playerResetGlide = -1;
        this.playerLandingTimer = -1;
      }
    }

    // Auto-Reset Timers & Glide: Boss
    if (this.bossLandingTimer > 0) {
      this.bossLandingTimer -= delta;
      if (this.bossLandingTimer <= 0) {
        this.bossResetGlide = 0;
      }
    }
    if (this.bossResetGlide >= 0) {
      this.bossResetGlide += delta * 2.5;
      this.logicBoss.group.position.lerp(
        CONFIG.track2.bossHome,
        Math.min(1.0, this.bossResetGlide),
      );
      if (this.bossResetGlide >= 1.0) {
        this.logicBoss.group.position.copy(CONFIG.track2.bossHome);
        this.logicBoss.group.rotation.y = 0;
        this.bossResetGlide = -1;
        this.bossLandingTimer = -1;
      }
    }
  }
}
