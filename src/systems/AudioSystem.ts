import { BossMusicController } from '../audio/BossMusicController';
import { BossMusicStorage } from '../audio/BossMusicStorage';
import { DEFAULT_PROCEDURAL_PRESET } from '../audio/types';
import { SettingsManager } from './SettingsManager';
import { SfxGenerators } from '../audio/synth/sfxGenerators';

export type SoundKey =
  | 'swingLight'
  | 'swingHeavy'
  | 'swordClash'
  | 'groundSlam'
  | 'damageGrunt'
  | 'footstepHeavy';

export class AudioSystem {
  public context: AudioContext | null = null;
  public unlocked = false;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  public readonly bossMusic = new BossMusicController();
  private pendingStartBossMusic = false;
  private pendingPresetId: string | null = null;
  private userInteractionCleanup: (() => void) | null = null;

  private soundBuffers: Partial<Record<SoundKey, AudioBuffer>> = {};

  private get sfxDestination(): AudioNode {
    return this.sfxGain ?? this.context!.destination;
  }

  constructor() {
    const onUserInteraction = async () => {
      if (!this.context) {
        await this.unlock();
      } else if (this.context.state === 'suspended') {
        try {
          await this.context.resume();
        } catch {}
      }

      if (this.context && this.context.state === 'running') {
        this.unlocked = true;

        if (this.pendingPresetId) {
          const preset = BossMusicStorage.getPresetById(this.pendingPresetId) || DEFAULT_PROCEDURAL_PRESET;
          await this.bossMusic.loadPreset(preset);
          this.pendingPresetId = null;
        }

        if (this.pendingStartBossMusic) {
          this.pendingStartBossMusic = false;
          this.bossMusic.startPhase1();
        }

        removeListeners();
      }
    };

    const removeListeners = () => {
      window.removeEventListener('pointerdown', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      this.userInteractionCleanup = null;
    };

    this.userInteractionCleanup = removeListeners;

    window.addEventListener('pointerdown', onUserInteraction);
    window.addEventListener('keydown', onUserInteraction);
    window.addEventListener('touchstart', onUserInteraction, { passive: true });

    // Pre-fetch SFX immediately if AudioContext can be initialized
    if (typeof window !== 'undefined') {
      void this.loadAllSounds();
    }
  }

  public async unlock(): Promise<void> {
    if (this.unlocked && this.context && this.context.state === 'running') return;

    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      this.context = new AudioContextClass();

      // Set up master routing
      this.masterGain = this.context.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.context.currentTime);
      this.masterGain.connect(this.context.destination);

      const initialSettings = SettingsManager.getInstance().data.audio;

      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.setValueAtTime(initialSettings.sfxVolume, this.context.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.context.createGain();
      this.musicGain.gain.setValueAtTime(initialSettings.bossMusicVolume, this.context.currentTime);
      this.musicGain.connect(this.masterGain);

      this.bossMusic.init(this.context, this.musicGain);

      // Load active preset from pendingPresetId or settings
      const targetPresetId = this.pendingPresetId || initialSettings.selectedTrackId;
      const activePreset = BossMusicStorage.getPresetById(targetPresetId) || DEFAULT_PROCEDURAL_PRESET;
      await this.bossMusic.loadPreset(activePreset);
      this.pendingPresetId = null;

      void this.loadAllSounds();
    }

    if (this.context.state === 'suspended') {
      try {
        await this.context.resume();
      } catch {}
    }

    if (this.context.state === 'running') {
      this.unlocked = true;

      if (this.pendingPresetId) {
        const preset = BossMusicStorage.getPresetById(this.pendingPresetId) || DEFAULT_PROCEDURAL_PRESET;
        await this.bossMusic.loadPreset(preset);
        this.pendingPresetId = null;
      }

      await this.loadAllSounds();

      if (this.pendingStartBossMusic) {
        this.pendingStartBossMusic = false;
        this.bossMusic.startPhase1();
      }

      if (this.userInteractionCleanup) {
        this.userInteractionCleanup();
      }
    }
  }

  public async setBossMusicTrack(presetId: string): Promise<void> {
    if (!this.unlocked || !this.context || this.context.state !== 'running') {
      this.pendingPresetId = presetId;
      const preset = BossMusicStorage.getPresetById(presetId) || DEFAULT_PROCEDURAL_PRESET;
      if (this.context) {
        await this.bossMusic.loadPreset(preset);
      }
      return;
    }
    const preset = BossMusicStorage.getPresetById(presetId) || DEFAULT_PROCEDURAL_PRESET;
    await this.bossMusic.loadPreset(preset);
  }

  public getAudioDiagnostics() {
    return {
      contextState: (this.context?.state || 'uninitialized') as 'suspended' | 'running' | 'closed' | 'uninitialized',
      isUnlocked: this.unlocked,
      activePhase: this.bossMusic.getState().activePhase,
      isPlaying: this.bossMusic.isPlaying(),
      activeTrackId: this.bossMusic.getState().activePresetId,
    };
  }

  public setMusicVolume(volume: number): void {
    if (this.context && this.musicGain) {
      this.musicGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.context.currentTime);
    }
    this.bossMusic.setVolume(volume);
  }

  public setSfxVolume(volume: number): void {
    if (this.context && this.sfxGain) {
      this.sfxGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), this.context.currentTime);
    }
  }

  public async startBossMusic(): Promise<void> {
    if (!this.unlocked || !this.context || this.context.state !== 'running') {
      this.pendingStartBossMusic = true;
      await this.unlock();
      return;
    }
    this.bossMusic.startPhase1();
  }

  public preloadBossPhase2(): void {
    this.bossMusic.preloadPhase2();
  }

  public transitionToBossPhase2(): void {
    if (!this.unlocked || !this.context) return;
    this.bossMusic.transitionToPhase2();
  }

  public stopBossMusic(fadeDuration = 1.0): void {
    this.pendingStartBossMusic = false;
    this.bossMusic.stop(fadeDuration);
  }

  private async loadAllSounds(): Promise<void> {
    const sfxList: Array<{ key: SoundKey; path: string }> = [
      { key: 'swingLight', path: '/assets/sfx/sword_swing_light.mp3' },
      { key: 'swingHeavy', path: '/assets/sfx/sword_swing_heavy.mp3' },
      { key: 'swordClash', path: '/assets/sfx/sword_clash_heavy.mp3' },
      { key: 'groundSlam', path: '/assets/sfx/ground_slam.mp3' },
      { key: 'damageGrunt', path: '/assets/sfx/damage_grunt.mp3' },
      { key: 'footstepHeavy', path: '/assets/sfx/footstep_heavy.mp3' },
    ];

    for (const item of sfxList) {
      if (this.soundBuffers[item.key]) continue;
      try {
        const res = await fetch(item.path);
        if (!res.ok) continue;
        const arrayBuf = await res.arrayBuffer();
        if (this.context) {
          const audioBuf = await this.context.decodeAudioData(arrayBuf);
          this.soundBuffers[item.key] = audioBuf;
        }
      } catch {
        // Silently fall back to synthesized audio if fetch/decode unavailable
      }
    }
  }

  private playBuffer(
    buffer: AudioBuffer | undefined,
    volume = 1.0,
    pitchVariation = 0.08,
  ): boolean {
    if (!this.context || this.context.state !== 'running' || !buffer) return false;

    try {
      const source = this.context.createBufferSource();
      source.buffer = buffer;

      // Organic pitch variation to avoid mechanical repetition
      if (pitchVariation > 0) {
        source.playbackRate.value = 1.0 + (Math.random() - 0.5) * pitchVariation * 2;
      }

      const gain = this.context.createGain();
      gain.gain.value = volume;

      source.connect(gain).connect(this.sfxDestination);
      source.start();
      return true;
    } catch {
      return false;
    }
  }

  public attackSwing(heavy = false): void {
    this.swordSwing(heavy);
  }

  public swordSwing(heavy = false): void {
    const played = heavy
      ? this.playBuffer(this.soundBuffers.swingHeavy || this.soundBuffers.swingLight, 0.75)
      : this.playBuffer(this.soundBuffers.swingLight, 0.65);

    if (played) return;
    if (!this.context || this.context.state !== 'running') return;
    SfxGenerators.playSwordSwoosh(this.context, this.sfxDestination, heavy);
  }

  public dodgeWhoosh(): void {
    if (!this.context || this.context.state !== 'running') return;
    SfxGenerators.playDodgeWhoosh(this.context, this.sfxDestination);
  }

  public hitImpact(isHeavy = false): void {
    if (!this.context || this.context.state !== 'running') return;
    SfxGenerators.playHitImpact(this.context, this.sfxDestination, isHeavy);
  }

  public hitConfirm(isHeavy = false): void {
    const played = this.playBuffer(this.soundBuffers.swordClash, isHeavy ? 0.95 : 0.7);
    if (played) return;

    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Sharp metallic impact cut fallback
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(isHeavy ? 1800 : 2400, now);
    osc.frequency.exponentialRampToValueAtTime(isHeavy ? 420 : 680, now + 0.12);

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isHeavy ? 1200 : 1800, now);
    filter.Q.setValueAtTime(2.8, now);

    gain.gain.setValueAtTime(isHeavy ? 0.4 : 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(filter).connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 0.15);

    this.hitImpact(isHeavy);
  }

  public damageTaken(isHeavy = false, isBoss = false): void {
    if (!isBoss) {
      this.playBuffer(this.soundBuffers.damageGrunt, 0.85);
    }

    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Flesh / armor impact crunch
    const baseFreq = isBoss ? (isHeavy ? 80 : 120) : (isHeavy ? 130 : 170);
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + (isHeavy ? 0.3 : 0.18));

    gain.gain.setValueAtTime(isHeavy ? 0.45 : 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (isHeavy ? 0.32 : 0.2));

    osc.connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  public bossTelegraph(): void {
    this.bossTelegraphRoar();
  }

  public bossSmash(): void {
    this.playGroundSlam();
  }

  public bossTelegraphRoar(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.linearRampToValueAtTime(140, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.7);

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.7);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    osc.connect(filter).connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  public phase2Roar(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    [55, 75, 110].forEach((freq) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq * 1.8, now + 0.6);
      osc.frequency.exponentialRampToValueAtTime(35, now + 1.8);

      const filter = this.context!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(700, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 1.8);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);

      osc.connect(filter).connect(gain).connect(this.sfxDestination);
      osc.start(now);
      osc.stop(now + 2.0);
    });
  }

  public staminaDepleted(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.18);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public estusDrink(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.45);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  public staggerClang(): void {
    const played = this.playBuffer(this.soundBuffers.swordClash, 1.0);
    if (played) return;

    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Loud metallic bell resonance fallback
    [840, 1260, 1680].forEach((freq, idx) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.25 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

      osc.connect(gain).connect(this.sfxDestination);
      osc.start(now);
      osc.stop(now + 0.9);
    });
  }

  public victoryStinger(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const notes = [293.66, 369.99, 440.0, 587.33];
    notes.forEach((freq, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      gain.gain.setValueAtTime(0.001, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 1.6);

      osc.connect(gain).connect(this.sfxDestination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 1.8);
    });
  }

  public deathStinger(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    const notes = [146.83, 174.61, 220.0];
    notes.forEach((freq) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      const filter = this.context!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, now);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);

      osc.connect(filter).connect(gain).connect(this.sfxDestination);
      osc.start(now);
      osc.stop(now + 2.5);
    });
  }

  public playPeakSwoosh(frequency = 380, duration = 0.16, isHeavy = false): void {
    const played = isHeavy
      ? this.playBuffer(this.soundBuffers.swingHeavy, 0.8)
      : this.playBuffer(this.soundBuffers.swingLight, 0.65);
    if (played) return;

    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = isHeavy ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.28), now + duration);

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency * 0.8, now);
    filter.Q.setValueAtTime(isHeavy ? 2.5 : 3.5, now);

    const peakGain = isHeavy ? 0.32 : 0.22;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + duration * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter).connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  public playFootstep(_heavy = false): void {
    const played = this.playBuffer(this.soundBuffers.footstepHeavy, 0.55);
    if (played) return;

    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.06);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc.connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playLandingThud(heavy = false): void {
    if (heavy) {
      this.playGroundSlam();
      return;
    }

    const played = this.playBuffer(this.soundBuffers.footstepHeavy, 0.85);
    if (played) return;

    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.22);

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    osc.connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  /**
   * Colossal ground crash sound effect for heavy ground slams.
   */
  public playGroundSlam(): void {
    const played = this.playBuffer(this.soundBuffers.groundSlam, 1.0, 0.04);
    if (played) return;

    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Deep earthquake sub-bass rumble fallback
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.8);

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);

    osc.connect(filter).connect(gain).connect(this.sfxDestination);
    osc.start(now);
    osc.stop(now + 1.0);
  }

  public dispose(): void {
    if (this.userInteractionCleanup) {
      this.userInteractionCleanup();
    }
    this.bossMusic.dispose();
    this.masterGain?.disconnect();
    this.sfxGain?.disconnect();
    this.musicGain?.disconnect();
    void this.context?.close();
    this.context = null;
  }
}
