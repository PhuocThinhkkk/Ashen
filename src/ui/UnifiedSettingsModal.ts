import { SettingsManager } from '../systems/SettingsManager';
import { PerformanceProfiler } from '../systems/PerformanceProfiler';
import type { ModelOption, UnifiedSettingsModalConfig, SettingsTabId, TabRenderContext } from './settings/types';
import { renderVfxTab } from './settings/VfxTab';
import { renderPerformanceTab, updateTelemetryValues } from './settings/PerformanceTab';
import { renderGraphicsTab } from './settings/GraphicsTab';
import { renderModelsTab } from './settings/ModelsTab';
import { renderGameplayTab } from './settings/GameplayTab';
import { renderGeneralTab } from './settings/GeneralTab';
import { renderMultiplayerTab } from './settings/MultiplayerTab';
import { renderAudioTab } from './settings/AudioTab';

export type { ModelOption, UnifiedSettingsModalConfig };

const ICONS = {
  GEAR: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  CLOSE: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  RECORD: `<svg class="ui-icon rec-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"></circle></svg>`,
  CLEAR: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`,
  EXPORT: `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
};

export class UnifiedSettingsModal {
  private container: HTMLElement;
  private isOpen = false;
  private activeTab: SettingsTabId = 'vfx';
  private config: UnifiedSettingsModalConfig;
  private settingsManager = SettingsManager.getInstance();
  private profiler = PerformanceProfiler.getInstance();
  private telemetryInterval: number | null = null;

  // Cached DOM elements
  private triggerBtn: HTMLButtonElement | null = null;
  private modalEl: HTMLElement | null = null;
  private tabContentEl: HTMLElement | null = null;

  constructor(config: UnifiedSettingsModalConfig) {
    this.config = config;
    this.container = document.body;
    this.initUI();
    this.bindGlobalKeys();
  }

  private initUI(): void {
    // 1. Setup Trigger Button in Top-Right
    this.triggerBtn = document.querySelector<HTMLButtonElement>('#game-settings-btn');
    if (!this.triggerBtn) {
      this.triggerBtn = document.createElement('button');
      this.triggerBtn.id = 'game-settings-btn';
      this.triggerBtn.className = 'unified-settings-btn';
      this.triggerBtn.innerHTML = `${ICONS.GEAR} <span>SETTINGS</span>`;
      this.container.appendChild(this.triggerBtn);
    }

    this.triggerBtn.addEventListener('click', () => {
      this.toggle();
    });

    // 2. Build Modal Structure
    this.modalEl = document.createElement('div');
    this.modalEl.id = 'unified-settings-modal';
    this.modalEl.className = 'unified-settings-modal hidden';
    this.modalEl.setAttribute('role', 'dialog');
    this.modalEl.setAttribute('aria-label', 'Game Settings & Diagnostics');

    this.modalEl.innerHTML = `
      <div class="settings-modal-backdrop"></div>
      <div class="settings-modal-window">
        <header class="settings-modal-header">
          <div class="settings-title-group">
            <span class="settings-badge">SANCTUARY ARCHITECTURE</span>
            <h2 class="settings-main-title">SETTINGS & TELEMETRY</h2>
          </div>
          <button id="settings-close-btn" class="settings-close-btn" aria-label="Close Settings">${ICONS.CLOSE}</button>
        </header>

        <div class="settings-modal-body">
          <aside class="settings-sidebar">
            <nav class="settings-tabs" role="tablist" aria-label="Settings Categories">
              <button class="settings-tab-btn" data-tab="vfx"><span class="tab-num">I</span> VFX CONFIG</button>
              <button class="settings-tab-btn" data-tab="performance"><span class="tab-num">II</span> DIAGNOSTICS</button>
              <button class="settings-tab-btn" data-tab="graphics"><span class="tab-num">III</span> GRAPHICS</button>
              <button class="settings-tab-btn" data-tab="models"><span class="tab-num">IV</span> COMBATANTS</button>
              <button class="settings-tab-btn" data-tab="gameplay"><span class="tab-num">V</span> KINEMATICS</button>
              <button class="settings-tab-btn" data-tab="general"><span class="tab-num">VI</span> SYSTEM</button>
              <button class="settings-tab-btn" data-tab="multiplayer"><span class="tab-num">VII</span> ONLINE DUEL</button>
              <button class="settings-tab-btn" data-tab="audio"><span class="tab-num">VIII</span> AUDIO</button>
            </nav>
          </aside>

          <main id="settings-tab-content" class="settings-tab-content"></main>
        </div>
      </div>
    `;

    this.container.appendChild(this.modalEl);
    this.tabContentEl = this.modalEl.querySelector<HTMLElement>('#settings-tab-content')!;

    // Backdrop & Close events
    this.modalEl.querySelector('.settings-modal-backdrop')?.addEventListener('click', () => this.close());
    this.modalEl.querySelector('#settings-close-btn')?.addEventListener('click', () => this.close());

    // Tab buttons event delegation
    const tabBtns = this.modalEl.querySelectorAll<HTMLButtonElement>('.settings-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as SettingsTabId;
        if (tab) this.switchTab(tab);
      });
    });

    this.renderCurrentTab();
  }

  private bindGlobalKeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  public open(): void {
    this.isOpen = true;
    this.modalEl?.classList.remove('hidden');
    this.triggerBtn?.classList.add('active');
    this.renderCurrentTab();

    if (this.activeTab === 'performance') {
      this.startTelemetryLoop();
    }
  }

  public close(): void {
    this.isOpen = false;
    this.modalEl?.classList.add('hidden');
    this.triggerBtn?.classList.remove('active');
    this.stopTelemetryLoop();
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  public switchTab(tab: SettingsTabId): void {
    this.activeTab = tab;
    const tabBtns = this.modalEl?.querySelectorAll<HTMLButtonElement>('.settings-tab-btn');
    tabBtns?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    this.renderCurrentTab();

    if (tab === 'performance') {
      this.startTelemetryLoop();
    } else {
      this.stopTelemetryLoop();
    }
  }

  private getTabContext(): TabRenderContext | null {
    if (!this.tabContentEl) return null;
    return {
      container: this.tabContentEl,
      config: this.config,
      settingsManager: this.settingsManager,
      profiler: this.profiler,
      icons: ICONS,
      closeModal: () => this.close(),
      renderCurrentTab: () => this.renderCurrentTab(),
      switchTab: (tab: SettingsTabId) => this.switchTab(tab),
    };
  }

  private renderCurrentTab(): void {
    const ctx = this.getTabContext();
    if (!ctx) return;

    // Highlight active tab header
    const tabBtns = this.modalEl?.querySelectorAll<HTMLButtonElement>('.settings-tab-btn');
    tabBtns?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === this.activeTab);
    });

    switch (this.activeTab) {
      case 'vfx':
        renderVfxTab(ctx);
        break;
      case 'performance':
        renderPerformanceTab(ctx);
        break;
      case 'graphics':
        renderGraphicsTab(ctx);
        break;
      case 'models':
        renderModelsTab(ctx);
        break;
      case 'gameplay':
        renderGameplayTab(ctx);
        break;
      case 'general':
        renderGeneralTab(ctx);
        break;
      case 'multiplayer':
        renderMultiplayerTab(ctx);
        break;
      case 'audio':
        renderAudioTab(ctx);
        break;
    }
  }

  /**
   * [Purpose]: Starts high-frequency polling interval to refresh profiler telemetry values when performance tab is active.
   * @condition Invoked when opening settings modal or switching to the 'performance' telemetry tab.
   * @param none Operates on modal DOM elements, activeTab state, and profiler telemetry data.
   * @returns Initializes interval timer (120ms) updating FPS, frametimes, and drawcall statistics.
   */
  private startTelemetryLoop(): void {
    if (this.telemetryInterval !== null) return;
    this.telemetryInterval = window.setInterval(() => {
      if (!this.isOpen || this.activeTab !== 'performance') {
        this.stopTelemetryLoop();
        return;
      }
      updateTelemetryValues(this.tabContentEl, this.profiler);
    }, 120);
  }

  private stopTelemetryLoop(): void {
    if (this.telemetryInterval !== null) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }

  public syncModels(playerModelId: string, bossModelId: string): void {
    this.config.currentPlayerModel = playerModelId;
    this.config.currentBossModel = bossModelId;
    if (this.isOpen && this.activeTab === 'models') {
      const ctx = this.getTabContext();
      if (ctx) renderModelsTab(ctx);
    }
  }

  public dispose(): void {
    this.stopTelemetryLoop();
    this.modalEl?.remove();
  }
}
