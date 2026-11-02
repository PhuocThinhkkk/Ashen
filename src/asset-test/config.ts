import * as THREE from 'three';

export const CONFIG = {
  arena: {
    radius: 26.0,
    floorRadius: 28.0,
    gridSize: 56.0,
  },
  track1: {
    playerPos: new THREE.Vector3(0.6, 0, -1.2),
    bossPos: new THREE.Vector3(0.6, 0, 1.4),
    markerCenter: new THREE.Vector3(0.6, 0.015, 0),
  },
  track2: {
    playerHome: new THREE.Vector3(4.8, 0, -2.0),
    bossHome: new THREE.Vector3(4.8, 0, 2.0),
    laneCenter: new THREE.Vector3(4.8, 0.012, 0),
    laneWidth: 3.6,
    laneLength: 8.5,
  },
  camera: {
    initialPos: new THREE.Vector3(2.7, 4.0, 10.2),
    initialTarget: new THREE.Vector3(2.7, 1.2, 0),
    presets: {
      player: { pos: new THREE.Vector3(0.6, 1.8, 2.2), target: new THREE.Vector3(0.6, 1.0, -1.2) },
      boss: { pos: new THREE.Vector3(0.6, 2.2, 5.5), target: new THREE.Vector3(0.6, 1.3, 1.4) },
      both: { pos: new THREE.Vector3(0.6, 2.2, 6.0), target: new THREE.Vector3(0.6, 1.2, 0) },
      duel: { pos: new THREE.Vector3(9.5, 3.2, 4.0), target: new THREE.Vector3(4.8, 1.2, 0) },
      side: { pos: new THREE.Vector3(11.2, 1.5, 0), target: new THREE.Vector3(4.8, 1.2, 0) },
      overview: { pos: new THREE.Vector3(2.7, 6.5, 12.5), target: new THREE.Vector3(2.7, 1.2, 0) },
      reset: { pos: new THREE.Vector3(0.6, 2.2, 6.0), target: new THREE.Vector3(0.6, 1.2, 0) },
    },
  },
};
