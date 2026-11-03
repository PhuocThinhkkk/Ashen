import * as THREE from 'three';

export interface HudModelControls {
  playerModels: { id: string; name: string }[];
  currentPlayerModel: string;
  onPlayerModelChange: (modelId: string) => Promise<void> | void;
  bossModels: { id: string; name: string }[];
  currentBossModel: string;
  onBossModelChange: (modelId: string) => Promise<void> | void;
}

export class Hud {
  private readonly playerHpFill: HTMLElement;
  private readonly playerHpChip: HTMLElement;
  private readonly playerHpText: HTMLElement;
  private readonly playerStaminaFill: HTMLElement;
  private readonly playerStaminaText: HTMLElement;

  private readonly bossHpFill: HTMLElement;
  private readonly bossHpChip: HTMLElement;

  private readonly lockonReticle: HTMLElement;
  private readonly damageContainer: HTMLElement;
  private readonly deathOverlay: HTMLElement;
  private readonly victoryOverlay: HTMLElement;
  private readonly fpsDisplay: HTMLElement | null;

  // Model Selection UI Elements
  private readonly modelSelectPanel: HTMLElement | null;
  private readonly playerModelSelect: HTMLSelectElement | null;
  private readonly bossModelSelect: HTMLSelectElement | null;
  private readonly modelSelectToggle: HTMLButtonElement | null;
  private readonly modelSelectBody: HTMLElement | null;
  private readonly modelSelectStatus: HTMLElement | null;

  private playerChipHp = 100;
  private bossChipHp = 420;
  private fpsFrames = 0;
  private fpsTimer = 0;

  constructor(modelControls?: HudModelControls) {
    this.playerHpFill = this.getEl('#player-hp-fill');
    this.playerHpChip = this.getEl('#player-hp-chip');
    this.playerHpText = this.getEl('#player-hp-text');
    this.playerStaminaFill = this.getEl('#player-stamina-fill');
    this.playerStaminaText = this.getEl('#player-stamina-text');

    this.bossHpFill = this.getEl('#boss-hp-fill');
    this.bossHpChip = this.getEl('#boss-hp-chip');

    this.lockonReticle = this.getEl('#lockon-reticle');
    this.damageContainer = this.getEl('#damage-container');
    this.deathOverlay = this.getEl('#death-overlay');
    this.victoryOverlay = this.getEl('#victory-overlay');
    this.fpsDisplay = document.querySelector<HTMLElement>('#fps-display');

    this.modelSelectPanel = document.querySelector<HTMLElement>('#model-select-panel');
    this.playerModelSelect = document.querySelector<HTMLSelectElement>('#player-model-select');
    this.bossModelSelect = document.querySelector<HTMLSelectElement>('#boss-model-select');
    this.modelSelectToggle = document.querySelector<HTMLButtonElement>('#model-select-toggle');
    this.modelSelectBody = document.querySelector<HTMLElement>('#model-select-body');
    this.modelSelectStatus = document.querySelector<HTMLElement>('#model-select-status');

    if (this.modelSelectToggle && this.modelSelectBody) {
      this.modelSelectToggle.addEventListener('click', () => {
        const isCollapsed = this.modelSelectBody!.classList.toggle('collapsed');
        this.modelSelectToggle!.textContent = isCollapsed ? 'Show' : 'Hide';
        this.modelSelectToggle!.setAttribute('aria-expanded', String(!isCollapsed));
      });
    }

    if (modelControls) {
      if (this.playerModelSelect) {
        this.playerModelSelect.innerHTML = '';
        for (const m of modelControls.playerModels) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name;
          if (m.id === modelControls.currentPlayerModel) opt.selected = true;
          this.playerModelSelect.appendChild(opt);
        }
        this.playerModelSelect.addEventListener('change', () => {
          if (this.playerModelSelect) {
            modelControls.onPlayerModelChange(this.playerModelSelect.value);
          }
        });
      }

      if (this.bossModelSelect) {
        this.bossModelSelect.innerHTML = '';
        for (const m of modelControls.bossModels) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name;
          if (m.id === modelControls.currentBossModel) opt.selected = true;
          this.bossModelSelect.appendChild(opt);
        }
        this.bossModelSelect.addEventListener('change', () => {
          if (this.bossModelSelect) {
            modelControls.onBossModelChange(this.bossModelSelect.value);
          }
        });
      }

      this.syncModels(modelControls.currentPlayerModel, modelControls.currentBossModel);
    }
  }

  public syncModels(playerModelId: string, bossModelId: string): void {
    if (this.playerModelSelect && this.playerModelSelect.value !== playerModelId) {
      this.playerModelSelect.value = playerModelId;
    }
    if (this.bossModelSelect && this.bossModelSelect.value !== bossModelId) {
      this.bossModelSelect.value = bossModelId;
    }
    if (this.modelSelectStatus) {
      const pName = this.playerModelSelect?.selectedOptions[0]?.text || playerModelId;
      const bName = this.bossModelSelect?.selectedOptions[0]?.text || bossModelId;
      this.modelSelectStatus.textContent = `Active: ${pName} vs ${bName}`;
    }
  }

  public setSelectionHidden(hidden: boolean): void {
    if (this.modelSelectPanel) {
      if (hidden) {
        this.modelSelectPanel.classList.add('hidden');
      } else {
        this.modelSelectPanel.classList.remove('hidden');
      }
    }
  }

  public update(
    delta: number,
    playerHp: number,
    playerMaxHp: number,
    playerStamina: number,
    playerMaxStamina: number,
    bossHp: number,
    bossMaxHp: number,
    isLockedOn: boolean,
    reticleScreenPos: THREE.Vector2 | null,
    isPlayerDead: boolean,
    isBossDead: boolean,
  ): void {
    // 1. Player HP
    const hpPct = Math.max(0, Math.min(100, (playerHp / playerMaxHp) * 100));
    this.playerHpFill.style.width = `${hpPct}%`;
    this.playerHpText.textContent = `${Math.ceil(playerHp)} / ${playerMaxHp}`;

    // Slow lag on damage chip
    if (this.playerChipHp > playerHp) {
      this.playerChipHp = Math.max(playerHp, this.playerChipHp - delta * 45.0);
    } else {
      this.playerChipHp = playerHp;
    }
    const chipPct = Math.max(0, Math.min(100, (this.playerChipHp / playerMaxHp) * 100));
    this.playerHpChip.style.width = `${chipPct}%`;

    // 2. Player Stamina
    const staminaPct = Math.max(0, Math.min(100, (playerStamina / playerMaxStamina) * 100));
    this.playerStaminaFill.style.width = `${staminaPct}%`;
    this.playerStaminaText.textContent = `${Math.ceil(playerStamina)} / ${playerMaxStamina}`;

    // 3. Boss HP
    const bossPct = Math.max(0, Math.min(100, (bossHp / bossMaxHp) * 100));
    this.bossHpFill.style.width = `${bossPct}%`;

    if (this.bossChipHp > bossHp) {
      this.bossChipHp = Math.max(bossHp, this.bossChipHp - delta * 60.0);
    } else {
      this.bossChipHp = bossHp;
    }
    const bossChipPct = Math.max(0, Math.min(100, (this.bossChipHp / bossMaxHp) * 100));
    this.bossHpChip.style.width = `${bossChipPct}%`;

    // 4. Lock-On Reticle
    if (isLockedOn && reticleScreenPos) {
      this.lockonReticle.classList.remove('hidden');
      this.lockonReticle.style.left = `${reticleScreenPos.x}px`;
      this.lockonReticle.style.top = `${reticleScreenPos.y}px`;
    } else {
      this.lockonReticle.classList.add('hidden');
    }

    // 5. Game Over / Victory Banners
    if (isPlayerDead) {
      this.deathOverlay.classList.remove('hidden');
    } else {
      this.deathOverlay.classList.add('hidden');
    }

    if (isBossDead) {
      this.victoryOverlay.classList.remove('hidden');
    } else {
      this.victoryOverlay.classList.add('hidden');
    }

    // 6. FPS Counter (smooth rolling 250ms average)
    this.fpsFrames++;
    this.fpsTimer += delta;
    if (this.fpsTimer >= 0.25) {
      const currentFps = Math.min(999, Math.round(this.fpsFrames / this.fpsTimer));
      if (this.fpsDisplay) {
        this.fpsDisplay.textContent = `FPS: ${currentFps}`;
        if (currentFps >= 50) {
          this.fpsDisplay.style.color = '#7ef29d';
        } else if (currentFps >= 30) {
          this.fpsDisplay.style.color = '#e5c158';
        } else {
          this.fpsDisplay.style.color = '#ff5555';
        }
      }
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }
  }

  public spawnDamageNumber(amount: number, screenX: number, screenY: number, isPlayerDamage = false): void {
    const el = document.createElement('div');
    el.className = `damage-number ${isPlayerDamage ? 'player-damage' : ''}`;
    el.textContent = `${Math.round(amount)}`;
    el.style.left = `${screenX + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${screenY + (Math.random() - 0.5) * 20}px`;

    this.damageContainer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 900);
  }

  public reset(): void {
    this.deathOverlay.classList.add('hidden');
    this.victoryOverlay.classList.add('hidden');
    this.lockonReticle.classList.add('hidden');
    this.damageContainer.innerHTML = '';
    this.fpsFrames = 0;
    this.fpsTimer = 0;
  }

  private getEl(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Missing HUD element: ${selector}`);
    return el;
  }
}
