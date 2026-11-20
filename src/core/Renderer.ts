import * as THREE from 'three';
import { isMobileDevice } from '../systems/SettingsManager';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const isMobile = isMobileDevice();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isMobile, // Disable MSAA 4x on mobile to avoid GPU bandwidth & VRAM saturation
    alpha: false,
    powerPreference: 'high-performance',
    precision: isMobile ? 'mediump' : 'highp',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('[Renderer] WebGL context lost. Attempting recovery...');
  });

  return renderer;
}

export function resizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  maxDpr = 2,
): boolean {
  const canvas = renderer.domElement;
  const width = Math.max(1, Math.floor(canvas.clientWidth));
  const height = Math.max(1, Math.floor(canvas.clientHeight));
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const bufferWidth = Math.floor(width * dpr);
  const bufferHeight = Math.floor(height * dpr);
  const needsResize = canvas.width !== bufferWidth || canvas.height !== bufferHeight;

  if (needsResize) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  return needsResize;
}
