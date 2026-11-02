export interface DomBindings {
  canvas: HTMLCanvasElement;
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
  btnToggleAutoReset: HTMLButtonElement | null;
  btnResetDuelPos: HTMLButtonElement | null;
  btnToggleTrajectory: HTMLButtonElement | null;
  btnBossAiMode: HTMLButtonElement | null;
  playerActionStateLabel: HTMLElement | null;
  bossActionStateLabel: HTMLElement | null;
  telDistance: HTMLElement | null;
  telReach: HTMLElement | null;
  telPlayerDisp: HTMLElement | null;
  telBossDisp: HTMLElement | null;
  telHitLog: HTMLElement | null;
  btnOpenSettings: HTMLButtonElement | null;
  settingsPanel: HTMLElement | null;
  telDmgBadge: HTMLElement | null;
  telDmgFrames: HTMLElement | null;
  telTimelineCursor: HTMLElement | null;
  telTimelineDmg: HTMLElement | null;
  telTimelineWindup: HTMLElement | null;
  telTimelineRecovery: HTMLElement | null;
}

export function getDomBindings(): DomBindings {
  return {
    canvas: document.querySelector<HTMLCanvasElement>('#test-canvas')!,
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
    btnToggleAutoReset: document.querySelector<HTMLButtonElement>('#btn-toggle-auto-reset'),
    btnResetDuelPos: document.querySelector<HTMLButtonElement>('#btn-reset-duel-pos'),
    btnToggleTrajectory: document.querySelector<HTMLButtonElement>('#btn-toggle-trajectory'),
    btnBossAiMode: document.querySelector<HTMLButtonElement>('#btn-boss-ai-mode'),
    playerActionStateLabel: document.querySelector<HTMLElement>('#player-action-state-label'),
    bossActionStateLabel: document.querySelector<HTMLElement>('#boss-action-state-label'),
    telDistance: document.querySelector<HTMLElement>('#tel-distance'),
    telReach: document.querySelector<HTMLElement>('#tel-reach'),
    telPlayerDisp: document.querySelector<HTMLElement>('#tel-player-disp'),
    telBossDisp: document.querySelector<HTMLElement>('#tel-boss-disp'),
    telHitLog: document.querySelector<HTMLElement>('#tel-hit-log'),
    btnOpenSettings: document.querySelector<HTMLButtonElement>('#btn-open-settings'),
    settingsPanel: document.querySelector<HTMLElement>('#settings-modal-panel'),
    telDmgBadge: document.querySelector<HTMLElement>('#tel-dmg-badge'),
    telDmgFrames: document.querySelector<HTMLElement>('#tel-dmg-frames'),
    telTimelineCursor: document.querySelector<HTMLElement>('#tel-timeline-cursor'),
    telTimelineDmg: document.querySelector<HTMLElement>('#tel-timeline-dmg'),
    telTimelineWindup: document.querySelector<HTMLElement>('#tel-timeline-windup'),
    telTimelineRecovery: document.querySelector<HTMLElement>('#tel-timeline-recovery'),
  };
}
