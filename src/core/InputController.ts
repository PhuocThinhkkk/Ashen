import * as THREE from 'three';
import { type CombatInputs } from './types';
import { DesktopInput, type DesktopTriggers } from './input/DesktopInput';
import { TouchInput, type TouchTriggers } from './input/TouchInput';

/**
 * High-level unified input controller facade.
 * Coordinates Desktop keyboard/mouse input and Mobile touch controls.
 */
export class InputController {
  private readonly desktop: DesktopInput;
  private readonly touch: TouchInput;

  private readonly desktopTriggers: DesktopTriggers = {
    dodge: false,
    lightAttack: false,
    heavyAttack: false,
    lockOn: false,
    restart: false,
    heal: false,
    jump: false,
  };

  private readonly touchTriggers: TouchTriggers = {
    dodge: false,
    lightAttack: false,
    heavyAttack: false,
    lockOn: false,
    heal: false,
    jump: false,
    restart: false,
  };

  private readonly keyVector = new THREE.Vector2();
  private readonly touchCameraDelta = new THREE.Vector2();

  // Overlay elements for restart
  private quickRestartBtn: HTMLElement | null = null;
  private deathRestartBtn: HTMLElement | null = null;
  private victoryRestartBtn: HTMLElement | null = null;
  private deathOverlay: HTMLElement | null = null;
  private victoryOverlay: HTMLElement | null = null;

  public get isPointerLocked(): boolean {
    return this.desktop.isPointerLocked;
  }

  public get mouseDeltaX(): number {
    return this.desktop.mouseDeltaX;
  }

  public set mouseDeltaX(val: number) {
    this.desktop.mouseDeltaX = val;
  }

  public get mouseDeltaY(): number {
    return this.desktop.mouseDeltaY;
  }

  public set mouseDeltaY(val: number) {
    this.desktop.mouseDeltaY = val;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.desktop = new DesktopInput(canvas, () => this.isRestartOverlayVisible());
    this.touch = new TouchInput(canvas);
    this.bindRestartOverlays();
  }

  private isRestartOverlayVisible(): boolean {
    const isDeathVisible = !!this.deathOverlay && !this.deathOverlay.classList.contains('hidden');
    const isVictoryVisible = !!this.victoryOverlay && !this.victoryOverlay.classList.contains('hidden');
    return isDeathVisible || isVictoryVisible;
  }

  private bindRestartOverlays(): void {
    this.quickRestartBtn = document.querySelector<HTMLElement>('#quick-restart-btn');
    this.deathRestartBtn = document.querySelector<HTMLElement>('#death-restart-btn');
    this.victoryRestartBtn = document.querySelector<HTMLElement>('#victory-restart-btn');
    this.deathOverlay = document.querySelector<HTMLElement>('#death-overlay');
    this.victoryOverlay = document.querySelector<HTMLElement>('#victory-overlay');

    const handleRestart = (e?: Event) => {
      e?.stopPropagation();
      this.triggerRestart();
    };

    this.quickRestartBtn?.addEventListener('click', handleRestart);
    this.deathRestartBtn?.addEventListener('click', handleRestart);
    this.victoryRestartBtn?.addEventListener('click', handleRestart);

    this.deathOverlay?.addEventListener('click', () => {
      if (!this.deathOverlay?.classList.contains('hidden')) {
        this.triggerRestart();
      }
    });

    this.victoryOverlay?.addEventListener('click', () => {
      if (!this.victoryOverlay?.classList.contains('hidden')) {
        this.triggerRestart();
      }
    });
  }

  public triggerRestart(): void {
    this.desktop.triggers.restart = true;
  }

  public triggerHeal(): void {
    this.desktop.triggers.heal = true;
  }

  public reset(): void {
    this.desktop.reset();
    this.touch.reset();
  }

  public readInputs(target: CombatInputs): CombatInputs {
    return this.consumeInputs(target);
  }

  /**
   * [Purpose]: Polls desktop and touch input drivers, coalescing movement axes and single-frame action triggers.
   * @condition Called at the beginning of each simulation tick in the 60Hz loop.
   * @param target Reusable CombatInputs object populated with normalized move vector and action booleans.
   * @returns The mutated target CombatInputs structure with consumed transient trigger flags cleared.
   */
  public consumeInputs(target: CombatInputs): CombatInputs {
    this.desktop.consumeTriggers(this.desktopTriggers);
    this.touch.consumeTriggers(this.touchTriggers);

    // Movement vector: prioritize touch joystick if active, otherwise keyboard
    if (this.touch.joystickVector.lengthSq() > 0.01) {
      target.move.copy(this.touch.joystickVector);
    } else {
      this.desktop.getMovementVector(this.keyVector);
      target.move.copy(this.keyVector);
    }

    target.dodge = this.desktopTriggers.dodge || this.touchTriggers.dodge;
    target.lightAttack = this.desktopTriggers.lightAttack || this.touchTriggers.lightAttack;
    target.heavyAttack = this.desktopTriggers.heavyAttack || this.touchTriggers.heavyAttack;
    target.toggleLockOn = this.desktopTriggers.lockOn || this.touchTriggers.lockOn;
    target.restart = this.desktopTriggers.restart || this.touchTriggers.restart;
    target.sprint = this.desktop.isSprinting() || this.touch.isSprinting;
    target.heal = this.desktopTriggers.heal || this.touchTriggers.heal;
    target.jump = this.desktopTriggers.jump || this.touchTriggers.jump;

    return target;
  }

  public consumeMouseDelta(target: THREE.Vector2): THREE.Vector2 {
    this.desktop.consumeMouseDelta(target);
    this.touch.consumeCameraDelta(this.touchCameraDelta);

    target.x += this.touchCameraDelta.x;
    target.y += this.touchCameraDelta.y;

    return target;
  }

  public dispose(): void {
    this.desktop.dispose();
    this.touch.dispose();
  }
}
