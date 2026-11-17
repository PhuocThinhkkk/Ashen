uniform float uProgress;
uniform float uSize;
varying vec2 vUv;

void main() {
  vUv = uv;

  // Standard camera-facing billboard rotation in view space
  vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);

  // Dynamic expansion as impact erupts
  float scale = uSize * (1.0 + uProgress * 0.35);
  mvPosition.xy += position.xy * scale;

  gl_Position = projectionMatrix * mvPosition;
}
