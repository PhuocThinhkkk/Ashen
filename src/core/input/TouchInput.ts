import * as THREE from 'three';

export interface TouchTriggers {
  dodge: boolean;
  lightAttack: boolean;
  heavyAttack: boolean;
  lockOn: boolean;
  heal: boolean;
  jump: boolean;
  restart: boolean;
}

export class TouchInput {
  public joystickVector = new THREE.Vector2();
  public touchCameraDeltaX = 0;
  public touchCameraDeltaY = 0;
  public isSprinting = false;

  private joystickPointerId: number | null = null;
  private joystickCenter = new THREE.Vector2();

  private cameraPointerId: number | null = null;
  private lastCameraTouchX = 0;
  private lastCameraTouchY = 0;

  private touchStickEl: HTMLElement | null = null;
  private touchKnobEl: HTMLElement | null = null;

  public triggers: TouchTriggers = {
    dodge: false,
    lightAttack: false,
    heavyAttack: false,
    lockOn: false,
    heal: false,
    jump: false,
    restart: false,
  };

  private boundOnJoystickPointerDown: (e: PointerEvent) => void;
  private boundOnJoystickPointerMove: (e: PointerEvent) => void;
  private boundOnJoystickPointerUp: (e: PointerEvent) => void;
  private boundOnTouchStart: (e: TouchEvent) => void;
  private boundOnTouchMove: (e: TouchEvent) => void;
  private boundOnTouchEnd: (e: TouchEvent) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.boundOnJoystickPointerDown = this.onJoystickPointerDown.bind(this);
    this.boundOnJoystickPointerMove = this.onJoystickPointerMove.bind(this);
    this.boundOnJoystickPointerUp = this.onJoystickPointerUp.bind(this);
    this.boundOnTouchStart = this.onTouchStart.bind(this);
    this.boundOnTouchMove = this.onTouchMove.bind(this);
    this.boundOnTouchEnd = this.onTouchEnd.bind(this);

    this.initControls();
  }

  private initControls(): void {
    this.touchStickEl = document.querySelector<HTMLElement>('#touch-stick');
    this.touchKnobEl = document.querySelector<HTMLElement>('#touch-knob');

    if (this.touchStickEl) {
      this.touchStickEl.addEventListener('pointerdown', this.boundOnJoystickPointerDown);
      this.touchStickEl.addEventListener('pointermove', this.boundOnJoystickPointerMove);
      this.touchStickEl.addEventListener('pointerup', this.boundOnJoystickPointerUp);
      this.touchStickEl.addEventListener('pointercancel', this.boundOnJoystickPointerUp);
    }

    this.bindActionBtn('#touch-attack-btn', () => (this.triggers.lightAttack = true));
    this.bindActionBtn('#touch-heavy-btn', () => (this.triggers.heavyAttack = true));
    this.bindActionBtn('#touch-dodge-btn', () => (this.triggers.dodge = true));
    this.bindActionBtn('#touch-lock-btn', () => (this.triggers.lockOn = true));
    this.bindActionBtn('#touch-heal-btn', () => (this.triggers.heal = true));
    this.bindActionBtn('#touch-jump-btn', () => (this.triggers.jump = true));

    const sprintBtn = document.querySelector<HTMLElement>('#touch-sprint-btn');
    if (sprintBtn) {
      const onSprintStart = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.isSprinting = true;
        sprintBtn.classList.add('active');
      };
      const onSprintEnd = () => {
        this.isSprinting = false;
        sprintBtn.classList.remove('active');
      };
      sprintBtn.addEventListener('pointerdown', onSprintStart, { passive: false });
      sprintBtn.addEventListener('touchstart', onSprintStart, { passive: false });
      sprintBtn.addEventListener('pointerup', onSprintEnd);
      sprintBtn.addEventListener('pointercancel', onSprintEnd);
      sprintBtn.addEventListener('pointerleave', onSprintEnd);
      sprintBtn.addEventListener('touchend', onSprintEnd);
      sprintBtn.addEventListener('touchcancel', onSprintEnd);
    }

    // Touch camera look
    this.canvas.addEventListener('touchstart', this.boundOnTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.boundOnTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.boundOnTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this.boundOnTouchEnd, { passive: false });
  }

  private bindActionBtn(selector: string, onTrigger: () => void): void {
    const btn = document.querySelector<HTMLElement>(selector);
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
      onTrigger();
      btn.classList.add('active');
    };

    btn.addEventListener('pointerdown', onPress, { passive: false });
    btn.addEventListener('touchstart', onPress, { passive: false });
    const onRelease = () => btn.classList.remove('active');
    btn.addEventListener('pointerup', onRelease);
    btn.addEventListener('pointercancel', onRelease);
    btn.addEventListener('pointerleave', onRelease);
    btn.addEventListener('touchend', onRelease);
    btn.addEventListener('touchcancel', onRelease);
  }

  private onJoystickPointerDown(e: PointerEvent): void {
    if (this.joystickPointerId !== null) return;
    this.joystickPointerId = e.pointerId;
    this.touchStickEl?.setPointerCapture(e.pointerId);

    const rect = this.touchStickEl?.getBoundingClientRect();
    if (rect) {
      this.joystickCenter.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    this.updateJoystick(e.clientX, e.clientY);
  }

  private onJoystickPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.joystickPointerId) return;
    this.updateJoystick(e.clientX, e.clientY);
  }

  private onJoystickPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.joystickPointerId) return;
    this.joystickPointerId = null;
    this.joystickVector.set(0, 0);
    if (this.touchKnobEl) {
      this.touchKnobEl.style.transform = `translate(0px, 0px)`;
    }
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const maxRadius = 45;
    const dx = clientX - this.joystickCenter.x;
    const dy = clientY - this.joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1) {
      this.joystickVector.set(0, 0);
      if (this.touchKnobEl) this.touchKnobEl.style.transform = `translate(0px, 0px)`;
      return;
    }

    const clampedDist = Math.min(dist, maxRadius);
    const normX = dx / dist;
    const normY = dy / dist;

    if (this.touchKnobEl) {
      this.touchKnobEl.style.transform = `translate(${normX * clampedDist}px, ${normY * clampedDist}px)`;
    }

    const intensity = clampedDist / maxRadius;
    this.joystickVector.set(normX * intensity, -normY * intensity);
  }

  private onTouchStart(e: TouchEvent): void {
    if (this.cameraPointerId !== null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX > window.innerWidth * 0.4) {
        this.cameraPointerId = touch.identifier;
        this.lastCameraTouchX = touch.clientX;
        this.lastCameraTouchY = touch.clientY;
        break;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === this.cameraPointerId) {
        const dx = touch.clientX - this.lastCameraTouchX;
        const dy = touch.clientY - this.lastCameraTouchY;
        this.touchCameraDeltaX += dx * 1.8;
        this.touchCameraDeltaY += dy * 1.8;
        this.lastCameraTouchX = touch.clientX;
        this.lastCameraTouchY = touch.clientY;
        break;
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.cameraPointerId) {
        this.cameraPointerId = null;
        break;
      }
    }
  }

  public consumeTriggers(triggers: TouchTriggers): void {
    triggers.dodge = this.triggers.dodge;
    triggers.lightAttack = this.triggers.lightAttack;
    triggers.heavyAttack = this.triggers.heavyAttack;
    triggers.lockOn = this.triggers.lockOn;
    triggers.heal = this.triggers.heal;
    triggers.jump = this.triggers.jump;
    triggers.restart = this.triggers.restart;

    this.triggers.dodge = false;
    this.triggers.lightAttack = false;
    this.triggers.heavyAttack = false;
    this.triggers.lockOn = false;
    this.triggers.heal = false;
    this.triggers.jump = false;
    this.triggers.restart = false;
  }

  public consumeCameraDelta(out: THREE.Vector2): void {
    out.set(this.touchCameraDeltaX, this.touchCameraDeltaY);
    this.touchCameraDeltaX = 0;
    this.touchCameraDeltaY = 0;
  }

  public reset(): void {
    this.joystickPointerId = null;
    this.joystickVector.set(0, 0);
    this.cameraPointerId = null;
    this.touchCameraDeltaX = 0;
    this.touchCameraDeltaY = 0;
    this.isSprinting = false;
    this.triggers.dodge = false;
    this.triggers.lightAttack = false;
    this.triggers.heavyAttack = false;
    this.triggers.lockOn = false;
    this.triggers.heal = false;
    this.triggers.jump = false;
    this.triggers.restart = false;
    if (this.touchKnobEl) {
      this.touchKnobEl.style.transform = `translate(0px, 0px)`;
    }
  }

  public dispose(): void {
    if (this.touchStickEl) {
      this.touchStickEl.removeEventListener('pointerdown', this.boundOnJoystickPointerDown);
      this.touchStickEl.removeEventListener('pointermove', this.boundOnJoystickPointerMove);
      this.touchStickEl.removeEventListener('pointerup', this.boundOnJoystickPointerUp);
      this.touchStickEl.removeEventListener('pointercancel', this.boundOnJoystickPointerUp);
    }
    this.canvas.removeEventListener('touchstart', this.boundOnTouchStart);
    this.canvas.removeEventListener('touchmove', this.boundOnTouchMove);
    this.canvas.removeEventListener('touchend', this.boundOnTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.boundOnTouchEnd);
  }
}
