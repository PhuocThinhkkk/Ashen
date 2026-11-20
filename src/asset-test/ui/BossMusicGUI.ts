import {
  type BossMusicPreset,
  type BossMusicConfig,
  type SingleTrackConfig,
  type DualTrackConfig,
  BUILTIN_PROCEDURAL_ID,
  DEFAULT_PROCEDURAL_PRESET,
} from '../../audio/types';
import { BossMusicController } from '../../audio/BossMusicController';
import { BossMusicStorage } from '../../audio/BossMusicStorage';
import type { DomBindings } from './DomBindings';

export class BossMusicGUI {
  private activeMode: 'single' | 'dual' = 'single';
  private currentPreset: BossMusicPreset = { ...DEFAULT_PROCEDURAL_PRESET };
  private audioContext: AudioContext;
  public readonly musicController: BossMusicController;
  private telemetryTimer: number | null = null;

  constructor(private readonly dom: DomBindings) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    this.musicController = new BossMusicController(this.audioContext);
  }

  public async init(): Promise<void> {
    // 0. Load external presets from public/audio/presets.json
    await BossMusicStorage.loadExternalPresets();

    // 1. Tab / Mode Switching (Single vs Dual)
    this.dom.btnMusicModeSingle?.addEventListener('click', () => {
      this.setMode('single');
    });

    this.dom.btnMusicModeDual?.addEventListener('click', () => {
      this.setMode('dual');
    });

    // 2. Preset Select & Management
    const presets = BossMusicStorage.getPresets();
    if (presets.length > 1) {
      // Automatically activate first custom or external preset from presets.json
      this.currentPreset = JSON.parse(JSON.stringify(presets[1]));
    }
    this.populatePresetSelect(this.currentPreset.id);

    this.dom.musicPresetSelect?.addEventListener('change', async () => {
      const id = this.dom.musicPresetSelect?.value;
      if (!id) return;
      const preset = BossMusicStorage.getPresetById(id) || DEFAULT_PROCEDURAL_PRESET;
      this.currentPreset = JSON.parse(JSON.stringify(preset));
      this.syncInputsFromPreset();
      await this.musicController.loadPreset(this.currentPreset);
    });

    this.dom.btnNewPreset?.addEventListener('click', () => {
      const id = `custom_track_${Date.now()}`;
      const config: BossMusicConfig =
        this.activeMode === 'single'
          ? {
              mode: 'single',
              url: '/audio/boss_theme.mp3',
              fileName: 'boss_theme.mp3',
              phase1: { start: 0, loopStart: 0, loopEnd: 16.0 },
              phase2: { start: 16.0, loopStart: 16.0, loopEnd: 32.0 },
            }
          : {
              mode: 'dual',
              phase1Url: '/audio/boss_phase1.mp3',
              phase1FileName: 'boss_phase1.mp3',
              phase1: { loopStart: 0, loopEnd: 16.0 },
              phase2Url: '/audio/boss_phase2.mp3',
              phase2FileName: 'boss_phase2.mp3',
              phase2: { loopStart: 0, loopEnd: 16.0 },
            };

      const newPreset: BossMusicPreset = {
        id,
        name: `Custom Boss Track ${BossMusicStorage.getPresets().length}`,
        isCustom: true,
        config,
      };

      BossMusicStorage.savePreset(newPreset);
      this.populatePresetSelect(newPreset.id);
      this.currentPreset = newPreset;
      this.syncInputsFromPreset();
    });

    this.dom.btnDeletePreset?.addEventListener('click', async () => {
      if (this.currentPreset.id === BUILTIN_PROCEDURAL_ID) return;
      await BossMusicStorage.deletePreset(this.currentPreset.id);
      this.populatePresetSelect();
      this.currentPreset = { ...DEFAULT_PROCEDURAL_PRESET };
      this.syncInputsFromPreset();
      await this.musicController.loadPreset(this.currentPreset);
    });

    this.dom.musicPresetName?.addEventListener('input', () => {
      if (this.dom.musicPresetName) {
        this.currentPreset.name = this.dom.musicPresetName.value;
      }
    });

    // 3. Audio URL Loaders (public/)
    this.setupUrlLoaders();

    // 4. Timestamp Inputs Binding
    this.setupTimestampInputs();

    // 5. Live Preview Transport
    this.setupTransportControls();

    // 6. Save & Export
    this.dom.btnSaveMusicPreset?.addEventListener('click', () => {
      this.savePresetToGame();
    });

    this.dom.btnExportMusicJson?.addEventListener('click', () => {
      this.exportJsonPreset();
    });

    this.dom.btnCloseMusicCode?.addEventListener('click', () => {
      if (this.dom.musicCodeContainer) this.dom.musicCodeContainer.style.display = 'none';
    });

    // 7. Initial sync & load
    this.syncInputsFromPreset();
    await this.musicController.loadPreset(this.currentPreset);

    // Start state telemetry monitor
    this.startTelemetryLoop();
  }

  private setMode(mode: 'single' | 'dual'): void {
    this.activeMode = mode;
    this.dom.btnMusicModeSingle?.classList.toggle('active', mode === 'single');
    this.dom.btnMusicModeDual?.classList.toggle('active', mode === 'dual');

    if (this.dom.containerSingleTrack) {
      this.dom.containerSingleTrack.style.display = mode === 'single' ? '' : 'none';
    }
    if (this.dom.containerDualTrack) {
      this.dom.containerDualTrack.style.display = mode === 'dual' ? '' : 'none';
    }

    // Update current preset mode
    if (mode === 'single' && this.currentPreset.config.mode !== 'single') {
      this.currentPreset.config = {
        mode: 'single',
        url: '/audio/boss_theme.mp3',
        phase1: { start: 0, loopStart: 0, loopEnd: 16.0 },
        phase2: { start: 16.0, loopStart: 16.0, loopEnd: 32.0 },
      };
    } else if (mode === 'dual' && this.currentPreset.config.mode !== 'dual') {
      this.currentPreset.config = {
        mode: 'dual',
        phase1Url: '/audio/boss_phase1.mp3',
        phase1: { loopStart: 0, loopEnd: 16.0 },
        phase2Url: '/audio/boss_phase2.mp3',
        phase2: { loopStart: 0, loopEnd: 16.0 },
      };
    }
  }

  private populatePresetSelect(selectedId?: string): void {
    const presets = BossMusicStorage.getPresets();
    if (!this.dom.musicPresetSelect) return;

    this.dom.musicPresetSelect.innerHTML = presets
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === (selectedId || this.currentPreset.id) ? 'selected' : ''}>${p.name}${p.isBuiltIn ? ' [Built-in]' : ' [Custom]'}</option>`,
      )
      .join('');
  }

  private syncInputsFromPreset(): void {
    const p = this.currentPreset;
    if (this.dom.musicPresetName) this.dom.musicPresetName.value = p.name;
    this.setMode(p.config.mode);

    if (p.config.mode === 'single') {
      const cfg = p.config as SingleTrackConfig;
      if (this.dom.inpSingleUrl) this.dom.inpSingleUrl.value = cfg.url || '';
      if (this.dom.inpSingleP1Start) this.dom.inpSingleP1Start.value = String(cfg.phase1.start);
      if (this.dom.inpSingleP1LoopStart) this.dom.inpSingleP1LoopStart.value = String(cfg.phase1.loopStart);
      if (this.dom.inpSingleP1LoopEnd) this.dom.inpSingleP1LoopEnd.value = String(cfg.phase1.loopEnd);

      if (this.dom.inpSingleP2Start) this.dom.inpSingleP2Start.value = String(cfg.phase2.start);
      if (this.dom.inpSingleP2LoopStart) this.dom.inpSingleP2LoopStart.value = String(cfg.phase2.loopStart);
      if (this.dom.inpSingleP2LoopEnd) this.dom.inpSingleP2LoopEnd.value = String(cfg.phase2.loopEnd);

      if (this.dom.singleFileInfo) {
        this.dom.singleFileInfo.textContent = `Track: ${cfg.url || cfg.fileName || '[Built-in Theme]'} ${cfg.duration ? `(${cfg.duration.toFixed(1)}s)` : ''}`;
        this.dom.singleFileInfo.style.color = '#ffd777';
      }
    } else {
      const cfg = p.config as DualTrackConfig;
      if (this.dom.inpDualP1Url) this.dom.inpDualP1Url.value = cfg.phase1Url || '';
      if (this.dom.inpDualP2Url) this.dom.inpDualP2Url.value = cfg.phase2Url || '';

      if (this.dom.inpDualP1LoopStart) this.dom.inpDualP1LoopStart.value = String(cfg.phase1.loopStart ?? 0);
      if (this.dom.inpDualP1LoopEnd) this.dom.inpDualP1LoopEnd.value = String(cfg.phase1.loopEnd ?? 16.0);

      if (this.dom.inpDualP2LoopStart) this.dom.inpDualP2LoopStart.value = String(cfg.phase2.loopStart ?? 0);
      if (this.dom.inpDualP2LoopEnd) this.dom.inpDualP2LoopEnd.value = String(cfg.phase2.loopEnd ?? 16.0);

      if (this.dom.dualP1FileInfo) {
        this.dom.dualP1FileInfo.textContent = `P1: ${cfg.phase1Url || cfg.phase1FileName || 'Built-in P1 Theme'} ${cfg.phase1Duration ? `(${cfg.phase1Duration.toFixed(1)}s)` : ''}`;
        this.dom.dualP1FileInfo.style.color = '#ffd777';
      }
      if (this.dom.dualP2FileInfo) {
        this.dom.dualP2FileInfo.textContent = `P2: ${cfg.phase2Url || cfg.phase2FileName || 'Built-in P2 Theme'} ${cfg.phase2Duration ? `(${cfg.phase2Duration.toFixed(1)}s)` : ''}`;
        this.dom.dualP2FileInfo.style.color = '#ffd777';
      }
    }
  }

  private setupTimestampInputs(): void {
    const onTimestampChange = () => {
      if (this.currentPreset.config.mode === 'single') {
        const cfg = this.currentPreset.config as SingleTrackConfig;
        if (this.dom.inpSingleP1Start) cfg.phase1.start = parseFloat(this.dom.inpSingleP1Start.value) || 0;
        if (this.dom.inpSingleP1LoopStart) cfg.phase1.loopStart = parseFloat(this.dom.inpSingleP1LoopStart.value) || 0;
        if (this.dom.inpSingleP1LoopEnd) cfg.phase1.loopEnd = parseFloat(this.dom.inpSingleP1LoopEnd.value) || 0;

        if (this.dom.inpSingleP2Start) cfg.phase2.start = parseFloat(this.dom.inpSingleP2Start.value) || 0;
        if (this.dom.inpSingleP2LoopStart) cfg.phase2.loopStart = parseFloat(this.dom.inpSingleP2LoopStart.value) || 0;
        if (this.dom.inpSingleP2LoopEnd) cfg.phase2.loopEnd = parseFloat(this.dom.inpSingleP2LoopEnd.value) || 0;
      } else {
        const cfg = this.currentPreset.config as DualTrackConfig;
        if (this.dom.inpDualP1LoopStart) cfg.phase1.loopStart = parseFloat(this.dom.inpDualP1LoopStart.value) || 0;
        if (this.dom.inpDualP1LoopEnd) cfg.phase1.loopEnd = parseFloat(this.dom.inpDualP1LoopEnd.value) || 0;

        if (this.dom.inpDualP2LoopStart) cfg.phase2.loopStart = parseFloat(this.dom.inpDualP2LoopStart.value) || 0;
        if (this.dom.inpDualP2LoopEnd) cfg.phase2.loopEnd = parseFloat(this.dom.inpDualP2LoopEnd.value) || 0;
      }
    };

    const inputs = [
      this.dom.inpSingleP1Start,
      this.dom.inpSingleP1LoopStart,
      this.dom.inpSingleP1LoopEnd,
      this.dom.inpSingleP2Start,
      this.dom.inpSingleP2LoopStart,
      this.dom.inpSingleP2LoopEnd,
      this.dom.inpDualP1LoopStart,
      this.dom.inpDualP1LoopEnd,
      this.dom.inpDualP2LoopStart,
      this.dom.inpDualP2LoopEnd,
    ];

    inputs.forEach((inp) => {
      inp?.addEventListener('input', onTimestampChange);
      inp?.addEventListener('change', onTimestampChange);
    });
  }

  private setupUrlLoaders(): void {
    // Single track URL loader
    const loadSingleUrl = async () => {
      const url = this.dom.inpSingleUrl?.value.trim();
      if (!url) return;

      if (this.dom.singleFileInfo) {
        this.dom.singleFileInfo.textContent = `Loading "${url}"...`;
        this.dom.singleFileInfo.style.color = '#ffd777';
      }

      try {
        const decoded = await this.musicController.loadUrlBuffer(url);
        if (this.currentPreset.config.mode === 'single') {
          const cfg = this.currentPreset.config as SingleTrackConfig;
          cfg.url = url;
          cfg.fileName = url.split('/').pop() || 'theme.mp3';
          cfg.duration = decoded.duration;
          cfg.phase1.loopEnd = Math.min(cfg.phase1.loopEnd, decoded.duration);
          cfg.phase2.loopEnd = Math.min(cfg.phase2.loopEnd, decoded.duration);
        }

        await this.musicController.setDirectBuffer(decoded, 'single');
        this.syncInputsFromPreset();
        if (this.dom.singleFileInfo) {
          this.dom.singleFileInfo.textContent = `Loaded: ${url} (${decoded.duration.toFixed(1)}s)`;
          this.dom.singleFileInfo.style.color = '#38d665';
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (this.dom.singleFileInfo) {
          this.dom.singleFileInfo.textContent = `Error: ${msg}`;
          this.dom.singleFileInfo.style.color = '#ff5555';
        }
      }
    };

    this.dom.btnSingleLoadUrl?.addEventListener('click', () => {
      void loadSingleUrl();
    });
    this.dom.inpSingleUrl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void loadSingleUrl();
    });

    // Dual P1 URL loader
    const loadDualP1Url = async () => {
      const url = this.dom.inpDualP1Url?.value.trim();
      if (!url) return;

      if (this.dom.dualP1FileInfo) {
        this.dom.dualP1FileInfo.textContent = `Loading P1 "${url}"...`;
        this.dom.dualP1FileInfo.style.color = '#ffd777';
      }

      try {
        const decoded = await this.musicController.loadUrlBuffer(url);
        if (this.currentPreset.config.mode === 'dual') {
          const cfg = this.currentPreset.config as DualTrackConfig;
          cfg.phase1Url = url;
          cfg.phase1FileName = url.split('/').pop() || 'p1.mp3';
          cfg.phase1Duration = decoded.duration;
          cfg.phase1.loopEnd = decoded.duration;
        }

        await this.musicController.setDirectBuffer(decoded, 'p1');
        this.syncInputsFromPreset();
        if (this.dom.dualP1FileInfo) {
          this.dom.dualP1FileInfo.textContent = `Loaded P1: ${url} (${decoded.duration.toFixed(1)}s)`;
          this.dom.dualP1FileInfo.style.color = '#38d665';
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (this.dom.dualP1FileInfo) {
          this.dom.dualP1FileInfo.textContent = `Error: ${msg}`;
          this.dom.dualP1FileInfo.style.color = '#ff5555';
        }
      }
    };

    this.dom.btnDualP1LoadUrl?.addEventListener('click', () => {
      void loadDualP1Url();
    });
    this.dom.inpDualP1Url?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void loadDualP1Url();
    });

    // Dual P2 URL loader
    const loadDualP2Url = async () => {
      const url = this.dom.inpDualP2Url?.value.trim();
      if (!url) return;

      if (this.dom.dualP2FileInfo) {
        this.dom.dualP2FileInfo.textContent = `Loading P2 "${url}"...`;
        this.dom.dualP2FileInfo.style.color = '#ff9999';
      }

      try {
        const decoded = await this.musicController.loadUrlBuffer(url);
        if (this.currentPreset.config.mode === 'dual') {
          const cfg = this.currentPreset.config as DualTrackConfig;
          cfg.phase2Url = url;
          cfg.phase2FileName = url.split('/').pop() || 'p2.mp3';
          cfg.phase2Duration = decoded.duration;
          cfg.phase2.loopEnd = decoded.duration;
        }

        await this.musicController.setDirectBuffer(decoded, 'p2');
        this.syncInputsFromPreset();
        if (this.dom.dualP2FileInfo) {
          this.dom.dualP2FileInfo.textContent = `Loaded P2: ${url} (${decoded.duration.toFixed(1)}s)`;
          this.dom.dualP2FileInfo.style.color = '#38d665';
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (this.dom.dualP2FileInfo) {
          this.dom.dualP2FileInfo.textContent = `Error: ${msg}`;
          this.dom.dualP2FileInfo.style.color = '#ff5555';
        }
      }
    };

    this.dom.btnDualP2LoadUrl?.addEventListener('click', () => {
      void loadDualP2Url();
    });
    this.dom.inpDualP2Url?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void loadDualP2Url();
    });
  }

  private setupTransportControls(): void {
    const resumeContext = async () => {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    };

    this.dom.btnPreviewP1?.addEventListener('click', async () => {
      await resumeContext();
      this.musicController.startPhase1(0.3);
    });

    this.dom.btnPreviewP2?.addEventListener('click', async () => {
      await resumeContext();
      this.musicController.playPhase2Direct(0.3);
    });

    this.dom.btnPreviewTransition?.addEventListener('click', async () => {
      await resumeContext();
      this.musicController.transitionToPhase2(2.0);
    });

    this.dom.btnPreviewStop?.addEventListener('click', () => {
      this.musicController.stop(0.4);
    });

    this.dom.inpMusicPreviewVol?.addEventListener('input', () => {
      const val = parseInt(this.dom.inpMusicPreviewVol?.value || '75', 10);
      if (this.dom.valMusicPreviewVol) this.dom.valMusicPreviewVol.textContent = `${val}%`;
      this.musicController.setVolume(val / 100);
    });
  }

  private startTelemetryLoop(): void {
    if (this.telemetryTimer !== null) return;
    this.telemetryTimer = window.setInterval(() => {
      const state = this.musicController.getState();

      if (this.dom.musicStateBadge) {
        const phaseNames: Record<string, string> = {
          none: 'IDLE',
          phase1: 'PLAYING P1',
          transitioning: 'TRANSITIONING',
          phase2: 'PLAYING P2',
        };
        const text = phaseNames[state.activePhase] || 'STANDBY';
        this.dom.musicStateBadge.textContent = text;
        this.dom.musicStateBadge.style.color =
          state.activePhase === 'phase2'
            ? '#ff5555'
            : state.activePhase === 'transitioning'
              ? '#ffaa33'
              : state.activePhase === 'phase1'
                ? '#ffd700'
                : '#c8c0b4';
        this.dom.musicStateBadge.style.borderColor = this.dom.musicStateBadge.style.color;
      }

      if (this.dom.musicPreviewTelemetry) {
        const pct1 = Math.round(state.phase1Progress * 100);
        const pct2 = Math.round(state.phase2Progress * 100);
        this.dom.musicPreviewTelemetry.textContent =
          `Phase: ${state.activePhase.toUpperCase()} | P1 Progress: ${pct1}% | P2 Progress: ${pct2}%`;
      }
    }, 100);
  }

  public savePresetToGame(): void {
    BossMusicStorage.savePreset(this.currentPreset);
    this.populatePresetSelect(this.currentPreset.id);

    if (this.dom.musicSaveStatus) {
      this.dom.musicSaveStatus.textContent = 'SAVED & SYNCED!';
      this.dom.musicSaveStatus.style.color = '#38d665';
      this.dom.musicSaveStatus.style.borderColor = '#38d665';
      setTimeout(() => {
        if (this.dom.musicSaveStatus) {
          this.dom.musicSaveStatus.textContent = 'READY';
        }
      }, 2000);
    }
  }

  public exportJsonPreset(): string {
    const p = this.currentPreset;
    const jsonStr = JSON.stringify([p], null, 2);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(jsonStr).catch(() => {});
    }

    if (this.dom.musicCodeContainer && this.dom.musicCodeOutput) {
      this.dom.musicCodeOutput.textContent = jsonStr;
      this.dom.musicCodeContainer.style.display = 'block';
    }

    return jsonStr;
  }

  public dispose(): void {
    if (this.telemetryTimer !== null) {
      clearInterval(this.telemetryTimer);
      this.telemetryTimer = null;
    }
    this.musicController.dispose();
    void this.audioContext.close();
  }
}
