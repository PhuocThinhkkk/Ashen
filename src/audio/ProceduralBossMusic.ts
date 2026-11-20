/**
 * Procedural Dark Fantasy Boss Theme Generator.
 * Synthesizes seamless, loopable Phase 1 and Phase 2 music buffers offline in ~25ms.
 */

export interface ProceduralThemeBuffers {
  phase1Buffer: AudioBuffer;
  phase2Buffer: AudioBuffer;
}

let cachedBuffers: ProceduralThemeBuffers | null = null;

export async function generateProceduralBossTheme(
  sampleRate = 44100,
): Promise<ProceduralThemeBuffers> {
  if (cachedBuffers) {
    return cachedBuffers;
  }

  const duration = 16.0; // 16-second loop
  const p1Buffer = await renderPhase1Track(duration, sampleRate);
  const p2Buffer = await renderPhase2Track(duration, sampleRate);

  cachedBuffers = {
    phase1Buffer: p1Buffer,
    phase2Buffer: p2Buffer,
  };

  return cachedBuffers;
}

async function renderPhase1Track(duration: number, sampleRate: number): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // 1. Gothic Root Drones (C2, Eb2, G2)
  const baseFreqs = [65.41, 77.78, 98.0, 130.81]; // C2, Eb2, G2, C3
  baseFreqs.forEach((freq, idx) => {
    const osc = offlineCtx.createOscillator();
    osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, 0);

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260 + idx * 40, 0);

    // Subtle slow LFO on filter cutoff
    const lfo = offlineCtx.createOscillator();
    lfo.frequency.setValueAtTime(0.25, 0);
    const lfoGain = offlineCtx.createGain();
    lfoGain.gain.setValueAtTime(60, 0);
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start(0);

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(0.12 / (idx + 1), 0);

    osc.connect(filter).connect(gain).connect(offlineCtx.destination);
    osc.start(0);
    osc.stop(duration);
  });

  // 2. Slow Rhythmic Taiko / Timpani War Drums (every 2.0s = 8 beats in 16s)
  const beatInterval = 2.0;
  const numBeats = Math.floor(duration / beatInterval);
  for (let b = 0; b < numBeats; b++) {
    const time = b * beatInterval;

    // Deep sub-thud
    const drumOsc = offlineCtx.createOscillator();
    drumOsc.type = 'sine';
    drumOsc.frequency.setValueAtTime(110, time);
    drumOsc.frequency.exponentialRampToValueAtTime(30, time + 0.35);

    const drumGain = offlineCtx.createGain();
    drumGain.gain.setValueAtTime(0.35, time);
    drumGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);

    drumOsc.connect(drumGain).connect(offlineCtx.destination);
    drumOsc.start(time);
    drumOsc.stop(time + 0.5);

    // Subtle noise impact transient
    const noiseBuffer = offlineCtx.createBuffer(1, sampleRate * 0.1, sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.02));
    }
    const noiseSrc = offlineCtx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    const noiseGain = offlineCtx.createGain();
    noiseGain.gain.setValueAtTime(0.18, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);

    noiseSrc.connect(noiseGain).connect(offlineCtx.destination);
    noiseSrc.start(time);
  }

  // 3. Eerie Gregorian String Arpeggios (C3, Eb3, G3, Bb3, C4, G3, Eb3, D3)
  const notes = [130.81, 155.56, 196.0, 233.08, 261.63, 196.0, 155.56, 146.83];
  const arpInterval = duration / notes.length; // 2.0s per note
  notes.forEach((freq, i) => {
    const t = i * arpInterval;
    const osc = offlineCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.5, t);
    filter.Q.setValueAtTime(3.0, t);

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + arpInterval);

    osc.connect(filter).connect(gain).connect(offlineCtx.destination);
    osc.start(t);
    osc.stop(t + arpInterval);
  });

  return offlineCtx.startRendering();
}

async function renderPhase2Track(duration: number, sampleRate: number): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // 1. Relentless Low Sub-Bass & Distorted Sawtooth Chords (Double-intensity C Minor / F# tritone tension)
  const lowFreqs = [55.0, 65.41, 77.78, 92.5, 110.0]; // A1, C2, Eb2, F#2, A2
  lowFreqs.forEach((freq, idx) => {
    const osc = offlineCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, 0);

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450 + idx * 80, 0);

    // Fast aggressive pulse
    const pulseLfo = offlineCtx.createOscillator();
    pulseLfo.frequency.setValueAtTime(2.0, 0);
    const pulseGain = offlineCtx.createGain();
    pulseGain.gain.setValueAtTime(140, 0);
    pulseLfo.connect(pulseGain).connect(filter.frequency);
    pulseLfo.start(0);

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(0.18 / (idx + 1), 0);

    osc.connect(filter).connect(gain).connect(offlineCtx.destination);
    osc.start(0);
    osc.stop(duration);
  });

  // 2. High-Tempo War Drums (120 BPM = 0.5s per beat, 32 beats in 16s)
  const beatInterval = 0.5;
  const numBeats = Math.floor(duration / beatInterval);
  for (let b = 0; b < numBeats; b++) {
    const time = b * beatInterval;
    const isHeavy = b % 4 === 0;

    const drumOsc = offlineCtx.createOscillator();
    drumOsc.type = 'triangle';
    drumOsc.frequency.setValueAtTime(isHeavy ? 140 : 180, time);
    drumOsc.frequency.exponentialRampToValueAtTime(32, time + (isHeavy ? 0.35 : 0.18));

    const drumGain = offlineCtx.createGain();
    drumGain.gain.setValueAtTime(isHeavy ? 0.45 : 0.22, time);
    drumGain.gain.exponentialRampToValueAtTime(0.0001, time + (isHeavy ? 0.38 : 0.2));

    drumOsc.connect(drumGain).connect(offlineCtx.destination);
    drumOsc.start(time);
    drumOsc.stop(time + 0.4);

    // Snare / metal clap on backbeats
    if (b % 2 === 1) {
      const snareBuffer = offlineCtx.createBuffer(1, sampleRate * 0.12, sampleRate);
      const snareData = snareBuffer.getChannelData(0);
      for (let i = 0; i < snareData.length; i++) {
        snareData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.03));
      }
      const snareSrc = offlineCtx.createBufferSource();
      snareSrc.buffer = snareBuffer;

      const snareFilter = offlineCtx.createBiquadFilter();
      snareFilter.type = 'highpass';
      snareFilter.frequency.setValueAtTime(1200, time);

      const snareGain = offlineCtx.createGain();
      snareGain.gain.setValueAtTime(0.24, time);
      snareGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

      snareSrc.connect(snareFilter).connect(snareGain).connect(offlineCtx.destination);
      snareSrc.start(time);
    }
  }

  // 3. Piercing Tension Brass & Tremolo Screeches (Higher octaves)
  const highStabs = [261.63, 311.13, 369.99, 392.0, 523.25]; // C4, Eb4, F#4, G4, C5
  const stabInterval = 1.0;
  for (let s = 0; s < duration; s += stabInterval) {
    const noteIdx = Math.floor(s / stabInterval) % highStabs.length;
    const freq = highStabs[noteIdx];

    const osc = offlineCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, s);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, s + 0.7);

    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.8, s);
    filter.Q.setValueAtTime(4.0, s);

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(0.001, s);
    gain.gain.linearRampToValueAtTime(0.22, s + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.85);

    osc.connect(filter).connect(gain).connect(offlineCtx.destination);
    osc.start(s);
    osc.stop(s + 0.9);
  }

  return offlineCtx.startRendering();
}
