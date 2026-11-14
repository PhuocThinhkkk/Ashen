import * as THREE from 'three';

export interface CombatInputs {
  move: THREE.Vector2;
  sprint: boolean;
  dodge: boolean;
  lightAttack: boolean;
  heavyAttack: boolean;
  toggleLockOn: boolean;
  restart: boolean;
}

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer = new THREE.Vector2();
  private readonly keyVector = new THREE.Vector2();

  // One-frame combat triggers
  private dodgeTriggered = false;
  private lightAttackTriggered = false;
  private heavyAttackTriggered = false;
  private lockOnTriggered = false;
  private restartTriggered = false;

  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public isPointerLocked = false;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      this.dodgeTriggered = true;
    } else if (event.code === 'KeyJ') {
      this.lightAttackTriggered = true;
    } else if (event.code === 'KeyK') {
      this.heavyAttackTriggered = true;
    } else if (event.code === 'KeyQ' || event.code === 'Tab') {
      event.preventDefault();
      this.lockOnTriggered = true;
    } else if (event.code === 'KeyR') {
      this.restartTriggered = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  private readonly onMouseDown = (event: MouseEvent) => {
    if (event.button === 0) {
      // Left click -> Light Attack
      this.lightAttackTriggered = true;
    } else if (event.button === 2) {
      // Right click -> Heavy Attack
      event.preventDefault();
      this.heavyAttackTriggered = true;
    } else if (event.button === 1) {
      // Middle click -> Toggle Lock-on
      event.preventDefault();
      this.lockOnTriggered = true;
    }
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
  };

  private readonly onMouseMove = (event: MouseEvent) => {
    if (this.isPointerLocked) {
      this.mouseDeltaX += event.movementX;
      this.mouseDeltaY += event.movementY;
    }
  };

  private readonly onPointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.canvas;
  };

  private readonly onCanvasClick = () => {
    if (!this.isPointerLocked && document.pointerLockElement !== this.canvas) {
      try {
        this.canvas.requestPointerLock();
      } catch {
        // Pointer lock may fail if triggered without user gesture or in iframe
      }
    }
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.addEventListener('click', this.onCanvasClick);
  }

  public readInputs(target: CombatInputs): void {
    // 1. Movement Vector (WASD)
    this.keyVector.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.keyVector.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.keyVector.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.keyVector.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.keyVector.y += 1;

    target.move.copy(this.keyVector).add(this.pointer);
    if (target.move.lengthSq() > 1) {
      target.move.normalize();
    }

    // 2. Sprint
    target.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    // 3. Triggers (consumed upon read)
    target.dodge = this.dodgeTriggered;
    target.lightAttack = this.lightAttackTriggered;
    target.heavyAttack = this.heavyAttackTriggered;
    target.toggleLockOn = this.lockOnTriggered;
    target.restart = this.restartTriggered;

    this.dodgeTriggered = false;
    this.lightAttackTriggered = false;
    this.heavyAttackTriggered = false;
    this.lockOnTriggered = false;
    this.restartTriggered = false;
  }

  public consumeMouseDelta(out: THREE.Vector2): void {
    out.set(this.mouseDeltaX, this.mouseDeltaY);
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  public reset(): void {
    this.keys.clear();
    this.pointer.set(0, 0);
    this.keyVector.set(0, 0);
    this.dodgeTriggered = false;
    this.lightAttackTriggered = false;
    this.heavyAttackTriggered = false;
    this.lockOnTriggered = false;
    this.restartTriggered = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  public isDashHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('Space');
  }

  public readMovement(target: THREE.Vector2): THREE.Vector2 {
    this.keyVector.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.keyVector.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.keyVector.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.keyVector.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.keyVector.y += 1;

    target.copy(this.keyVector).add(this.pointer);
    if (target.lengthSq() > 1) target.normalize();
    return target;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.canvas.removeEventListener('click', this.onCanvasClick);
  }
}
