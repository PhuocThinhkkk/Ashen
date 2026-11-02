import type { DomBindings } from './DomBindings';
import type { CombatDuelStage, DuelTelemetryUpdate } from '../track2/CombatDuelStage';

export class CombatDuelUI {
  constructor(
    private readonly dom: DomBindings,
    private readonly duelStage: CombatDuelStage,
    private readonly onCombatLog: (text: string) => void,
  ) {}

  public init(): void {
    // 1. Settings Buttons
    this.dom.btnToggleAutoReset?.addEventListener('click', () => {
      const active = this.duelStage.toggleAutoReset();
      if (this.dom.btnToggleAutoReset) {
        this.dom.btnToggleAutoReset.textContent = `Auto-Reset: ${active ? 'ON (1.0s)' : 'OFF'}`;
        this.dom.btnToggleAutoReset.classList.toggle('active', active);
      }
    });

    this.dom.btnResetDuelPos?.addEventListener('click', () => {
      this.duelStage.resetPositions(this.onCombatLog);
    });

    this.dom.btnToggleTrajectory?.addEventListener('click', () => {
      const active = this.duelStage.trajectory.toggleVisibility();
      if (this.dom.btnToggleTrajectory) {
        this.dom.btnToggleTrajectory.textContent = `Trajectory: ${active ? 'ON' : 'OFF'}`;
        this.dom.btnToggleTrajectory.classList.toggle('active', active);
      }
    });

    this.dom.btnBossAiMode?.addEventListener('click', () => {
      const mode = this.duelStage.toggleBossAiMode();
      if (this.dom.btnBossAiMode) {
        this.dom.btnBossAiMode.textContent = `Boss: ${mode === 'dummy' ? 'Practice Dummy' : 'Active Duel AI'}`;
        this.dom.btnBossAiMode.classList.toggle('active', mode === 'duel');
      }
    });

    // 2. Action Player Buttons
    document.querySelector('#btn-act-light1')?.addEventListener('click', () =>
      this.duelStage.triggerPlayerAction('light1', this.onCombatLog),
    );
    document.querySelector('#btn-act-light2')?.addEventListener('click', () =>
      this.duelStage.triggerPlayerAction('light2', this.onCombatLog),
    );
    document.querySelector('#btn-act-light3')?.addEventListener('click', () =>
      this.duelStage.triggerPlayerAction('light3', this.onCombatLog),
    );
    document.querySelector('#btn-act-combo')?.addEventListener('click', () =>
      this.duelStage.triggerPlayerAction('combo', this.onCombatLog),
    );
    document.querySelector('#btn-act-heavy')?.addEventListener('click', () =>
      this.duelStage.triggerPlayerAction('heavy', this.onCombatLog),
    );
    document.querySelector('#btn-act-dodge-fwd')?.addEventListener('click', () =>
      this.duelStage.triggerPlayerAction('dodge_fwd', this.onCombatLog),
    );
    document.querySelector('#btn-act-dodge-back')?.addEventListener('click', () =>
      this.duelStage.triggerPlayerAction('dodge_back', this.onCombatLog),
    );

    // 3. Action Boss Buttons
    document.querySelector('#btn-act-boss-downward')?.addEventListener('click', () =>
      this.duelStage.triggerBossAction('downward', this.onCombatLog),
    );
    document.querySelector('#btn-act-boss-combo')?.addEventListener('click', () =>
      this.duelStage.triggerBossAction('combo', this.onCombatLog),
    );
    document.querySelector('#btn-act-boss-jump')?.addEventListener('click', () =>
      this.duelStage.triggerBossAction('jump', this.onCombatLog),
    );
    document.querySelector('#btn-act-boss-360')?.addEventListener('click', () =>
      this.duelStage.triggerBossAction('spin360', this.onCombatLog),
    );
    document.querySelector('#btn-act-boss-kick')?.addEventListener('click', () =>
      this.duelStage.triggerBossAction('kick', this.onCombatLog),
    );
  }

  public updateTelemetry(data: DuelTelemetryUpdate): void {
    if (this.dom.telDistance) {
      this.dom.telDistance.textContent = `${data.distance.toFixed(2)}m`;
    }

    if (this.dom.playerActionStateLabel) {
      const stateStr = data.isPlayerInvulnerable
        ? 'INVULNERABLE (I-Frames)'
        : data.playerState.toUpperCase();
      this.dom.playerActionStateLabel.textContent = `${stateStr} (HP: ${Math.round(data.playerHp)})`;
      this.dom.playerActionStateLabel.style.color = data.isPlayerInvulnerable
        ? '#00ffff'
        : data.playerState === 'attack'
          ? '#ffd700'
          : '#e5ded2';
    }

    if (this.dom.bossActionStateLabel) {
      const bState = data.bossState.toUpperCase();
      this.dom.bossActionStateLabel.textContent = `${bState} (HP: ${Math.round(data.bossHp)})`;
      this.dom.bossActionStateLabel.style.color = data.isBossHitboxActive ? '#ff4444' : '#e5ded2';
    }

    if (this.dom.telReach) {
      const inReach = data.distance <= data.bossReach;
      this.dom.telReach.textContent = inReach
        ? `⚠️ IN REACH (${data.bossReach.toFixed(1)}m)`
        : `Safe (${data.distance.toFixed(1)}m > ${data.bossReach.toFixed(1)}m)`;
      this.dom.telReach.style.color = inReach ? '#ff5555' : '#38d665';
    }

    if (data.playerDispText && this.dom.telPlayerDisp) {
      this.dom.telPlayerDisp.textContent = data.playerDispText;
    }
    if (data.bossDispText && this.dom.telBossDisp) {
      this.dom.telBossDisp.textContent = data.bossDispText;
    }
  }

  public logCombat(text: string): void {
    if (this.dom.telHitLog) {
      this.dom.telHitLog.textContent = text;
    }
  }
}
