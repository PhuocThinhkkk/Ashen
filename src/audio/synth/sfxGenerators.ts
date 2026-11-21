import { AudioSynthUtils } from './audioSynthUtils';

/**
 * Pure procedural SFX sound recipes for souls combat.
 */
export class SfxGenerators {
  public static playSwordSwoosh(ctx: AudioContext, dest: AudioNode, heavy = false): void {
    const now = ctx.currentTime;
    const duration = heavy ? 0.28 : 0.18;
    const startFreq = heavy ? 600 : 900;
    const endFreq = heavy ? 180 : 320;
    const peakGain = heavy ? 0.35 : 0.22;

    AudioSynthUtils.createNoiseBurst(ctx, dest, now, duration, startFreq, endFreq, peakGain);
  }

  public static playDodgeWhoosh(ctx: AudioContext, dest: AudioNode): void {
    const now = ctx.currentTime;
    AudioSynthUtils.createPitchDropOscillator(ctx, dest, now, 0.28, 'sine', 260, 90, 0.18);
  }

  public static playHitImpact(ctx: AudioContext, dest: AudioNode, isHeavy = false): void {
    const now = ctx.currentTime;
    // Low thud
    const thudDuration = isHeavy ? 0.24 : 0.14;
    AudioSynthUtils.createPitchDropOscillator(
      ctx,
      dest,
      now,
      thudDuration,
      'triangle',
      isHeavy ? 140 : 200,
      35,
      isHeavy ? 0.45 : 0.28,
    );
    // Metallic ring
    const ringDuration = isHeavy ? 0.35 : 0.18;
    AudioSynthUtils.createMetallicRing(
      ctx,
      dest,
      now,
      ringDuration,
      isHeavy ? 1240 : 1680,
      isHeavy ? 0.25 : 0.15,
    );
  }
}
