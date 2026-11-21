import type * as THREE from 'three';
import type { PlayerCharacter } from '../../entities/PlayerCharacter';
import type { BossCharacter } from '../../entities/BossCharacter';
import type { VFXSystem } from '../../systems/VFXSystem';

export class MatchPrewarmer {
  public static prewarmAnimationMixers(player: PlayerCharacter, boss: BossCharacter): void {
    // Pre-warm player mixer actions
    if (player.mixer) {
      for (const action of player.upperActions.values()) {
        action.play();
        action.setEffectiveWeight(0.0001);
      }
      for (const action of player.lowerActions.values()) {
        action.play();
        action.setEffectiveWeight(0.0001);
      }
      player.mixer.update(0.001);
    }

    // Pre-warm boss mixer actions
    if (boss.mixer) {
      const bossAny = boss as any;
      if (bossAny.rawClips) {
        for (const clip of bossAny.rawClips) {
          bossAny.getAction?.(clip.name);
        }
      }
      for (const action of (bossAny.actions as Map<string, THREE.AnimationAction>)?.values() ?? []) {
        action.play();
        action.setEffectiveWeight(0.0001);
      }
      boss.mixer.update(0.001);
    }
  }

  public static prewarmRendererAndShaders(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    vfx: VFXSystem,
  ): void {
    vfx.prewarm(renderer, camera);
    renderer.compile(scene, camera);
  }
}
