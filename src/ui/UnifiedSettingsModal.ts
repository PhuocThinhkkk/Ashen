import { SettingsManager, type VFXPreset, type ShadowQuality } from '../systems/SettingsManager';
import { PerformanceProfiler } from '../systems/PerformanceProfiler';

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

export class UnifiedSettingsModal {
  private container: HTMLElement;
  private isOpen = false;
  private activeTab: 'general' | 'graphics' | 'vfx' | 'performance' | 'models' | 'gameplay' = 'vfx';
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
      this.triggerBtn.innerHTML = '<span class="gear-icon">⚙️</span> Settings';
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
            <h2 class="settings-main-title">GAME SETTINGS & PROFILER</h2>
          </div>
          <button id="settings-close-btn" class="settings-close-btn" aria-label="Close Settings">&times;</button>
        </header>

        <nav class="settings-tabs" role="tablist">
          <button class="settings-tab-btn" data-tab="vfx">⚔️ VFX Toggles</button>
          <button class="settings-tab-btn" data-tab="performance">📊 Diagnostics</button>
          <button class="settings-tab-btn" data-tab="graphics">🎨 Graphics</button>
          <button class="settings-tab-btn" data-tab="models">👤 Models</button>
          <button class="settings-tab-btn" data-tab="gameplay">🎮 Gameplay</button>
          <button class="settings-tab-btn" data-tab="general">⚙️ General</button>
        </nav>

        <main id="settings-tab-content" class="settings-tab-content"></main>
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
          <button class="btn-preset ${s.preset === 'full' ? 'active' : ''}" data-preset="full">🌟 Full Quality</button>
          <button class="btn-preset ${s.preset === 'balanced' ? 'active' : ''}" data-preset="balanced">⚖️ Balanced</button>
          <button class="btn-preset ${s.preset === 'performance' ? 'active' : ''}" data-preset="performance">⚡ Performance Mode</button>
          <button class="btn-preset ${s.preset === 'custom' ? 'active' : ''}" data-preset="custom" disabled>🛠️ Custom</button>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">INDIVIDUAL EFFECT TOGGLES</h3>
        <p class="section-desc">Disable specific rendering systems to eliminate GPU fillrate or CPU overdraw bottlenecks.</p>

        <div class="toggles-grid">
          <!-- Blood Burst -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">🩸 Visceral Blood Burst</span>
              <span class="toggle-badge permanent">Elden Ring Style</span>
              <span class="toggle-desc">Directional arterial spray at weapon impact with realistic gravity.</span>
            </div>
            <input type="checkbox" id="vfx-blood" ${s.bloodBursts ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Slash Arcs -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">⚔️ Sword Slash Arcs</span>
              <span class="toggle-desc">Dynamic noise-dissolving blade ribbons on light & heavy swings.</span>
            </div>
            <input type="checkbox" id="vfx-slash" ${s.slashArcs ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Hit Sparks -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">✨ Contact Hit Sparks</span>
              <span class="toggle-desc">High-energy spark particle bursts at blade collision contact points.</span>
            </div>
            <input type="checkbox" id="vfx-sparks" ${s.hitSparks ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Colossal Ground Slam -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">💥 Ground Slam Shockwave</span>
              <span class="toggle-desc">Expanding energy shockwave ring during boss jump & downward smashes.</span>
            </div>
            <input type="checkbox" id="vfx-shockwave" ${s.groundSlamShockwave ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Ground Decals -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">🪨 Ground Crack Decals</span>
              <span class="toggle-desc">Stone fissure decals pre-pooled on floor at ground impact locations.</span>
            </div>
            <input type="checkbox" id="vfx-decals" ${s.groundDecals ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Floor Dust -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">💨 Floor Dust & Footsteps</span>
              <span class="toggle-desc">Rolling ground dust from jump attacks and running footstep kickups.</span>
            </div>
            <input type="checkbox" id="vfx-dust" ${s.groundDust ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Arena Ambient Embers -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">🔥 Sanctuary Ambient Embers</span>
              <span class="toggle-desc">Atmospheric floating embers drifting upward across the arena floor.</span>
            </div>
            <input type="checkbox" id="vfx-arena-dust" ${s.arenaDust ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Damage Numbers -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">🔢 Floating Damage Numbers</span>
              <span class="toggle-desc">Floating screen-space damage numbers displayed upon hits.</span>
            </div>
            <input type="checkbox" id="vfx-damage-nums" ${s.damageNumbers ? 'checked' : ''} />
            <span class="toggle-switch"></span>
          </label>

          <!-- Camera Shake -->
          <label class="toggle-card">
            <div class="toggle-info">
              <span class="toggle-title">📳 Impact Camera Shake</span>
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
        <p class="section-desc">Independent CPU, GPU submission, memory, and stutter metrics.</p>

        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">CURRENT FPS</span>
            <span id="diag-fps" class="metric-val fps-${snap.fps >= 50 ? 'good' : snap.fps >= 30 ? 'warn' : 'bad'}">${snap.fps}</span>
            <span class="metric-sub">Avg: <b id="diag-avg-fps">${snap.avgFps}</b> FPS</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">FRAME DURATION</span>
            <span id="diag-frametime" class="metric-val">${snap.frameTimeMs} ms</span>
            <span class="metric-sub">Avg: <b id="diag-avg-frametime">${snap.avgFrameTimeMs}</b> ms</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">1% LOW FPS (STUTTER)</span>
            <span id="diag-1pct-low" class="metric-val fps-${snap.onePercentLowFps >= 45 ? 'good' : snap.onePercentLowFps >= 25 ? 'warn' : 'bad'}">${snap.onePercentLowFps}</span>
            <span class="metric-sub">99th percentile worst frames</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">FRAME SPIKES (&gt;25ms)</span>
            <span id="diag-spikes" class="metric-val ${snap.spikeCount25ms > 5 ? 'bad' : 'good'}">${snap.spikeCount25ms}</span>
            <span class="metric-sub">&gt;33ms: <b id="diag-spikes33">${snap.spikeCount33ms}</b></span>
          </div>

          <div class="metric-card">
            <span class="metric-label">CPU LOGIC TIME</span>
            <span id="diag-cputime" class="metric-val">${snap.cpuTimeMs} ms</span>
            <span class="metric-sub">Entities, Physics & Transforms</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">WEBGL RENDER TIME</span>
            <span id="diag-rendertime" class="metric-val">${snap.renderTimeMs} ms</span>
            <span class="metric-sub">WebGL Command Submission</span>
          </div>

          <div class="metric-card">
            <span class="metric-label">DRAW CALLS</span>
            <span id="diag-drawcalls" class="metric-val">${snap.drawCalls}</span>
            <span class="metric-sub">Triangles: <b id="diag-triangles">${snap.triangles.toLocaleString()}</b></span>
          </div>

          <div class="metric-card">
            <span class="metric-label">JS HEAP MEMORY</span>
            <span id="diag-memory" class="metric-val">${snap.usedHeapMb !== null ? `${snap.usedHeapMb} MB` : 'N/A'}</span>
            <span class="metric-sub">V8 Garbage Collection</span>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3 class="section-title">COMBAT EVENT RECORDING & PROFILING</h3>
        <p class="section-desc">Record attacks, hits, ground slams, and dodge rolls to pinpoint exact frame-time spikes.</p>

        <div class="profiler-controls">
          <button id="btn-toggle-record" class="btn-action ${snap.isRecording ? 'recording' : ''}">
            ${snap.isRecording ? '🔴 Stop Recording' : '⏺️ Start Recording'}
          </button>
          <button id="btn-clear-stats" class="btn-util">🔄 Clear Stats</button>
          <button id="btn-export-json" class="btn-util">💾 Export Report (JSON)</button>
        </div>

        <div id="profiler-status-banner" class="profiler-banner ${snap.isRecording ? 'active' : ''}">
          ${snap.isRecording ? 'RECORDING IN PROGRESS — Perform attacks and hits in combat...' : 'Ready to record combat performance session.'}
        </div>
      </div>

      <div class="settings-section diagnostic-notes">
        <h4 class="notes-title">ℹ️ Technical Diagnostic Architecture</h4>
        <p>• <b>CPU vs GPU Timings:</b> In standard WebGL 2.0, precise on-chip GPU rasterization timestamps (<code>EXT_disjoint_timer_query</code>) are disabled across modern browsers for Spectre side-channel security. The metric above measures exact JavaScript main-thread CPU time and WebGL driver command submission.</p>
        <p>• <b>Hitstop Time Dilation:</b> Hits against the boss trigger intentional gameplay time-dilation (0.15x) for visceral impact weight. The renderer and camera continue running at full 60 FPS without halting browser updates.</p>
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
            <span class="control-label">Max Resolution Scale (DPR)</span>
            <span class="control-sub">Current: <b id="dpr-val">${g.maxDpr}x</b></span>
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
            <span class="control-sub">Static arena geometry shadow casting is disabled for optimal performance.</span>
          </div>
          <select id="shadow-quality-select" class="settings-select">
            <option value="off" ${g.shadowQuality === 'off' ? 'selected' : ''}>Off (Maximum Performance)</option>
            <option value="low" ${g.shadowQuality === 'low' ? 'selected' : ''}>Low (512x512)</option>
            <option value="medium" ${g.shadowQuality === 'medium' ? 'selected' : ''}>Medium (1024x1024)</option>
            <option value="high" ${g.shadowQuality === 'high' ? 'selected' : ''}>High (2048x2048 Default)</option>
          </select>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Exposure / Tone Mapping</span>
            <span class="control-sub">ACES Filmic Exposure: <b id="exposure-val">${g.exposure.toFixed(2)}</b></span>
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
          <span class="model-select-badge">3D REGISTRY</span>
          <h3 class="model-select-title">MODEL SELECT</h3>
          <button id="model-select-toggle" class="model-select-toggle" type="button">Hide</button>
        </div>

        <div id="model-select-body" class="model-select-body">
          <h3 class="section-title">3D CHARACTER MODEL REGISTRY</h3>
          <p class="section-desc">Hot-swap rigged humanoid player and boss armatures at runtime.</p>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Player Body Model</span>
              <span class="control-sub">Rebinds hand sockets, weapon transforms, and animation tracks.</span>
            </div>
            <select id="player-model-select" class="settings-select model-dropdown">
              ${pOptions}
            </select>
          </div>

          <div class="control-row">
            <div class="control-info">
              <span class="control-label">Boss Body Model</span>
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
            <span class="control-sub">Value: <b id="speed-val">${gp.speed.toFixed(1)}</b> m/s</span>
          </div>
          <input type="range" id="speed-slider" class="settings-slider" min="2" max="12" step="0.2" value="${gp.speed}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Sprint Dash Multiplier</span>
            <span class="control-sub">Multiplier: <b id="dash-val">${gp.dashMultiplier.toFixed(2)}x</b></span>
          </div>
          <input type="range" id="dash-slider" class="settings-slider" min="1.0" max="2.5" step="0.05" value="${gp.dashMultiplier}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Locomotion Acceleration</span>
            <span class="control-sub">Value: <b id="accel-val">${gp.acceleration.toFixed(0)}</b></span>
          </div>
          <input type="range" id="accel-slider" class="settings-slider" min="4" max="22" step="1" value="${gp.acceleration}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Camera Follow Lag</span>
            <span class="control-sub">Smoothing: <b id="camlag-val">${gp.cameraLag.toFixed(2)}s</b></span>
          </div>
          <input type="range" id="camlag-slider" class="settings-slider" min="0.02" max="0.5" step="0.01" value="${gp.cameraLag}" />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Hitstop Simulation Dilation</span>
            <span class="control-sub">Impact Dilation: <b id="hitstop-val">${gp.hitstopDilation.toFixed(2)}x</b> (0.15 recommended)</span>
          </div>
          <input type="range" id="hitstop-slider" class="settings-slider" min="0.05" max="0.50" step="0.05" value="${gp.hitstopDilation}" />
        </div>

        <button id="btn-reset-tuning" class="btn-util">🔄 Reset to Default Tuning</button>
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
        <h3 class="section-title">GENERAL CONTROLS & DISPLAY</h3>
        <p class="section-desc">Toggle on-screen HUD elements and debug visualizers.</p>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Hitbox Wireframe Debugger</span>
            <span class="control-sub">Hot-swap yellow wireframe volume attachment on weapon bones (Key: H)</span>
          </div>
          <button id="btn-toggle-hitbox" class="btn-util ${gen.showHitboxDebug ? 'active' : ''}">
            ${gen.showHitboxDebug ? '🟡 Hitbox Debug (ON)' : '⚪ Hitbox Debug (OFF)'}
          </button>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Reset Combat Trial</span>
            <span class="control-sub">Instantly respawns player and boss at neutral arena positions (Key: R)</span>
          </div>
          <button id="btn-reset-trial" class="btn-action">Rise Again (Key: R)</button>
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Invert Camera Vertical Axis</span>
            <span class="control-sub">Invert mouse pitch control direction</span>
          </div>
          <input type="checkbox" id="check-invert-y" ${gen.invertCameraY ? 'checked' : ''} />
        </div>

        <div class="control-row">
          <div class="control-info">
            <span class="control-label">Show Controls Guide Overlay</span>
            <span class="control-sub">WASD / Space / Combat key bindings in bottom-left</span>
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
