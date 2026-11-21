import * as THREE from 'three';

export interface DesktopTriggers {
  dodge: boolean;
  lightAttack: boolean;
  heavyAttack: boolean;
  lockOn: boolean;
  restart: boolean;
  heal: boolean;
  jump: boolean;
}

export class DesktopInput {
  private readonly keys = new Set<string>();
  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public isPointerLocked = false;

  private spacePressed = false;
  private spaceDownTime = 0;
  private spaceHasSprinted = false;

  public triggers: DesktopTriggers = {
    dodge: false,
    lightAttack: false,
    heavyAttack: false,
    lockOn: false,
    restart: false,
    heal: false,
    jump: false,
  };

  private boundOnKeyDown: (e: KeyboardEvent) => void;
  private boundOnKeyUp: (e: KeyboardEvent) => void;
  private boundOnMouseMove: (e: MouseEvent) => void;
  private boundOnPointerLockChange: () => void;
  private boundOnMouseDown: (e: MouseEvent) => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private isRestartOverlayVisible: () => boolean,
  ) {
    this.boundOnKeyDown = this.onKeyDown.bind(this);
    this.boundOnKeyUp = this.onKeyUp.bind(this);
    this.boundOnMouseMove = this.onMouseMove.bind(this);
    this.boundOnPointerLockChange = this.onPointerLockChange.bind(this);
    this.boundOnMouseDown = this.onMouseDown.bind(this);

    window.addEventListener('keydown', this.boundOnKeyDown);
    window.addEventListener('keyup', this.boundOnKeyUp);
    window.addEventListener('mousemove', this.boundOnMouseMove);
    document.addEventListener('pointerlockchange', this.boundOnPointerLockChange);
    this.canvas.addEventListener('mousedown', this.boundOnMouseDown);
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.keys.add(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      if (!this.spacePressed) {
        this.spacePressed = true;
        this.spaceDownTime = performance.now();
        this.spaceHasSprinted = false;
      }
    } else if (event.code === 'KeyJ') {
      this.triggers.lightAttack = true;
    } else if (event.code === 'KeyK') {
      this.triggers.heavyAttack = true;
    } else if (event.code === 'KeyQ' || event.code === 'Tab') {
      event.preventDefault();
      this.triggers.lockOn = true;
    } else if (event.code === 'KeyY') {
      this.triggers.restart = true;
    } else if (event.code === 'KeyR') {
      if (this.isRestartOverlayVisible()) {
        this.triggers.restart = true;
      } else {
        this.triggers.heal = true;
      }
    } else if (event.code === 'KeyE') {
      this.triggers.heal = true;
    } else if (event.code === 'KeyF') {
      this.triggers.jump = true;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      const duration = performance.now() - this.spaceDownTime;
      this.spacePressed = false;
      if (!this.spaceHasSprinted && duration < 300) {
        this.triggers.dodge = true;
      }
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.isPointerLocked) {
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    }
  }

  private onPointerLockChange(): void {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
  }

  private onMouseDown(event: MouseEvent): void {
    if (!this.isPointerLocked && event.button === 0) {
      this.canvas.requestPointerLock?.();
    } else if (this.isPointerLocked) {
      if (event.button === 0) {
        this.triggers.lightAttack = true;
      } else if (event.button === 2) {
        this.triggers.heavyAttack = true;
      }
    }
  }

  public getMovementVector(out: THREE.Vector2): void {
    out.set(0, 0);
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) out.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) out.y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) out.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) out.x += 1;

    if (out.lengthSq() > 1) {
      out.normalize();
    }
  }

  public isSprinting(): boolean {
    const isShiftSprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    let isSpaceSprint = false;
    if (this.spacePressed) {
      const holdTime = performance.now() - this.spaceDownTime;
      if (holdTime >= 300) {
        this.spaceHasSprinted = true;
        isSpaceSprint = true;
      }
    }
    return isShiftSprint || isSpaceSprint;
  }

  public consumeTriggers(triggers: DesktopTriggers): void {
    triggers.dodge = this.triggers.dodge;
    triggers.lightAttack = this.triggers.lightAttack;
    triggers.heavyAttack = this.triggers.heavyAttack;
    triggers.lockOn = this.triggers.lockOn;
    triggers.restart = this.triggers.restart;
    triggers.heal = this.triggers.heal;
    triggers.jump = this.triggers.jump;

    this.triggers.dodge = false;
    this.triggers.lightAttack = false;
    this.triggers.heavyAttack = false;
    this.triggers.lockOn = false;
    this.triggers.restart = false;
    this.triggers.heal = false;
    this.triggers.jump = false;
  }

  public consumeMouseDelta(out: THREE.Vector2): void {
    out.set(this.mouseDeltaX, this.mouseDeltaY);
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  public reset(): void {
    this.keys.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.spacePressed = false;
    this.spaceDownTime = 0;
    this.spaceHasSprinted = false;
    this.triggers.dodge = false;
    this.triggers.lightAttack = false;
    this.triggers.heavyAttack = false;
    this.triggers.lockOn = false;
    this.triggers.restart = false;
    this.triggers.heal = false;
    this.triggers.jump = false;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.boundOnKeyDown);
    window.removeEventListener('keyup', this.boundOnKeyUp);
    window.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('pointerlockchange', this.boundOnPointerLockChange);
    this.canvas.removeEventListener('mousedown', this.boundOnMouseDown);
  }
}
