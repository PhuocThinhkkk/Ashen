export interface DuelBindings {
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
}

export function getDuelBindings(): DuelBindings {
  return {
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
  };
}
