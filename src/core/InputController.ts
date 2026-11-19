import * as THREE from 'three';
import { type CombatInputs } from './types';

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
  private healTriggered = false;
  private jumpTriggered = false;

  // Touch states
  private joystickPointerId: number | null = null;
  private joystickCenter = new THREE.Vector2();
  private touchSprintButton = false;

  // Touch camera look
  private cameraPointerId: number | null = null;
  private lastCameraTouchX = 0;
  private lastCameraTouchY = 0;

  // DOM Elements cached for touch
  private touchStickEl: HTMLElement | null = null;
  private touchKnobEl: HTMLElement | null = null;
  private touchAttackBtn: HTMLElement | null = null;
  private touchHeavyBtn: HTMLElement | null = null;
  private touchDodgeBtn: HTMLElement | null = null;
  private touchLockBtn: HTMLElement | null = null;
  private touchSprintBtn: HTMLElement | null = null;
  private touchHealBtn: HTMLElement | null = null;
  private touchJumpBtn: HTMLElement | null = null;

  // Restart buttons and overlays
  private quickRestartBtn: HTMLElement | null = null;
  private deathRestartBtn: HTMLElement | null = null;
  private victoryRestartBtn: HTMLElement | null = null;
  private deathOverlay: HTMLElement | null = null;
  private victoryOverlay: HTMLElement | null = null;

  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public isPointerLocked = false;

  // Space tap vs hold tracking (Space = tap to roll, hold to run)
  private spacePressed = false;
  private spaceDownTime = 0;
  private spaceHasSprinted = false;

  private isRestartOverlayVisible(): boolean {
    const isDeathVisible = !!this.deathOverlay && !this.deathOverlay.classList.contains('hidden');
    const isVictoryVisible = !!this.victoryOverlay && !this.victoryOverlay.classList.contains('hidden');
    return isDeathVisible || isVictoryVisible;
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      if (!this.spacePressed) {
        this.spacePressed = true;
        this.spaceDownTime = performance.now();
        this.spaceHasSprinted = false;
      }
    } else if (event.code === 'KeyJ') {
      this.lightAttackTriggered = true;
    } else if (event.code === 'KeyK') {
      this.heavyAttackTriggered = true;
    } else if (event.code === 'KeyQ' || event.code === 'Tab') {
      event.preventDefault();
      this.lockOnTriggered = true;
    } else if (event.code === 'KeyY') {
      this.restartTriggered = true;
    } else if (event.code === 'KeyR') {
      if (this.isRestartOverlayVisible()) {
        this.restartTriggered = true;
      } else {
        this.healTriggered = true;
      }
    } else if (event.code === 'KeyE') {
      this.healTriggered = true;
    } else if (event.code === 'KeyF') {
      this.jumpTriggered = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);

    if (event.code === 'Space') {
      event.preventDefault();
      const duration = performance.now() - this.spaceDownTime;
      this.spacePressed = false;
      if (!this.spaceHasSprinted && duration < 300) {
        this.dodgeTriggered = true;
      }
      this.spaceHasSprinted = false;
    }
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

  // Canvas touch look handlers — only fire when the event target IS the canvas
  private readonly onCanvasPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && event.target === this.canvas) {
      if (this.cameraPointerId === null && event.clientX > window.innerWidth * 0.35) {
        this.cameraPointerId = event.pointerId;
        this.lastCameraTouchX = event.clientX;
        this.lastCameraTouchY = event.clientY;
      }
    }
  };

  private readonly onCanvasPointerMove = (event: PointerEvent) => {
    if (event.pointerId === this.cameraPointerId) {
      const dx = event.clientX - this.lastCameraTouchX;
      const dy = event.clientY - this.lastCameraTouchY;
      this.lastCameraTouchX = event.clientX;
      this.lastCameraTouchY = event.clientY;
      this.mouseDeltaX += dx * 1.6;
      this.mouseDeltaY += dy * 1.6;
    }
  };

  private readonly onCanvasPointerUp = (event: PointerEvent) => {
    if (event.pointerId === this.cameraPointerId) {
      this.cameraPointerId = null;
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

    // Canvas touch look
    this.canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    this.canvas.addEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.addEventListener('pointerup', this.onCanvasPointerUp);
    this.canvas.addEventListener('pointercancel', this.onCanvasPointerUp);

    this.initTouchControls();
  }

  private initTouchControls(): void {
    // 1. Joystick
    this.touchStickEl = document.querySelector<HTMLElement>('#touch-stick');
    this.touchKnobEl = document.querySelector<HTMLElement>('#touch-knob');

    if (this.touchStickEl) {
      this.touchStickEl.addEventListener('pointerdown', this.onJoystickPointerDown);
      this.touchStickEl.addEventListener('pointermove', this.onJoystickPointerMove);
      this.touchStickEl.addEventListener('pointerup', this.onJoystickPointerUp);
      this.touchStickEl.addEventListener('pointercancel', this.onJoystickPointerUp);
    }

    // 2. Action buttons
    this.touchAttackBtn = document.querySelector<HTMLElement>('#touch-attack-btn');
    this.touchHeavyBtn = document.querySelector<HTMLElement>('#touch-heavy-btn');
    this.touchDodgeBtn = document.querySelector<HTMLElement>('#touch-dodge-btn');
    this.touchLockBtn = document.querySelector<HTMLElement>('#touch-lock-btn');
    this.touchSprintBtn = document.querySelector<HTMLElement>('#touch-sprint-btn');
    this.touchHealBtn = document.querySelector<HTMLElement>('#touch-heal-btn');
    this.touchJumpBtn = document.querySelector<HTMLElement>('#touch-jump-btn');

    this.bindActionButton(this.touchAttackBtn, () => {
      this.lightAttackTriggered = true;
    });

    this.bindActionButton(this.touchHeavyBtn, () => {
      this.heavyAttackTriggered = true;
    });

    this.bindActionButton(this.touchDodgeBtn, () => {
      this.dodgeTriggered = true;
    });

    this.bindActionButton(this.touchLockBtn, () => {
      this.lockOnTriggered = true;
    });

    this.bindActionButton(this.touchHealBtn, () => {
      this.healTriggered = true;
    });

    this.bindActionButton(this.touchJumpBtn, () => {
      this.jumpTriggered = true;
    });

    if (this.touchSprintBtn) {
      const onSprintStart = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchSprintButton = true;
        this.touchSprintBtn?.classList.add('active');
      };
      const onSprintEnd = () => {
        this.touchSprintButton = false;
        this.touchSprintBtn?.classList.remove('active');
      };
      this.touchSprintBtn.addEventListener('pointerdown', onSprintStart, { passive: false });
      this.touchSprintBtn.addEventListener('touchstart', onSprintStart, { passive: false });
      this.touchSprintBtn.addEventListener('pointerup', onSprintEnd);
      this.touchSprintBtn.addEventListener('pointercancel', onSprintEnd);
      this.touchSprintBtn.addEventListener('pointerleave', onSprintEnd);
      this.touchSprintBtn.addEventListener('touchend', onSprintEnd);
      this.touchSprintBtn.addEventListener('touchcancel', onSprintEnd);
    }

    // 3. Restart triggers (R to play again)
    this.quickRestartBtn = document.querySelector<HTMLElement>('#quick-restart-btn');
    this.deathRestartBtn = document.querySelector<HTMLElement>('#death-restart-btn');
    this.victoryRestartBtn = document.querySelector<HTMLElement>('#victory-restart-btn');
    this.deathOverlay = document.querySelector<HTMLElement>('#death-overlay');
    this.victoryOverlay = document.querySelector<HTMLElement>('#victory-overlay');

    if (this.quickRestartBtn) {
      this.quickRestartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.triggerRestart();
      });
    }

    if (this.deathRestartBtn) {
      this.deathRestartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.triggerRestart();
      });
    }

    if (this.victoryRestartBtn) {
      this.victoryRestartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.triggerRestart();
      });
    }

    // Tapping death or victory banner also restarts
    if (this.deathOverlay) {
      this.deathOverlay.addEventListener('click', () => {
        if (!this.deathOverlay?.classList.contains('hidden')) {
          this.triggerRestart();
        }
      });
    }

    if (this.victoryOverlay) {
      this.victoryOverlay.addEventListener('click', () => {
        if (!this.victoryOverlay?.classList.contains('hidden')) {
          this.triggerRestart();
        }
      });
    }
  }

  private bindActionButton(btn: HTMLElement | null, trigger: () => void): void {
    if (!btn) return;
    let lastTime = 0;
    const onPress = (e: Event) => {
      const now = performance.now();
      if (now - lastTime < 60) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      lastTime = now;
      e.preventDefault();
      e.stopPropagation();
      trigger();
      btn.classList.add('active');
    };
    btn.addEventListener('pointerdown', onPress, { passive: false });
    btn.addEventListener('touchstart', onPress, { passive: false });
    const removeActive = () => btn.classList.remove('active');
    btn.addEventListener('pointerup', removeActive);
    btn.addEventListener('pointercancel', removeActive);
    btn.addEventListener('pointerleave', removeActive);
    btn.addEventListener('touchend', removeActive);
    btn.addEventListener('touchcancel', removeActive);
  }

  private readonly onJoystickPointerDown = (event: PointerEvent) => {
    event.preventDefault();
    this.joystickPointerId = event.pointerId;
    if (this.touchStickEl) {
      try {
        this.touchStickEl.setPointerCapture(event.pointerId);
      } catch {
        // Fallback for browsers that don't support pointer capture
      }
      const rect = this.touchStickEl.getBoundingClientRect();
      this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
      this.updateJoystickPosition(event.clientX, event.clientY);
    }
  };

  private readonly onJoystickPointerMove = (event: PointerEvent) => {
    if (event.pointerId === this.joystickPointerId) {
      event.preventDefault();
      this.updateJoystickPosition(event.clientX, event.clientY);
    }
  };

  private readonly onJoystickPointerUp = (event: PointerEvent) => {
    if (event.pointerId === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.pointer.set(0, 0);
      if (this.touchKnobEl) {
        this.touchKnobEl.style.transform = 'translate(-50%, -50%)';
      }
      if (this.touchStickEl) {
        try {
          this.touchStickEl.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore
        }
      }
    }
  };

  private updateJoystickPosition(clientX: number, clientY: number): void {
    if (!this.touchStickEl || !this.touchKnobEl) return;

    const maxRadius = this.touchStickEl.clientWidth * 0.42;
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const clampedX = Math.cos(angle) * clampedDist;
    const clampedY = Math.sin(angle) * clampedDist;

    this.touchKnobEl.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

    if (maxRadius > 0) {
      const normX = clampedX / maxRadius;
      const normY = clampedY / maxRadius;
      this.pointer.set(normX, normY);
    }
  }

  public triggerRestart(): void {
    this.restartTriggered = true;
  }

  public triggerDodge(): void {
    this.dodgeTriggered = true;
  }

  public triggerLightAttack(): void {
    this.lightAttackTriggered = true;
  }

  public triggerHeavyAttack(): void {
    this.heavyAttackTriggered = true;
  }

  public triggerLockOn(): void {
    this.lockOnTriggered = true;
  }

  public triggerHeal(): void {
    this.healTriggered = true;
  }

  public triggerJump(): void {
    this.jumpTriggered = true;
  }

  public setTouchMove(x: number, y: number): void {
    this.pointer.set(x, y);
    if (this.pointer.lengthSq() > 1) {
      this.pointer.normalize();
    }
  }

  public setTouchSprint(sprint: boolean): void {
    this.touchSprintButton = sprint;
  }

  public readInputs(target: CombatInputs): void {
    // 1. Movement Vector (WASD + Touch Joystick)
    this.keyVector.set(0, 0);
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) this.keyVector.x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) this.keyVector.x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) this.keyVector.y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) this.keyVector.y += 1;

    target.move.copy(this.keyVector).add(this.pointer);
    if (target.move.lengthSq() > 1) {
      target.move.normalize();
    }

    // 2. Sprint (Shift, dedicated SPRINT touch button, or held Space)
    const isSpaceHeldForRun = this.spacePressed && performance.now() - this.spaceDownTime >= 180;
    if (isSpaceHeldForRun) {
      this.spaceHasSprinted = true;
    }

    target.sprint =
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.touchSprintButton ||
      isSpaceHeldForRun;

    // 3. Triggers (consumed upon read)
    target.dodge = this.dodgeTriggered;
    target.lightAttack = this.lightAttackTriggered;
    target.heavyAttack = this.heavyAttackTriggered;
    target.toggleLockOn = this.lockOnTriggered;
    target.restart = this.restartTriggered;
    target.heal = this.healTriggered;
    target.jump = this.jumpTriggered;

    this.dodgeTriggered = false;
    this.lightAttackTriggered = false;
    this.heavyAttackTriggered = false;
    this.lockOnTriggered = false;
    this.restartTriggered = false;
    this.healTriggered = false;
    this.jumpTriggered = false;
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
    this.healTriggered = false;
    this.jumpTriggered = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.spacePressed = false;
    this.spaceDownTime = 0;
    this.spaceHasSprinted = false;
    this.joystickPointerId = null;
    this.touchSprintButton = false;
    this.cameraPointerId = null;

    if (this.touchKnobEl) {
      this.touchKnobEl.style.transform = 'translate(-50%, -50%)';
    }
  }

  public isDashHeld(): boolean {
    return (
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      (this.spacePressed && performance.now() - this.spaceDownTime >= 180) ||
      this.touchSprintButton
    );
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

    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.removeEventListener('pointerup', this.onCanvasPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onCanvasPointerUp);

    if (this.touchStickEl) {
      this.touchStickEl.removeEventListener('pointerdown', this.onJoystickPointerDown);
      this.touchStickEl.removeEventListener('pointermove', this.onJoystickPointerMove);
      this.touchStickEl.removeEventListener('pointerup', this.onJoystickPointerUp);
      this.touchStickEl.removeEventListener('pointercancel', this.onJoystickPointerUp);
    }
  }
}
