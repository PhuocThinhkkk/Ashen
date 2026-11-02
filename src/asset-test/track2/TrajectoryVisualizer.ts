import * as THREE from 'three';
import { CONFIG } from '../config';

export class TrajectoryVisualizer {
  public isVisible = true;

  private readonly playerTrajLine: THREE.Line;
  private readonly playerTrailPoints: THREE.Vector3[] = [];
  private readonly playerStartMarker: THREE.Mesh;

  private readonly bossTrajLine: THREE.Line;
  private readonly bossTrailPoints: THREE.Vector3[] = [];
  private readonly bossStartMarker: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    // 1. Stage Floor Markers
    const track1Geo = new THREE.RingGeometry(2.1, 2.2, 48);
    const track1Mat = new THREE.MeshBasicMaterial({
      color: 0x7a5e2a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const track1Ring = new THREE.Mesh(track1Geo, track1Mat);
    track1Ring.rotation.x = -Math.PI / 2;
    track1Ring.position.copy(CONFIG.track1.markerCenter);
    scene.add(track1Ring);

    // Track 2 Combat Lane Plane
    const laneGeo = new THREE.PlaneGeometry(CONFIG.track2.laneWidth, CONFIG.track2.laneLength);
    const laneMat = new THREE.MeshBasicMaterial({
      color: 0x223249,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const lanePlane = new THREE.Mesh(laneGeo, laneMat);
    lanePlane.rotation.x = -Math.PI / 2;
    lanePlane.position.copy(CONFIG.track2.laneCenter);
    scene.add(lanePlane);

    // Track 2 Player Home Ring (Gold)
    const playerHomeGeo = new THREE.RingGeometry(0.55, 0.65, 32);
    const playerHomeMat = new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide });
    const playerHomeRing = new THREE.Mesh(playerHomeGeo, playerHomeMat);
    playerHomeRing.rotation.x = -Math.PI / 2;
    playerHomeRing.position.set(CONFIG.track2.playerHome.x, 0.02, CONFIG.track2.playerHome.z);
    scene.add(playerHomeRing);

    // Track 2 Boss Home Ring (Crimson)
    const bossHomeGeo = new THREE.RingGeometry(0.85, 0.95, 32);
    const bossHomeMat = new THREE.MeshBasicMaterial({ color: 0xff3333, side: THREE.DoubleSide });
    const bossHomeRing = new THREE.Mesh(bossHomeGeo, bossHomeMat);
    bossHomeRing.rotation.x = -Math.PI / 2;
    bossHomeRing.position.set(CONFIG.track2.bossHome.x, 0.02, CONFIG.track2.bossHome.z);
    scene.add(bossHomeRing);

    // 2. Start Ghost Markers
    const ghostPlayerGeo = new THREE.RingGeometry(0.25, 0.45, 24);
    const ghostPlayerMat = new THREE.MeshBasicMaterial({
      color: 0xffe680,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    this.playerStartMarker = new THREE.Mesh(ghostPlayerGeo, ghostPlayerMat);
    this.playerStartMarker.rotation.x = -Math.PI / 2;
    this.playerStartMarker.visible = false;
    scene.add(this.playerStartMarker);

    const ghostBossGeo = new THREE.RingGeometry(0.5, 0.75, 24);
    const ghostBossMat = new THREE.MeshBasicMaterial({
      color: 0xff6666,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    this.bossStartMarker = new THREE.Mesh(ghostBossGeo, ghostBossMat);
    this.bossStartMarker.rotation.x = -Math.PI / 2;
    this.bossStartMarker.visible = false;
    scene.add(this.bossStartMarker);

    // 3. Dynamic Floor Trajectory Lines
    const playerTrajMat = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 2 });
    this.playerTrajLine = new THREE.Line(new THREE.BufferGeometry(), playerTrajMat);
    scene.add(this.playerTrajLine);

    const bossTrajMat = new THREE.LineBasicMaterial({ color: 0xff4422, linewidth: 2 });
    this.bossTrajLine = new THREE.Line(new THREE.BufferGeometry(), bossTrajMat);
    scene.add(this.bossTrajLine);
  }

  private updateLine(line: THREE.Line, points: THREE.Vector3[]): void {
    if (points.length < 2) {
      line.visible = false;
      return;
    }
    line.visible = this.isVisible;
    const pos = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      pos[i * 3] = points[i].x;
      pos[i * 3 + 1] = points[i].y;
      pos[i * 3 + 2] = points[i].z;
    }
    line.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    line.geometry = geo;
  }

  public startPlayerAction(pos: THREE.Vector3): void {
    this.playerTrailPoints.length = 0;
    this.playerTrailPoints.push(new THREE.Vector3(pos.x, 0.03, pos.z));
    this.updateLine(this.playerTrajLine, this.playerTrailPoints);
    this.playerStartMarker.position.set(pos.x, 0.025, pos.z);
    this.playerStartMarker.visible = this.isVisible;
  }

  public recordPlayerPoint(pos: THREE.Vector3): void {
    if (!this.isVisible) return;
    const last = this.playerTrailPoints[this.playerTrailPoints.length - 1];
    if (!last || pos.distanceTo(last) > 0.05) {
      this.playerTrailPoints.push(new THREE.Vector3(pos.x, 0.03, pos.z));
      this.updateLine(this.playerTrajLine, this.playerTrailPoints);
    }
  }

  public startBossAction(pos: THREE.Vector3): void {
    this.bossTrailPoints.length = 0;
    this.bossTrailPoints.push(new THREE.Vector3(pos.x, 0.03, pos.z));
    this.updateLine(this.bossTrajLine, this.bossTrailPoints);
    this.bossStartMarker.position.set(pos.x, 0.025, pos.z);
    this.bossStartMarker.visible = this.isVisible;
  }

  public recordBossPoint(pos: THREE.Vector3): void {
    if (!this.isVisible) return;
    const last = this.bossTrailPoints[this.bossTrailPoints.length - 1];
    if (!last || pos.distanceTo(last) > 0.05) {
      this.bossTrailPoints.push(new THREE.Vector3(pos.x, 0.03, pos.z));
      this.updateLine(this.bossTrajLine, this.bossTrailPoints);
    }
  }

  public clear(): void {
    this.playerTrailPoints.length = 0;
    this.bossTrailPoints.length = 0;
    this.playerTrajLine.geometry.dispose();
    this.playerTrajLine.geometry = new THREE.BufferGeometry();
    this.playerTrajLine.visible = false;
    this.bossTrajLine.geometry.dispose();
    this.bossTrajLine.geometry = new THREE.BufferGeometry();
    this.bossTrajLine.visible = false;
    this.playerStartMarker.visible = false;
    this.bossStartMarker.visible = false;
  }

  public toggleVisibility(visible?: boolean): boolean {
    this.isVisible = visible !== undefined ? visible : !this.isVisible;
    this.playerTrajLine.visible = this.isVisible && this.playerTrailPoints.length >= 2;
    this.bossTrajLine.visible = this.isVisible && this.bossTrailPoints.length >= 2;
    this.playerStartMarker.visible = this.isVisible && this.playerTrailPoints.length > 0;
    this.bossStartMarker.visible = this.isVisible && this.bossTrailPoints.length > 0;
    return this.isVisible;
  }
}
