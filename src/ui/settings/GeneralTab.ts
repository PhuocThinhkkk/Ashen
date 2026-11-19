import type { TabRenderContext } from './types';

export function renderGeneralTab(ctx: TabRenderContext): void {
  const el = ctx.container;
  const gen = ctx.settingsManager.data.general;

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
    const nowVisible = ctx.config.onToggleHitboxDebug();
    ctx.settingsManager.updateGeneral({ showHitboxDebug: nowVisible });
    ctx.renderCurrentTab();
  });

  // Bind Reset Trial
  const resetBtn = el.querySelector<HTMLButtonElement>('#btn-reset-trial');
  resetBtn?.addEventListener('click', () => {
    ctx.config.onResetTrial();
    ctx.closeModal();
  });

  // Invert Camera
  const invertCheck = el.querySelector<HTMLInputElement>('#check-invert-y');
  invertCheck?.addEventListener('change', () => {
    ctx.settingsManager.updateGeneral({ invertCameraY: invertCheck.checked });
  });

  // Controls Guide
  const guideCheck = el.querySelector<HTMLInputElement>('#check-controls-guide');
  guideCheck?.addEventListener('change', () => {
    ctx.settingsManager.updateGeneral({ showControlsGuide: guideCheck.checked });
    const guideEl = document.querySelector<HTMLElement>('#controls-guide');
    if (guideEl) guideEl.style.display = guideCheck.checked ? '' : 'none';
  });
}
