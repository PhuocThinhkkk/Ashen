import type * as THREE from 'three';
import type { PlayerCharacter } from '../entities/PlayerCharacter';
import type { BossCharacter } from '../entities/BossCharacter';
import type { SoulslikeCamera } from '../systems/SoulslikeCamera';
import type { Arena } from '../world/Arena';
import type { AudioSystem } from '../systems/AudioSystem';
import type { VFXSystem } from '../systems/VFXSystem';
import type { Hud } from '../systems/Hud';
import type { InputController } from '../core/InputController';
import type { NetworkManager } from '../network/NetworkManager';
import type { PerformanceProfiler } from '../systems/PerformanceProfiler';
import type { Loop } from '../core/Loop';

/**
 * Clean interface contract for Game orchestration, test hooks, and multiplayer.
 * Eliminates the need for unsafe `(game as any)` casting.
 */
export interface IGameContext {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  loop: Loop;
  camera: SoulslikeCamera;
  player: PlayerCharacter;
  boss: BossCharacter;
  arena: Arena;
  audioSystem: AudioSystem;
  vfxSystem: VFXSystem;
  hud: Hud;
  input: InputController;
  networkManager: NetworkManager;
  statsProfiler: PerformanceProfiler;

  isPaused: boolean;
  isQuickRestarting: boolean;
  isMatchPreparing: boolean;

  restartMatch(): Promise<void>;
  togglePause(): void;
  prepareMatch(playerModelId?: string, bossModelId?: string): Promise<void>;
}
