import * as THREE from 'three';

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

  private playerChipHp = 100;
  private bossChipHp = 420;

  constructor() {
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
  }

  private getEl(selector: string): HTMLElement {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`Missing HUD element: ${selector}`);
    return el;
  }
}
