export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;

  constructor() {
    const unlock = () => {
      void this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  public async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.unlocked = true;
  }

  public attackSwing(heavy = false): void {
    this.swordSwing(heavy);
  }

  public swordSwing(heavy = false): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Filtered noise swoosh
    const bufferSize = this.context.sampleRate * (heavy ? 0.28 : 0.18);
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.context.createBufferSource();
    noise.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 600 : 900, now);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 180 : 320, now + (heavy ? 0.25 : 0.16));
    filter.Q.setValueAtTime(3.5, now);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(heavy ? 0.35 : 0.22, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (heavy ? 0.28 : 0.18));

    noise.connect(filter).connect(gain).connect(this.context.destination);
    noise.start(now);
  }

  public dodgeWhoosh(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public hitImpact(isHeavy = false): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Punchy low thud
    const osc = this.context.createOscillator();
    const oscGain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isHeavy ? 140 : 200, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + (isHeavy ? 0.22 : 0.12));

    oscGain.gain.setValueAtTime(isHeavy ? 0.45 : 0.28, now);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + (isHeavy ? 0.24 : 0.14));

    osc.connect(oscGain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    // Metallic ring
    const ring = this.context.createOscillator();
    const ringGain = this.context.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(isHeavy ? 1240 : 1680, now);
    ringGain.gain.setValueAtTime(isHeavy ? 0.25 : 0.15, now);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, now + (isHeavy ? 0.35 : 0.18));

    ring.connect(ringGain).connect(this.context.destination);
    ring.start(now);
    ring.stop(now + 0.36);
  }

  public hitConfirm(isHeavy = false): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Sharp metallic impact cut
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

    osc.connect(filter).connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.15);

    // Punchy bottom body impact
    this.hitImpact(isHeavy);
  }

  public damageTaken(isHeavy = false, isBoss = false): void {
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

    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + (isHeavy ? 0.35 : 0.22));

    // Low rumble noise burst for heavy damage
    if (isHeavy) {
      const bufferSize = Math.floor(this.context.sampleRate * 0.18);
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.7;
      }
      const noise = this.context.createBufferSource();
      noise.buffer = buffer;
      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(isBoss ? 280 : 450, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(60, now + 0.16);

      const noiseGain = this.context.createGain();
      noiseGain.gain.setValueAtTime(0.3, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      noise.connect(noiseFilter).connect(noiseGain).connect(this.context.destination);
      noise.start(now);
    }
  }

  public bossTelegraph(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Dark swelling hum
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.linearRampToValueAtTime(75, now + 0.6);

    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);
    filter.frequency.linearRampToValueAtTime(380, now + 0.6);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

    osc.connect(filter).connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.75);
  }

  public bossSmash(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Deep sub-bass crunch
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.45);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  public staggerClang(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;

    // Loud metallic bell resonance
    [840, 1260, 1680].forEach((freq, idx) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.25 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

      osc.connect(gain).connect(this.context!.destination);
      osc.start(now);
      osc.stop(now + 0.9);
    });
  }

  public victoryStinger(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // Majestic major chord: D4, F#4, A4, D5
    const notes = [293.66, 369.99, 440.0, 587.33];
    notes.forEach((freq, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      gain.gain.setValueAtTime(0.001, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 1.6);

      osc.connect(gain).connect(this.context!.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 1.8);
    });
  }

  public deathStinger(): void {
    if (!this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    // Low somber minor chord: D3, F3, A3
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

      osc.connect(filter).connect(gain).connect(this.context!.destination);
      osc.start(now);
      osc.stop(now + 2.5);
    });
  }

  public dispose(): void {
    void this.context?.close();
    this.context = null;
  }
}
