import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SoulslikeCamera } from '../../systems/SoulslikeCamera';
import { InputController } from '../../core/InputController';
import { CONFIG } from '../config';
import type { CameraPreset } from '../types';

export class AssetTestCameraManager {
  public readonly camera: THREE.PerspectiveCamera;
  public readonly controls: OrbitControls;
  public readonly soulslikeCamera: SoulslikeCamera;
  public readonly inputController: InputController;

  public isRoamMode = false;
  private readonly tempScreenVec = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly onRoamModeChange?: (roam: boolean) => void,
  ) {
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.copy(CONFIG.camera.initialPos);
    this.camera.lookAt(CONFIG.camera.initialTarget);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(CONFIG.camera.initialTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 35;
    this.controls.minDistance = 1;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05;

    this.soulslikeCamera = new SoulslikeCamera(this.camera);
    this.inputController = new InputController(canvas);
  }

  public setCamera(preset: CameraPreset): void {
    if (preset === 'roam') {
      this.setRoamMode(true);
      return;
    }
    this.setRoamMode(false);

    const cfg = CONFIG.camera.presets[preset] || CONFIG.camera.presets.reset;
    this.camera.position.copy(cfg.pos);
    this.controls.target.copy(cfg.target);
    this.controls.update();
  }

  public setRoamMode(enabled: boolean, playerPos?: THREE.Vector3): void {
    this.isRoamMode = enabled;
    if (this.isRoamMode) {
      this.controls.enabled = false;
      if (playerPos) {
        this.soulslikeCamera.snapTo(playerPos);
      }
    } else {
      this.controls.enabled = true;
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.soulslikeCamera.setLockedTarget(null);
    }
    this.onRoamModeChange?.(this.isRoamMode);
  }

  public projectToScreen(pos: THREE.Vector3, heightOffset = 0): { x: number; y: number } {
    this.tempScreenVec.copy(pos);
    this.tempScreenVec.y += heightOffset;
    this.tempScreenVec.project(this.camera);
    const x = (this.tempScreenVec.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-(this.tempScreenVec.y * 0.5) + 0.5) * window.innerHeight;
    return { x, y };
  }

  public update(): void {
    if (!this.isRoamMode) {
      this.controls.update();
    }
  }

  public handleResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
