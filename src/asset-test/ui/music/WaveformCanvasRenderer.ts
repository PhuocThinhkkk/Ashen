/**
 * Pure canvas waveform renderer for audio visualizer inspectors.
 */
export class WaveformCanvasRenderer {
  public static renderWaveform(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    buffer: AudioBuffer | null,
    playheadProgress = 0,
    accentColor = '#ffd700',
  ): void {
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = '#111116';
    ctx.fillRect(0, 0, width, height);

    if (!buffer) {
      ctx.fillStyle = '#555566';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NO AUDIO LOADED', width / 2, height / 2 + 4);
      return;
    }

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.fillStyle = accentColor;
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }

    // Playhead line
    if (playheadProgress > 0 && playheadProgress <= 1) {
      const px = Math.floor(playheadProgress * width);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px, 0, 2, height);
    }
  }
}
