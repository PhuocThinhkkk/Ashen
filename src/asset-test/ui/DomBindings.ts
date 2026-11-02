export interface DomBindings {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement | null; // Window 1 wrapper
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

  // Window 1, 2, 3 management
  btnToggleWin1: HTMLButtonElement | null;
  btnToggleWin2: HTMLButtonElement | null;
  btnToggleWin3: HTMLButtonElement | null;
  winRawAnim: HTMLElement | null;
  winCombatDuel: HTMLElement | null;
  winWeaponOffsets: HTMLElement | null;
  btnMinWin2: HTMLButtonElement | null;
  btnMinWin3: HTMLButtonElement | null;

  // Window 2: Combat Duel Controls
  btnDuelStepPrev: HTMLButtonElement | null;
  btnDuelPlayPause: HTMLButtonElement | null;
  btnDuelStepNext: HTMLButtonElement | null;
  duelSpeedButtons: HTMLElement | null;
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
  telDmgBadge: HTMLElement | null;
  telDmgFrames: HTMLElement | null;
  telTimelineCursor: HTMLElement | null;
  telTimelineDmg: HTMLElement | null;
  telTimelineWindup: HTMLElement | null;
  telTimelineRecovery: HTMLElement | null;

  // Window 3: Socket Sliders & Presets
  tabSocketPlayer: HTMLButtonElement | null;
  tabSocketBoss: HTMLButtonElement | null;
  socketSaveStatus: HTMLElement | null;
  inpPosX: HTMLInputElement | null;
  inpPosY: HTMLInputElement | null;
  inpPosZ: HTMLInputElement | null;
  inpRotX: HTMLInputElement | null;
  inpRotY: HTMLInputElement | null;
  inpRotZ: HTMLInputElement | null;
  inpScale: HTMLInputElement | null;
  valPosX: HTMLElement | null;
  valPosY: HTMLElement | null;
  valPosZ: HTMLElement | null;
  valRotX: HTMLElement | null;
  valRotY: HTMLElement | null;
  valRotZ: HTMLElement | null;
  valScale: HTMLElement | null;
  btnPresetKnight2h: HTMLButtonElement | null;
  btnPresetBoss2h: HTMLButtonElement | null;
  btnFlipPlayerBlade: HTMLButtonElement | null;
  btnFlipBossBlade: HTMLButtonElement | null;
  btnResetSocketConfig: HTMLButtonElement | null;
  btnSavePrintConfig: HTMLButtonElement | null;
  btnCopyConfigTs: HTMLButtonElement | null;
  socketCodeContainer: HTMLElement | null;
  socketCodeOutput: HTMLElement | null;
  btnCloseCodeBox: HTMLButtonElement | null;
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

    // Window 1, 2, 3
    btnToggleWin1: document.querySelector<HTMLButtonElement>('#btn-toggle-win-1'),
    btnToggleWin2: document.querySelector<HTMLButtonElement>('#btn-toggle-win-2'),
    btnToggleWin3: document.querySelector<HTMLButtonElement>('#btn-toggle-win-3'),
    winRawAnim: document.querySelector<HTMLElement>('#win-raw-anim') || document.querySelector<HTMLElement>('#overlay'),
    winCombatDuel: document.querySelector<HTMLElement>('#win-combat-duel'),
    winWeaponOffsets: document.querySelector<HTMLElement>('#win-weapon-offsets'),
    btnMinWin2: document.querySelector<HTMLButtonElement>('#btn-min-win-2'),
    btnMinWin3: document.querySelector<HTMLButtonElement>('#btn-min-win-3'),

    // Window 2: Combat Duel Controls
    btnDuelStepPrev: document.querySelector<HTMLButtonElement>('#btn-duel-step-prev'),
    btnDuelPlayPause: document.querySelector<HTMLButtonElement>('#btn-duel-play-pause'),
    btnDuelStepNext: document.querySelector<HTMLButtonElement>('#btn-duel-step-next'),
    duelSpeedButtons: document.querySelector<HTMLElement>('#duel-speed-buttons'),
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
    telDmgBadge: document.querySelector<HTMLElement>('#tel-dmg-badge'),
    telDmgFrames: document.querySelector<HTMLElement>('#tel-dmg-frames'),
    telTimelineCursor: document.querySelector<HTMLElement>('#tel-timeline-cursor'),
    telTimelineDmg: document.querySelector<HTMLElement>('#tel-timeline-dmg'),
    telTimelineWindup: document.querySelector<HTMLElement>('#tel-timeline-windup'),
    telTimelineRecovery: document.querySelector<HTMLElement>('#tel-timeline-recovery'),

    // Window 3: Socket Sliders & Presets
    tabSocketPlayer: document.querySelector<HTMLButtonElement>('#tab-socket-player'),
    tabSocketBoss: document.querySelector<HTMLButtonElement>('#tab-socket-boss'),
    socketSaveStatus: document.querySelector<HTMLElement>('#socket-save-status'),
    inpPosX: document.querySelector<HTMLInputElement>('#inp-pos-x'),
    inpPosY: document.querySelector<HTMLInputElement>('#inp-pos-y'),
    inpPosZ: document.querySelector<HTMLInputElement>('#inp-pos-z'),
    inpRotX: document.querySelector<HTMLInputElement>('#inp-rot-x'),
    inpRotY: document.querySelector<HTMLInputElement>('#inp-rot-y'),
    inpRotZ: document.querySelector<HTMLInputElement>('#inp-rot-z'),
    inpScale: document.querySelector<HTMLInputElement>('#inp-scale'),
    valPosX: document.querySelector<HTMLElement>('#val-pos-x'),
    valPosY: document.querySelector<HTMLElement>('#val-pos-y'),
    valPosZ: document.querySelector<HTMLElement>('#val-pos-z'),
    valRotX: document.querySelector<HTMLElement>('#val-rot-x'),
    valRotY: document.querySelector<HTMLElement>('#val-rot-y'),
    valRotZ: document.querySelector<HTMLElement>('#val-rot-z'),
    valScale: document.querySelector<HTMLElement>('#val-scale'),
    btnPresetKnight2h: document.querySelector<HTMLButtonElement>('#btn-preset-knight-2h'),
    btnPresetBoss2h: document.querySelector<HTMLButtonElement>('#btn-preset-boss-2h'),
    btnFlipPlayerBlade: document.querySelector<HTMLButtonElement>('#btn-flip-player-blade'),
    btnFlipBossBlade: document.querySelector<HTMLButtonElement>('#btn-flip-boss-blade'),
    btnResetSocketConfig: document.querySelector<HTMLButtonElement>('#btn-reset-socket-config'),
    btnSavePrintConfig: document.querySelector<HTMLButtonElement>('#btn-save-print-config'),
    btnCopyConfigTs: document.querySelector<HTMLButtonElement>('#btn-copy-config-ts'),
    socketCodeContainer: document.querySelector<HTMLElement>('#socket-code-container'),
    socketCodeOutput: document.querySelector<HTMLElement>('#socket-code-output'),
    btnCloseCodeBox: document.querySelector<HTMLButtonElement>('#btn-close-code-box'),
  };
}
