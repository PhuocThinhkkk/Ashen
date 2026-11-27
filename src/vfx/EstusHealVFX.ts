import * as THREE from 'three';
import {
  BatchedRenderer,
  ParticleSystem,
  ConeEmitter,
  SphereEmitter,
  IntervalValue,
  ConstantValue,
  ConstantColor,
  ColorOverLife,
  Gradient,
  SizeOverLife,
  ApplyForce,
  PiecewiseBezier,
  Bezier,
  RenderMode,
  Vector3,
  Vector4,
} from 'three.quarks';
import { VFXTextureFactory } from './VFXTextureFactory';

interface EstusBurstSlot {
  wispPs: ParticleSystem;
  emberPs: ParticleSystem;
  flarePs: ParticleSystem;
  runePs: ParticleSystem;
}

/**
 * Dark Souls Estus-style healing VFX using three.quarks GPU particles + staged CC0 Kenney textures
 * and a warm golden PointLight flash synced to the exact heal frame.
 */
export class EstusHealVFX {
  private pool: EstusBurstSlot[] = [];
  private readonly poolSize = 2;
  private currentIndex = 0;
  private batchRenderer: BatchedRenderer;
  private emitterContainer: THREE.Object3D;

  private wispMaterial: THREE.MeshBasicMaterial;
  private emberMaterial: THREE.MeshBasicMaterial;
  private flareMaterial: THREE.MeshBasicMaterial;
  private runeMaterial: THREE.MeshBasicMaterial;

  private healLight: THREE.PointLight;
  private lightTimer = 0;
  private readonly lightDuration = 0.95;

  constructor(batchRenderer: BatchedRenderer, sceneOrContainer: THREE.Object3D) {
    this.batchRenderer = batchRenderer;
    this.emitterContainer = sceneOrContainer;
    const texFactory = VFXTextureFactory.getInstance();

    this.wispMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getEstusWispTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.emberMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getEstusEmberTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.flareMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getEstusFlareTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.runeMaterial = new THREE.MeshBasicMaterial({
      map: texFactory.getEstusRuneTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Subtle warm golden point light anchored in the scene (intensity 0 until heal fires)
    this.healLight = new THREE.PointLight(0xffaa33, 0, 6.0, 1.8);
    this.emitterContainer.add(this.healLight);

    for (let i = 0; i < this.poolSize; i++) {
      // 1. Rising warm golden Estus wisps around the player's torso
      const wispColor = new ColorOverLife(
        new Gradient(
          [
            [new Vector3(1.0, 0.85, 0.42), 0],
            [new Vector3(1.0, 0.58, 0.12), 0.55],
            [new Vector3(0.7, 0.25, 0.03), 1],
          ],
          [
            [0.0, 0],
            [0.75, 0.18],
            [0.45, 0.65],
            [0.0, 1],
          ],
        ),
      );
      const wispSize = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(0.4, 0.95, 1.15, 0.6), 0]]),
      );
      const wispUpward = new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(2.4));

      const wispPs = new ParticleSystem({
        duration: 1.05,
        looping: false,
        startLife: new IntervalValue(0.55, 0.95),
        startSpeed: new IntervalValue(0.45, 1.15),
        startSize: new IntervalValue(0.28, 0.52),
        startColor: new ConstantColor(new Vector4(1.0, 0.78, 0.28, 0.85)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new ConstantValue(14),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: new ConeEmitter({ radius: 0.34, angle: 0.35 }),
        material: this.wispMaterial,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [wispColor, wispSize, wispUpward],
      });

      // 2. Ascending golden sparks/embers enveloping the body
      const emberColor = new ColorOverLife(
        new Gradient(
          [
            [new Vector3(1.0, 0.96, 0.7), 0],
            [new Vector3(1.0, 0.65, 0.14), 0.6],
            [new Vector3(0.85, 0.32, 0.04), 1],
          ],
          [
            [0.95, 0],
            [0.8, 0.65],
            [0.0, 1],
          ],
        ),
      );
      const emberSize = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(0.6, 1.0, 0.55, 0.1), 0]]),
      );
      const emberRise = new ApplyForce(new Vector3(0, 1, 0), new ConstantValue(3.0));

      const emberPs = new ParticleSystem({
        duration: 1.15,
        looping: false,
        startLife: new IntervalValue(0.6, 1.05),
        startSpeed: new IntervalValue(0.6, 1.6),
        startSize: new IntervalValue(0.08, 0.16),
        startColor: new ConstantColor(new Vector4(1.0, 0.9, 0.5, 1.0)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new ConstantValue(22),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: new SphereEmitter({ radius: 0.48 }),
        material: this.emberMaterial,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [emberColor, emberSize, emberRise],
      });

      // 3. Flask / chest radiant core flare right at the sip moment
      const flareColor = new ColorOverLife(
        new Gradient(
          [
            [new Vector3(1.0, 0.96, 0.78), 0],
            [new Vector3(1.0, 0.68, 0.18), 0.5],
            [new Vector3(0.9, 0.4, 0.05), 1],
          ],
          [
            [0.0, 0],
            [0.95, 0.15],
            [0.0, 1],
          ],
        ),
      );
      const flareSize = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(0.25, 1.15, 0.9, 0.3), 0]]),
      );

      const flarePs = new ParticleSystem({
        duration: 0.55,
        looping: false,
        startLife: new ConstantValue(0.5),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1.05),
        startColor: new ConstantColor(new Vector4(1.0, 0.85, 0.4, 0.95)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new ConstantValue(1),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: new SphereEmitter({ radius: 0.02 }),
        material: this.flareMaterial,
        renderMode: RenderMode.BillBoard,
        worldSpace: true,
        behaviors: [flareColor, flareSize],
      });

      // 4. Subtle golden runic seal pulsing on the sanctuary floor under the player
      const runeColor = new ColorOverLife(
        new Gradient(
          [
            [new Vector3(1.0, 0.82, 0.32), 0],
            [new Vector3(1.0, 0.55, 0.1), 0.6],
            [new Vector3(0.7, 0.28, 0.02), 1],
          ],
          [
            [0.0, 0],
            [0.65, 0.2],
            [0.0, 1],
          ],
        ),
      );
      const runeSize = new SizeOverLife(
        new PiecewiseBezier([[new Bezier(0.55, 0.95, 1.15, 1.25), 0]]),
      );

      const runePs = new ParticleSystem({
        duration: 0.95,
        looping: false,
        startLife: new ConstantValue(0.9),
        startSpeed: new ConstantValue(0),
        startSize: new ConstantValue(1.55),
        startColor: new ConstantColor(new Vector4(1.0, 0.78, 0.25, 0.8)),
        emissionOverTime: new ConstantValue(0),
        emissionBursts: [
          {
            time: 0,
            count: new ConstantValue(1),
            cycle: 1,
            interval: 0.01,
            probability: 1,
          },
        ],
        shape: new SphereEmitter({ radius: 0.01 }),
        material: this.runeMaterial,
        renderMode: RenderMode.HorizontalBillBoard,
        worldSpace: true,
        behaviors: [runeColor, runeSize],
      });

      this.batchRenderer.addSystem(wispPs);
      this.batchRenderer.addSystem(emberPs);
      this.batchRenderer.addSystem(flarePs);
      this.batchRenderer.addSystem(runePs);

      this.emitterContainer.add(wispPs.emitter);
      this.emitterContainer.add(emberPs.emitter);
      this.emitterContainer.add(flarePs.emitter);
      this.emitterContainer.add(runePs.emitter);

      this.pool.push({ wispPs, emberPs, flarePs, runePs });
    }
  }

  public emit(playerBasePos: THREE.Vector3, flaskWorldPos?: THREE.Vector3): void {
    const slot = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.poolSize;

    // 1. Torso rising wisps (tilt cone upward -X 90 deg so ConeEmitter points along +Y)
    slot.wispPs.emitter.position.set(playerBasePos.x, playerBasePos.y + 0.55, playerBasePos.z);
    slot.wispPs.emitter.rotation.set(-Math.PI / 2, 0, 0);
    slot.wispPs.emitter.updateMatrixWorld(true);
    slot.wispPs.restart();

    // 2. Torso ascending golden embers
    slot.emberPs.emitter.position.set(playerBasePos.x, playerBasePos.y + 1.0, playerBasePos.z);
    slot.emberPs.emitter.updateMatrixWorld(true);
    slot.emberPs.restart();

    // 3. Core Estus flare right at the flask / chest
    if (flaskWorldPos) {
      slot.flarePs.emitter.position.copy(flaskWorldPos);
    } else {
      slot.flarePs.emitter.position.set(playerBasePos.x, playerBasePos.y + 1.25, playerBasePos.z);
    }
    slot.flarePs.emitter.updateMatrixWorld(true);
    slot.flarePs.restart();

    // 4. Floor runic halo
    slot.runePs.emitter.position.set(playerBasePos.x, Math.max(0.03, playerBasePos.y + 0.04), playerBasePos.z);
    slot.runePs.emitter.updateMatrixWorld(true);
    slot.runePs.restart();

    // 5. Warm golden flash on knight armor
    this.healLight.position.set(
      playerBasePos.x,
      playerBasePos.y + 1.3,
      playerBasePos.z,
    );
    this.healLight.intensity = 3.6;
    this.lightTimer = this.lightDuration;
  }

  public update(delta: number): void {
    if (this.lightTimer > 0) {
      this.lightTimer = Math.max(0, this.lightTimer - delta);
      const t = this.lightTimer / this.lightDuration;
      // Smooth quadratic falloff matching Estus ember fade
      this.healLight.intensity = 3.6 * t * t;
    } else if (this.healLight.intensity > 0) {
      this.healLight.intensity = 0;
    }
  }

  public getActiveCount(): number {
    let count = 0;
    for (const s of this.pool) {
      if (s.wispPs.emissionState.isBursting || s.emberPs.emissionState.isBursting) {
        count++;
      }
    }
    return count;
  }

  public reset(): void {
    for (const s of this.pool) {
      s.wispPs.restart();
      s.emberPs.restart();
      s.flarePs.restart();
      s.runePs.restart();
    }
    this.currentIndex = 0;
    this.lightTimer = 0;
    this.healLight.intensity = 0;
  }

  public dispose(): void {
    for (const s of this.pool) {
      this.batchRenderer.deleteSystem(s.wispPs);
      this.batchRenderer.deleteSystem(s.emberPs);
      this.batchRenderer.deleteSystem(s.flarePs);
      this.batchRenderer.deleteSystem(s.runePs);

      if (s.wispPs.emitter.parent) s.wispPs.emitter.parent.remove(s.wispPs.emitter);
      if (s.emberPs.emitter.parent) s.emberPs.emitter.parent.remove(s.emberPs.emitter);
      if (s.flarePs.emitter.parent) s.flarePs.emitter.parent.remove(s.flarePs.emitter);
      if (s.runePs.emitter.parent) s.runePs.emitter.parent.remove(s.runePs.emitter);
    }
    this.pool = [];
    if (this.healLight.parent) this.healLight.parent.remove(this.healLight);
    this.wispMaterial.dispose();
    this.emberMaterial.dispose();
    this.flareMaterial.dispose();
    this.runeMaterial.dispose();
  }
}
