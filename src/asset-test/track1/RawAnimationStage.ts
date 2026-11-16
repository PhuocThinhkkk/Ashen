import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HitboxVisualDebugger } from '../../combat/HitboxVisualDebugger';
import { getKinematicAction } from '../../combat/KinematicData';
import { ModelLoader } from '../../utils/ModelLoader';
import {
  DEFAULT_PLAYER_WEAPON_SOCKET,
  DEFAULT_BOSS_WEAPON_SOCKET,
  loadSocketConfig,
  applyWeaponSocketTransform,
  type WeaponSocketTransform,
} from '../../combat/WeaponSocketConfig';
import { CONFIG } from '../config';
import type { AssetTestDiagnostics } from '../types';

export class RawAnimationStage {
  public readonly diagnostics: AssetTestDiagnostics = {
    loaded: false,
    error: null,
    player: {
      modelId: 'knight',
      bonesCount: 0,
      clips: [],
      activeClip: '',
      height: 0,
      weaponAttached: false,
      handBoneFound: false,
    },
    boss: {
      modelId: 'titan',
      bonesCount: 0,
      clips: [],
      activeClip: '',
      height: 0,
      handBoneFound: false,
    },
  };

  public readonly playerSocket: WeaponSocketTransform = loadSocketConfig(
    'player',
    DEFAULT_PLAYER_WEAPON_SOCKET,
  );
  public readonly bossSocket: WeaponSocketTransform = loadSocketConfig(
    'boss',
    DEFAULT_BOSS_WEAPON_SOCKET,
  );

  private readonly loader = new GLTFLoader();
  private scene: THREE.Scene | null = null;

  public currentPlayerScene: THREE.Group | null = null;
  public currentBossScene: THREE.Group | null = null;
  public playerMixer: THREE.AnimationMixer | null = null;
  public bossMixer: THREE.AnimationMixer | null = null;
  public readonly playerActions = new Map<string, THREE.AnimationAction>();
  public readonly bossActions = new Map<string, THREE.AnimationAction>();
  public playerRawClips: THREE.AnimationClip[] = [];
  public bossRawClips: THREE.AnimationClip[] = [];
  public currentPlayerAction: THREE.AnimationAction | null = null;
  public currentBossAction: THREE.AnimationAction | null = null;

  public playerHandBone: THREE.Object3D | null = null;
  public axeObject: THREE.Object3D | null = null;
  public bossHandBone: THREE.Object3D | null = null;
  public bossLeftFootBone: THREE.Object3D | null = null;
  public bossSwordGroup: THREE.Group | null = null;
  public bossSwordObject: THREE.Object3D | null = null;

  public readonly playerHitboxDebugger = new HitboxVisualDebugger({
    size: new THREE.Vector3(0.28, 1.4, 0.28),
    offset: new THREE.Vector3(0, 0.7, 0),
  });
  public readonly bossHitboxDebugger = new HitboxVisualDebugger({
    size: new THREE.Vector3(0.45, 2.4, 0.45),
    offset: new THREE.Vector3(0, 1.2, 0),
  });
  public readonly bossFootHitboxDebugger = new HitboxVisualDebugger({
    size: new THREE.Vector3(0.35, 0.4, 0.5),
    offset: new THREE.Vector3(0, 0.1, 0),
  });

  public isHitboxVisible = false;

  public async init(
    scene: THREE.Scene,
    onStatusUpdate?: (status: string, isError?: boolean) => void,
  ): Promise<void> {
    this.scene = scene;
    await this.loadPlayer('knight', onStatusUpdate);
    await this.loadBoss(onStatusUpdate);
  }

  public async loadPlayer(
    modelId: 'knight' | 'samurai',
    onStatusUpdate?: (status: string, isError?: boolean) => void,
  ): Promise<void> {
    if (!this.scene) return;
    onStatusUpdate?.(`Loading ${modelId}.glb...`);

    if (this.currentPlayerScene) {
      if (this.playerMixer) this.playerMixer.stopAllAction();
      this.playerActions.clear();
      this.currentPlayerAction = null;
      this.playerHandBone = null;
      if (this.axeObject && this.axeObject.parent) {
        this.axeObject.parent.remove(this.axeObject);
      }
      this.scene.remove(this.currentPlayerScene);
      this.currentPlayerScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      });
      this.currentPlayerScene = null;
    }

    const playerGltf = await this.loader.loadAsync(`/assets/models/players/${modelId}.glb`);
    this.currentPlayerScene = playerGltf.scene;
    this.currentPlayerScene.position.copy(CONFIG.track1.playerPos);

    const rawBox = new THREE.Box3().setFromObject(this.currentPlayerScene);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    const scaleFactor = 1.8 / (rawSize.y || 1);
    this.currentPlayerScene.scale.set(scaleFactor, scaleFactor, scaleFactor);
    this.currentPlayerScene.rotation.y = 0;
    this.currentPlayerScene.updateMatrixWorld(true);

    const playerBox = new THREE.Box3().setFromObject(this.currentPlayerScene);
    const playerSize = new THREE.Vector3();
    playerBox.getSize(playerSize);
    this.diagnostics.player.height = parseFloat(playerSize.y.toFixed(2));
    this.scene.add(this.currentPlayerScene);

    let pBones = 0;
    this.currentPlayerScene.traverse((obj) => {
      const lower = obj.name.toLowerCase();
      if (
        lower.includes('icosphere') ||
        lower.includes('cylinder') ||
        lower.includes('hand_shape') ||
        lower.includes('plane')
      ) {
        obj.visible = false;
      }
      if (obj instanceof THREE.Mesh) {
        if (lower.includes('icosphere') || lower.includes('cylinder')) {
          obj.visible = false;
        } else {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      }
      if (obj instanceof THREE.Bone) {
        pBones++;
        if (
          obj.name === 'PalmR' ||
          obj.name === 'Palm.R' ||
          obj.name === 'MiddleHand.R' ||
          obj.name.toLowerCase().includes('palmr') ||
          obj.name.toLowerCase().includes('middlehand.r') ||
          obj.name.toLowerCase().includes('righthand')
        ) {
          if (!this.playerHandBone) this.playerHandBone = obj;
        }
      }
    });

    this.diagnostics.player.bonesCount = pBones;
    this.diagnostics.player.handBoneFound = !!this.playerHandBone;

    if (!this.axeObject) {
      onStatusUpdate?.('Loading Sword.glb...');
      const swordGltf = await this.loader.loadAsync('/assets/weapons/chevalier_sword.glb');
      this.axeObject = swordGltf.scene;
      this.axeObject.castShadow = true;
      this.axeObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.castShadow = true;
      });
    }

    if (this.playerHandBone && this.axeObject) {
      applyWeaponSocketTransform(this.axeObject, this.playerSocket);
      this.playerHandBone.add(this.axeObject);
      this.playerHitboxDebugger.attachToBone(this.playerHandBone);
      this.diagnostics.player.weaponAttached = true;
    }

    this.playerMixer = new THREE.AnimationMixer(this.currentPlayerScene);
    this.playerRawClips = playerGltf.animations;
    this.diagnostics.player.clips = this.playerRawClips.map((a) => a.name);

    for (const clip of this.playerRawClips) {
      ModelLoader.stripRootMotion(clip, ['Hips', 'hips', 'body', 'HumanArmature|Hips']);
      const action = this.playerMixer.clipAction(clip);
      this.playerActions.set(clip.name, action);
    }

    this.playPlayerAnimation('idle');
    this.diagnostics.player.modelId = modelId;
  }

  public async loadBoss(
    onStatusUpdate?: (status: string, isError?: boolean) => void,
  ): Promise<void> {
    if (!this.scene) return;
    onStatusUpdate?.('Loading titan.glb...');

    if (this.currentBossScene) {
      if (this.bossMixer) this.bossMixer.stopAllAction();
      if (this.bossSwordGroup && this.bossSwordGroup.parent) {
        this.bossSwordGroup.parent.remove(this.bossSwordGroup);
      }
      this.scene.remove(this.currentBossScene);
    }

    const bossGltf = await this.loader.loadAsync('/assets/models/bosses/titan.glb');
    this.currentBossScene = bossGltf.scene;
    this.currentBossScene.position.copy(CONFIG.track1.bossPos);

    const rawBossBox = new THREE.Box3().setFromObject(this.currentBossScene);
    const rawBossSize = new THREE.Vector3();
    rawBossBox.getSize(rawBossSize);
    const bossScaleFactor = 2.4 / (rawBossSize.y || 1);
    this.currentBossScene.scale.set(bossScaleFactor, bossScaleFactor, bossScaleFactor);
    this.currentBossScene.rotation.y = 0;
    this.currentBossScene.updateMatrixWorld(true);
    this.scene.add(this.currentBossScene);

    const bossBox = new THREE.Box3().setFromObject(this.currentBossScene);
    const bossSize = new THREE.Vector3();
    bossBox.getSize(bossSize);
    this.diagnostics.boss.height = parseFloat(bossSize.y.toFixed(2));

    let bBones = 0;
    this.currentBossScene.traverse((obj) => {
      const lower = obj.name.toLowerCase();
      if (
        lower.includes('icosphere') ||
        lower.includes('cylinder') ||
        lower.includes('hand_shape') ||
        lower.includes('plane')
      ) {
        obj.visible = false;
      }
      if (obj instanceof THREE.Mesh) {
        if (
          lower.includes('icosphere') ||
          lower.includes('cylinder') ||
          lower.includes('hand_shape')
        ) {
          obj.visible = false;
        } else {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      }
      if (obj instanceof THREE.Bone || (obj as any).isBone) {
        bBones++;
        if (
          (obj.name === 'handR' ||
            obj.name === 'hand.R' ||
            obj.name === 'PalmR' ||
            obj.name === 'Palm.R' ||
            obj.name === 'mixamorig:RightHand' ||
            obj.name.toLowerCase().includes('righthand')) &&
          !obj.name.includes('IK')
        ) {
          if (!this.bossHandBone) this.bossHandBone = obj;
        }
        if (
          (obj.name === 'mixamorig:LeftFoot' || obj.name.toLowerCase().includes('leftfoot')) &&
          !obj.name.includes('IK')
        ) {
          if (!this.bossLeftFootBone) this.bossLeftFootBone = obj;
        }
      }
    });

    this.diagnostics.boss.bonesCount = bBones;
    this.diagnostics.boss.handBoneFound = !!this.bossHandBone;

    if (!this.bossSwordGroup) {
      onStatusUpdate?.('Loading lower_orc_great_sword.glb...');
      const swordGltf = await this.loader.loadAsync('/assets/weapons/lower_orc_great_sword.glb');
      this.bossSwordObject = swordGltf.scene;
      this.bossSwordObject.position.set(0, 0.7, 0);
      this.bossSwordObject.castShadow = true;
      this.bossSwordObject.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      this.bossSwordGroup = new THREE.Group();
      this.bossSwordGroup.add(this.bossSwordObject);
    }

    if (this.bossHandBone && this.bossSwordGroup) {
      applyWeaponSocketTransform(this.bossSwordGroup, this.bossSocket);
      this.bossHandBone.add(this.bossSwordGroup);
      this.bossHitboxDebugger.attachToBone(this.bossHandBone);
    }

    if (this.bossLeftFootBone) {
      this.bossFootHitboxDebugger.attachToBone(this.bossLeftFootBone);
    }

    this.bossMixer = new THREE.AnimationMixer(this.currentBossScene);
    this.bossRawClips = bossGltf.animations;
    this.diagnostics.boss.clips = this.bossRawClips.map((a) => a.name);

    for (const clip of this.bossRawClips) {
      ModelLoader.stripRootMotion(clip, ['hips', 'mixamorig:Hips', 'mixamorigHips', 'body']);
      const action = this.bossMixer.clipAction(clip);
      this.bossActions.set(clip.name, action);
    }

    this.playBossAnimation('idle');
  }

  public playPlayerAnimation(name: string): void {
    let targetAction = this.playerActions.get(name);
    let resolvedClipName = name;

    if (!targetAction) {
      const foundClip = ModelLoader.findClip(this.playerRawClips, name);
      if (foundClip) {
        targetAction = this.playerActions.get(foundClip.name);
        resolvedClipName = foundClip.name;
      }
    }

    if (!targetAction) return;

    if (targetAction === this.currentPlayerAction && targetAction.isRunning()) {
      targetAction.reset();
      targetAction.play();
      return;
    }

    targetAction.reset();
    const isOneShot = ['attack_light', 'attack_heavy', 'dodge', 'death'].some((k) =>
      resolvedClipName.toLowerCase().includes(k),
    );

    if (resolvedClipName.toLowerCase().includes('dodge')) {
      targetAction.setLoop(THREE.LoopOnce, 1);
      targetAction.clampWhenFinished = true;
      targetAction.timeScale = targetAction.getClip().duration / 0.4;
    } else if (isOneShot) {
      targetAction.setLoop(THREE.LoopOnce, 1);
      targetAction.clampWhenFinished = true;
      targetAction.timeScale = 1.0;
    } else {
      targetAction.setLoop(THREE.LoopRepeat, Infinity);
      targetAction.clampWhenFinished = false;
      targetAction.timeScale = 1.0;
    }

    if (this.currentPlayerAction) {
      this.currentPlayerAction.crossFadeTo(targetAction, 0.18, true);
    }
    targetAction.play();
    this.currentPlayerAction = targetAction;
    this.diagnostics.player.activeClip = resolvedClipName;
  }

  public playBossAnimation(name: string): void {
    let targetAction = this.bossActions.get(name);
    let resolvedClipName = name;

    if (!targetAction) {
      const foundClip = ModelLoader.findClip(this.bossRawClips, name);
      if (foundClip) {
        targetAction = this.bossActions.get(foundClip.name);
        resolvedClipName = foundClip.name;
      }
    }

    if (!targetAction) return;

    if (targetAction === this.currentBossAction && targetAction.isRunning()) {
      targetAction.reset();
      targetAction.play();
      return;
    }

    targetAction.reset();
    const isLoop = ['idle', 'walking', 'walk'].includes(resolvedClipName.toLowerCase());
    if (isLoop) {
      targetAction.setLoop(THREE.LoopRepeat, Infinity);
      targetAction.clampWhenFinished = false;
    } else {
      targetAction.setLoop(THREE.LoopOnce, 1);
      targetAction.clampWhenFinished = true;
    }

    if (this.currentBossAction) {
      this.currentBossAction.crossFadeTo(targetAction, 0.2, true);
    }
    targetAction.play();
    this.currentBossAction = targetAction;
    this.diagnostics.boss.activeClip = resolvedClipName;
  }

  public getWeaponDistanceToHand(): number {
    if (!this.playerHandBone || !this.axeObject) return 999;
    const handWorld = new THREE.Vector3();
    const axeWorld = new THREE.Vector3();
    this.playerHandBone.getWorldPosition(handWorld);
    this.axeObject.getWorldPosition(axeWorld);
    return handWorld.distanceTo(axeWorld);
  }

  public setHitboxVisible(visible: boolean): void {
    this.isHitboxVisible = visible;
    this.playerHitboxDebugger.setVisible(visible);
    this.bossHitboxDebugger.setVisible(visible);
    this.bossFootHitboxDebugger.setVisible(visible);
  }

  public updateFrameTelemetry(): {
    playerActive: boolean;
    bossActive: boolean;
    telemetryText: string;
  } {
    let playerImpact = false;
    let bossImpact = false;
    let telemetryText = '';

    if (this.currentPlayerAction) {
      const clipName = this.diagnostics.player.activeClip;
      const cfg = getKinematicAction(clipName);
      const duration = this.currentPlayerAction.getClip().duration;
      const totalFrames = cfg ? cfg.totalFrames : Math.round(duration * 60);
      const timeNorm = ((this.currentPlayerAction.time % duration) + duration) % duration;
      const frame = Math.min(totalFrames, Math.floor(timeNorm * 60) + 1);

      let phase = 'Idle';
      if (cfg) {
        for (const p of cfg.phases) {
          if (frame >= p.startFrame && frame <= p.endFrame) {
            phase = p.type;
            break;
          }
        }
        if (
          cfg.hitbox &&
          frame >= cfg.hitbox.activeStartFrame &&
          frame <= cfg.hitbox.activeEndFrame
        ) {
          playerImpact = true;
        }
      }
      telemetryText = `Player: [${clipName}] F:${frame}/${totalFrames} [${phase}]`;
    }

    if (this.currentBossAction) {
      const clipName = this.diagnostics.boss.activeClip;
      const cfg = getKinematicAction(clipName);
      const duration = this.currentBossAction.getClip().duration;
      const totalFrames = cfg ? cfg.totalFrames : Math.round(duration * 60);
      const timeNorm = ((this.currentBossAction.time % duration) + duration) % duration;
      const frame = Math.min(totalFrames, Math.floor(timeNorm * 60) + 1);

      let phase = 'Idle';
      if (cfg) {
        for (const p of cfg.phases) {
          if (frame >= p.startFrame && frame <= p.endFrame) {
            phase = p.type;
            break;
          }
        }
        if (
          cfg.hitbox &&
          frame >= cfg.hitbox.activeStartFrame &&
          frame <= cfg.hitbox.activeEndFrame
        ) {
          bossImpact = true;
        }
      }
      telemetryText += ` | Boss: [${clipName}] F:${frame}/${totalFrames} [${phase}]`;
    }

    this.playerHitboxDebugger.update(playerImpact);
    const isKick = this.diagnostics.boss.activeClip.toLowerCase().includes('kick');
    this.bossHitboxDebugger.update(!isKick && bossImpact);
    this.bossFootHitboxDebugger.update(isKick && bossImpact);

    return { playerActive: playerImpact, bossActive: bossImpact, telemetryText };
  }

  public update(delta: number): void {
    if (this.playerMixer) this.playerMixer.update(delta);
    if (this.bossMixer) this.bossMixer.update(delta);
    this.updateFrameTelemetry();
  }

  public stepFrame(deltaSeconds: number): void {
    if (this.playerMixer) this.playerMixer.update(deltaSeconds);
    if (this.bossMixer) this.bossMixer.update(deltaSeconds);
    this.updateFrameTelemetry();
  }
}
