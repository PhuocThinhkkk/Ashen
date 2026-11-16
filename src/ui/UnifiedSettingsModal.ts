import { SettingsManager, type VFXPreset, type ShadowQuality } from '../systems/SettingsManager';
import { PerformanceProfiler } from '../systems/PerformanceProfiler';
import { NetworkManager } from '../network/NetworkManager';

export interface ModelOption {
  id: string;
  name: string;
}

export interface UnifiedSettingsModalConfig {
  playerModels: ModelOption[];
  currentPlayerModel: string;
  onPlayerModelChange: (modelId: string) => Promise<void> | void;
  bossModels: ModelOption[];
  currentBossModel: string;
  onBossModelChange: (modelId: string) => Promise<void> | void;
  onResetTrial: () => void;
  onToggleHitboxDebug: (visible?: boolean) => boolean;
}

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
  private activeTab: 'general' | 'graphics' | 'vfx' | 'performance' | 'models' | 'gameplay' | 'multiplayer' = 'vfx';
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
        const tab = btn.getAttribute('data-tab') as typeof this.activeTab;
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

  public switchTab(tab: typeof this.activeTab): void {
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

  private renderCurrentTab(): void {
    if (!this.tabContentEl) return;

    // Highlight active tab header
    const tabBtns = this.modalEl?.querySelectorAll<HTMLButtonElement>('.settings-tab-btn');
    tabBtns?.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === this.activeTab);
    });

    switch (this.activeTab) {
      case 'vfx':
        this.renderVfxTab();
        break;
      case 'performance':
        this.renderPerformanceTab();
        break;
      case 'graphics':
        this.renderGraphicsTab();
        break;
      case 'models':
        this.renderModelsTab();
        break;
      case 'gameplay':
        this.renderGameplayTab();
        break;
      case 'general':
        this.renderGeneralTab();
        break;
      case 'multiplayer':
        this.renderMultiplayerTab();
        break;
    }
  }

  // =========================================================================
  // TAB 1: VFX CONTROLS
  // =========================================================================
  private renderVfxTab(): void {
    const el = this.tabContentEl;
    if (!el) return;
    const s = this.settingsManager.data.vfx;

    el.innerHTML = `
      <div class="settings-section">
        <h3 class="section-title">COMBAT VFX PRESETS</h3>
        <p class="section-desc">Instantly configure all combat visual effects or isolate individual systems.</p>
        <div class="preset-buttons-group">
          <button class="btn-preset ${s.preset === 'full' ? 'active' : ''}" data-preset="full">FULL FIDELITY</button>
          <button class="btn-preset ${s.preset === 'balanced' ? 'active' : ''}" data-preset="balanced">BALANCED</button>
          <button class="btn-preset ${s.preset === 'performance' ? 'active' : ''}" data-preset="performance">PERFORMANCE</button>
          <button class="btn-preset ${s.preset === 'custom' ? 'active' : ''}" data-preset="custom" disabled>CUSTOM</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">INDIVIDUAL EFFECT TOGGLES</h3>
        <p class="section-desc">Disable specific rendering systems to eliminate GPU fillrate or CPU overdraw bottlenecks.</p>

        <div class="toggles-grid">
          <!-- Blood Burst -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">ARTERIAL BLOOD SPRAY</span>
              <span class="toggle-badge permanent">ELDEN RING VISCERAL FEEDBACK</span>
              <span class="toggle-desc">Directional arterial spray at weapon collision point with realistic gravity.</span>
            </div>
            <input type="checkbox" id="vfx-blood" ${s.bloodBursts ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Slash Arcs -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">BLADE SWEEP ARCS</span>
              <span class="toggle-desc">Dynamic noise-dissolving blade ribbons along attack cut planes.</span>
            </div>
            <input type="checkbox" id="vfx-slash" ${s.slashArcs ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Hit Sparks -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">COLLISION IMPACT SPARKS</span>
              <span class="toggle-desc">High-energy spark particle bursts at blade collision contact points.</span>
            </div>
            <input type="checkbox" id="vfx-sparks" ${s.hitSparks ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Colossal Ground Slam -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">COLOSSAL SLAM SHOCKWAVE</span>
              <span class="toggle-desc">Expanding energy shockwave ring during boss jump & downward smashes.</span>
            </div>
            <input type="checkbox" id="vfx-shockwave" ${s.groundSlamShockwave ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Ground Decals -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">GROUND CRATER FISSURES</span>
              <span class="toggle-desc">Stone fissure decals pre-pooled on floor at ground impact locations.</span>
            </div>
            <input type="checkbox" id="vfx-decals" ${s.groundDecals ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Floor Dust -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">LOCOMOTION DUST KICKUPS</span>
              <span class="toggle-desc">Rolling ground dust from jump attacks and running footstep kickups.</span>
            </div>
            <input type="checkbox" id="vfx-dust" ${s.groundDust ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Arena Ambient Embers -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">SANCTUARY AMBIENT EMBERS</span>
              <span class="toggle-desc">Atmospheric floating embers drifting upward across the arena floor.</span>
            </div>
            <input type="checkbox" id="vfx-arena-dust" ${s.arenaDust ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Damage Numbers -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">COMBAT DAMAGE FLOATERS</span>
              <span class="toggle-desc">Screen-space floating damage numbers displayed upon hits.</span>
            </div>
            <input type="checkbox" id="vfx-damage-nums" ${s.damageNumbers ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Camera Shake -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">TRAUMA CAMERA SHAKE</span>
              <span class="toggle-desc">Screen-space trauma shake on heavy impacts and colossal slams.</span>
            </div>
            <input type="checkbox" id="vfx-shake" ${s.cameraShake ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>
        </div>
      </div>
    `;

    // Bind Preset Buttons
    el.querySelectorAll<HTMLButtonElement>('.btn-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset') as VFXPreset;
        if (preset) {
          this.settingsManager.applyVFXPreset(preset);
          this.renderVfxTab();
        }
      });
    });

    // Bind Individual Checkboxes
    const bindToggle = (id: string, key: keyof typeof s) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`);
      input?.addEventListener('change', () => {
        this.settingsManager.updateVFX({ [key]: input.checked });
        this.renderVfxTab();
      });
    };

    bindToggle('vfx-blood', 'bloodBursts');
    bindToggle('vfx-slash', 'slashArcs');
    bindToggle('vfx-sparks', 'hitSparks');
    bindToggle('vfx-shockwave', 'groundSlamShockwave');
    bindToggle('vfx-decals', 'groundDecals');
    bindToggle('vfx-dust', 'groundDust');
    bindToggle('vfx-arena-dust', 'arenaDust');
    bindToggle('vfx-damage-nums', 'damageNumbers');
    bindToggle('vfx-shake', 'cameraShake');
  }

  // =========================================================================
  // TAB 2: PERFORMANCE & REAL DIAGNOSTICS
  // =========================================================================
  private renderPerformanceTab(): void {
    const el = this.tabContentEl;
    if (!el) return;
    const snap = this.profiler.getSnapshot();

    el.innerHTML = `
      <div class="settings-section">
        <h3 class="section-title">REAL-TIME DIAGNOSTIC METRICS</h3>
        <p class="section-desc">Independent CPU, WebGL command submission, memory, and stutter metrics.</p>

        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">CURRENT FRAMERATE</span>
            <span id="diag-fps" class="metric-val fps-${snap.fps >= 50 ? 'good' : snap.fps >= 30 ? 'warn' : 'bad'}">${snap.fps}</span>
            <span class="metric-sub">Average: <b id="diag-avg-fps">${snap.avgFps}</b> FPS</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">FRAME DURATION</span>
            <span id="diag-frametime" class="metric-val">${snap.frameTimeMs} ms</span>
            <span class="metric-sub">Average: <b id="diag-avg-frametime">${snap.avgFrameTimeMs}</b> ms</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">1% LOW FRAMERATE</span>
            <span id="diag-1pct-low" class="metric-val fps-${snap.onePercentLowFps >= 45 ? 'good' : snap.onePercentLowFps >= 25 ? 'warn' : 'bad'}">${snap.onePercentLowFps}</span>
            <span class="metric-sub">99th percentile worst frames</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">SPIKES (&gt;25ms)</span>
            <span id="diag-spikes" class="metric-val ${snap.spikeCount25ms > 5 ? 'bad' : 'good'}">${snap.spikeCount25ms}</span>
            <span class="metric-sub">&gt;33.3ms: <b id="diag-spikes33">${snap.spikeCount33ms}</b></span>
          </div>

          <div class="metric-card">
            <span class="metric-label">CPU LOGIC TIME</span>
            <span id="diag-cputime" class="metric-val">${snap.cpuTimeMs} ms</span>
            <span class="metric-sub">Transforms, Physics & Kinematics</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">WEBGL SUBMISSION</span>
            <span id="diag-rendertime" class="metric-val">${snap.renderTimeMs} ms</span>
            <span class="metric-sub">Driver Draw Command Buffer</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">DRAW CALLS</span>
            <span id="diag-drawcalls" class="metric-val">${snap.drawCalls}</span>
            <span class="metric-sub">Triangles: <b id="diag-triangles">${snap.triangles.toLocaleString()}</b></span>
          </div>

          <div class="metric-card">
            <span class="metric-label">JS HEAP MEMORY</span>
            <span id="diag-memory" class="metric-val">${snap.usedHeapMb !== null ? `${snap.usedHeapMb} MB` : 'N/A'}</span>
            <span class="metric-sub">Garbage Collection Space</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">COMBAT EVENT RECORDING & PROFILING</h3>
        <p class="section-desc">Record attacks, hits, ground slams, and dodge rolls to pinpoint exact frame-time spikes.</p>

        <div class="profiler-controls">
          <button id="btn-toggle-record" class="btn-action ${snap.isRecording ? 'recording' : ''}">
            ${ICONS.RECORD} <span>${snap.isRecording ? 'HALT RECORDING' : 'RECORD SESSION'}</span>
          </button>
          <button id="btn-clear-stats" class="btn-util">${ICONS.CLEAR} <span>PURGE STATS</span></button>
          <button id="btn-export-json" class="btn-util">${ICONS.EXPORT} <span>EXPORT JSON</span></button>
        </div>

        <div id="profiler-status-banner" class="profiler-banner ${snap.isRecording ? 'active' : ''}">
          ${snap.isRecording ? 'TELEMETRY SESSION ACTIVE — Perform attacks, clashes and rolls in arena...' : 'Ready to capture combat performance session.'}
        </div>
      </div>

      <div class="settings-section diagnostic-notes">
        <h4 class="notes-title">DIAGNOSTIC ARCHITECTURE & HARDWARE CONSTRAINTS</h4>
        <p>• <b>CPU vs GPU Timings:</b> In WebGL 2.0, direct on-chip GPU rasterization timestamps (EXT_disjoint_timer_query) are disabled across modern browsers for security reasons. Metrics above reflect precise JavaScript CPU time and WebGL driver submission.</p>
        <p>• <b>Hitstop Time Dilation:</b> Clashes trigger intentional simulation time dilation (0.15x) for visceral impact weight. The renderer and camera continue updating at full framerate.</p>
      </div>
    `;

    // Bind Profiler Actions
    const recordBtn = el.querySelector<HTMLButtonElement>('#btn-toggle-record');
    recordBtn?.addEventListener('click', () => {
      if (this.profiler.isRecording) {
        this.profiler.stopRecording();
      } else {
        this.profiler.startRecording();
      }
      this.renderPerformanceTab();
    });

    const clearBtn = el.querySelector<HTMLButtonElement>('#btn-clear-stats');
    clearBtn?.addEventListener('click', () => {
      this.profiler.clearStats();
      this.renderPerformanceTab();
    });

    const exportBtn = el.querySelector<HTMLButtonElement>('#btn-export-json');
    exportBtn?.addEventListener('click', () => {
      const json = this.profiler.exportReportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `souls-combat-performance-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  private startTelemetryLoop(): void {
    if (this.telemetryInterval !== null) return;
    this.telemetryInterval = window.setInterval(() => {
      if (!this.isOpen || this.activeTab !== 'performance') {
        this.stopTelemetryLoop();
        return;
      }
      this.updateTelemetryValues();
    }, 120);
  }

  private stopTelemetryLoop(): void {
    if (this.telemetryInterval !== null) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
  }

  private updateTelemetryValues(): void {
    const snap = this.profiler.getSnapshot();
    const setVal = (id: string, val: string | number) => {
      const el = this.tabContentEl?.querySelector<HTMLElement>(`#${id}`);
      if (el) el.textContent = String(val);
    };

    setVal('diag-fps', snap.fps);
    setVal('diag-avg-fps', snap.avgFps);
    setVal('diag-frametime', `${snap.frameTimeMs} ms`);
    setVal('diag-avg-frametime', snap.avgFrameTimeMs);
    setVal('diag-1pct-low', snap.onePercentLowFps);
    setVal('diag-spikes', snap.spikeCount25ms);
    setVal('diag-spikes33', snap.spikeCount33ms);
    setVal('diag-cputime', `${snap.cpuTimeMs} ms`);
    setVal('diag-rendertime', `${snap.renderTimeMs} ms`);
    setVal('diag-drawcalls', snap.drawCalls);
    setVal('diag-triangles', snap.triangles.toLocaleString());
    if (snap.usedHeapMb !== null) setVal('diag-memory', `${snap.usedHeapMb} MB`);
  }

  // =========================================================================
  // TAB 3: GRAPHICS SETTINGS
  // =========================================================================
  private renderGraphicsTab(): void {
    const el = this.tabContentEl;
    if (!el) return;
    const g = this.settingsManager.data.graphics;

    el.innerHTML = `
      <div class="settings-section">
        <h3 class="section-title">DISPLAY & RESOLUTION</h3>
        <p class="section-desc">Adjust rendering scale to match high-DPI displays or boost low-end frame rates.</p>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Resolution Scale (DPR)</span>
            <span class="control-sub">Current Scale: <b id="dpr-val">${g.maxDpr}x</b></span>
          </div>
          <div class="button-selector" id="dpr-selector">
            <button class="btn-choice ${g.maxDpr === 0.75 ? 'active' : ''}" data-val="0.75">0.75x</button>
            <button class="btn-choice ${g.maxDpr === 1.0 ? 'active' : ''}" data-val="1">1.0x (Standard)</button>
            <button class="btn-choice ${g.maxDpr === 1.25 ? 'active' : ''}" data-val="1.25">1.25x</button>
            <button class="btn-choice ${g.maxDpr === 1.5 ? 'active' : ''}" data-val="1.5">1.5x</button>
            <button class="btn-choice ${g.maxDpr === 2.0 ? 'active' : ''}" data-val="2">2.0x (Retina)</button>
          </div>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Shadow Quality</span>
            <span class="control-sub">Static sanctuary geometry shadow casting is disabled for optimal performance.</span>
          </div>
          <select id="shadow-quality-select" class="settings-select">
            <option value="off" ${g.shadowQuality === 'off' ? 'selected' : ''}>OFF (Max Framerate)</option>
            <option value="low" ${g.shadowQuality === 'low' ? 'selected' : ''}>LOW (512x512)</option>
            <option value="medium" ${g.shadowQuality === 'medium' ? 'selected' : ''}>MEDIUM (1024x1024)</option>
            <option value="high" ${g.shadowQuality === 'high' ? 'selected' : ''}>HIGH (2048x2048)</option>
          </select>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">ACES Filmic Exposure</span>
            <span class="control-sub">Exposure Value: <b id="exposure-val">${g.exposure.toFixed(2)}</b></span>
          </div>
          <input type="range" id="exposure-slider" class="settings-slider" min="0.6" max="1.8" step="0.05" value="${g.exposure}" />
        </div>
      </div>
    `;

    // Bind DPR selector
    el.querySelectorAll('#dpr-selector .btn-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.getAttribute('data-val') || '1.0');
        this.settingsManager.updateGraphics({ maxDpr: val });
        this.renderGraphicsTab();
      });
    });

    // Bind Shadow Quality
    const shadowSelect = el.querySelector<HTMLSelectElement>('#shadow-quality-select');
    shadowSelect?.addEventListener('change', () => {
      this.settingsManager.updateGraphics({ shadowQuality: shadowSelect.value as ShadowQuality });
    });

    // Bind Exposure
    const exposureSlider = el.querySelector<HTMLInputElement>('#exposure-slider');
    exposureSlider?.addEventListener('input', () => {
      const val = parseFloat(exposureSlider.value);
      const valDisplay = el.querySelector('#exposure-val');
      if (valDisplay) valDisplay.textContent = val.toFixed(2);
      this.settingsManager.updateGraphics({ exposure: val });
    });
  }

  // =========================================================================
  // TAB 4: CHARACTER & BOSS MODELS
  // =========================================================================
  private renderModelsTab(): void {
    const el = this.tabContentEl;
    if (!el) return;

    const pOptions = this.config.playerModels
      .map((m) => `<option value="${m.id}" ${m.id === this.config.currentPlayerModel ? 'selected' : ''}>${m.name}</option>`)
      .join('');

    const bOptions = this.config.bossModels
      .map((m) => `<option value="${m.id}" ${m.id === this.config.currentBossModel ? 'selected' : ''}>${m.name}</option>`)
      .join('');

    el.innerHTML = `
      <div id="model-select-panel" class="settings-section">
        <div class="model-select-header">
          <span class="model-select-badge">REGISTRY</span>
          <h3 class="model-select-title">COMBATANTS</h3>
          <button id="model-select-toggle" class="model-select-toggle" type="button">Hide</button>
        </div>

        <div id="model-select-body" class="model-select-body">
          <h3 class="section-title">3D CHARACTER ARMATURES</h3>
          <p class="section-desc">Hot-swap rigged humanoid player and boss armatures at runtime.</p>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Player Armature</span>
              <span class="control-sub">Rebinds hand sockets, weapon offsets, and combat animation clips.</span>
            </div>
            <select id="player-model-select" class="settings-select model-dropdown">
              ${pOptions}
            </select>
          </div>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Boss Armature</span>
              <span class="control-sub">Rebinds greatsword sockets and colossal boss animations.</span>
            </div>
            <select id="boss-model-select" class="settings-select model-dropdown">
              ${bOptions}
            </select>
          </div>

          <div id="model-select-status" class="model-status-card">
            Active: <b>${this.config.currentPlayerModel === 'knight' ? 'Knight' : 'Samurai'}</b> vs <b>Titan</b>
          </div>
        </div>
      </div>
    `;

    // Bind Player Dropdown
    const playerSelect = el.querySelector<HTMLSelectElement>('#player-model-select');
    playerSelect?.addEventListener('change', async () => {
      await this.config.onPlayerModelChange(playerSelect.value);
      this.config.currentPlayerModel = playerSelect.value;
      this.renderModelsTab();
    });

    // Bind Boss Dropdown
    const bossSelect = el.querySelector<HTMLSelectElement>('#boss-model-select');
    bossSelect?.addEventListener('change', async () => {
      await this.config.onBossModelChange(bossSelect.value);
      this.config.currentBossModel = bossSelect.value;
      this.renderModelsTab();
    });

    // Bind Collapse Toggle
    const toggleBtn = el.querySelector<HTMLButtonElement>('#model-select-toggle');
    const bodyEl = el.querySelector<HTMLElement>('#model-select-body');
    toggleBtn?.addEventListener('click', () => {
      const isCollapsed = bodyEl?.classList.toggle('collapsed');
      toggleBtn.textContent = isCollapsed ? 'Show' : 'Hide';
    });
  }

  // =========================================================================
  // TAB 5: GAMEPLAY & TUNING
  // =========================================================================
  private renderGameplayTab(): void {
    const el = this.tabContentEl;
    if (!el) return;
    const gp = this.settingsManager.data.gameplay;

    el.innerHTML = `
      <div class="settings-section">
        <h3 class="section-title">COMBAT KINEMATICS & FEEL</h3>
        <p class="section-desc">Fine-tune movement speeds, camera responsiveness, and impact weight.</p>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Base Move Speed</span>
            <span class="control-sub">Velocity: <b id="speed-val">${gp.speed.toFixed(1)}</b> m/s</span>
          </div>
          <input type="range" id="speed-slider" class="settings-slider" min="2" max="12" step="0.2" value="${gp.speed}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Sprint Dash Multiplier</span>
            <span class="control-sub">Ratio: <b id="dash-val">${gp.dashMultiplier.toFixed(2)}x</b></span>
          </div>
          <input type="range" id="dash-slider" class="settings-slider" min="1.0" max="2.5" step="0.05" value="${gp.dashMultiplier}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Locomotion Acceleration</span>
            <span class="control-sub">Factor: <b id="accel-val">${gp.acceleration.toFixed(0)}</b></span>
          </div>
          <input type="range" id="accel-slider" class="settings-slider" min="4" max="22" step="1" value="${gp.acceleration}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Camera Follow Lag</span>
            <span class="control-sub">Damping: <b id="camlag-val">${gp.cameraLag.toFixed(2)}s</b></span>
          </div>
          <input type="range" id="camlag-slider" class="settings-slider" min="0.02" max="0.5" step="0.01" value="${gp.cameraLag}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Hitstop Simulation Dilation</span>
            <span class="control-sub">Impact Dilation: <b id="hitstop-val">${gp.hitstopDilation.toFixed(2)}x</b></span>
          </div>
          <input type="range" id="hitstop-slider" class="settings-slider" min="0.05" max="0.50" step="0.05" value="${gp.hitstopDilation}" />
        </div>

        <button id="btn-reset-tuning" class="btn-util">RESTORE DEFAULT KINEMATICS</button>
      </div>
    `;

    const bindSlider = (id: string, key: keyof typeof gp, valId: string, format: (v: number) => string) => {
      const slider = el.querySelector<HTMLInputElement>(`#${id}`);
      slider?.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        const valDisplay = el.querySelector(`#${valId}`);
        if (valDisplay) valDisplay.textContent = format(val);
        this.settingsManager.updateGameplay({ [key]: val });
      });
    };

    bindSlider('speed-slider', 'speed', 'speed-val', (v) => `${v.toFixed(1)}`);
    bindSlider('dash-slider', 'dashMultiplier', 'dash-val', (v) => `${v.toFixed(2)}x`);
    bindSlider('accel-slider', 'acceleration', 'accel-val', (v) => `${v.toFixed(0)}`);
    bindSlider('camlag-slider', 'cameraLag', 'camlag-val', (v) => `${v.toFixed(2)}s`);
    bindSlider('hitstop-slider', 'hitstopDilation', 'hitstop-val', (v) => `${v.toFixed(2)}x`);

    el.querySelector('#btn-reset-tuning')?.addEventListener('click', () => {
      this.settingsManager.updateGameplay({
        speed: 4.8,
        dashMultiplier: 1.6,
        acceleration: 14,
        cameraLag: 0.12,
        hitstopDilation: 0.15,
      });
      this.renderGameplayTab();
    });
  }

  // =========================================================================
  // TAB 6: GENERAL & DISPLAY
  // =========================================================================
  private renderGeneralTab(): void {
    const el = this.tabContentEl;
    if (!el) return;
    const gen = this.settingsManager.data.general;

    el.innerHTML = `
      <div class="settings-section">
        <h3 class="section-title">SYSTEM & OVERLAYS</h3>
        <p class="section-desc">Configure collision wireframes, trial state, and viewport controls.</p>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Hitbox Wireframe Debugger</span>
            <span class="control-sub">Direct volumetric bone attachment visualization (Key: H)</span>
          </div>
          <button id="btn-toggle-hitbox" class="btn-util ${gen.showHitboxDebug ? 'active' : ''}">
            WIREFRAMES: ${gen.showHitboxDebug ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Reset Combat Trial</span>
            <span class="control-sub">Cleanly purges all combat states and respawns combatants (Key: R)</span>
          </div>
          <button id="btn-reset-trial" class="btn-action">RESTORE TRIAL (KEY: R)</button>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Invert Pitch Axis</span>
            <span class="control-sub">Invert mouse vertical look orientation</span>
          </div>
          <input type="checkbox" id="check-invert-y" ${gen.invertCameraY ? 'checked' : ''} />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Keybinding Guide Overlay</span>
            <span class="control-sub">Display combat key legend in bottom-left viewport</span>
          </div>
          <input type="checkbox" id="check-controls-guide" ${gen.showControlsGuide ? 'checked' : ''} />
        </div>
      </div>
    `;

    // Bind Hitbox Debug
    const hitboxBtn = el.querySelector<HTMLButtonElement>('#btn-toggle-hitbox');
    hitboxBtn?.addEventListener('click', () => {
      const nowVisible = this.config.onToggleHitboxDebug();
      this.settingsManager.updateGeneral({ showHitboxDebug: nowVisible });
      this.renderGeneralTab();
    });

    // Bind Reset Trial
    const resetBtn = el.querySelector<HTMLButtonElement>('#btn-reset-trial');
    resetBtn?.addEventListener('click', () => {
      this.config.onResetTrial();
      this.close();
    });

    // Invert Camera
    const invertCheck = el.querySelector<HTMLInputElement>('#check-invert-y');
    invertCheck?.addEventListener('change', () => {
      this.settingsManager.updateGeneral({ invertCameraY: invertCheck.checked });
    });

    // Controls Guide
    const guideCheck = el.querySelector<HTMLInputElement>('#check-controls-guide');
    guideCheck?.addEventListener('change', () => {
      this.settingsManager.updateGeneral({ showControlsGuide: guideCheck.checked });
      const guideEl = document.querySelector<HTMLElement>('#controls-guide');
      if (guideEl) guideEl.style.display = guideCheck.checked ? '' : 'none';
    });
  }

  // =========================================================================
  // TAB 7: ONLINE MULTIPLAYER DUEL
  // =========================================================================
  private renderMultiplayerTab(): void {
    const el = this.tabContentEl;
    if (!el) return;
    const net = NetworkManager.getInstance();

    if (net.isConnected && net.roomCode) {
      // IN ROOM LOBBY VIEW
      el.innerHTML = `
        <div class="settings-section">
          <h3 class="section-title">ACTIVE DUEL CHAMBER</h3>
          <p class="section-desc">1v1 PvP online chamber synchronized via lightweight Colyseus relay.</p>

          <div class="model-status-card" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              CHAMBER CODE: <b style="color: #ffd700; font-size: 1.15rem; letter-spacing: 2px;">${net.roomCode}</b>
            </div>
            <button id="btn-copy-code" class="btn-util">COPY CODE</button>
          </div>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Your Combat Role</span>
              <span class="control-sub">${net.isHost ? 'Host (Chamber Overseer)' : 'Challenger (Duelist)'}</span>
            </div>
            <span class="toggle-badge permanent">${net.isHost ? 'HOST' : 'GUEST'}</span>
          </div>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Duel Readiness</span>
              <span class="control-sub">Signal when your character and graphics are prepared</span>
            </div>
            <button id="btn-toggle-ready" class="btn-util">TOGGLE READY</button>
          </div>

          ${
            net.isHost
              ? `
          <div class="control-row" style="background: rgba(30, 24, 12, 0.7); border-color: #ffd700;">
            <div class="control-info">
              <span class="control-label" style="color: #ffd700;">Initiate Combat Encounter</span>
              <span class="control-sub">Loads arena duel, spawns opponent, and enables PvP damage</span>
            </div>
            <button id="btn-start-duel" class="btn-action">INITIATE ONLINE DUEL</button>
          </div>`
              : `
          <div class="profiler-banner active">
            WAITING FOR HOST TO INITIATE DUEL...
          </div>`
          }

          <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button id="btn-leave-room" class="btn-util" style="border-color: #ff5555; color: #ff8888;">LEAVE CHAMBER</button>
          </div>
        </div>
      `;

      el.querySelector('#btn-copy-code')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(net.roomCode);
        const btn = el.querySelector<HTMLButtonElement>('#btn-copy-code');
        if (btn) btn.textContent = 'COPIED!';
      });

      let isReady = false;
      el.querySelector('#btn-toggle-ready')?.addEventListener('click', () => {
        isReady = !isReady;
        net.setReady(isReady);
        const btn = el.querySelector<HTMLButtonElement>('#btn-toggle-ready');
        if (btn) btn.textContent = isReady ? 'READY (CONFIRMED)' : 'TOGGLE READY';
      });

      el.querySelector('#btn-start-duel')?.addEventListener('click', () => {
        net.startMatch();
      });

      el.querySelector('#btn-leave-room')?.addEventListener('click', () => {
        net.leaveRoom();
        this.renderMultiplayerTab();
      });
    } else {
      // NOT IN ROOM VIEW
      el.innerHTML = `
        <div class="settings-section">
          <h3 class="section-title">ONLINE MULTIPLAYER DUEL CHAMBERS</h3>
          <p class="section-desc">Host or join 1v1 PvP combat trials with friends via human-readable invite codes.</p>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Allocate New Chamber (Host)</span>
              <span class="control-sub">Creates an online room and generates a 6-character room code to invite your opponent.</span>
            </div>
            <button id="btn-create-chamber" class="btn-action">ALLOCATE CHAMBER</button>
          </div>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Enter Existing Chamber (Join)</span>
              <span class="control-sub">Connect to your friend's duel chamber using their room code.</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <input type="text" id="inp-chamber-code" class="settings-select" placeholder="CODE (e.g. ASH-101)" style="width: 140px; text-transform: uppercase;" />
              <button id="btn-join-chamber" class="btn-util">ENTER</button>
            </div>
          </div>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Relay Server Endpoint</span>
              <span class="control-sub">WebSocket endpoint (ensure 'npm run server' is running on port 2567)</span>
            </div>
            <input type="text" id="inp-server-endpoint" class="settings-select" value="${net.serverUrl}" style="width: 220px;" />
          </div>

          <div id="net-status-banner" class="profiler-banner">
            READY TO CONNECT — Start server with 'npm run server' then allocate or join a chamber.
          </div>
        </div>
      `;

      el.querySelector('#inp-server-endpoint')?.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value.trim();
        if (val) net.setServerUrl(val);
      });

      const statusBanner = el.querySelector<HTMLElement>('#net-status-banner');
      const setStatus = (msg: string) => {
        if (statusBanner) statusBanner.textContent = msg;
      };

      el.querySelector('#btn-create-chamber')?.addEventListener('click', async () => {
        setStatus('ALLOCATING CHAMBER ON RELAY SERVER...');
        try {
          await net.createRoom(this.config.currentPlayerModel);
          this.renderMultiplayerTab();
        } catch (err) {
          setStatus(`Failed: ${(err as Error).message}. (Check if 'npm run server' is active)`);
        }
      });

      el.querySelector('#btn-join-chamber')?.addEventListener('click', async () => {
        const codeInput = el.querySelector<HTMLInputElement>('#inp-chamber-code');
        const code = codeInput?.value.trim() || '';
        if (!code) {
          setStatus('Please enter a valid 6-character room code.');
          return;
        }

        setStatus(`LOCATING CHAMBER ${code.toUpperCase()}...`);
        const ok = await net.joinRoom(code, this.config.currentPlayerModel);
        if (ok) {
          this.renderMultiplayerTab();
        } else {
          setStatus(`Chamber ${code.toUpperCase()} not found or inactive.`);
        }
      });
    }
  }

  public syncModels(playerModelId: string, bossModelId: string): void {
    this.config.currentPlayerModel = playerModelId;
    this.config.currentBossModel = bossModelId;
    if (this.isOpen && this.activeTab === 'models') {
      this.renderModelsTab();
    }
  }

  public dispose(): void {
    this.stopTelemetryLoop();
    this.modalEl?.remove();
  }
}
