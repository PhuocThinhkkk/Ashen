import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export { splitClipByBodyPart, isLowerBodyBone } from './AnimationSplitter';

export type EntityType = 'player' | 'boss';

export class ModelLoader {
  private static readonly loader = new GLTFLoader();

  /**
   * Resolves the standardized public asset URL for a given entity type and ID.
   * Example:
   *   getModelUrl('player', 'knight')  -> '/assets/models/players/knight.glb'
   *   getModelUrl('boss', 'titan')     -> '/assets/models/bosses/titan.glb'
   */
  public static getModelUrl(type: EntityType, id: string): string {
    const category = type === 'boss' ? 'bosses' : `${type}s`;
    return `/assets/models/${category}/${id}.glb`;
  }

  /**
   * Asynchronously loads a character model GLTF.
   */
  public static async loadModel(type: EntityType, id: string): Promise<GLTF> {
    const url = this.getModelUrl(type, id);
    return await this.loader.loadAsync(url);
  }

  /**
   * Finds an animation clip by standard name or common state alias.
   */
  public static findClip(animations: THREE.AnimationClip[], stateName: string): THREE.AnimationClip | null {
    // 1. Direct match
    let clip = THREE.AnimationClip.findByName(animations, stateName);
    if (clip) return clip;

    // 2. Alias mapping table for smooth transition from legacy names
    const ALIAS_MAP: Record<string, string[]> = {
      idle: ['idle', 'Great Sword Idle', 'HumanArmature|Idle_swordRight', 'HumanArmature|Idle', 'Idle-loop', 'Boss_Idle'],
      walk: ['walk', 'walking', 'walk_forward', 'Great Sword Walk forward', 'HumanArmature|Walking', 'Walk-loop'],
      walking: ['walking', 'walk', 'walk_forward', 'Great Sword Walk forward', 'HumanArmature|Walking'],
      walk_forward: ['walk_forward', 'walking', 'walk', 'Great Sword Walk forward'],
      walk_backward: ['walk_backward', 'walk_back', 'backward', 'Great Sword Walk backward'],
      walk_back: ['walk_back', 'walk_backward', 'backward', 'Great Sword Walk backward'],
      strafe_left: ['strafe_left', 'Great Sword Strafe Left'],
      strafe_right: ['strafe_right', 'Great Sword Strafe right'],
      turn_left: ['turn_left', 'Turn Left', 'turn left', 'turnleft', 'TurnLeft', 'strafe_left'],
      turn_right: ['turn_right', 'Turn Right', 'turn right', 'turnright', 'TurnRight', 'strafe_right'],
      run: ['run', 'Great Sword Run', 'HumanArmature|Run', 'Run-loop'],
      dodge: ['dodge', 'Stand To Roll', 'stand_to_roll', 'HumanArmature|Roll_sword', 'HumanArmature|Roll', 'Roll', 'Dive_Roll'],
      attack_light: ['attack_light', 'Great Sword Light Attack', 'HumanArmature|Run_swordAttack', 'Attack1', 'Great_Sword_Slash'],
      attack_heavy: ['attack_heavy', 'attack', 'attack_downward', 'Standing Melee Attack Downward', 'HumanArmature|swordAttackJump', 'Attack2', 'Heavy_Smash'],
      attack_combo: ['attack_combo', 'combo_attack', 'Standing Melee Combo Attack Ver. 2', 'standing_melee_combo_attack_ver_2'],
      attack_jump: ['attack_jump', 'jump_attack', 'Standing Melee Run Jump Attack', 'standing_melee_run_jump_attack'],
      attack_360: ['attack_360', '360_attack', 'Standing Melee Attack 360 Low heavy attack', 'standing_melee_attack_360_low_heavy_attack'],
      kick: ['kick', 'Great Sword Kick', 'great_sword_kick'],
      drinking: ['drinking', 'drink', 'Drink', 'Drinking'],
      jumping: ['jumping', 'jump', 'Jump', 'Jumping'],
      special: ['special', 'taunt', 'Roar'],
      hit: ['hit', 'Great Sword Impact', 'great_sword_impact', 'Hit_Reaction', 'Hurt'],
      death: ['death', 'die', 'HumanArmature|Death', 'Die'],
      die: ['die', 'death', 'HumanArmature|Death', 'Die'],
    };

    // Check if stateName is a known alias
    const normalized = stateName.toLowerCase();
    for (const [standardKey, aliases] of Object.entries(ALIAS_MAP)) {
      if (standardKey === normalized || aliases.some((a) => a.toLowerCase() === normalized)) {
        for (const candidate of [standardKey, ...aliases]) {
          clip = THREE.AnimationClip.findByName(animations, candidate);
          if (clip) return clip;
        }
      }
    }

    return null;
  }

  /**
   * Plays an animation clip on the mixer by its standard state name.
   */
  public static playAnimation(
    mixer: THREE.AnimationMixer,
    gltfOrClips: { animations: THREE.AnimationClip[] } | THREE.AnimationClip[],
    stateName: string,
    options?: {
      loop?: THREE.AnimationActionLoopStyles;
      clampWhenFinished?: boolean;
      timeScale?: number;
      fadeDuration?: number;
      currentAction?: THREE.AnimationAction | null;
    },
  ): THREE.AnimationAction | null {
    const clips = Array.isArray(gltfOrClips) ? gltfOrClips : gltfOrClips.animations;
    const clip = this.findClip(clips, stateName);

    if (!clip) {
      console.warn(`[ModelLoader] Animation "${stateName}" missing in GLB.`);
      return null;
    }

    const action = mixer.clipAction(clip);
    action.setLoop(
      options?.loop ?? THREE.LoopRepeat,
      options?.loop === THREE.LoopOnce ? 1 : Infinity,
    );
    action.clampWhenFinished = options?.clampWhenFinished ?? false;
    action.timeScale = options?.timeScale ?? 1.0;

    if (options?.currentAction && options.currentAction !== action) {
      options.currentAction.crossFadeTo(action, options.fadeDuration ?? 0.15, true);
    }
    action.play();
    return action;
  }

  /**
   * Finds a bone matching target candidate names, avoiding false matches on IK helpers and fingers.
   */
  public static findSocketBone(
    root: THREE.Object3D,
    candidates: string[] | string,
  ): THREE.Object3D | null {
    const list = Array.isArray(candidates) ? candidates : [candidates];

    // 1. Exact case-sensitive match
    for (const name of list) {
      let match: THREE.Object3D | null = null;
      root.traverse((obj) => {
        if (match) return;
        if (obj.name === name) match = obj;
      });
      if (match) return match;
    }

    // 2. Case-insensitive exact match (excluding IK)
    for (const name of list) {
      const lowerTarget = name.toLowerCase();
      let match: THREE.Object3D | null = null;
      root.traverse((obj) => {
        if (match) return;
        const lower = obj.name.toLowerCase();
        if (lower.includes('ik') && !lowerTarget.includes('ik')) return;
        if (lower === lowerTarget) match = obj;
      });
      if (match) return match;
    }

    // 3. Alphanumeric normalized search
    for (const name of list) {
      const normTarget = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      let match: THREE.Object3D | null = null;
      root.traverse((obj) => {
        if (match) return;
        const lower = obj.name.toLowerCase();
        if (
          (lower.includes('ik') && !normTarget.includes('ik')) ||
          lower.includes('thumb') ||
          lower.includes('index') ||
          lower.includes('pinky') ||
          lower.includes('ring')
        ) {
          return;
        }
        const normObj = lower.replace(/[^a-zA-Z0-9]/g, '');
        if (normObj === normTarget || normObj.endsWith(normTarget)) {
          match = obj;
        }
      });
      if (match) return match;
    }

    return null;
  }

  /**
   * Strips horizontal translation from root motion tracks in an AnimationClip
   * so animations play strictly in-place at the character controller origin.
   * In the Mixamo skeleton hierarchy:
   *  - X is lateral displacement
   *  - Y is horizontal forward/backward displacement
   *  - Z is vertical jumping/ducking height
   */
  public static stripRootMotion(
    clip: THREE.AnimationClip,
    rootBones: string[] | string = ['hips', 'body'],
  ): void {
    const roots = (Array.isArray(rootBones) ? rootBones : [rootBones]).map((r) => r.toLowerCase());
    for (const track of clip.tracks) {
      if (track instanceof THREE.VectorKeyframeTrack && track.name.toLowerCase().includes('position')) {
        const boneName = track.name.split('.')[0].toLowerCase();
        const isRoot = roots.some(
          (r) =>
            boneName === r ||
            boneName.endsWith(`|${r}`) ||
            boneName.endsWith(`:${r}`) ||
            boneName.includes(r),
        );
        if (isRoot) {
          const v = track.values;
          const x0 = v[0];
          const y0 = v[1];
          for (let i = 0; i < v.length; i += 3) {
            v[i] = x0;      // Lock lateral X
            v[i + 1] = y0;  // Lock forward/backward horizontal translation Y
            // v[i + 2] is Z (vertical height) - preserved for natural hips jumping/bobbing
          }
        }
      }
    }
  }

  /**
   * Strips horizontal root XZ translation from root motion tracks in an AnimationClip
   * for Three.js world space (X = lateral, Z = forward/backward, Y = vertical bobbing).
   */
  public static stripRootMotionXZ(
    clip: THREE.AnimationClip,
    rootBones: string[] | string = ['hips', 'mixamorig:hips', 'mixamorighips', 'body'],
  ): void {
    const roots = (Array.isArray(rootBones) ? rootBones : [rootBones]).map((r) => r.toLowerCase());
    for (const track of clip.tracks) {
      if (track instanceof THREE.VectorKeyframeTrack && track.name.toLowerCase().includes('position')) {
        const boneName = track.name.split('.')[0].toLowerCase();
        const isRoot = roots.some(
          (r) =>
            boneName === r ||
            boneName.endsWith(`|${r}`) ||
            boneName.endsWith(`:${r}`) ||
            boneName.includes(r),
        );
        if (isRoot) {
          const v = track.values;
          const x0 = v[0];
          const z0 = v[2];
          for (let i = 0; i < v.length; i += 3) {
            v[i] = x0;      // Strip lateral X
            v[i + 2] = z0;  // Strip forward/backward Z
          }
        }
      }
    }
  }
}
