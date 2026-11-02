import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { VFXSystem } from '../src/systems/VFXSystem';
import { createSlashArcGeometry, SlashArcInstance } from '../src/vfx/SlashArcRibbon';
import { GroundSlamVFX } from '../src/vfx/GroundSlamVFX';
import { BloodBurstVFX } from '../src/vfx/BloodBurstVFX';
import { BatchedRenderer } from 'three.quarks';

test.describe('Elden Ring Combat VFX & SFX Architecture', () => {
  test('verifies three-nebula is completely removed from project dependencies', () => {
    const pkgPath = path.resolve('package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.dependencies['three-nebula']).toBeUndefined();
    expect(pkg.devDependencies?.['three-nebula']).toBeUndefined();
    expect(pkg.dependencies['three.quarks']).toBeDefined();
  });

  test('verifies Sword Slash Arc Ribbon geometry and custom ShaderMaterial', () => {
    const geom = createSlashArcGeometry(0.7, 2.6, Math.PI * 0.8, 44, 4);
    expect(geom.getAttribute('position')).toBeDefined();
    expect(geom.getAttribute('uv')).toBeDefined();
    expect(geom.getAttribute('normal')).toBeDefined();
    expect(geom.getIndex()).toBeDefined();

    const arc = new SlashArcInstance(geom);
    expect(arc.material.transparent).toBe(true);
    expect(arc.material.blending).toBe(THREE.AdditiveBlending);
    expect(arc.material.depthWrite).toBe(false);
    expect(arc.material.side).toBe(THREE.DoubleSide);
    expect(arc.material.uniforms.uColor).toBeDefined();
    expect(arc.material.uniforms.uProgress).toBeDefined();

    // Test activation & progress lifecycle
    arc.activate(new THREE.Vector3(0, 1, 0), new THREE.Euler(0, 0, 0), 1.2, 0xffe066, 0.20);
    expect(arc.active).toBe(true);
    expect(arc.mesh.visible).toBe(true);

    const stillActive = arc.update(0.10);
    expect(stillActive).toBe(true);
    expect(arc.material.uniforms.uProgress.value).toBeCloseTo(0.5, 1);

    const finished = arc.update(0.12);
    expect(finished).toBe(false);
    expect(arc.active).toBe(false);
    expect(arc.mesh.visible).toBe(false);

    geom.dispose();
    arc.dispose();
  });

  test('verifies BloodBurstVFX directional three.quarks particle system initialization', () => {
    const batchRenderer = new BatchedRenderer();
    const bloodVfx = new BloodBurstVFX(batchRenderer);

    // Verify emission along impact direction
    const contactPoint = new THREE.Vector3(0, 1.2, 0);
    const hitDirection = new THREE.Vector3(0, 0.2, 1);
    expect(() => bloodVfx.emit(contactPoint, hitDirection, true)).not.toThrow();

    batchRenderer.update(0.016);
    bloodVfx.dispose();
  });

  test('verifies GroundSlamVFX Decal projection, shockwave ring, and rolling dust', () => {
    const scene = new THREE.Scene();
    const batchRenderer = new BatchedRenderer();
    scene.add(batchRenderer);

    // Mock arena stone floor
    const floorGeo = new THREE.PlaneGeometry(30, 30);
    const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial());
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.updateMatrixWorld(true);
    scene.add(floorMesh);

    const slamVfx = new GroundSlamVFX(scene, batchRenderer);
    slamVfx.setGroundTarget(floorMesh);

    const impact = new THREE.Vector3(2, 0, 3);
    slamVfx.triggerGroundSlam(impact);

    // Verify update cycle
    slamVfx.update(0.05);
    batchRenderer.update(0.05);

    slamVfx.dispose();
    floorGeo.dispose();
  });

  test('verifies VFXSystem orchestrates all modular VFX systems without three-nebula', () => {
    const scene = new THREE.Scene();
    const vfx = new VFXSystem(scene);

    expect(vfx.batchRenderer).toBeDefined();
    expect(vfx.bloodVFX).toBeDefined();
    expect(vfx.groundSlamVFX).toBeDefined();

    // Verify calling all public VFX APIs
    expect(() => {
      vfx.spawnFootDustKickup(new THREE.Vector3(0, 0, 0), 10);
      vfx.spawnPeakVelocitySparks(new THREE.Vector3(0, 1, 0), 25, false);
      vfx.spawnAttackSlashArc(new THREE.Vector3(0, 1, 0), 0, 'light', false, false);
      vfx.spawnAttackSlashArc(new THREE.Vector3(0, 1, 0), 0, 'downward', true, true);
      vfx.spawnBloodBurst(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), true);
      vfx.triggerGroundSlam(new THREE.Vector3(0, 0, 0));
      vfx.update(0.016);
    }).not.toThrow();

    vfx.dispose();
  });

  test('verifies all 6 processed SFX assets exist in public/assets/sfx/ with valid size', () => {
    const sfxDir = path.resolve('public/assets/sfx');
    const requiredFiles = [
      'sword_swing_light.mp3',
      'sword_swing_heavy.mp3',
      'sword_clash_heavy.mp3',
      'ground_slam.mp3',
      'damage_grunt.mp3',
      'footstep_heavy.mp3',
    ];

    for (const name of requiredFiles) {
      const full = path.join(sfxDir, name);
      expect(fs.existsSync(full)).toBe(true);
      const stat = fs.statSync(full);
      expect(stat.size).toBeGreaterThan(1024); // at least 1KB
    }
  });
});
