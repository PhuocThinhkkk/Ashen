uniform float uProgress;
varying vec2 vUv;

void main() {
  float distFromCenter = abs(vUv.y - 0.5) * 2.0;
  float taper = mix(0.95, 0.40, vUv.x);

  // Jagged liquid shear
  float tendril = sin(vUv.y * 32.0 + vUv.x * 16.0) * 0.55 + cos(vUv.y * 48.0 - vUv.x * 24.0) * 0.45;
  float cohesion = smoothstep(0.38, 0.04, vUv.x);
  float streamMask = mix(tendril, 0.75, cohesion);

  float edgeOffset = distFromCenter - (streamMask * 0.32 * vUv.x);
  float liquidEdge = smoothstep(taper, taper - 0.04, edgeOffset);

  // Dissolve & fade
  float rootDissolve = smoothstep(uProgress * 0.72, uProgress * 0.72 + 0.14, vUv.x);
  float fade = 1.0 - smoothstep(0.62, 1.0, uProgress);

  float alpha = liquidEdge * rootDissolve * fade;
  if (alpha < 0.02) discard;

  vec3 coreColor = vec3(0.55, 0.02, 0.02);
  vec3 rimColor = vec3(0.20, 0.005, 0.005);
  vec3 finalColor = mix(coreColor, rimColor, distFromCenter);

  gl_FragColor = vec4(finalColor, alpha * 0.96);
}
