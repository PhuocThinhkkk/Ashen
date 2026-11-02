import * as THREE from 'three';

export interface AssetTestDiagnostics {
  loaded: boolean;
  error: string | null;
  player: {
    modelId: string;
    bonesCount: number;
    clips: string[];
    activeClip: string;
    height: number;
    weaponAttached: boolean;
    handBoneFound: boolean;
  };
  boss: {
    modelId: string;
    bonesCount: number;
    clips: string[];
    activeClip: string;
    height: number;
    handBoneFound: boolean;
  };
}

export interface DuelSpacing {
  distance: number;
  playerPos: THREE.Vector3;
  bossPos: THREE.Vector3;
}

export type CameraPreset =
  | 'both'
  | 'player'
  | 'boss'
  | 'reset'
  | 'duel'
  | 'side'
  | 'roam'
  | 'overview';

declare global {
  interface Window {
    __ASSET_TEST__?: {
      diagnostics: AssetTestDiagnostics;
      playPlayerClip: (name: string) => void;
      playBossClip: (name: string) => void;
      getWeaponDistanceToHand: () => number;
      switchPlayerModel: (modelId: string) => Promise<void>;
      setPlaybackSpeed: (speed: number) => void;
      setCamera: (preset: CameraPreset) => void;
      pauseAtMidFrame: (
        category: 'player' | 'boss',
        clipName: string,
      ) => Promise<{ duration: number; midTime: number }>;
      captureCanvas: () => string;
      captureAllAnimations: () => Promise<Record<string, string>>;
      toggleHitbox?: (visible?: boolean) => boolean;
      isHitboxVisible?: () => boolean;
      stepFrame?: (frames: number) => void;
      togglePause?: () => boolean;
      setMode?: (mode: 'orbit' | 'walk') => void;
      getHitboxDebugState?: () => { playerActive: boolean; bossActive: boolean };
      triggerPlayerAction?: (actionKey: string) => void;
      triggerBossAction?: (actionKey: string) => void;
      resetDuelPositions?: () => void;
      getDuelSpacing?: () => DuelSpacing;
      toggleAutoReset?: (enabled?: boolean) => boolean;
      toggleTrajectory?: (enabled?: boolean) => boolean;
      setRoamMode?: (enabled: boolean) => void;
      getWeaponLocations?: () => any;
    };
  }
}
