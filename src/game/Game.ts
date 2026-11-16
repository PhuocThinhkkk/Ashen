import * as THREE from 'three';
import { BOSS_ATTACKS } from '../combat/FrameCombat';
import { checkAttackHit } from '../combat/HitDetection';
import { type CombatInputs, InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { BossCharacter } from '../entities/BossCharacter';
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
import { NetworkManager, type RemoteHitData } from '../network/NetworkManager';
import { RemotePlayerProxy } from '../network/RemotePlayerProxy';

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
  };

  private readonly mouseDelta = new THREE.Vector2();

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
  public isReady = false;

  // Previous states for audio & profiler triggers
  private prevPlayerState = 'idle';
  private prevBossState = 'idle';

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

    // Trigger Pre-match Preparation and Resource Warm-Up
    void this.prepareMatch();
  }

  /**
   * Pre-match loading & warm-up sequence:
   * 1. Await models & weapons
   * 2. Pre-tick animations to bind interpolants upfront
   * 3. Pre-compile WebGL shaders and shadow depth maps
   * 4. Pre-warm three.quarks particle systems and decal pools
   * 5. Smoothly transition to match start
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
      setProgress(25, 'Loading 3D Armatures & Weapon Sockets...');
      await Promise.all([this.player.loadPromise, this.boss.loadPromise]);

      setProgress(60, 'Pre-warming WebGL Shaders, Shadows & VFX Pools...');
      // Pre-warm all AnimationMixer action tracks upfront so first-time action plays have zero binding hitch
      if (this.player.mixer) {
        for (const action of (this.player as unknown as { actions: Map<string, THREE.AnimationAction> }).actions.values()) {
          action.play();
          action.setEffectiveWeight(0.0001);
        }
        this.player.mixer.update(0.001);
      }
      if (this.boss.mixer) {
        for (const action of (this.boss as unknown as { actions: Map<string, THREE.AnimationAction> }).actions.values()) {
          action.play();
          action.setEffectiveWeight(0.0001);
        }
        this.boss.mixer.update(0.001);
      }

      if (this.player.state !== 'dead' && this.boss.state !== 'dead') {
        this.resetRun();
      }
      this.vfx.prewarm(this.renderer, this.camera);
      this.renderer.compile(this.scene, this.camera);
      this.render();

      setProgress(100, 'Trial Prepared. Entering Sanctuary...');
      await new Promise((r) => setTimeout(r, 60));

      this.isReady = true;
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
    this.network.onMatchStart = (data) => {
      void this.startMultiplayerDuel(data);
    };

    this.network.onRemoteUpdate = (data) => {
      if (this.remotePlayer && this.isMultiplayerDuel) {
        this.remotePlayer.applyRemoteState(data);
      }
    };

    this.network.onCombatHit = (hitData) => {
      this.handleRemoteCombatHit(hitData);
    };

    this.network.onMatchOver = (data) => {
      this.handleMultiplayerMatchOver(data);
    };

    this.network.onOpponentDisconnect = () => {
      this.handleOpponentDisconnect();
    };
  }

  public async startMultiplayerDuel(data: { p1SessionId: string; p2SessionId: string | null }): Promise<void> {
    this.isMultiplayerDuel = true;
    this.boss.group.visible = false;
    this.settingsModal.close();

    const isHost = this.network.mySessionId === data.p1SessionId;
    this.opponentSessionId = isHost ? (data.p2SessionId || '') : data.p1SessionId;

    // Reset local player to dedicated spawn
    const mySpawn = isHost ? new THREE.Vector3(0, 0, 7) : new THREE.Vector3(0, 0, -7);
    this.player.reset(mySpawn);
    if (!isHost) {
      this.player.group.rotation.set(0, Math.PI, 0);
    }

    // Spawn or update remote player proxy
    const oppSpawn = isHost ? new THREE.Vector3(0, 0, -7) : new THREE.Vector3(0, 0, 7);
    if (!this.remotePlayer) {
      this.remotePlayer = new RemotePlayerProxy(isHost ? 'samurai' : 'knight');
      this.remotePlayer.setVfx(this.vfx);
      this.scene.add(this.remotePlayer.group);
    }
    this.remotePlayer.group.visible = true;
    this.remotePlayer.reset(oppSpawn);

    // Update camera to target remote opponent
    this.cameraRig.setLockedTarget(this.remotePlayer.group.position);
    this.cameraRig.snapTo(this.player.group.position, this.arena.radius);
    this.hud.reset();
  }

  private handleRemoteCombatHit(hitData: RemoteHitData): void {
    const contact = new THREE.Vector3(hitData.hitPoint.x, hitData.hitPoint.y, hitData.hitPoint.z);
    const dir = new THREE.Vector3(hitData.hitDir.x, hitData.hitDir.y, hitData.hitDir.z);

    this.vfx.spawnBloodBurst(contact, dir, hitData.isHeavy);

    // If I was the target, take damage locally
    if (hitData.targetSessionId === this.network.mySessionId) {
      this.player.takeDamage(hitData.damage, hitData.isHeavy);
      const screenPos = this.projectToScreen(this.player.group.position, 1.2);
      this.hud.spawnDamageNumber(hitData.damage, screenPos.x, screenPos.y, true);
      this.audio.hitConfirm(hitData.isHeavy);
      this.audio.damageTaken(hitData.isHeavy, false);
      if (this.settingsManager.data.vfx.cameraShake) {
        this.cameraRig.addShake(hitData.isHeavy ? 0.42 : 0.22);
      }
      this.hitstopTimer = 0.05;
    } else if (this.remotePlayer) {
      // Opponent was target
      this.remotePlayer.hp = Math.max(0, this.remotePlayer.hp - hitData.damage);
      const screenPos = this.projectToScreen(this.remotePlayer.group.position, 1.2);
      this.hud.spawnDamageNumber(hitData.damage, screenPos.x, screenPos.y, false);
      this.audio.hitConfirm(hitData.isHeavy);
      this.audio.damageTaken(hitData.isHeavy, true);
    }
  }

  private handleMultiplayerMatchOver(data: { winnerSessionId: string }): void {
    const won = data.winnerSessionId === this.network.mySessionId;
    if (won) {
      this.audio.victoryStinger();
    } else {
      this.audio.deathStinger();
    }
  }

  private handleOpponentDisconnect(): void {
    if (this.remotePlayer) {
      this.remotePlayer.group.visible = false;
    }
    this.isMultiplayerDuel = false;
    this.boss.group.visible = true;
    this.resetRun();
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

  private update(delta: number, elapsed: number): void {
    this.profiler.beginFrame();
    this.frame += 1;

    if (this.pausedForScreenshot) {
      this.profiler.markUpdateEnd();
      this.publishDiagnostics();
      return;
    }

    this.elapsed += delta;
    resizeRenderer(this.renderer, this.camera, this.settingsManager.data.graphics.maxDpr);

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

    if (this.combatInputs.toggleLockOn && !isTargetDead) {
      const locked = this.cameraRig.toggleLockOn(targetPos);
      if (!locked) {
        this.cameraRig.setLockedTarget(null);
      }
    }

    // Break lock-on if target dead or too far
    if (this.cameraRig.isLockedOn) {
      const dist = this.player.group.position.distanceTo(targetPos);
      if (isTargetDead || dist > 26.0) {
        this.cameraRig.setLockedTarget(null);
      } else {
        this.cameraRig.setLockedTarget(targetPos);
      }
    }

    // 3. Update Entities
    const lockedTargetPos = this.cameraRig.isLockedOn ? targetPos : null;

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
      this.boss.update(simDelta, elapsed, this.player.group.position, this.arena.radius);

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
    );

    this.profiler.markUpdateEnd();
    this.publishDiagnostics();
  }

  private resolveCombatCollisions(): void {
    if (this.isMultiplayerDuel && this.remotePlayer && this.remotePlayer.hp > 0) {
      const playerHitboxActive = this.player.isHitboxActive();
      if (
        this.player.state === 'attack' &&
        (this.player.attackPhase === 'active' || playerHitboxActive) &&
        this.player.currentAttack &&
        !this.player.hasHitCurrentSwing
      ) {
        const hit = checkAttackHit(
          this.player.group.position,
          this.player.group.rotation.y,
          this.player.currentAttack,
          this.remotePlayer.group.position,
          this.remotePlayer.radius,
          this.remotePlayer.isInvulnerable,
        );

        if (hit.hit) {
          this.player.hasHitCurrentSwing = true;
          const hitPoint = hit.contactPoint || this.player.getHitboxWorldPosition();
          const fwdAngle = this.player.group.rotation.y;
          const hitDir = new THREE.Vector3(-Math.sin(fwdAngle), 0.25, -Math.cos(fwdAngle)).normalize();

          this.network.sendCombatHit({
            targetSessionId: this.opponentSessionId,
            damage: hit.damage,
            isHeavy: hit.isHeavy,
            hitPoint: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
            hitDir: { x: hitDir.x, y: hitDir.y, z: hitDir.z },
          });

          this.vfx.spawnBloodBurst(hitPoint, hitDir, hit.isHeavy);
          this.audio.hitConfirm(hit.isHeavy);
          this.audio.damageTaken(hit.isHeavy, true);

          if (this.settingsManager.data.vfx.cameraShake) {
            this.cameraRig.addShake(hit.isHeavy ? 0.32 : 0.16);
          }
          this.hitstopTimer = 0.05;
        }
      }
      return;
    }

    // A. Player Attack Hits Boss
    const playerHitboxActive = this.player.isHitboxActive();
    if (
      this.player.state === 'attack' &&
      (this.player.attackPhase === 'active' || playerHitboxActive) &&
      this.player.currentAttack &&
      !this.player.hasHitCurrentSwing &&
      this.boss.state !== 'dead'
    ) {
      const hit = checkAttackHit(
        this.player.group.position,
        this.player.group.rotation.y,
        this.player.currentAttack,
        this.boss.group.position,
        this.boss.radius,
        false,
      );

      if (hit.hit) {
        this.boss.takeDamage(hit.damage, hit.poiseDamage);
        this.player.hasHitCurrentSwing = true;

        // Visual & Audio Feedback
        const screenPos = this.projectToScreen(this.boss.group.position, 1.5);
        this.hud.spawnDamageNumber(hit.damage, screenPos.x, screenPos.y, false);

        // Combat VFX: Minimal Elden Ring blade-slash blood spit right on target surface
        const toBoss = this.boss.group.position.clone().sub(this.player.group.position);
        toBoss.y = 0;
        let hitPoint: THREE.Vector3;
        if (toBoss.length() > 0.01) {
          toBoss.normalize();
          hitPoint = this.boss.group.position.clone().addScaledVector(toBoss, -this.boss.radius * 0.75);
          hitPoint.y = this.boss.group.position.y + 1.15;
        } else {
          hitPoint = hit.contactPoint || this.boss.group.position.clone().add(new THREE.Vector3(0, 1.15, 0));
        }

        const fwdAngle = this.player.group.rotation.y;
        const hitDir = new THREE.Vector3(
          Math.cos(fwdAngle) * 0.75 - Math.sin(fwdAngle) * 0.35,
          0.15,
          -Math.sin(fwdAngle) * 0.75 - Math.cos(fwdAngle) * 0.35,
        ).normalize();

        this.vfx.spawnBloodBurst(hitPoint, hitDir, hit.isHeavy);

        this.profiler.markCombatEvent('PLAYER_HIT_BOSS', { damage: hit.damage, isHeavy: hit.isHeavy });

        this.audio.hitConfirm(hit.isHeavy);
        this.audio.damageTaken(hit.isHeavy, true);

        if (this.settingsManager.data.vfx.cameraShake) {
          this.cameraRig.addShake(hit.isHeavy ? 0.32 : 0.16);
        }

        if (hit.isHeavy) {
          this.hitstopTimer = 0.05;
        }

        if ((this.boss.state as string) === 'dead') {
          this.audio.victoryStinger();
          this.cameraRig.setLockedTarget(null);
        } else if (this.boss.state === 'stagger') {
          this.audio.staggerClang();
        }
      }
    }

    // B. Boss Attack Hits Player
    const bossHitboxActive = this.boss.isHitboxActive();
    if (
      (this.boss.state === 'active' || bossHitboxActive) &&
      this.boss.currentAttack &&
      !this.boss.hasHitCurrentSwing &&
      this.player.state !== 'dead'
    ) {
      const bladeHitboxPos = this.boss.getBladeHitboxWorldPosition();
      const distToBlade = this.player.group.position.distanceTo(bladeHitboxPos);
      const bladeHit = distToBlade <= (this.player.radius + 2.0);

      const hit = checkAttackHit(
        this.boss.group.position,
        this.boss.group.rotation.y,
        this.boss.currentAttack,
        this.player.group.position,
        this.player.radius,
        this.player.isInvulnerable,
      );

      if ((bladeHit || hit.hit) && !this.player.isInvulnerable) {
        const damageDealt = this.player.takeDamage(hit.damage || this.boss.currentAttack.damage, hit.isHeavy);
        this.boss.hasHitCurrentSwing = true;

        if (damageDealt) {
          const screenPos = this.projectToScreen(this.player.group.position, 1.2);
          this.hud.spawnDamageNumber(hit.damage, screenPos.x, screenPos.y, true);

          // Combat VFX: Minimal Elden Ring blade-slash blood spit right on player surface
          const toPlayer = this.player.group.position.clone().sub(this.boss.group.position);
          toPlayer.y = 0;
          let hitPoint: THREE.Vector3;
          if (toPlayer.length() > 0.01) {
            toPlayer.normalize();
            hitPoint = this.player.group.position.clone().addScaledVector(toPlayer, -this.player.radius * 0.75);
            hitPoint.y = this.player.group.position.y + 1.10;
          } else {
            hitPoint = hit.contactPoint || this.player.group.position.clone().add(new THREE.Vector3(0, 1.10, 0));
          }

          const fwdAngle = this.boss.group.rotation.y;
          const hitDir = new THREE.Vector3(
            -Math.cos(fwdAngle) * 0.75 - Math.sin(fwdAngle) * 0.35,
            0.15,
            Math.sin(fwdAngle) * 0.75 - Math.cos(fwdAngle) * 0.35,
          ).normalize();

          this.vfx.spawnBloodBurst(hitPoint, hitDir, true);

          this.profiler.markCombatEvent('BOSS_HIT_PLAYER', { damage: hit.damage });

          this.audio.hitConfirm(true);
          this.audio.damageTaken(true, false);

          if (this.settingsManager.data.vfx.cameraShake) {
            this.cameraRig.addShake(0.42);
          }
          this.hitstopTimer = 0.06;

          if ((this.player.state as string) === 'dead') {
            this.audio.deathStinger();
          }
        }
      }
    }
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
  }

  private projectToScreen(worldPos: THREE.Vector3, heightOffset = 0): THREE.Vector2 {
    const v = worldPos.clone();
    v.y += heightOffset;
    v.project(this.camera);

    const halfW = this.canvas.clientWidth / 2;
    const halfH = this.canvas.clientHeight / 2;
    return new THREE.Vector2(v.x * halfW + halfW, -v.y * halfH + halfH);
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
    this.pausedForScreenshot = false;
    this.profiler.markCombatEvent('TRIAL_RESET');
    this.render();
  }

  private syncHud(delta = 0): void {
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
    );
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (_n: number) => {},
      setState: (stateName: string) => {
        if (stateName === 'initial' || stateName === 'default') {
          this.resetRun();
        } else if (stateName === 'player_dead') {
          this.player.hp = 0;
          this.player.state = 'dead';
          this.player.playAction('death', 0.1, THREE.LoopOnce, true, 1.0);
        } else if (stateName === 'boss_dead') {
          this.boss.hp = 0;
          this.boss.state = 'dead';
          this.boss.playAction('die', 0.1, THREE.LoopOnce, true, 1.0);
        } else if (stateName === 'boss_phase2') {
          this.boss.hp = this.boss.maxHp * 0.45;
          this.boss.triggerPhase2(this.player.group.position);
        } else {
          throw new Error(`Unknown state: ${stateName}`);
        }
        this.syncHud();
        this.render();
        this.publishDiagnostics();
        return { state: stateName };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
        if (paused) {
          this.player.velocity.set(0, 0, 0);
        }
        this.render();
        this.publishDiagnostics();
      },
      hideDebugUi: (_hidden: boolean) => {
        this.settingsModal.close();
      },
      toggleHitboxDebug: (visible?: boolean) => {
        return this.toggleHitboxDebug(visible);
      },
      isHitboxDebugVisible: () => {
        return this.player.hitboxDebugger.isVisible;
      },
      setPlayerModel: async (modelId: string) => {
        await this.setPlayerModel(modelId);
        return { playerModel: modelId };
      },
      setBossModel: async (modelId: string) => {
        await this.setBossModel(modelId);
        return { bossModel: modelId };
      },
      getPlayerWeaponDistanceToHand: () => {
        if (!this.player.handBone || !this.player.swordObject) return 999;
        const handPos = new THREE.Vector3();
        const swordPos = new THREE.Vector3();
        this.player.handBone.updateMatrixWorld(true);
        this.player.swordObject.updateMatrixWorld(true);
        this.player.handBone.getWorldPosition(handPos);
        this.player.swordObject.getWorldPosition(swordPos);
        return handPos.distanceTo(swordPos);
      },
      getBossWeaponDistanceToHand: () => {
        if (!this.boss.handBone || !this.boss.greatswordGroup) return 999;
        const handPos = new THREE.Vector3();
        const swordPos = new THREE.Vector3();
        this.boss.handBone.updateMatrixWorld(true);
        this.boss.greatswordGroup.updateMatrixWorld(true);
        this.boss.handBone.getWorldPosition(handPos);
        this.boss.greatswordGroup.getWorldPosition(swordPos);
        return handPos.distanceTo(swordPos);
      },
      triggerBossAttack: (attackKey: string) => {
        const atk = BOSS_ATTACKS[attackKey];
        if (atk) {
          (this.boss as unknown as { chooseAttack: (a: unknown) => void }).chooseAttack(atk);
        }
      },
      triggerGroundSlam: (pos?: any) => {
        const p = pos
          ? (pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z))
          : this.boss.group.position.clone().add(new THREE.Vector3(0, 0, 2));
        this.vfx.triggerGroundSlam(p, this.arena.floorMesh);
      },
      triggerBloodBurst: (pos?: any, dir?: any) => {
        const p = pos
          ? (pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z))
          : this.player.group.position.clone().add(new THREE.Vector3(0, 1, 0));
        const d = dir
          ? (dir instanceof THREE.Vector3 ? dir : new THREE.Vector3(dir.x, dir.y, dir.z))
          : new THREE.Vector3(0, 0.5, 1);
        this.vfx.spawnBloodBurst(p, d, true);
      },
      triggerHitSparks: (pos?: any, dir?: any) => {
        const p = pos
          ? (pos instanceof THREE.Vector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z))
          : this.player.group.position.clone().add(new THREE.Vector3(0, 1, 0));
        const d = dir
          ? (dir instanceof THREE.Vector3 ? dir : new THREE.Vector3(dir.x, dir.y, dir.z))
          : new THREE.Vector3(0, 0.8, 0.6).normalize();
        this.vfx.spawnHitSparks(p, d, true);
      },
      triggerSlashArc: (origin?: THREE.Vector3, rotation?: THREE.Euler, color?: number | string) => {
        const o = origin || this.player.group.position.clone().add(new THREE.Vector3(0, 1, 0));
        const r = rotation || new THREE.Euler(0, this.player.group.rotation.y, 0);
        this.vfx.spawnSlashArc(o, r, 1.2, color || 0xffe066);
      },
      getVfxSystem: () => this.vfx,
      triggerRestart: () => this.resetRun(),
      getInputController: () => this.input,
      getMobileDeviceController: () => this.mobileDeviceController,
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    const snap = this.profiler.getSnapshot();

    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
      fps: snap.fps,
      onePercentLowFps: snap.onePercentLowFps,
      frameTimeMs: snap.frameTimeMs,
      player: {
        position: {
          x: this.player.group.position.x,
          y: this.player.group.position.y,
          z: this.player.group.position.z,
        },
        speed: this.player.velocity.length(),
        hp: this.player.hp,
        stamina: this.player.stamina,
        state: this.player.state,
        isInvulnerable: this.player.isInvulnerable,
        loaded: this.player.isLoaded,
        activeClip: this.player.currentActionName,
        modelId: this.player.modelId,
      },
      boss: {
        position: {
          x: this.boss.group.position.x,
          y: this.boss.group.position.y,
          z: this.boss.group.position.z,
        },
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        state: this.boss.state,
        isPhase2: this.boss.isPhase2,
        loaded: this.boss.isLoaded,
        activeClip: this.boss.currentActionName,
        modelId: this.boss.modelId,
      },
      assetsLoaded: this.player.isLoaded && this.boss.isLoaded && this.isReady,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, this.settingsManager.data.graphics.maxDpr),
      },
    };
  }
}
