import type { TabRenderContext } from './types';

export function renderGameplayTab(ctx: TabRenderContext): void {
  const el = ctx.container;
  const gp = ctx.settingsManager.data.gameplay;

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
      ctx.settingsManager.updateGameplay({ [key]: val });
    });
  };

  bindSlider('speed-slider', 'speed', 'speed-val', (v) => `${v.toFixed(1)}`);
  bindSlider('dash-slider', 'dashMultiplier', 'dash-val', (v) => `${v.toFixed(2)}x`);
  bindSlider('accel-slider', 'acceleration', 'accel-val', (v) => `${v.toFixed(0)}`);
  bindSlider('camlag-slider', 'cameraLag', 'camlag-val', (v) => `${v.toFixed(2)}s`);
  bindSlider('hitstop-slider', 'hitstopDilation', 'hitstop-val', (v) => `${v.toFixed(2)}x`);

  el.querySelector('#btn-reset-tuning')?.addEventListener('click', () => {
    ctx.settingsManager.updateGameplay({
      speed: 4.8,
      dashMultiplier: 1.6,
      acceleration: 14,
      cameraLag: 0.12,
      hitstopDilation: 0.15,
    });
    ctx.renderCurrentTab();
  });
}
