import * as THREE from 'three';
import { type CombatInputs } from '../core/types';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { BossCharacter } from '../entities/BossCharacter';
import type { PlayerCombatSnapshot } from '../entities/boss/BossAI';
import { PlayerCharacter } from '../entities/PlayerCharacter';
import { AudioSystem } from '../systems/AudioSystem';
import { Hud } from '../systems/Hud';
import { SoulslikeCamera } from '../systems/SoulslikeCamera';
import { VFXSystem } from '../systems/VFXSystem';
import { Arena } from '../world/Arena';
import { SettingsManager, type ShadowQuality } from '../systems/SettingsManager';
import { PerformanceProfiler } from '../systems/PerformanceProfiler';
import { UnifiedSettingsModal } from '../ui/UnifiedSettingsModal';
import { MobileDeviceController } from '../ui/MobileDeviceController';
import { NetworkManager } from '../network/NetworkManager';
import { RemotePlayerProxy } from '../network/RemotePlayerProxy';
import { resolveCombatCollisions } from './GameCollisionResolver';
import { installGameTestHooks } from './GameTestHooks';
import { GameMultiplayerHandler } from './GameMultiplayerHandler';
import { BossMusicStorage } from '../audio/BossMusicStorage';
import { BUILTIN_PROCEDURAL_ID } from '../audio/types';
import { MatchPrewarmer } from './lifecycle/MatchPrewarmer';
import { GameDiagnostics } from './lifecycle/GameDiagnostics';
import { LockOnSystem } from './systems/LockOnSystem';

export const AVAILABLE_PLAYER_MODELS = [
  { id: 'knight', name: 'Knight' },
  { id: 'samurai', name: 'Samurai' },
];

export const AVAILABLE_BOSS_MODELS = [
  { id: 'titan', name: 'Titan (Ashen Knight)' },
];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);

  private readonly arena = new Arena({ radius: 21.0 });
  private readonly player = new PlayerCharacter();
  private readonly boss = new BossCharacter();

  private readonly input: InputController;
  private readonly cameraRig: SoulslikeCamera;
  private readonly audio = new AudioSystem();
  private readonly vfx: VFXSystem;
  private readonly hud: Hud;
  private readonly settingsModal: UnifiedSettingsModal;
  private readonly mobileDeviceController: MobileDeviceController;
  private readonly multiplayerHandler: GameMultiplayerHandler;

  private readonly settingsManager = SettingsManager.getInstance();
  private readonly profiler = PerformanceProfiler.getInstance();
  private readonly network = NetworkManager.getInstance();

  private remotePlayer: RemotePlayerProxy | null = null;
  public isMultiplayerDuel = false;
  private networkSendTimer = 0;
  private opponentSessionId = '';

  private moonLight!: THREE.DirectionalLight;

  private readonly loop = new Loop(
    (delta, elapsed) => this.update(delta, elapsed),
    () => this.render(),
  );

  private readonly combatInputs: CombatInputs = {
    move: new THREE.Vector2(),
    sprint: false,
    dodge: false,
    lightAttack: false,
    heavyAttack: false,
    toggleLockOn: false,
    restart: false,
    heal: false,
    jump: false,
  };

  private readonly mouseDelta = new THREE.Vector2();

  // Pre-allocated scratch vectors & cached viewport to eliminate runtime GC allocations and DOM reflow
  private readonly scratchScreenPos = new THREE.Vector2();
  private readonly scratchWorldPos = new THREE.Vector3();
  private cachedHalfWidth = 640;
  private cachedHalfHeight = 360;

  private readonly tuning = {
    speed: 4.8,
    dashMultiplier: 1.6,
    acceleration: 14,
    cameraLag: 0.12,
  };

  private frame = 0;
  private elapsed = 0;
  private hitstopTimer = 0;
  private pausedForScreenshot = false;
  private pendingResize = true;
  public isReady = false;

  // Previous states for audio & profiler triggers
  private prevPlayerState = 'idle';
  private prevBossState = 'idle';
  private prevBossIsPhase2 = false;
  private currentMusicTrackId = '';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.settingsManager.data.graphics.exposure;

    this.input = new InputController(canvas);
    this.cameraRig = new SoulslikeCamera(this.camera);
    this.vfx = new VFXSystem(this.scene);
    this.vfx.setGroundTarget(this.arena.floorMesh);

    this.player.setVfxAndAudio(this.vfx, this.audio);
    this.boss.setVfxAndAudio(this.vfx, this.audio);
    this.boss.onGroundSlamImpact = (pos) => {
      this.profiler.markCombatEvent('BOSS_GROUND_SLAM', { x: pos.x, z: pos.z });
      if (this.settingsManager.data.vfx.cameraShake) {
        this.cameraRig.addShake(0.55);
      }
      this.hitstopTimer = 0.06;
    };

    this.hud = new Hud({
      playerModels: AVAILABLE_PLAYER_MODELS,
      currentPlayerModel: this.player.modelId,
      onPlayerModelChange: async (id: string) => {
        await this.setPlayerModel(id);
      },
      bossModels: AVAILABLE_BOSS_MODELS,
      currentBossModel: this.boss.modelId,
      onBossModelChange: async (id: string) => {
        await this.setBossModel(id);
      },
    });

    // Unified Dark Fantasy Settings Modal & Tabbed UI (Replaces lil-gui)
    this.settingsModal = new UnifiedSettingsModal({
      playerModels: AVAILABLE_PLAYER_MODELS,
      currentPlayerModel: this.player.modelId,
      onPlayerModelChange: async (id: string) => {
        await this.setPlayerModel(id);
      },
      bossModels: AVAILABLE_BOSS_MODELS,
      currentBossModel: this.boss.modelId,
      onBossModelChange: async (id: string) => {
        await this.setBossModel(id);
      },
      onResetTrial: () => {
        this.resetRun();
      },
      onToggleHitboxDebug: (visible?: boolean) => {
        return this.toggleHitboxDebug(visible);
      },
    });

    this.mobileDeviceController = new MobileDeviceController({
      onRestart: () => this.resetRun(),
    });
    this.multiplayerHandler = new GameMultiplayerHandler(this);

    const potionHudEl = document.querySelector<HTMLElement>('#potion-hud');
    if (potionHudEl) {
      potionHudEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.input.triggerHeal();
      });
    }

    this.buildScene();
    this.applySettings();

    // Subscribe to Settings changes
    this.settingsManager.subscribe(() => {
      this.applySettings();
    });

    // Hotkey 'H' toggles visual hitbox debugging
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !e.repeat) {
        this.toggleHitboxDebug();
      }
    });

    this.resetRun();
    this.installTestHooks();
    this.setupNetworkHandlers();

    window.addEventListener('resize', () => {
      this.pendingResize = true;
    });

    // Cache initial viewport dimensions
    this.cachedHalfWidth = Math.max(1, (this.canvas.clientWidth || 1280) / 2);
    this.cachedHalfHeight = Math.max(1, (this.canvas.clientHeight || 720) / 2);

    // Trigger Pre-match Preparation and Resource Warm-Up
    void this.prepareMatch();
  }

  /**
   * [Purpose]: Orchestrates asset loading, animation mixer pre-ticking, shader compilation, and particle prewarming before match start.
   * @condition Invoked once on game initialization before starting the simulation loop.
   * @param None Operates on instance members and DOM loading screen elements.
   * @returns Resolves when pre-warm pipeline completes and UI transitions to ready state.
   */
  public async prepareMatch(): Promise<void> {
    const screen = document.querySelector<HTMLElement>('#prewarm-loading-screen');
    const fill = document.querySelector<HTMLElement>('#prewarm-progress-fill');
    const statusText = document.querySelector<HTMLElement>('#prewarm-status-text');

    const setProgress = (pct: number, msg: string) => {
      if (fill) fill.style.width = `${pct}%`;
      if (statusText) statusText.textContent = msg;
    };

    try {
      setProgress(25, 'Loading 3D Armatures, Weapon Sockets & Audio...');
      const [, , externalPresets] = await Promise.all([
        this.player.loadPromise,
        this.boss.loadPromise,
        BossMusicStorage.loadExternalPresets(),
      ]);

      if (
        externalPresets &&
        externalPresets.length > 0 &&
        this.settingsManager.data.audio.selectedTrackId === BUILTIN_PROCEDURAL_ID
      ) {
        this.settingsManager.updateAudio({ selectedTrackId: externalPresets[0].id });
        void this.audio.setBossMusicTrack(externalPresets[0].id);
      }

      setProgress(60, 'Pre-warming WebGL Shaders, Shadows & VFX Pools...');
      MatchPrewarmer.prewarmAnimationMixers(this.player, this.boss);

      if (this.player.state !== 'dead' && this.boss.state !== 'dead') {
        this.resetRun();
      }
      if (this.player.flaskMesh) {
        this.player.flaskMesh.visible = true;
      }
      MatchPrewarmer.prewarmRendererAndShaders(this.renderer, this.scene, this.camera, this.vfx);
      this.render();
      if (this.player.flaskMesh) {
        this.player.flaskMesh.visible = false;
      }

      setProgress(100, 'Trial Prepared. Entering Sanctuary...');
      await new Promise((r) => setTimeout(r, 60));

      this.isReady = true;
      this.audio.startBossMusic();
      if (screen) {
        screen.classList.add('fade-out');
        setTimeout(() => screen.remove(), 250);
      }
      this.canvas.focus();
    } catch (err) {
      console.warn('[Game] Preparation warning:', err);
      this.isReady = true;
      if (screen) screen.remove();
    }

    this.publishDiagnostics();
  }

  private setupNetworkHandlers(): void {
    this.multiplayerHandler.setupNetworkHandlers();
  }

  public async startMultiplayerDuel(data: { p1SessionId: string; p2SessionId: string | null }): Promise<void> {
    await this.multiplayerHandler.startMultiplayerDuel(data);
  }

  private applySettings(): void {
    const s = this.settingsManager.data;

    // Graphics
    this.renderer.toneMappingExposure = s.graphics.exposure;
    this.applyShadowQuality(s.graphics.shadowQuality);
    resizeRenderer(this.renderer, this.camera, s.graphics.maxDpr);

    // Gameplay
    this.tuning.speed = s.gameplay.speed;
    this.tuning.dashMultiplier = s.gameplay.dashMultiplier;
    this.tuning.acceleration = s.gameplay.acceleration;
    this.tuning.cameraLag = s.gameplay.cameraLag;

    // Controls guide
    const guideEl = document.querySelector<HTMLElement>('#controls-guide');
    if (guideEl) guideEl.style.display = s.general.showControlsGuide ? '' : 'none';

    // Audio settings sync
    this.audio.setMusicVolume(s.audio.bossMusicVolume);
    this.audio.setSfxVolume(s.audio.sfxVolume);
    if (this.currentMusicTrackId !== s.audio.selectedTrackId) {
      this.currentMusicTrackId = s.audio.selectedTrackId;
      void this.audio.setBossMusicTrack(s.audio.selectedTrackId);
    }
  }

  private applyShadowQuality(quality: ShadowQuality): void {
    if (quality === 'off') {
      this.renderer.shadowMap.enabled = false;
      if (this.moonLight) this.moonLight.castShadow = false;
    } else {
      this.renderer.shadowMap.enabled = true;
      if (this.moonLight) {
        this.moonLight.castShadow = true;
        const size = quality === 'low' ? 512 : quality === 'medium' ? 1024 : 2048;
        this.moonLight.shadow.mapSize.set(size, size);
        if (this.moonLight.shadow.map) {
          this.moonLight.shadow.map.dispose();
          (this.moonLight.shadow as unknown as { map: THREE.WebGLRenderTarget | null }).map = null;
        }
      }
    }
  }

  public toggleHitboxDebug(visible?: boolean): boolean {
    const next = visible !== undefined ? visible : !this.player.hitboxDebugger.isVisible;
    this.player.toggleHitboxDebug(next);
    this.boss.toggleHitboxDebug(next);
    this.settingsManager.updateGeneral({ showHitboxDebug: next });
    return next;
  }

  public async setPlayerModel(modelId: string): Promise<void> {
    await this.player.loadModel(modelId);
    this.player.setVfxAndAudio(this.vfx, this.audio);
    this.hud.syncModels(this.player.modelId, this.boss.modelId);
    this.settingsModal.syncModels(this.player.modelId, this.boss.modelId);
    this.render();
    this.publishDiagnostics();
  }

  public async setBossModel(modelId: string): Promise<void> {
    await this.boss.loadModel(modelId);
    this.boss.setVfxAndAudio(this.vfx, this.audio);
    this.boss.onGroundSlamImpact = (pos) => {
      this.profiler.markCombatEvent('BOSS_GROUND_SLAM', { x: pos.x, z: pos.z });
      if (this.settingsManager.data.vfx.cameraShake) {
        this.cameraRig.addShake(0.55);
      }
      this.hitstopTimer = 0.06;
    };
    this.hud.syncModels(this.player.modelId, this.boss.modelId);
    this.settingsModal.syncModels(this.player.modelId, this.boss.modelId);
    this.render();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.network.leaveRoom();
    if (this.remotePlayer) {
      this.remotePlayer.dispose();
      this.remotePlayer = null;
    }
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.vfx.dispose();
    this.settingsModal.dispose();
    this.mobileDeviceController.dispose();
    this.arena.dispose();
    this.player.dispose();
    this.boss.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private buildScene(): void {
    // 1. Atmosphere & Fog (Dark Gothic Night)
    this.scene.background = new THREE.Color(0x0a0e16);
    this.scene.fog = new THREE.Fog(0x0b101a, 16, 60);

    // 2. Ambient & Directional Moonlight
    const hemiLight = new THREE.HemisphereLight(0x506888, 0x222a36, 1.8);
    this.scene.add(hemiLight);

    this.moonLight = new THREE.DirectionalLight(0xbcd6ff, 2.8);
    this.moonLight.position.set(-14, 24, 16);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(2048, 2048);
    this.moonLight.shadow.bias = -0.0003;
    this.moonLight.shadow.camera.near = 1;
    this.moonLight.shadow.camera.far = 70;
    this.moonLight.shadow.camera.left = -24;
    this.moonLight.shadow.camera.right = 24;
    this.moonLight.shadow.camera.top = 24;
    this.moonLight.shadow.camera.bottom = -24;
    this.scene.add(this.moonLight);

    // Rim light from opposite angle
    const rimLight = new THREE.DirectionalLight(0x5577aa, 0.85);
    rimLight.position.set(16, 12, -14);
    this.scene.add(rimLight);

    // 3. Add Sanctuary Arena, Player & Boss
    this.scene.add(this.arena.group);
    this.scene.add(this.player.group);
    this.scene.add(this.boss.group);
  }

  /**
   * [Purpose]: Orchestrates the per-frame game simulation tick across player, boss, camera, vfx, audio, and HUD.
   * @condition Called by the fixed 60Hz simulation loop with hitstop time-dilation applied.
   * @param delta Simulation step time in seconds; elapsed is total running time in seconds.
   * @returns Mutates entity positions, combat states, and advances profiler diagnostics.
   */
  private update(delta: number, elapsed: number): void {
    this.profiler.beginFrame();
    this.frame += 1;

    if (this.pausedForScreenshot) {
      this.profiler.markUpdateEnd();
      this.publishDiagnostics();
      return;
    }

    this.elapsed += delta;
    if (this.pendingResize) {
      this.pendingResize = false;
      if (resizeRenderer(this.renderer, this.camera, this.settingsManager.data.graphics.maxDpr)) {
        this.cachedHalfWidth = Math.max(1, (this.canvas.clientWidth || 1280) / 2);
        this.cachedHalfHeight = Math.max(1, (this.canvas.clientHeight || 720) / 2);
      }
    }

    // Hitstop time dilation on impacts (visceral weight without halting browser rendering or dropping frames)
    let simDelta = delta;
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= delta;
      simDelta = delta * this.settingsManager.data.gameplay.hitstopDilation;
    }

    // 1. Read Inputs
    this.input.readInputs(this.combatInputs);
    this.input.consumeMouseDelta(this.mouseDelta);

    // Restart check
    if (this.combatInputs.restart) {
      this.resetRun();
      this.profiler.markUpdateEnd();
      return;
    }

    // Mouse look
    if (this.mouseDelta.lengthSq() > 0) {
      const pitchSign = this.settingsManager.data.general.invertCameraY ? -1 : 1;
      this.cameraRig.handleMouseMove(this.mouseDelta.x, this.mouseDelta.y * pitchSign);
    }

    // 2. Lock-On Management
    const targetGroup = this.isMultiplayerDuel && this.remotePlayer
      ? this.remotePlayer.group
      : this.boss.group;
    const targetPos = targetGroup.position;
    const isTargetDead = this.isMultiplayerDuel && this.remotePlayer
      ? this.remotePlayer.hp <= 0
      : this.boss.state === 'dead';

    const lockedTargetPos = LockOnSystem.updateLockOn(
      this.cameraRig,
      this.combatInputs.toggleLockOn,
      this.player.group.position,
      targetPos,
      isTargetDead,
      26.0,
    );

    this.player.update(
      simDelta,
      elapsed,
      this.combatInputs,
      this.cameraRig.yaw,
      lockedTargetPos,
      this.arena.radius,
    );

    if (this.isMultiplayerDuel && this.remotePlayer) {
      this.remotePlayer.update(simDelta);

      // Entity collision separation (player vs remote player)
      const sepX = this.player.group.position.x - this.remotePlayer.group.position.x;
      const sepZ = this.player.group.position.z - this.remotePlayer.group.position.z;
      const sepDistSq = sepX * sepX + sepZ * sepZ;
      const minDist = this.player.radius + this.remotePlayer.radius;
      if (sepDistSq < minDist * minDist && sepDistSq > 0.0001) {
        const sepDist = Math.sqrt(sepDistSq);
        const push = minDist - sepDist;
        this.player.group.position.x += (sepX / sepDist) * push;
        this.player.group.position.z += (sepZ / sepDist) * push;
      }

      // 30Hz Network State Relay
      this.networkSendTimer += delta;
      if (this.networkSendTimer >= 0.033) {
        this.networkSendTimer = 0;
        this.network.sendPlayerState({
          x: this.player.group.position.x,
          y: this.player.group.position.y,
          z: this.player.group.position.z,
          rotY: this.player.group.rotation.y,
          velX: this.player.velocity.x,
          velZ: this.player.velocity.z,
          state: this.player.state,
          actionName: this.player.currentActionName,
          attackPhase: this.player.attackPhase,
          isInvulnerable: this.player.isInvulnerable,
          hp: this.player.hp,
          maxHp: this.player.maxHp,
          stamina: this.player.stamina,
          maxStamina: this.player.maxStamina,
        });
      }
    } else {
      const playerSnapshot: PlayerCombatSnapshot = {
        position: this.player.group.position,
        velocity: this.player.velocity,
        isHealing: this.player.isDrinking,
        isAttacking: this.player.state === 'attack' || this.player.attackPhase !== 'none',
        isStaggered: this.player.state === 'stagger',
      };
      this.boss.update(simDelta, elapsed, playerSnapshot, this.arena.radius, this.arena);

      // Entity collision separation (player vs boss)
      const sepX = this.player.group.position.x - this.boss.group.position.x;
      const sepZ = this.player.group.position.z - this.boss.group.position.z;
      const sepDistSq = sepX * sepX + sepZ * sepZ;
      const minDist = this.player.radius + this.boss.radius;
      if (sepDistSq < minDist * minDist && sepDistSq > 0.0001) {
        const sepDist = Math.sqrt(sepDistSq);
        const push = minDist - sepDist;
        this.player.group.position.x += (sepX / sepDist) * push;
        this.player.group.position.z += (sepZ / sepDist) * push;
      }
    }

    this.arena.update(simDelta, elapsed);

    // 4. Combat Hit Resolution
    this.resolveCombatCollisions();

    // 5. Update Visual Effects
    this.vfx.update(delta);

    // 6. Audio State Transition Triggers
    this.updateAudioTriggers();

    // 7. Update Camera
    this.cameraRig.update(delta, this.player.group.position, this.arena.radius);

    // 8. Update HUD
    let screenReticle: THREE.Vector2 | null = null;
    if (this.cameraRig.isLockedOn) {
      screenReticle = this.projectToScreen(targetPos, 1.8);
    }

    const oppHp = this.isMultiplayerDuel && this.remotePlayer ? this.remotePlayer.hp : this.boss.hp;
    const oppMaxHp = this.isMultiplayerDuel && this.remotePlayer ? this.remotePlayer.maxHp : this.boss.maxHp;
    const isOppDead = this.isMultiplayerDuel && this.remotePlayer ? this.remotePlayer.hp <= 0 : this.boss.state === 'dead';

    this.hud.update(
      delta,
      this.player.hp,
      this.player.maxHp,
      this.player.stamina,
      this.player.maxStamina,
      oppHp,
      oppMaxHp,
      this.cameraRig.isLockedOn,
      screenReticle,
      this.player.state === 'dead',
      isOppDead,
      this.player.healCharges,
      this.player.maxHealCharges,
    );

    this.profiler.markUpdateEnd();
    if (this.frame % 4 === 0 || this.frame <= 2) {
      this.publishDiagnostics();
    }
  }

  private resolveCombatCollisions(): void {
    resolveCombatCollisions({
      player: this.player,
      boss: this.boss,
      remotePlayer: this.remotePlayer,
      isMultiplayerDuel: this.isMultiplayerDuel,
      opponentSessionId: this.opponentSessionId,
      network: this.network,
      vfx: this.vfx,
      audio: this.audio,
      hud: this.hud,
      cameraRig: this.cameraRig,
      settingsManager: this.settingsManager,
      profiler: this.profiler,
      projectToScreen: (pos, offset) => this.projectToScreen(pos, offset),
      setHitstop: (time) => {
        this.hitstopTimer = time;
      },
    });
  }

  private updateAudioTriggers(): void {
    if (this.player.state === 'dodge' && this.prevPlayerState !== 'dodge') {
      this.audio.dodgeWhoosh();
      this.profiler.markCombatEvent('PLAYER_DODGE');
    } else if (this.player.state === 'attack' && this.prevPlayerState !== 'attack') {
      this.audio.attackSwing(this.player.currentAttack?.isHeavy);
      this.profiler.markCombatEvent('PLAYER_ATTACK', { attack: this.player.currentAttack?.name });
    }
    this.prevPlayerState = this.player.state;

    if (this.boss.state === 'windup' && this.prevBossState !== 'windup') {
      this.audio.bossTelegraph();
      this.profiler.markCombatEvent('BOSS_WINDUP', { attack: this.boss.currentAttack?.name });
    } else if (this.boss.state === 'active' && this.prevBossState !== 'active') {
      this.audio.attackSwing(true);
      if (this.boss.currentAttack?.isHeavy) {
        this.audio.bossSmash();
      }
      this.profiler.markCombatEvent('BOSS_ATTACK', { attack: this.boss.currentAttack?.name });
    }
    this.prevBossState = this.boss.state;

    // Boss Phase 2 Preload (at <= 55% HP)
    if (this.boss.hp <= this.boss.maxHp * 0.55 && !this.boss.isPhase2) {
      this.audio.preloadBossPhase2();
    }

    // Boss Phase 2 Transition
    if (this.boss.isPhase2 && !this.prevBossIsPhase2) {
      this.audio.transitionToBossPhase2();
      this.profiler.markCombatEvent('BOSS_PHASE2_TRANSITION');
    }
    this.prevBossIsPhase2 = this.boss.isPhase2;
  }

  /**
   * [Purpose]: Transforms a 3D world coordinate into 2D viewport pixel space with optional vertical offset.
   * @condition Invoked per frame by HUD rendering, lock-on reticle placement, and damage floating text.
   * @param worldPos Target 3D coordinate; heightOffset is vertical offset in world units.
   * @returns Reusable 2D vector containing pixel coordinates relative to top-left of canvas.
   */
  private projectToScreen(worldPos: THREE.Vector3, heightOffset = 0): THREE.Vector2 {
    this.scratchWorldPos.copy(worldPos);
    this.scratchWorldPos.y += heightOffset;
    this.scratchWorldPos.project(this.camera);

    this.scratchScreenPos.set(
      this.scratchWorldPos.x * this.cachedHalfWidth + this.cachedHalfWidth,
      -this.scratchWorldPos.y * this.cachedHalfHeight + this.cachedHalfHeight,
    );
    return this.scratchScreenPos;
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
    this.profiler.endFrame(this.renderer, this.vfx.getActiveCounts());
  }

  public resetRun(): void {
    if (this.isMultiplayerDuel && this.network.isConnected) {
      this.network.rematch();
      return;
    }
    this.hitstopTimer = 0;
    this.input.reset();
    this.vfx.reset();
    this.player.reset(new THREE.Vector3(0, 0, 9));
    this.boss.reset(new THREE.Vector3(0, 0, -8));
    this.cameraRig.reset();
    this.cameraRig.snapTo(this.player.group.position, this.arena.radius);
    this.hud.reset();
    this.prevPlayerState = 'idle';
    this.prevBossState = 'idle';
    this.prevBossIsPhase2 = false;
    this.audio.stopBossMusic(0.2);
    this.audio.startBossMusic();
    this.pausedForScreenshot = false;
    this.profiler.markCombatEvent('TRIAL_RESET');
    this.render();
  }

  public syncHud(delta = 0): void {
    const oppHp = this.isMultiplayerDuel && this.remotePlayer ? this.remotePlayer.hp : this.boss.hp;
    const oppMaxHp = this.isMultiplayerDuel && this.remotePlayer ? this.remotePlayer.maxHp : this.boss.maxHp;
    const isOppDead = this.isMultiplayerDuel && this.remotePlayer ? this.remotePlayer.hp <= 0 : this.boss.state === 'dead';

    this.hud.update(
      delta,
      this.player.hp,
      this.player.maxHp,
      this.player.stamina,
      this.player.maxStamina,
      oppHp,
      oppMaxHp,
      this.cameraRig.isLockedOn,
      null,
      this.player.state === 'dead',
      isOppDead,
      this.player.healCharges,
      this.player.maxHealCharges,
    );
  }

  private installTestHooks(): void {
    installGameTestHooks(this);
  }

  private publishDiagnostics(): void {
    GameDiagnostics.publish({
      frame: this.frame,
      elapsed: this.elapsed,
      player: this.player,
      boss: this.boss,
      audio: this.audio,
      profiler: this.profiler,
      renderer: this.renderer,
      isReady: this.isReady,
      halfWidth: this.cachedHalfWidth,
      halfHeight: this.cachedHalfHeight,
      canvas: this.canvas,
      maxDpr: this.settingsManager.data.graphics.maxDpr,
    });
  }
}
