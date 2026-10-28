import * as THREE from 'three';
import { checkAttackHit } from '../combat/HitDetection';
import { type CombatInputs, InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { BossCharacter } from '../entities/BossCharacter';
import { PlayerCharacter } from '../entities/PlayerCharacter';
import { AudioSystem } from '../systems/AudioSystem';
import { DebugTools, type DebugTuning } from '../systems/DebugTools';
import { Hud } from '../systems/Hud';
import { SoulslikeCamera } from '../systems/SoulslikeCamera';
import { Arena } from '../world/Arena';

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
  private readonly hud: Hud;
  private readonly debugTools: DebugTools;

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

  private readonly tuning: DebugTuning = {
    speed: 4.8,
    dashMultiplier: 1.6,
    acceleration: 14,
    cameraLag: 0.12,
    exposure: 1.1,
    maxDpr: 2,
  };

  private frame = 0;
  private elapsed = 0;
  private hitstopTimer = 0;
  private pausedForScreenshot = false;

  // Previous states for audio triggers
  private prevPlayerState = 'idle';
  private prevBossState = 'idle';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = this.tuning.exposure;

    this.input = new InputController(canvas);
    this.cameraRig = new SoulslikeCamera(this.camera);

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

    this.debugTools = new DebugTools(
      this.tuning,
      () => {
        this.renderer.toneMappingExposure = this.tuning.exposure;
        resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
      },
      {
        playerModels: AVAILABLE_PLAYER_MODELS.map((m) => m.id),
        currentPlayerModel: this.player.modelId,
        onPlayerModelChange: async (id: string) => {
          await this.setPlayerModel(id);
        },
        bossModels: AVAILABLE_BOSS_MODELS.map((m) => m.id),
        currentBossModel: this.boss.modelId,
        onBossModelChange: async (id: string) => {
          await this.setBossModel(id);
        },
      },
    );

    this.buildScene();
    this.resetRun();

    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);
    this.installTestHooks();
    this.publishDiagnostics();
  }

  public async setPlayerModel(modelId: string): Promise<void> {
    await this.player.loadModel(modelId);
    this.hud.syncModels(this.player.modelId, this.boss.modelId);
    this.debugTools.syncModels(this.player.modelId, this.boss.modelId);
    this.render();
    this.publishDiagnostics();
  }

  public async setBossModel(modelId: string): Promise<void> {
    await this.boss.loadModel(modelId);
    this.hud.syncModels(this.player.modelId, this.boss.modelId);
    this.debugTools.syncModels(this.player.modelId, this.boss.modelId);
    this.render();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debugTools.dispose();
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

    const moonLight = new THREE.DirectionalLight(0xbcd6ff, 2.8);
    moonLight.position.set(-14, 24, 16);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.bias = -0.0003;
    moonLight.shadow.camera.near = 1;
    moonLight.shadow.camera.far = 70;
    moonLight.shadow.camera.left = -24;
    moonLight.shadow.camera.right = 24;
    moonLight.shadow.camera.top = 24;
    moonLight.shadow.camera.bottom = -24;
    this.scene.add(moonLight);

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
    this.frame += 1;
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    this.elapsed += delta;
    resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);

    // Hitstop freeze-frame on impacts
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= delta;
      this.publishDiagnostics();
      return;
    }

    // 1. Read Inputs
    this.input.readInputs(this.combatInputs);
    this.input.consumeMouseDelta(this.mouseDelta);

    // Restart check
    if (this.combatInputs.restart) {
      this.resetRun();
      return;
    }

    // Mouse look
    if (this.mouseDelta.lengthSq() > 0) {
      this.cameraRig.handleMouseMove(this.mouseDelta.x, this.mouseDelta.y);
    }

    // 2. Lock-On Management
    if (this.combatInputs.toggleLockOn && this.boss.state !== 'dead') {
      const locked = this.cameraRig.toggleLockOn(this.boss.group.position);
      if (!locked) {
        this.cameraRig.setLockedTarget(null);
      }
    }

    // Break lock-on if boss dead or too far
    if (this.cameraRig.isLockedOn) {
      const dist = this.player.group.position.distanceTo(this.boss.group.position);
      if (this.boss.state === 'dead' || dist > 26.0) {
        this.cameraRig.setLockedTarget(null);
      } else {
        this.cameraRig.setLockedTarget(this.boss.group.position);
      }
    }

    // 3. Update Entities
    const lockedTargetPos = this.cameraRig.isLockedOn ? this.boss.group.position : null;

    this.player.update(
      delta,
      elapsed,
      this.combatInputs,
      this.cameraRig.yaw,
      lockedTargetPos,
      this.arena.radius,
    );

    this.boss.update(delta, elapsed, this.player.group.position, this.arena.radius);
    this.arena.update(delta, elapsed);

    // Entity collision separation (prevent player clipping through boss)
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

    // 4. Combat Hit Resolution
    this.resolveCombatCollisions();

    // 5. Audio State Transition Triggers
    this.updateAudioTriggers();

    // 6. Update Camera
    this.cameraRig.update(delta, this.player.group.position, this.arena.radius);

    // 7. Update HUD
    let screenReticle: THREE.Vector2 | null = null;
    if (this.cameraRig.isLockedOn) {
      screenReticle = this.projectToScreen(this.boss.group.position, 1.8);
    }

    this.hud.update(
      delta,
      this.player.hp,
      this.player.maxHp,
      this.player.stamina,
      this.player.maxStamina,
      this.boss.hp,
      this.boss.maxHp,
      this.cameraRig.isLockedOn,
      screenReticle,
      this.player.state === 'dead',
      this.boss.state === 'dead',
    );

    this.publishDiagnostics();
  }

  private resolveCombatCollisions(): void {
    // A. Player Attack Hits Boss
    if (
      this.player.state === 'attack' &&
      this.player.attackPhase === 'active' &&
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

        this.audio.hitImpact(hit.isHeavy);
        this.cameraRig.addShake(hit.isHeavy ? 0.32 : 0.16);

        if (hit.isHeavy) {
          this.hitstopTimer = 0.05; // 50ms freeze frame
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
    if (
      (this.boss.state === 'active') &&
      this.boss.currentAttack &&
      !this.boss.hasHitCurrentSwing &&
      this.player.state !== 'dead'
    ) {
      // Precise blade collision registered directly via the weapon hitbox parented to sword mesh
      const bladeHitboxPos = this.boss.getBladeHitboxWorldPosition();
      const distToBlade = this.player.group.position.distanceTo(bladeHitboxPos);
      const bladeHit = distToBlade <= (this.player.radius + 2.0);

      const hit = checkAttackHit(
        this.boss.group.position,
        this.boss.group.rotation.y,
        this.boss.currentAttack,
        this.player.group.position,
        this.player.radius,
        this.player.isInvulnerable, // Protected by dodge i-frames!
      );

      if ((bladeHit || hit.hit) && !this.player.isInvulnerable) {
        const damageDealt = this.player.takeDamage(hit.damage || this.boss.currentAttack.damage, hit.isHeavy);
        this.boss.hasHitCurrentSwing = true;

        if (damageDealt) {
          const screenPos = this.projectToScreen(this.player.group.position, 1.2);
          this.hud.spawnDamageNumber(hit.damage, screenPos.x, screenPos.y, true);

          this.audio.hitImpact(true);
          this.cameraRig.addShake(0.42);
          this.hitstopTimer = 0.06;

          if ((this.player.state as string) === 'dead') {
            this.audio.deathStinger();
          }
        }
      }
    }
  }

  private updateAudioTriggers(): void {
    // Player action sounds
    if (this.player.state === 'dodge' && this.prevPlayerState !== 'dodge') {
      this.audio.dodgeWhoosh();
    } else if (this.player.state === 'attack' && this.prevPlayerState !== 'attack') {
      this.audio.swordSwing(this.player.currentAttack?.isHeavy);
    }
    this.prevPlayerState = this.player.state;

    // Boss telegraph & attack sounds
    if (this.boss.state === 'windup' && this.prevBossState !== 'windup') {
      this.audio.bossTelegraph();
    } else if (this.boss.state === 'active' && this.prevBossState !== 'active') {
      this.audio.swordSwing(true);
      if (this.boss.currentAttack?.name === 'Sundering Smite') {
        this.audio.bossSmash();
      }
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
  }

  public resetRun(): void {
    this.player.reset(new THREE.Vector3(0, 0, 9));
    this.boss.reset(new THREE.Vector3(0, 0, -8));
    this.cameraRig.setLockedTarget(null);
    this.cameraRig.yaw = 0;
    this.cameraRig.pitch = 0.26;
    this.cameraRig.distance = 4.6;
    this.cameraRig.snapTo(this.player.group.position, this.arena.radius);
    this.hud.reset();
    this.hitstopTimer = 0;
    this.render();
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
      hideDebugUi: (hidden: boolean) => {
        this.debugTools.setHidden(hidden);
        this.hud.setSelectionHidden(hidden);
      },
      setPlayerModel: async (modelId: string) => {
        await this.setPlayerModel(modelId);
        return { playerModel: this.player.modelId };
      },
      setBossModel: async (modelId: string) => {
        await this.setBossModel(modelId);
        return { bossModel: this.boss.modelId };
      },
      getPlayerWeaponDistanceToHand: () => {
        if (!this.player.handBone || !this.player.swordObject) return 999;
        this.player.handBone.updateMatrixWorld(true);
        this.player.swordObject.updateMatrixWorld(true);
        const handWorld = new THREE.Vector3();
        const swordWorld = new THREE.Vector3();
        this.player.handBone.getWorldPosition(handWorld);
        this.player.swordObject.getWorldPosition(swordWorld);
        return handWorld.distanceTo(swordWorld);
      },
      getBossWeaponDistanceToHand: () => {
        if (!this.boss.handBone || !this.boss.greatswordGroup) return 999;
        this.boss.handBone.updateMatrixWorld(true);
        this.boss.greatswordGroup.updateMatrixWorld(true);
        const handWorld = new THREE.Vector3();
        const swordWorld = new THREE.Vector3();
        this.boss.handBone.getWorldPosition(handWorld);
        this.boss.greatswordGroup.getWorldPosition(swordWorld);
        return handWorld.distanceTo(swordWorld);
      },
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.elapsed,
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
      assetsLoaded: this.player.isLoaded && this.boss.isLoaded,
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
        dpr: Math.min(window.devicePixelRatio || 1, this.tuning.maxDpr),
      },
    };
  }
}
