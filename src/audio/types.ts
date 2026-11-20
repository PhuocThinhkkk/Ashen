export type BossMusicMode = 'single' | 'dual';

export interface SingleTrackPhaseTimestamps {
  start: number;     // Intro offset timestamp (seconds)
  loopStart: number; // Loop start point (seconds)
  loopEnd: number;   // Loop end point (seconds)
}

export interface DualTrackPhaseConfig {
  loopStart?: number; // Optional loop start (seconds, default: 0)
  loopEnd?: number;   // Optional loop end (seconds, default: duration)
}

export interface SingleTrackConfig {
  mode: 'single';
  url?: string;        // Path relative to public/, e.g. '/audio/boss_theme.mp3'
  fileKey?: string;    // Optional fallback key for IndexedDB cache
  fileName?: string;
  duration?: number;
  phase1: SingleTrackPhaseTimestamps;
  phase2: SingleTrackPhaseTimestamps;
}

export interface DualTrackConfig {
  mode: 'dual';
  phase1Url?: string;        // Path relative to public/, e.g. '/audio/boss_phase1.mp3'
  phase1FileKey?: string;    // Optional fallback key for IndexedDB cache
  phase1FileName?: string;
  phase1Duration?: number;
  phase1: DualTrackPhaseConfig;
  phase2Url?: string;        // Path relative to public/, e.g. '/audio/boss_phase2.mp3'
  phase2FileKey?: string;    // Optional fallback key for IndexedDB cache
  phase2FileName?: string;
  phase2Duration?: number;
  phase2: DualTrackPhaseConfig;
}

export type BossMusicConfig = SingleTrackConfig | DualTrackConfig;

export interface BossMusicPreset {
  id: string;
  name: string;
  description?: string;
  isBuiltIn?: boolean;
  isCustom?: boolean;
  config: BossMusicConfig;
}

export interface AudioSettings {
  bossMusicVolume: number; // 0.0 to 1.0
  sfxVolume: number;       // 0.0 to 1.0
  selectedTrackId: string; // Preset ID or built-in ID
}

export const BUILTIN_PROCEDURAL_ID = 'builtin_procedural';

export const DEFAULT_PROCEDURAL_PRESET: BossMusicPreset = {
  id: BUILTIN_PROCEDURAL_ID,
  name: 'Malakhor Sanctuary (Built-in Theme)',
  description: 'Procedurally generated dark fantasy battle theme with phase progression',
  isBuiltIn: true,
  config: {
    mode: 'dual',
    phase1FileKey: 'procedural_phase1',
    phase1FileName: 'procedural_phase1.wav',
    phase1Duration: 16.0,
    phase1: {
      loopStart: 0,
      loopEnd: 16.0,
    },
    phase2FileKey: 'procedural_phase2',
    phase2FileName: 'procedural_phase2.wav',
    phase2Duration: 16.0,
    phase2: {
      loopStart: 0,
      loopEnd: 16.0,
    },
  },
};
