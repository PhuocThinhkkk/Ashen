export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';
export type VFXPreset = 'full' | 'balanced' | 'performance' | 'custom';

export interface GraphicsSettings {
  maxDpr: number;
  shadowQuality: ShadowQuality;
  exposure: number;
}

export interface VFXSettings {
  slashArcs: boolean;
  bloodBursts: boolean;
  hitSparks: boolean;
  groundSlamShockwave: boolean;
  groundDecals: boolean;
  groundDust: boolean;
  arenaDust: boolean;
  damageNumbers: boolean;
  cameraShake: boolean;
  preset: VFXPreset;
}

export interface GameplaySettings {
  speed: number;
  dashMultiplier: number;
  acceleration: number;
  cameraLag: number;
  hitstopDilation: number;
}

export interface GeneralSettings {
  showControlsGuide: boolean;
  showHudBars: boolean;
  showBossBar: boolean;
  showHitboxDebug: boolean;
  invertCameraY: boolean;
}

export interface GameSettingsData {
  graphics: GraphicsSettings;
  vfx: VFXSettings;
  gameplay: GameplaySettings;
  general: GeneralSettings;
}

export type SettingsChangeListener = (settings: GameSettingsData) => void;

const STORAGE_KEY = 'ashen_souls_settings_v1';

export const DEFAULT_SETTINGS: GameSettingsData = {
  graphics: {
    maxDpr: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 2,
    shadowQuality: 'high',
    exposure: 1.1,
  },
  vfx: {
    slashArcs: true,
    bloodBursts: true,
    hitSparks: true,
    groundSlamShockwave: true,
    groundDecals: true,
    groundDust: true,
    arenaDust: true,
    damageNumbers: true,
    cameraShake: true,
    preset: 'full',
  },
  gameplay: {
    speed: 4.8,
    dashMultiplier: 1.6,
    acceleration: 14,
    cameraLag: 0.12,
    hitstopDilation: 0.15,
  },
  general: {
    showControlsGuide: true,
    showHudBars: true,
    showBossBar: true,
    showHitboxDebug: false,
    invertCameraY: false,
  },
};

export class SettingsManager {
  private static instance: SettingsManager | null = null;
  public data: GameSettingsData;
  private listeners: Set<SettingsChangeListener> = new Set();

  constructor() {
    this.data = this.loadSettings();
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  public subscribe(listener: SettingsChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify(): void {
    this.saveSettings();
    for (const listener of this.listeners) {
      listener(this.data);
    }
  }

  public updateGraphics(partial: Partial<GraphicsSettings>): void {
    Object.assign(this.data.graphics, partial);
    this.notify();
  }

  public updateVFX(partial: Partial<VFXSettings>): void {
    Object.assign(this.data.vfx, partial);
    // If individual switches were changed, update preset to custom unless specifically set
    if (!('preset' in partial)) {
      this.data.vfx.preset = 'custom';
    }
    this.notify();
  }

  public applyVFXPreset(preset: VFXPreset): void {
    if (preset === 'full') {
      this.data.vfx = {
        slashArcs: true,
        bloodBursts: true,
        hitSparks: true,
        groundSlamShockwave: true,
        groundDecals: true,
        groundDust: true,
        arenaDust: true,
        damageNumbers: true,
        cameraShake: true,
        preset: 'full',
      };
      this.data.graphics.shadowQuality = 'high';
      this.data.graphics.maxDpr = 2.0;
    } else if (preset === 'balanced') {
      this.data.vfx = {
        slashArcs: true,
        bloodBursts: true,
        hitSparks: true,
        groundSlamShockwave: true,
        groundDecals: false,
        groundDust: false,
        arenaDust: false,
        damageNumbers: true,
        cameraShake: true,
        preset: 'balanced',
      };
      this.data.graphics.shadowQuality = 'medium';
      this.data.graphics.maxDpr = 1.25;
    } else if (preset === 'performance') {
      this.data.vfx = {
        slashArcs: false,
        bloodBursts: true, // Visceral blood remains clearly visible!
        hitSparks: true,
        groundSlamShockwave: false,
        groundDecals: false,
        groundDust: false,
        arenaDust: false,
        damageNumbers: false,
        cameraShake: false,
        preset: 'performance',
      };
      this.data.graphics.shadowQuality = 'off';
      this.data.graphics.maxDpr = 1.0;
    } else {
      this.data.vfx.preset = 'custom';
    }
    this.notify();
  }

  public updateGameplay(partial: Partial<GameplaySettings>): void {
    Object.assign(this.data.gameplay, partial);
    this.notify();
  }

  public updateGeneral(partial: Partial<GeneralSettings>): void {
    Object.assign(this.data.general, partial);
    this.notify();
  }

  public resetToDefaults(): void {
    this.data = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    this.notify();
  }

  private loadSettings(): GameSettingsData {
    if (typeof window === 'undefined' || !window.localStorage) {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const parsed = JSON.parse(raw);
      return {
        graphics: { ...DEFAULT_SETTINGS.graphics, ...(parsed.graphics || {}) },
        vfx: { ...DEFAULT_SETTINGS.vfx, ...(parsed.vfx || {}) },
        gameplay: { ...DEFAULT_SETTINGS.gameplay, ...(parsed.gameplay || {}) },
        general: { ...DEFAULT_SETTINGS.general, ...(parsed.general || {}) },
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  private saveSettings(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }
}
