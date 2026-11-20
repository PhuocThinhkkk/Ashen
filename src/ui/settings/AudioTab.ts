import type { TabRenderContext } from './types';
import { BossMusicStorage } from '../../audio/BossMusicStorage';

export function renderAudioTab(ctx: TabRenderContext): void {
  const el = ctx.container;
  const audio = ctx.settingsManager.data.audio;
  const presets = BossMusicStorage.getPresets();
  const selectedPreset = presets.find((p) => p.id === audio.selectedTrackId) || presets[0];

  const presetOptions = presets
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === audio.selectedTrackId ? 'selected' : ''}>${p.name}${p.isBuiltIn ? ' [Built-in]' : ' [Custom]'}</option>`,
    )
    .join('');

  const modeLabel = selectedPreset?.config.mode === 'single' ? 'SINGLE-TRACK' : 'DUAL-TRACK';
  let detailsText = '';
  if (selectedPreset?.config.mode === 'single') {
    const cfg = selectedPreset.config;
    const p1 = cfg.phase1;
    const p2 = cfg.phase2;
    const trackSrc = cfg.url || cfg.fileName || 'Built-in Theme';
    detailsText = `Track: ${trackSrc} | P1: ${p1.loopStart.toFixed(1)}s-${p1.loopEnd.toFixed(1)}s | P2: ${p2.loopStart.toFixed(1)}s-${p2.loopEnd.toFixed(1)}s`;
  } else if (selectedPreset) {
    const cfg = selectedPreset.config;
    const p1 = cfg.phase1;
    const p2 = cfg.phase2;
    const p1Src = cfg.phase1Url || cfg.phase1FileName || 'Built-in P1';
    const p2Src = cfg.phase2Url || cfg.phase2FileName || 'Built-in P2';
    const p1Text = p1.loopEnd ? `${(p1.loopStart || 0).toFixed(1)}s-${p1.loopEnd.toFixed(1)}s` : 'Full';
    const p2Text = p2.loopEnd ? `${(p2.loopStart || 0).toFixed(1)}s-${p2.loopEnd.toFixed(1)}s` : 'Full';
    detailsText = `P1: ${p1Src} (${p1Text}) | P2: ${p2Src} (${p2Text})`;
  }

  el.innerHTML = `
    <div class="settings-section">
      <h3 class="section-title">AUDIO & SOUNDTRACK</h3>
      <p class="section-desc">Configure dynamic boss encounter music, custom editor presets, and master acoustic volume levels.</p>

      <div class="control-row">
        <div class="control-info">
          <span class="control-label">Boss Fight Theme</span>
          <span class="control-sub">Select active orchestral track or custom preset from editor</span>
        </div>
        <select id="select-boss-music" class="settings-select" style="min-width: 200px; max-width: 260px; background: #0c121c; border: 1px solid rgba(181, 149, 74, 0.4); color: #ffd777; padding: 6px 8px; border-radius: 4px; font-family: monospace; font-size: 11px;">
          ${presetOptions}
        </select>
      </div>

      <div class="control-row" style="background: rgba(14, 20, 30, 0.6); padding: 8px 12px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 12px;">
        <div class="control-info">
          <span class="control-label" style="font-size: 10px; color: #8bb2d6;">ACTIVE PRESET STRUCTURE</span>
          <span class="control-sub" id="music-track-details" style="font-family: monospace; color: #c8c0b4;">Mode: ${modeLabel} | ${detailsText}</span>
        </div>
      </div>

      <div class="control-row">
        <div class="control-info">
          <span class="control-label">Boss Music Volume</span>
          <span class="control-sub">Dynamic Phase 1 and Phase 2 battle soundtrack amplitude</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <input type="range" id="slider-music-vol" min="0" max="100" step="1" value="${Math.round(audio.bossMusicVolume * 100)}" style="accent-color: #ffd700; cursor: pointer; width: 130px;" />
          <span id="val-music-vol" style="font-family: monospace; font-size: 11px; color: #ffd700; width: 36px; text-align: right;">${Math.round(audio.bossMusicVolume * 100)}%</span>
        </div>
      </div>

      <div class="control-row">
        <div class="control-info">
          <span class="control-label">Combat Sound Effects (SFX)</span>
          <span class="control-sub">Sword swings, impact clashes, ground slams, and vocal grunts</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <input type="range" id="slider-sfx-vol" min="0" max="100" step="1" value="${Math.round(audio.sfxVolume * 100)}" style="accent-color: #ffd700; cursor: pointer; width: 130px;" />
          <span id="val-sfx-vol" style="font-family: monospace; font-size: 11px; color: #ffd700; width: 36px; text-align: right;">${Math.round(audio.sfxVolume * 100)}%</span>
        </div>
      </div>
    </div>
  `;

  // Track select event
  const selectEl = el.querySelector<HTMLSelectElement>('#select-boss-music');
  selectEl?.addEventListener('change', () => {
    const newTrackId = selectEl.value;
    ctx.settingsManager.updateAudio({ selectedTrackId: newTrackId });
    ctx.renderCurrentTab();
  });

  // Music volume slider event
  const musicSlider = el.querySelector<HTMLInputElement>('#slider-music-vol');
  const musicVal = el.querySelector<HTMLElement>('#val-music-vol');
  musicSlider?.addEventListener('input', () => {
    const val = parseInt(musicSlider.value, 10);
    if (musicVal) musicVal.textContent = `${val}%`;
    ctx.settingsManager.updateAudio({ bossMusicVolume: val / 100 });
  });

  // SFX volume slider event
  const sfxSlider = el.querySelector<HTMLInputElement>('#slider-sfx-vol');
  const sfxVal = el.querySelector<HTMLElement>('#val-sfx-vol');
  sfxSlider?.addEventListener('input', () => {
    const val = parseInt(sfxSlider.value, 10);
    if (sfxVal) sfxVal.textContent = `${val}%`;
    ctx.settingsManager.updateAudio({ sfxVolume: val / 100 });
  });
}
