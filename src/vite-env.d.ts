/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
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
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}

declare module 'three-nebula' {
  export class SpriteRenderer {
    constructor(scene: any, THREE: any);
    [key: string]: any;
  }
  export class Emitter {
    constructor();
    [key: string]: any;
  }
  export class Rate {
    constructor(numPan: any, interval?: any);
    [key: string]: any;
  }
  export class Span {
    constructor(a: any, b?: any);
    [key: string]: any;
  }
  export class Position {
    constructor(zone?: any);
    [key: string]: any;
  }
  export class PointZone {
    constructor(x?: number, y?: number, z?: number);
    [key: string]: any;
  }
  export class Mass {
    constructor(mass: any);
    [key: string]: any;
  }
  export class Radius {
    constructor(radius: any);
    [key: string]: any;
  }
  export class Life {
    constructor(life: any);
    [key: string]: any;
  }
  export class RadialVelocity {
    constructor(radius: any, vector?: any, theta?: any);
    [key: string]: any;
  }
  export class VectorVelocity {
    constructor(vector: any);
    [key: string]: any;
  }
  export class Vector3D {
    constructor(x?: number, y?: number, z?: number);
    [key: string]: any;
  }
  export class Alpha {
    constructor(a: any, b?: any);
    [key: string]: any;
  }
  export class Scale {
    constructor(a: any, b?: any);
    [key: string]: any;
  }
  export class Color {
    constructor(a: any, b?: any);
    [key: string]: any;
  }
  export class Body {
    constructor(target: any);
    [key: string]: any;
  }
  export class Behaviour {
    [key: string]: any;
  }
  export default class System {
    constructor();
    [key: string]: any;
  }
}
