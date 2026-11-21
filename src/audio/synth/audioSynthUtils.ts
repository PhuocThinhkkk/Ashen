/**
 * Core Web Audio synthesis utilities for procedural SFX generation.
 */
export class AudioSynthUtils {
  public static createNoiseBurst(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    startFreq: number,
    endFreq: number,
    peakGain: number,
  ): void {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(startFreq, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), startTime + duration * 0.9);
    filter.Q.setValueAtTime(3.5, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.04, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    noise.connect(filter).connect(gain).connect(dest);
    noise.start(startTime);
  }

  public static createPitchDropOscillator(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    peakGain: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, endFreq), startTime + duration * 0.9);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + Math.min(0.05, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain).connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  public static createMetallicRing(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    freq: number,
    peakGain: number,
  ): void {
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();

    ring.type = 'sine';
    ring.frequency.setValueAtTime(freq, startTime);
    ringGain.gain.setValueAtTime(peakGain, startTime);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    ring.connect(ringGain).connect(dest);
    ring.start(startTime);
    ring.stop(startTime + duration + 0.05);
  }
}
