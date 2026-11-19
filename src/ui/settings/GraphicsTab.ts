import type { TabRenderContext } from './types';
import type { ShadowQuality } from '../../systems/SettingsManager';

export function renderGraphicsTab(ctx: TabRenderContext): void {
  const el = ctx.container;
  const g = ctx.settingsManager.data.graphics;

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
      ctx.settingsManager.updateGraphics({ maxDpr: val });
      ctx.renderCurrentTab();
    });
  });

  // Bind Shadow Quality
  const shadowSelect = el.querySelector<HTMLSelectElement>('#shadow-quality-select');
  shadowSelect?.addEventListener('change', () => {
    ctx.settingsManager.updateGraphics({ shadowQuality: shadowSelect.value as ShadowQuality });
  });

  // Bind Exposure
  const exposureSlider = el.querySelector<HTMLInputElement>('#exposure-slider');
  exposureSlider?.addEventListener('input', () => {
    const val = parseFloat(exposureSlider.value);
    const valDisplay = el.querySelector('#exposure-val');
    if (valDisplay) valDisplay.textContent = val.toFixed(2);
    ctx.settingsManager.updateGraphics({ exposure: val });
  });
}
