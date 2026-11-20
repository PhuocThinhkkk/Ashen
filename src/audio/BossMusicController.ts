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

  // Decoded buffers in memory (used for procedural music or direct editor loading)
  private singleBuffer: AudioBuffer | null = null;
  private phase1Buffer: AudioBuffer | null = null;
  private phase2Buffer: AudioBuffer | null = null;

  // Streaming HTMLAudioElements for URL tracks (cuts memory from ~176MB to ~3MB on mobile)
  private singleAudio: HTMLAudioElement | null = null;
  private p1Audio: HTMLAudioElement | null = null;
  private p2Audio: HTMLAudioElement | null = null;
  private mediaSourceMap = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

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
    if (this.p1Audio) this.p1Audio.volume = this.masterVolume;
    if (this.p2Audio) this.p2Audio.volume = this.masterVolume;
    if (this.singleAudio) this.singleAudio.volume = this.masterVolume;
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

    // Clear existing buffers and streaming audio
    this.singleBuffer = null;
    this.phase1Buffer = null;
    this.phase2Buffer = null;

    if (this.singleAudio) {
      this.singleAudio.pause();
      this.singleAudio.src = '';
      this.singleAudio = null;
    }
    if (this.p1Audio) {
      this.p1Audio.pause();
      this.p1Audio.src = '';
      this.p1Audio = null;
    }
    if (this.p2Audio) {
      this.p2Audio.pause();
      this.p2Audio.src = '';
      this.p2Audio = null;
    }

    if (!this.context) return;

    if (preset.id === BUILTIN_PROCEDURAL_ID) {
      const themes = await generateProceduralBossTheme(this.context.sampleRate);
      this.phase1Buffer = themes.phase1Buffer;
      this.phase2Buffer = themes.phase2Buffer;
      this.notifyState();
      return;
    }

    // Custom preset: Stream from static URL (public/) via HTMLAudioElement (saves ~176MB RAM)
    if (preset.config.mode === 'single') {
      const cfg = preset.config;
      if (cfg.url) {
        this.singleAudio = this.createStreamElement(cfg.url, cfg.phase1, cfg.duration);
      } else if (cfg.fileKey) {
        const arrayBuf = await BossMusicStorage.getAudioBinary(cfg.fileKey);
        if (arrayBuf) {
          this.singleBuffer = await this.context.decodeAudioData(arrayBuf.slice(0));
        }
      }
    } else {
      const cfg = preset.config;
      if (cfg.phase1Url) {
        this.p1Audio = this.createStreamElement(cfg.phase1Url, cfg.phase1, cfg.phase1Duration);
      } else if (cfg.phase1FileKey) {
        const buf = await BossMusicStorage.getAudioBinary(cfg.phase1FileKey);
        this.phase1Buffer = buf ? await this.context.decodeAudioData(buf.slice(0)) : null;
      }

      // Lazy-load Phase 2 on demand: do not create element or decode upfront
      if (cfg.phase2FileKey && !cfg.phase2Url) {
        const buf = await BossMusicStorage.getAudioBinary(cfg.phase2FileKey);
        this.phase2Buffer = buf ? await this.context.decodeAudioData(buf.slice(0)) : null;
      }
    }

    this.notifyState();
  }

  /**
   * Preloads Phase 2 track in background before transition (e.g. when boss HP <= 55%).
   */
  public preloadPhase2(): void {
    if (this.currentPreset.config.mode === 'dual') {
      const cfg = this.currentPreset.config as DualTrackConfig;
      if (cfg.phase2Url && !this.p2Audio) {
        this.p2Audio = this.createStreamElement(cfg.phase2Url, cfg.phase2, cfg.phase2Duration);
      }
    }
  }

  private createStreamElement(
    url: string,
    loopCfg?: { loopStart?: number; loopEnd?: number },
    duration?: number,
  ): HTMLAudioElement {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    this.setupAudioLoop(audio, loopCfg, duration);
    return audio;
  }

  private setupAudioLoop(
    audioEl: HTMLAudioElement,
    loopCfg?: { loopStart?: number; loopEnd?: number },
    duration?: number,
  ): void {
    const lStart = loopCfg?.loopStart ?? 0;
    const lEnd = loopCfg?.loopEnd && loopCfg.loopEnd > lStart ? loopCfg.loopEnd : 0;
    const isFullTrack = lStart <= 0.05 && (!lEnd || (duration !== undefined && lEnd >= duration - 0.5));

    if (isFullTrack) {
      audioEl.loop = true;
    } else {
      audioEl.loop = false;
      audioEl.ontimeupdate = () => {
        if (lEnd > 0 && audioEl.currentTime >= lEnd) {
          audioEl.currentTime = lStart;
          void audioEl.play().catch(() => {});
        }
      };
      audioEl.onended = () => {
        audioEl.currentTime = lStart;
        void audioEl.play().catch(() => {});
      };
    }
  }

  private connectMediaElement(audioEl: HTMLAudioElement, gainNode: GainNode): void {
    if (!this.context) return;
    try {
      let source = this.mediaSourceMap.get(audioEl);
      if (!source) {
        source = this.context.createMediaElementSource(audioEl);
        this.mediaSourceMap.set(audioEl, source);
      }
      source.disconnect();
      source.connect(gainNode);
    } catch {
      audioEl.volume = this.masterVolume;
    }
  }

  /**
   * Fetches an audio file from public/ static assets and decodes it to AudioBuffer (Used by Editor preview).
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
      this.singleAudio = null;
    } else if (mode === 'p1') {
      this.phase1Buffer = buffer;
      this.p1Audio = null;
    } else {
      this.phase2Buffer = buffer;
      this.p2Audio = null;
    }
  }

  public startPhase1(fadeDuration = 0.8): void {
    if (!this.context || !this.musicMasterGain) return;
    if (this.activePhase === 'phase1') return; // already active

    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => {});
    }

    this.stopActiveSources(fadeDuration);

    const now = this.context.currentTime;
    this.p1Gain = this.context.createGain();
    this.p1Gain.gain.setValueAtTime(0.001, now);
    this.p1Gain.gain.linearRampToValueAtTime(1.0, now + fadeDuration);
    this.p1Gain.connect(this.musicMasterGain);

    if (this.currentPreset.config.mode === 'single') {
      const cfg = this.currentPreset.config as SingleTrackConfig;
      if (this.singleAudio) {
        this.connectMediaElement(this.singleAudio, this.p1Gain);
        this.setupAudioLoop(this.singleAudio, cfg.phase1, cfg.duration);
        this.singleAudio.currentTime = Math.max(0, cfg.phase1.start || 0);
        void this.singleAudio.play().catch(() => {});
      } else {
        const buf = this.singleBuffer;
        if (!buf) {
          void this.loadPreset(this.currentPreset).then(() => this.startPhase1(fadeDuration));
          return;
        }

        this.p1Source = this.context.createBufferSource();
        this.p1Source.buffer = buf;
        this.p1Source.loop = true;
        this.p1Source.loopStart = Math.max(0, cfg.phase1.loopStart);
        this.p1Source.loopEnd = cfg.phase1.loopEnd > cfg.phase1.loopStart ? cfg.phase1.loopEnd : buf.duration;
        this.p1Source.connect(this.p1Gain);

        const offset = Math.min(cfg.phase1.start, buf.duration - 0.1);
        this.p1Source.start(now, Math.max(0, offset));
      }
    } else {
      const cfg = this.currentPreset.config as DualTrackConfig;
      if (this.p1Audio) {
        this.connectMediaElement(this.p1Audio, this.p1Gain);
        this.setupAudioLoop(this.p1Audio, cfg.phase1, cfg.phase1Duration);
        this.p1Audio.currentTime = 0;
        void this.p1Audio.play().catch(() => {});
      } else {
        const buf = this.phase1Buffer;
        if (!buf) {
          void this.loadPreset(this.currentPreset).then(() => this.startPhase1(fadeDuration));
          return;
        }

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
    const oldP1Audio = this.p1Audio;

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
      if (this.singleAudio) {
        this.connectMediaElement(this.singleAudio, this.p2Gain);
        this.setupAudioLoop(this.singleAudio, cfg.phase2, cfg.duration);
        this.singleAudio.currentTime = Math.max(0, cfg.phase2.start || 0);
        void this.singleAudio.play().catch(() => {});
      } else {
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
      }
    } else {
      const cfg = this.currentPreset.config as DualTrackConfig;
      if (cfg.phase2Url && !this.p2Audio) {
        this.p2Audio = this.createStreamElement(cfg.phase2Url, cfg.phase2, cfg.phase2Duration);
      }

      if (this.p2Audio) {
        this.connectMediaElement(this.p2Audio, this.p2Gain);
        this.setupAudioLoop(this.p2Audio, cfg.phase2, cfg.phase2Duration);
        this.p2Audio.currentTime = 0;
        void this.p2Audio.play().catch(() => {});
      } else {
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
    }

    this.activePhase = 'transitioning';
    this.p2StartTime = now;
    this.notifyState();

    setTimeout(() => {
      if (this.activePhase === 'transitioning') {
        this.activePhase = 'phase2';
        this.p1Source = null;
        this.p1Gain = null;
        if (oldP1Audio) {
          oldP1Audio.pause();
        }
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
      if (this.singleAudio) {
        this.connectMediaElement(this.singleAudio, this.p2Gain);
        this.setupAudioLoop(this.singleAudio, cfg.phase2, cfg.duration);
        this.singleAudio.currentTime = Math.max(0, cfg.phase2.start || 0);
        void this.singleAudio.play().catch(() => {});
      } else {
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
      }
    } else {
      const cfg = this.currentPreset.config as DualTrackConfig;
      if (cfg.phase2Url && !this.p2Audio) {
        this.p2Audio = this.createStreamElement(cfg.phase2Url, cfg.phase2, cfg.phase2Duration);
      }

      if (this.p2Audio) {
        this.connectMediaElement(this.p2Audio, this.p2Gain);
        this.setupAudioLoop(this.p2Audio, cfg.phase2, cfg.phase2Duration);
        this.p2Audio.currentTime = 0;
        void this.p2Audio.play().catch(() => {});
      } else {
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
    const a1 = this.p1Audio;
    const a2 = this.p2Audio;
    const as = this.singleAudio;

    setTimeout(() => {
      try {
        s1?.stop();
        s1?.disconnect();
      } catch {}
      try {
        s2?.stop();
        s2?.disconnect();
      } catch {}
      try {
        a1?.pause();
      } catch {}
      try {
        a2?.pause();
      } catch {}
      try {
        as?.pause();
      } catch {}
    }, fadeDuration * 1000 + 50);

    this.p1Source = null;
    this.p2Source = null;
    this.p1Gain = null;
    this.p2Gain = null;
  }

  private getProgress(phase: 1 | 2): number {
    if (phase === 1 && (this.activePhase === 'phase1' || this.activePhase === 'transitioning')) {
      if (this.p1Audio && this.p1Audio.duration) {
        return this.p1Audio.currentTime / this.p1Audio.duration;
      }
      if (this.singleAudio && this.singleAudio.duration) {
        return this.singleAudio.currentTime / this.singleAudio.duration;
      }
      if (!this.context) return 0;
      const now = this.context.currentTime;
      const dur = this.currentPreset.config.mode === 'single'
        ? (this.singleBuffer?.duration || 1)
        : (this.phase1Buffer?.duration || 1);
      return ((now - this.p1StartTime) % dur) / dur;
    }
    if (phase === 2 && (this.activePhase === 'phase2' || this.activePhase === 'transitioning')) {
      if (this.p2Audio && this.p2Audio.duration) {
        return this.p2Audio.currentTime / this.p2Audio.duration;
      }
      if (this.singleAudio && this.singleAudio.duration) {
        return this.singleAudio.currentTime / this.singleAudio.duration;
      }
      if (!this.context) return 0;
      const now = this.context.currentTime;
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
    if (this.p1Audio) {
      this.p1Audio.pause();
      this.p1Audio.src = '';
      this.p1Audio = null;
    }
    if (this.p2Audio) {
      this.p2Audio.pause();
      this.p2Audio.src = '';
      this.p2Audio = null;
    }
    if (this.singleAudio) {
      this.singleAudio.pause();
      this.singleAudio.src = '';
      this.singleAudio = null;
    }
  }
}
