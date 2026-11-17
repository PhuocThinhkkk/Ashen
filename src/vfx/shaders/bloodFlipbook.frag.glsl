uniform sampler2D uTexture;
uniform float uProgress;
uniform vec2 uGrid; // vec2(columns, rows), e.g. vec2(1.0, 1.0)
varying vec2 vUv;

void main() {
  vec2 frameUv = vUv;

  if (uGrid.x > 1.0 || uGrid.y > 1.0) {
    float totalFrames = uGrid.x * uGrid.y;
    float currentFrame = floor(clamp(uProgress, 0.0, 0.999) * totalFrames);
    float col = mod(currentFrame, uGrid.x);
    float row = floor(currentFrame / uGrid.x);
    frameUv = (vUv + vec2(col, (uGrid.y - 1.0) - row)) / uGrid;
  }

  vec4 texColor = texture2D(uTexture, frameUv);
  float fade = 1.0 - smoothstep(0.65, 1.0, uProgress);
  float alpha = texColor.a * fade;

  if (alpha < 0.02) discard;

  // If texture is already colored red (blood_splat_1.png), preserve rich natural color;
  // If grayscale/white fallback, apply arterial crimson tint.
  vec3 color = texColor.rgb;
  if (color.r <= color.g + 0.1) {
    color = vec3(0.65, 0.04, 0.04) * color.r;
  }

  gl_FragColor = vec4(color, alpha);
}
