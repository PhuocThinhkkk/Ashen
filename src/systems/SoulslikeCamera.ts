import * as THREE from 'three';

export interface CameraConfig {
  defaultDistance: number;
  minDistance: number;
  maxDistance: number;
  minPitch: number;
  maxPitch: number;
  mouseSensitivity: number;
  followLag: number;
}

const DEFAULT_CONFIG: CameraConfig = {
  defaultDistance: 4.6,
  minDistance: 2.8,
  maxDistance: 7.5,
  minPitch: -0.15, // slightly looking up
  maxPitch: 1.15,  // looking down
  mouseSensitivity: 0.0022,
  followLag: 0.12,
};

export class SoulslikeCamera {
  public yaw = 0;
  public pitch = 0.26; // ~15 degrees down
  public distance = DEFAULT_CONFIG.defaultDistance;

  public isLockedOn = false;
  private lockedTarget: THREE.Vector3 | null = null;

  private readonly focus = new THREE.Vector3();
  private readonly targetFocus = new THREE.Vector3();
  private readonly currentPos = new THREE.Vector3();
  private readonly desiredPos = new THREE.Vector3();

  private shakeIntensity = 0;
  private shakeDecay = 7.0;

  constructor(
    public readonly camera: THREE.PerspectiveCamera,
    private readonly config: CameraConfig = DEFAULT_CONFIG,
  ) {
    this.camera.fov = 48;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();
  }

  public setLockedTarget(target: THREE.Vector3 | null): void {
    this.lockedTarget = target;
    this.isLockedOn = target !== null;
  }

  public toggleLockOn(target: THREE.Vector3): boolean {
    if (this.isLockedOn) {
      this.isLockedOn = false;
      this.lockedTarget = null;
      return false;
    } else {
      this.isLockedOn = true;
      this.lockedTarget = target;
      return true;
    }
  }

  public handleMouseMove(movementX: number, movementY: number): void {
    if (this.isLockedOn) return; // Free look locked to target during lock-on

    this.yaw -= movementX * this.config.mouseSensitivity;
    this.pitch += movementY * this.config.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.config.minPitch, this.config.maxPitch);
  }

  public addShake(intensity: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  public snapTo(playerPos: THREE.Vector3, arenaRadius = 20.5): void {
    this.focus.set(playerPos.x, playerPos.y + 1.25, playerPos.z);
    this.distance = this.config.defaultDistance;

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    this.desiredPos.set(
      this.focus.x + this.distance * cosPitch * sinYaw,
      this.focus.y + this.distance * sinPitch,
      this.focus.z + this.distance * cosPitch * cosYaw,
    );
    this.desiredPos.y = Math.max(this.desiredPos.y, 0.65);

    const maxCamR = arenaRadius - 1.2;
    const rDistSq = this.desiredPos.x * this.desiredPos.x + this.desiredPos.z * this.desiredPos.z;
    if (rDistSq > maxCamR * maxCamR) {
      const rDist = Math.sqrt(rDistSq);
      this.desiredPos.x = (this.desiredPos.x / rDist) * maxCamR;
      this.desiredPos.z = (this.desiredPos.z / rDist) * maxCamR;
    }

    this.currentPos.copy(this.desiredPos);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.focus);
  }

  public update(delta: number, playerPos: THREE.Vector3, arenaRadius = 20.5): void {
    // 1. Calculate Target Focus Point
    if (this.isLockedOn && this.lockedTarget) {
      // Focus between player and boss, slightly biased towards player
      this.targetFocus.set(
        playerPos.x * 0.65 + this.lockedTarget.x * 0.35,
        playerPos.y + 1.35,
        playerPos.z * 0.65 + this.lockedTarget.z * 0.35,
      );

      // Lock-on yaw tracks direction towards target
      const dx = this.lockedTarget.x - playerPos.x;
      const dz = this.lockedTarget.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const targetYaw = Math.atan2(-dx, -dz);

      // Smoothly interpolate yaw to target angle
      let diff = targetYaw - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1.0, delta * 8.0);

      // Dynamic distance and pitch based on range
      const targetDist = THREE.MathUtils.clamp(4.2 + dist * 0.22, 4.0, this.config.maxDistance);
      this.distance = THREE.MathUtils.lerp(this.distance, targetDist, delta * 4.0);
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0.28, delta * 3.0);
    } else {
      // Free third-person follow
      this.targetFocus.set(playerPos.x, playerPos.y + 1.25, playerPos.z);
      this.distance = THREE.MathUtils.lerp(this.distance, this.config.defaultDistance, delta * 3.0);
    }

    // Smooth focus tracking
    const followSmoothing = 1 - Math.exp(-delta / Math.max(0.001, this.config.followLag));
    this.focus.lerp(this.targetFocus, followSmoothing);

    // 2. Compute Desired Camera Position from Spherical Coordinates
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    this.desiredPos.set(
      this.focus.x + this.distance * cosPitch * sinYaw,
      this.focus.y + this.distance * sinPitch,
      this.focus.z + this.distance * cosPitch * cosYaw,
    );

    // Prevent clipping through floor
    this.desiredPos.y = Math.max(this.desiredPos.y, 0.65);

    // Prevent clipping outside arena boundary
    const maxCamR = arenaRadius - 1.2;
    const rDistSq = this.desiredPos.x * this.desiredPos.x + this.desiredPos.z * this.desiredPos.z;
    if (rDistSq > maxCamR * maxCamR) {
      const rDist = Math.sqrt(rDistSq);
      this.desiredPos.x = (this.desiredPos.x / rDist) * maxCamR;
      this.desiredPos.z = (this.desiredPos.z / rDist) * maxCamR;
    }

    // Smooth camera motion
    this.currentPos.lerp(this.desiredPos, followSmoothing * 1.2);
    this.camera.position.copy(this.currentPos);

    // 3. Screen Shake Feedback
    if (this.shakeIntensity > 0.001) {
      const shakeX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      const shakeY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - delta * this.shakeDecay);
    }

    this.camera.lookAt(this.focus);
  }

  public getForwardVector(target: THREE.Vector3): THREE.Vector3 {
    target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    return target;
  }

  public getRightVector(target: THREE.Vector3): THREE.Vector3 {
    target.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
    return target;
  }
}
