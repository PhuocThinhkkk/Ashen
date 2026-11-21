export interface MusicBindings {
  musicStateBadge: HTMLElement | null;
  btnMusicModeSingle: HTMLButtonElement | null;
  btnMusicModeDual: HTMLButtonElement | null;
  musicPresetSelect: HTMLSelectElement | null;
  btnNewPreset: HTMLButtonElement | null;
  btnDeletePreset: HTMLButtonElement | null;
  musicPresetName: HTMLInputElement | null;
  containerSingleTrack: HTMLElement | null;
  containerDualTrack: HTMLElement | null;
  inpSingleUrl: HTMLInputElement | null;
  btnSingleLoadUrl: HTMLButtonElement | null;
  singleFileInfo: HTMLElement | null;
  inpSingleP1Start: HTMLInputElement | null;
  inpSingleP1LoopStart: HTMLInputElement | null;
  inpSingleP1LoopEnd: HTMLInputElement | null;
  inpSingleP2Start: HTMLInputElement | null;
  inpSingleP2LoopStart: HTMLInputElement | null;
  inpSingleP2LoopEnd: HTMLInputElement | null;
  inpDualP1Url: HTMLInputElement | null;
  btnDualP1LoadUrl: HTMLButtonElement | null;
  dualP1FileInfo: HTMLElement | null;
  inpDualP1LoopStart: HTMLInputElement | null;
  inpDualP1LoopEnd: HTMLInputElement | null;
  inpDualP2Url: HTMLInputElement | null;
  btnDualP2LoadUrl: HTMLButtonElement | null;
  dualP2FileInfo: HTMLElement | null;
  inpDualP2LoopStart: HTMLInputElement | null;
  inpDualP2LoopEnd: HTMLInputElement | null;
  btnPreviewP1: HTMLButtonElement | null;
  btnPreviewP2: HTMLButtonElement | null;
  btnPreviewTransition: HTMLButtonElement | null;
  btnPreviewStop: HTMLButtonElement | null;
  inpMusicPreviewVol: HTMLInputElement | null;
  valMusicPreviewVol: HTMLElement | null;
  musicPreviewTelemetry: HTMLElement | null;
  btnSaveMusicPreset: HTMLButtonElement | null;
  btnExportMusicJson: HTMLButtonElement | null;
  musicSaveStatus: HTMLElement | null;
  musicCodeContainer: HTMLElement | null;
  musicCodeOutput: HTMLElement | null;
  btnCloseMusicCode: HTMLButtonElement | null;
}

export function getMusicBindings(): MusicBindings {
  return {
    musicStateBadge: document.querySelector<HTMLElement>('#music-state-badge'),
    btnMusicModeSingle: document.querySelector<HTMLButtonElement>('#btn-music-mode-single'),
    btnMusicModeDual: document.querySelector<HTMLButtonElement>('#btn-music-mode-dual'),
    musicPresetSelect: document.querySelector<HTMLSelectElement>('#music-preset-select'),
    btnNewPreset: document.querySelector<HTMLButtonElement>('#btn-new-preset'),
    btnDeletePreset: document.querySelector<HTMLButtonElement>('#btn-delete-preset'),
    musicPresetName: document.querySelector<HTMLInputElement>('#music-preset-name'),
    containerSingleTrack: document.querySelector<HTMLElement>('#container-single-track'),
    containerDualTrack: document.querySelector<HTMLElement>('#container-dual-track'),
    inpSingleUrl: document.querySelector<HTMLInputElement>('#inp-single-url'),
    btnSingleLoadUrl: document.querySelector<HTMLButtonElement>('#btn-single-load-url'),
    singleFileInfo: document.querySelector<HTMLElement>('#single-file-info'),
    inpSingleP1Start: document.querySelector<HTMLInputElement>('#inp-single-p1-start'),
    inpSingleP1LoopStart: document.querySelector<HTMLInputElement>('#inp-single-p1-loop-start'),
    inpSingleP1LoopEnd: document.querySelector<HTMLInputElement>('#inp-single-p1-loop-end'),
    inpSingleP2Start: document.querySelector<HTMLInputElement>('#inp-single-p2-start'),
    inpSingleP2LoopStart: document.querySelector<HTMLInputElement>('#inp-single-p2-loop-start'),
    inpSingleP2LoopEnd: document.querySelector<HTMLInputElement>('#inp-single-p2-loop-end'),
    inpDualP1Url: document.querySelector<HTMLInputElement>('#inp-dual-p1-url'),
    btnDualP1LoadUrl: document.querySelector<HTMLButtonElement>('#btn-dual-p1-load-url'),
    dualP1FileInfo: document.querySelector<HTMLElement>('#dual-p1-file-info'),
    inpDualP1LoopStart: document.querySelector<HTMLInputElement>('#inp-dual-p1-loop-start'),
    inpDualP1LoopEnd: document.querySelector<HTMLInputElement>('#inp-dual-p1-loop-end'),
    inpDualP2Url: document.querySelector<HTMLInputElement>('#inp-dual-p2-url'),
    btnDualP2LoadUrl: document.querySelector<HTMLButtonElement>('#btn-dual-p2-load-url'),
    dualP2FileInfo: document.querySelector<HTMLElement>('#dual-p2-file-info'),
    inpDualP2LoopStart: document.querySelector<HTMLInputElement>('#inp-dual-p2-loop-start'),
    inpDualP2LoopEnd: document.querySelector<HTMLInputElement>('#inp-dual-p2-loop-end'),
    btnPreviewP1: document.querySelector<HTMLButtonElement>('#btn-preview-p1'),
    btnPreviewP2: document.querySelector<HTMLButtonElement>('#btn-preview-p2'),
    btnPreviewTransition: document.querySelector<HTMLButtonElement>('#btn-preview-transition'),
    btnPreviewStop: document.querySelector<HTMLButtonElement>('#btn-preview-stop'),
    inpMusicPreviewVol: document.querySelector<HTMLInputElement>('#inp-music-preview-vol'),
    valMusicPreviewVol: document.querySelector<HTMLElement>('#val-music-preview-vol'),
    musicPreviewTelemetry: document.querySelector<HTMLElement>('#music-preview-telemetry'),
    btnSaveMusicPreset: document.querySelector<HTMLButtonElement>('#btn-save-music-preset'),
    btnExportMusicJson: document.querySelector<HTMLButtonElement>('#btn-export-music-json'),
    musicSaveStatus: document.querySelector<HTMLElement>('#music-save-status'),
    musicCodeContainer: document.querySelector<HTMLElement>('#music-code-container'),
    musicCodeOutput: document.querySelector<HTMLElement>('#music-code-output'),
    btnCloseMusicCode: document.querySelector<HTMLButtonElement>('#btn-close-music-code'),
  };
}
