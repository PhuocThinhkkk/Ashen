export interface RawBindings {
  overlay: HTMLElement | null;
  overlayToggleBtn: HTMLButtonElement | null;
  loadStatus: HTMLElement | null;
  playerInfo: HTMLElement | null;
  bossInfo: HTMLElement | null;
  weaponInfo: HTMLElement | null;
  playerActiveLabel: HTMLElement | null;
  bossActiveLabel: HTMLElement | null;
  playerAnimButtons: HTMLElement | null;
  bossAnimButtons: HTMLElement | null;
  playerModelButtons: HTMLElement | null;
  cameraButtons: HTMLElement | null;
  speedButtons: HTMLElement | null;
  btnCaptureAll: HTMLButtonElement | null;
  captureStatus: HTMLElement | null;
  btnToggleHitbox: HTMLButtonElement | null;
  btnModeToggle: HTMLButtonElement | null;
  btnStepPrev: HTMLButtonElement | null;
  btnPlayPause: HTMLButtonElement | null;
  btnStepNext: HTMLButtonElement | null;
  hitboxStatusBadge: HTMLElement | null;
  frameTelemetry: HTMLElement | null;
  reticle: HTMLElement | null;
  roamBanner: HTMLElement | null;
}

export function getRawBindings(): RawBindings {
  return {
    overlay: document.querySelector<HTMLElement>('#overlay'),
    overlayToggleBtn: document.querySelector<HTMLButtonElement>('#overlay-toggle'),
    loadStatus: document.querySelector<HTMLElement>('#load-status'),
    playerInfo: document.querySelector<HTMLElement>('#player-info'),
    bossInfo: document.querySelector<HTMLElement>('#boss-info'),
    weaponInfo: document.querySelector<HTMLElement>('#weapon-info'),
    playerActiveLabel: document.querySelector<HTMLElement>('#player-active-label'),
    bossActiveLabel: document.querySelector<HTMLElement>('#boss-active-label'),
    playerAnimButtons: document.querySelector<HTMLElement>('#player-anim-buttons'),
    bossAnimButtons: document.querySelector<HTMLElement>('#boss-anim-buttons'),
    playerModelButtons: document.querySelector<HTMLElement>('#player-model-buttons'),
    cameraButtons: document.querySelector<HTMLElement>('#camera-buttons'),
    speedButtons: document.querySelector<HTMLElement>('#speed-buttons'),
    btnCaptureAll: document.querySelector<HTMLButtonElement>('#btn-capture-all'),
    captureStatus: document.querySelector<HTMLElement>('#capture-status'),
    btnToggleHitbox: document.querySelector<HTMLButtonElement>('#btn-toggle-hitbox'),
    btnModeToggle: document.querySelector<HTMLButtonElement>('#btn-mode-toggle'),
    btnStepPrev: document.querySelector<HTMLButtonElement>('#btn-step-prev'),
    btnPlayPause: document.querySelector<HTMLButtonElement>('#btn-play-pause'),
    btnStepNext: document.querySelector<HTMLButtonElement>('#btn-step-next'),
    hitboxStatusBadge: document.querySelector<HTMLElement>('#hitbox-status-badge'),
    frameTelemetry: document.querySelector<HTMLElement>('#frame-telemetry'),
    reticle: document.querySelector<HTMLElement>('#reticle'),
    roamBanner: document.querySelector<HTMLElement>('#roam-banner'),
  };
}
