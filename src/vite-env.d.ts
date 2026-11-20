/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  fps?: number;
  onePercentLowFps?: number;
  frameTimeMs?: number;
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
    hp: number;
    stamina: number;
    state: string;
    isInvulnerable: boolean;
    loaded?: boolean;
    activeClip?: string;
    modelId?: string;
    upperClip?: string;
    lowerClip?: string;
    isGrounded?: boolean;
    isDrinking?: boolean;
    isAirborneAttack?: boolean;
    tiltAngle?: number;
    healCharges?: number;
    maxHealCharges?: number;
  };
  boss: {
    position: { x: number; y: number; z: number };
    hp: number;
    maxHp: number;
    state: string;
    isPhase2: boolean;
    loaded?: boolean;
    activeClip?: string;
    modelId?: string;
    subgoal?: string;
    attackCooldown?: number;
    strafeDir?: number;
    locomotionWeights?: {
      idle: number;
      walkForward: number;
      walkBack: number;
      strafeLeft: number;
      strafeRight: number;
    };
  };
  assetsLoaded?: boolean;
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface ThreeGameTestHooks {
  seed(value: number): void | Promise<void>;
  setState(name: string): { state: string } | Promise<{ state: string }>;
  setPausedForScreenshot(paused: boolean): void | Promise<void>;
  setReducedMotion?(enabled: boolean): void | Promise<void>;
  hideDebugUi(hidden: boolean): void | Promise<void>;
  setPlayerModel?(modelId: string): Promise<{ playerModel: string }>;
  setBossModel?(modelId: string): Promise<{ bossModel: string }>;
  getPlayerWeaponDistanceToHand?(): number;
  getBossWeaponDistanceToHand?(): number;
  toggleHitboxDebug?(visible?: boolean): boolean;
  isHitboxDebugVisible?(): boolean;
  triggerBossAttack?(attackKey: string): void;
  triggerGroundSlam?(pos?: any): void;
  triggerBloodBurst?(pos?: any, dir?: any): void;
  triggerHitSparks?(pos?: any, dir?: any): void;
  triggerSlashArc?(origin?: any, rotation?: any, color?: any): void;
  getVfxSystem?(): any;
  getProfiler?(): any;
  triggerRestart?(): void;
  getInputController?(): any;
  getMobileDeviceController?(): any;
  setPlayerHp?(hp: number): void;
  triggerHeal?(): void;
  triggerJump?(): void;
  triggerMidAirAttack?(heavy?: boolean): void;
  getPlayerJumpDiagnostics?(): any;
  getPlayerDrinkDiagnostics?(): any;
  getBossAIDiagnostics?(): any;
  queueBossCombo?(openerKey: string, followupKey: string): void;
  setPlayerPosition?(pos: { x: number; y: number; z: number }): void;
  setBossPosition?(pos: { x: number; y: number; z: number }): void;
  setBossAttackCooldown?(cd: number): void;
  setBossSubgoal?(subgoal: any): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}

declare module '*.glsl?raw' {
  const content: string;
  export default content;
}

declare module '*.glsl' {
  const content: string;
  export default content;
}

