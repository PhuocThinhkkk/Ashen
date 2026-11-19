import type { TabRenderContext } from './types';
import type { VFXPreset } from '../../systems/SettingsManager';

export function renderVfxTab(ctx: TabRenderContext): void {
  const el = ctx.container;
  const s = ctx.settingsManager.data.vfx;

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
        ctx.settingsManager.applyVFXPreset(preset);
        ctx.renderCurrentTab();
      }
    });
  });

  // Bind Individual Checkboxes
  const bindToggle = (id: string, key: keyof typeof s) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`);
    input?.addEventListener('change', () => {
      ctx.settingsManager.updateVFX({ [key]: input.checked });
      ctx.renderCurrentTab();
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
