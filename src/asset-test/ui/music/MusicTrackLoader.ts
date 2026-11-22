import type { BossMusicPreset, SingleTrackConfig, DualTrackConfig } from '../../../audio/types';
import type { BossMusicController } from '../../../audio/BossMusicController';

export interface LoaderDomElements {
  input: HTMLInputElement | null;
  button: HTMLElement | null;
  fileInfo: HTMLElement | null;
}

export class MusicTrackLoader {
  /**
   * [Purpose]: Binds URL submission input and triggers audio file loading and decoding into BossMusicController.
   * @condition Invoked during music inspector GUI initialization for single track and phase 1/2 slots.
   * @param elements Loader DOM inputs/buttons, musicController, currentPreset, target slot, and onSuccess callback.
   * @returns Registers click and enter-key event listeners that asynchronously load and decode audio buffers.
   */
  public static bindLoader(
    elements: LoaderDomElements,
    musicController: BossMusicController,
    currentPreset: BossMusicPreset,
    slot: 'single' | 'p1' | 'p2',
    onSuccess: () => void,
  ): void {
    const { input, button, fileInfo } = elements;

    const loadUrl = async () => {
      const url = input?.value.trim();
      if (!url) return;

      if (fileInfo) {
        fileInfo.textContent = `Loading ${slot.toUpperCase()} "${url}"...`;
        fileInfo.style.color = '#ffd777';
      }

      try {
        const decoded = await musicController.loadUrlBuffer(url);

        if (slot === 'single' && currentPreset.config.mode === 'single') {
          const cfg = currentPreset.config as SingleTrackConfig;
          cfg.url = url;
          cfg.fileName = url.split('/').pop() || 'theme.mp3';
          cfg.duration = decoded.duration;
          cfg.phase1.loopEnd = Math.min(cfg.phase1.loopEnd, decoded.duration);
          cfg.phase2.loopEnd = Math.min(cfg.phase2.loopEnd, decoded.duration);
        } else if (slot === 'p1' && currentPreset.config.mode === 'dual') {
          const cfg = currentPreset.config as DualTrackConfig;
          cfg.phase1Url = url;
          cfg.phase1FileName = url.split('/').pop() || 'p1.mp3';
          cfg.phase1Duration = decoded.duration;
          cfg.phase1.loopEnd = decoded.duration;
        } else if (slot === 'p2' && currentPreset.config.mode === 'dual') {
          const cfg = currentPreset.config as DualTrackConfig;
          cfg.phase2Url = url;
          cfg.phase2FileName = url.split('/').pop() || 'p2.mp3';
          cfg.phase2Duration = decoded.duration;
          cfg.phase2.loopEnd = decoded.duration;
        }

        await musicController.setDirectBuffer(decoded, slot);
        onSuccess();

        if (fileInfo) {
          fileInfo.textContent = `Loaded ${slot.toUpperCase()}: ${url} (${decoded.duration.toFixed(1)}s)`;
          fileInfo.style.color = '#38d665';
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (fileInfo) {
          fileInfo.textContent = `Error: ${msg}`;
          fileInfo.style.color = '#ff5555';
        }
      }
    };

    button?.addEventListener('click', () => {
      void loadUrl();
    });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void loadUrl();
    });
  }
}
