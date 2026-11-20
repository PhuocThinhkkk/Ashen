import {
  type BossMusicPreset,
  type SingleTrackConfig,
  type DualTrackConfig,
  BUILTIN_PROCEDURAL_ID,
  DEFAULT_PROCEDURAL_PRESET,
} from './types';
import { BossMusicStorage } from './BossMusicStorage';
import { generateProceduralBossTheme } from './ProceduralBossMusic';

export type MusicPhaseState = 'none' | 'phase1' | 'transitioning' | 'phase2';

export interface BossMusicPlaybackState {
  activePhase: MusicPhaseState;
  activePresetId: string | null;
  volume: number;
  phase1Progress: number; // 0 to 1
  phase2Progress: number; // 0 to 1
}

export class BossMusicController {
  private context: AudioContext | null = null;
  private musicMasterGain: GainNode | null = null;

  private currentPreset: BossMusicPreset = DEFAULT_PROCEDURAL_PRESET;

  // Decoded buffers in memory
  private singleBuffer: AudioBuffer | null = null;
  private phase1Buffer: AudioBuffer | null = null;
  private phase2Buffer: AudioBuffer | null = null;

  // Active audio nodes
  private p1Source: AudioBufferSourceNode | null = null;
  private p2Source: AudioBufferSourceNode | null = null;
  private p1Gain: GainNode | null = null;
  private p2Gain: GainNode | null = null;

  private activePhase: MusicPhaseState = 'none';
  private masterVolume = 0.75;
  private p1StartTime = 0;
  private p2StartTime = 0;

  public onStateChange?: (state: BossMusicPlaybackState) => void;

  constructor(context?: AudioContext, parentDestination?: AudioNode) {
    if (context) {
      this.init(context, parentDestination);
    }
  }

  public init(context: AudioContext, parentDestination?: AudioNode): void {
    this.context = context;
    this.musicMasterGain = this.context.createGain();
    this.musicMasterGain.gain.setValueAtTime(this.masterVolume, this.context.currentTime);

    const dest = parentDestination || this.context.destination;
    this.musicMasterGain.connect(dest);
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.context && this.musicMasterGain) {
      this.musicMasterGain.gain.setValueAtTime(this.masterVolume, this.context.currentTime);
    }
    this.notifyState();
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  public getState(): BossMusicPlaybackState {
    return {
      activePhase: this.activePhase,
      activePresetId: this.currentPreset?.id || null,
      volume: this.masterVolume,
      phase1Progress: this.getProgress(1),
      phase2Progress: this.getProgress(2),
    };
  }

  private notifyState(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  public getCurrentPreset(): BossMusicPreset {
    return this.currentPreset;
  }

  public async loadPreset(preset: BossMusicPreset): Promise<void> {
    this.stop(0.2);
    this.currentPreset = preset;

    // Clear existing buffers
    this.singleBuffer = null;
    this.phase1Buffer = null;
    this.phase2Buffer = null;

    if (!this.context) return;

    if (preset.id === BUILTIN_PROCEDURAL_ID) {
      const themes = await generateProceduralBossTheme(this.context.sampleRate);
      this.phase1Buffer = themes.phase1Buffer;
      this.phase2Buffer = themes.phase2Buffer;
      this.notifyState();
      return;
    }

    // Custom preset: Load buffers from static URL (public/) or IndexedDB fallback
    if (preset.config.mode === 'single') {
      const cfg = preset.config;
      if (cfg.url) {
        try {
          this.singleBuffer = await this.loadUrlBuffer(cfg.url);
        } catch (err) {
          console.warn(`[BossMusicController] Could not load audio from URL "${cfg.url}":`, err);
        }
      } else if (cfg.fileKey) {
        const arrayBuf = await BossMusicStorage.getAudioBinary(cfg.fileKey);
        if (arrayBuf) {
          this.singleBuffer = await this.context.decodeAudioData(arrayBuf.slice(0));
        }
      }
    } else {
      const cfg = preset.config;
      const loadP1 = async () => {
        if (cfg.phase1Url) {
          try {
            return await this.loadUrlBuffer(cfg.phase1Url);
          } catch (err) {
            console.warn(`[BossMusicController] Could not load P1 audio from URL "${cfg.phase1Url}":`, err);
            return null;
          }
        } else if (cfg.phase1FileKey) {
          const buf = await BossMusicStorage.getAudioBinary(cfg.phase1FileKey);
          return buf ? await this.context!.decodeAudioData(buf.slice(0)) : null;
        }
        return null;
      };

      const loadP2 = async () => {
        if (cfg.phase2Url) {
          try {
            return await this.loadUrlBuffer(cfg.phase2Url);
          } catch (err) {
            console.warn(`[BossMusicController] Could not load P2 audio from URL "${cfg.phase2Url}":`, err);
            return null;
          }
        } else if (cfg.phase2FileKey) {
          const buf = await BossMusicStorage.getAudioBinary(cfg.phase2FileKey);
          return buf ? await this.context!.decodeAudioData(buf.slice(0)) : null;
        }
        return null;
      };

      const [p1, p2] = await Promise.all([loadP1(), loadP2()]);
      this.phase1Buffer = p1;
      this.phase2Buffer = p2;
    }

    this.notifyState();
  }

  /**
   * Fetches an audio file from public/ static assets and decodes it to AudioBuffer.
   */
  public async loadUrlBuffer(url: string): Promise<AudioBuffer> {
    if (!this.context) throw new Error('AudioContext not initialized');
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to load audio from "${url}": HTTP ${res.status}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return await this.context.decodeAudioData(arrayBuf);
  }

  public async setDirectBuffer(
    buffer: AudioBuffer,
    mode: 'single' | 'p1' | 'p2',
  ): Promise<void> {
    if (mode === 'single') {
      this.singleBuffer = buffer;
    } else if (mode === 'p1') {
      this.phase1Buffer = buffer;
    } else {
      this.phase2Buffer = buffer;
    }
  }

  public startPhase1(fadeDuration = 0.8): void {
    if (!this.context || !this.musicMasterGain) return;
    if (this.activePhase === 'phase1') return; // already active

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    if (this.currentPreset.config.mode === 'single') {
      const cfg = this.currentPreset.config as SingleTrackConfig;
      const buf = this.singleBuffer;
      if (!buf) {
        void this.loadPreset(this.currentPreset).then(() => this.startPhase1(fadeDuration));
        return;
      }

      this.stopActiveSources(fadeDuration);

      const now = this.context.currentTime;
      this.p1Gain = this.context.createGain();
      this.p1Gain.gain.setValueAtTime(0.001, now);
      this.p1Gain.gain.linearRampToValueAtTime(1.0, now + fadeDuration);
      this.p1Gain.connect(this.musicMasterGain);

      this.p1Source = this.context.createBufferSource();
      this.p1Source.buffer = buf;
      this.p1Source.loop = true;
      this.p1Source.loopStart = Math.max(0, cfg.phase1.loopStart);
      this.p1Source.loopEnd = cfg.phase1.loopEnd > cfg.phase1.loopStart ? cfg.phase1.loopEnd : buf.duration;
      this.p1Source.connect(this.p1Gain);

      const offset = Math.min(cfg.phase1.start, buf.duration - 0.1);
      this.p1Source.start(now, Math.max(0, offset));
    } else {
      const cfg = this.currentPreset.config as DualTrackConfig;
      const buf = this.phase1Buffer;
      if (!buf) {
        void this.loadPreset(this.currentPreset).then(() => this.startPhase1(fadeDuration));
        return;
      }

      this.stopActiveSources(fadeDuration);

      const now = this.context.currentTime;
      this.p1Gain = this.context.createGain();
      this.p1Gain.gain.setValueAtTime(0.001, now);
      this.p1Gain.gain.linearRampToValueAtTime(1.0, now + fadeDuration);
      this.p1Gain.connect(this.musicMasterGain);

      this.p1Source = this.context.createBufferSource();
      this.p1Source.buffer = buf;
      this.p1Source.loop = true;
      const lStart = cfg.phase1.loopStart ?? 0;
      const lEnd = cfg.phase1.loopEnd && cfg.phase1.loopEnd > lStart ? cfg.phase1.loopEnd : buf.duration;
      this.p1Source.loopStart = lStart;
      this.p1Source.loopEnd = lEnd;
      this.p1Source.connect(this.p1Gain);
      this.p1Source.start(now, 0);
    }

    this.activePhase = 'phase1';
    this.p1StartTime = this.context.currentTime;
    this.notifyState();
  }

  public transitionToPhase2(crossfadeDuration = 2.0): void {
    if (!this.context || !this.musicMasterGain) return;
    if (this.activePhase === 'phase2' || this.activePhase === 'transitioning') return;

    const now = this.context.currentTime;
    const oldP1Gain = this.p1Gain;
    const oldP1Source = this.p1Source;

    // 1. Crossfade out Phase 1
    if (oldP1Gain) {
      oldP1Gain.gain.setValueAtTime(oldP1Gain.gain.value, now);
      oldP1Gain.gain.linearRampToValueAtTime(0.0001, now + crossfadeDuration);
      if (oldP1Source) {
        oldP1Source.stop(now + crossfadeDuration + 0.1);
      }
    }

    // 2. Crossfade in Phase 2
    this.p2Gain = this.context.createGain();
    this.p2Gain.gain.setValueAtTime(0.0001, now);
    this.p2Gain.gain.linearRampToValueAtTime(1.0, now + crossfadeDuration);
    this.p2Gain.connect(this.musicMasterGain);

    if (this.currentPreset.config.mode === 'single') {
      const cfg = this.currentPreset.config as SingleTrackConfig;
      const buf = this.singleBuffer;
      if (!buf) return;

      this.p2Source = this.context.createBufferSource();
      this.p2Source.buffer = buf;
      this.p2Source.loop = true;
      this.p2Source.loopStart = Math.max(0, cfg.phase2.loopStart);
      this.p2Source.loopEnd = cfg.phase2.loopEnd > cfg.phase2.loopStart ? cfg.phase2.loopEnd : buf.duration;
      this.p2Source.connect(this.p2Gain);

      const offset = Math.min(cfg.phase2.start, buf.duration - 0.1);
      this.p2Source.start(now, Math.max(0, offset));
    } else {
      const cfg = this.currentPreset.config as DualTrackConfig;
      const buf = this.phase2Buffer;
      if (!buf) return;

      this.p2Source = this.context.createBufferSource();
      this.p2Source.buffer = buf;
      this.p2Source.loop = true;
      const lStart = cfg.phase2.loopStart ?? 0;
      const lEnd = cfg.phase2.loopEnd && cfg.phase2.loopEnd > lStart ? cfg.phase2.loopEnd : buf.duration;
      this.p2Source.loopStart = lStart;
      this.p2Source.loopEnd = lEnd;
      this.p2Source.connect(this.p2Gain);
      this.p2Source.start(now, 0);
    }

    this.activePhase = 'transitioning';
    this.p2StartTime = now;
    this.notifyState();

    setTimeout(() => {
      if (this.activePhase === 'transitioning') {
        this.activePhase = 'phase2';
        this.p1Source = null;
        this.p1Gain = null;
        this.notifyState();
      }
    }, crossfadeDuration * 1000);
  }

  public playPhase2Direct(fadeDuration = 0.8): void {
    if (!this.context || !this.musicMasterGain) return;
    this.stopActiveSources(fadeDuration);

    const now = this.context.currentTime;
    this.p2Gain = this.context.createGain();
    this.p2Gain.gain.setValueAtTime(0.001, now);
    this.p2Gain.gain.linearRampToValueAtTime(1.0, now + fadeDuration);
    this.p2Gain.connect(this.musicMasterGain);

    if (this.currentPreset.config.mode === 'single') {
      const cfg = this.currentPreset.config as SingleTrackConfig;
      const buf = this.singleBuffer;
      if (!buf) return;

      this.p2Source = this.context.createBufferSource();
      this.p2Source.buffer = buf;
      this.p2Source.loop = true;
      this.p2Source.loopStart = Math.max(0, cfg.phase2.loopStart);
      this.p2Source.loopEnd = cfg.phase2.loopEnd > cfg.phase2.loopStart ? cfg.phase2.loopEnd : buf.duration;
      this.p2Source.connect(this.p2Gain);

      const offset = Math.min(cfg.phase2.start, buf.duration - 0.1);
      this.p2Source.start(now, Math.max(0, offset));
    } else {
      const cfg = this.currentPreset.config as DualTrackConfig;
      const buf = this.phase2Buffer;
      if (!buf) return;

      this.p2Source = this.context.createBufferSource();
      this.p2Source.buffer = buf;
      this.p2Source.loop = true;
      const lStart = cfg.phase2.loopStart ?? 0;
      const lEnd = cfg.phase2.loopEnd && cfg.phase2.loopEnd > lStart ? cfg.phase2.loopEnd : buf.duration;
      this.p2Source.loopStart = lStart;
      this.p2Source.loopEnd = lEnd;
      this.p2Source.connect(this.p2Gain);
      this.p2Source.start(now, 0);
    }

    this.activePhase = 'phase2';
    this.p2StartTime = now;
    this.notifyState();
  }

  public stop(fadeDuration = 1.0): void {
    this.stopActiveSources(fadeDuration);
    this.activePhase = 'none';
    this.notifyState();
  }

  private stopActiveSources(fadeDuration: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;

    if (this.p1Gain) {
      this.p1Gain.gain.setValueAtTime(this.p1Gain.gain.value, now);
      this.p1Gain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
    }
    if (this.p2Gain) {
      this.p2Gain.gain.setValueAtTime(this.p2Gain.gain.value, now);
      this.p2Gain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
    }

    const s1 = this.p1Source;
    const s2 = this.p2Source;
    setTimeout(() => {
      try {
        s1?.stop();
        s1?.disconnect();
      } catch {
        // Source might already have stopped
      }
      try {
        s2?.stop();
        s2?.disconnect();
      } catch {
        // Source might already have stopped
      }
    }, fadeDuration * 1000 + 50);

    this.p1Source = null;
    this.p2Source = null;
    this.p1Gain = null;
    this.p2Gain = null;
  }

  private getProgress(phase: 1 | 2): number {
    if (!this.context) return 0;
    const now = this.context.currentTime;
    if (phase === 1 && (this.activePhase === 'phase1' || this.activePhase === 'transitioning')) {
      const dur = this.currentPreset.config.mode === 'single'
        ? (this.singleBuffer?.duration || 1)
        : (this.phase1Buffer?.duration || 1);
      return ((now - this.p1StartTime) % dur) / dur;
    }
    if (phase === 2 && (this.activePhase === 'phase2' || this.activePhase === 'transitioning')) {
      const dur = this.currentPreset.config.mode === 'single'
        ? (this.singleBuffer?.duration || 1)
        : (this.phase2Buffer?.duration || 1);
      return ((now - this.p2StartTime) % dur) / dur;
    }
    return 0;
  }

  public dispose(): void {
    this.stop(0.1);
    this.musicMasterGain?.disconnect();
    this.musicMasterGain = null;
  }
}
