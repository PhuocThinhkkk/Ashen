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
  btnToggleWin4: HTMLButtonElement | null;
  winRawAnim: HTMLElement | null;
  winCombatDuel: HTMLElement | null;
  winWeaponOffsets: HTMLElement | null;
  winBossMusic: HTMLElement | null;
  btnMinWin2: HTMLButtonElement | null;
  btnMinWin3: HTMLButtonElement | null;
  btnMinWin4: HTMLButtonElement | null;

  // Window 4: Boss Music Editor Controls
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
  tabSocketPotion: HTMLButtonElement | null;
  btnActDrink: HTMLButtonElement | null;
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
    btnToggleWin4: document.querySelector<HTMLButtonElement>('#btn-toggle-win-4'),
    winRawAnim: document.querySelector<HTMLElement>('#win-raw-anim') || document.querySelector<HTMLElement>('#overlay'),
    winCombatDuel: document.querySelector<HTMLElement>('#win-combat-duel'),
    winWeaponOffsets: document.querySelector<HTMLElement>('#win-weapon-offsets'),
    winBossMusic: document.querySelector<HTMLElement>('#win-boss-music'),
    btnMinWin2: document.querySelector<HTMLButtonElement>('#btn-min-win-2'),
    btnMinWin3: document.querySelector<HTMLButtonElement>('#btn-min-win-3'),
    btnMinWin4: document.querySelector<HTMLButtonElement>('#btn-min-win-4'),

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
    tabSocketPotion: document.querySelector<HTMLButtonElement>('#tab-socket-potion'),
    btnActDrink: document.querySelector<HTMLButtonElement>('#btn-act-drink'),
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

    // Window 4: Boss Music Editor Controls
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
