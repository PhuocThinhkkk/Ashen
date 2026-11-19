import type { TabRenderContext } from './types';

export function renderModelsTab(ctx: TabRenderContext): void {
  const el = ctx.container;

  const pOptions = ctx.config.playerModels
    .map((m) => `<option value="${m.id}" ${m.id === ctx.config.currentPlayerModel ? 'selected' : ''}>${m.name}</option>`)
    .join('');

  const bOptions = ctx.config.bossModels
    .map((m) => `<option value="${m.id}" ${m.id === ctx.config.currentBossModel ? 'selected' : ''}>${m.name}</option>`)
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
          Active: <b>${ctx.config.currentPlayerModel === 'knight' ? 'Knight' : 'Samurai'}</b> vs <b>Titan</b>
        </div>
      </div>
    </div>
  `;

  // Bind Player Dropdown
  const playerSelect = el.querySelector<HTMLSelectElement>('#player-model-select');
  playerSelect?.addEventListener('change', async () => {
    await ctx.config.onPlayerModelChange(playerSelect.value);
    ctx.config.currentPlayerModel = playerSelect.value;
    ctx.renderCurrentTab();
  });

  // Bind Boss Dropdown
  const bossSelect = el.querySelector<HTMLSelectElement>('#boss-model-select');
  bossSelect?.addEventListener('change', async () => {
    await ctx.config.onBossModelChange(bossSelect.value);
    ctx.config.currentBossModel = bossSelect.value;
    ctx.renderCurrentTab();
  });

  // Bind Collapse Toggle
  const toggleBtn = el.querySelector<HTMLButtonElement>('#model-select-toggle');
  const bodyEl = el.querySelector<HTMLElement>('#model-select-body');
  toggleBtn?.addEventListener('click', () => {
    const isCollapsed = bodyEl?.classList.toggle('collapsed');
    toggleBtn.textContent = isCollapsed ? 'Show' : 'Hide';
  });
}
