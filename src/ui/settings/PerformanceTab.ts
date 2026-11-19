import type { TabRenderContext } from './types';
import type { PerformanceProfiler } from '../../systems/PerformanceProfiler';

export function renderPerformanceTab(ctx: TabRenderContext): void {
  const el = ctx.container;
  const snap = ctx.profiler.getSnapshot();

  el.innerHTML = `
    <div class="settings-section">
      <h3 class="section-title">REAL-TIME DIAGNOSTIC METRICS</h3>
      <p class="section-desc">Independent CPU, WebGL command submission, memory, and stutter metrics.</p>

      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-label">CURRENT FRAMERATE</span>
          <span id="diag-fps" class="metric-val fps-${snap.fps >= 50 ? 'good' : snap.fps >= 30 ? 'warn' : 'bad'}">${snap.fps}</span>
          <span class="metric-sub">Average: <b id="diag-avg-fps">${snap.avgFps}</b> FPS</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">FRAME DURATION</span>
          <span id="diag-frametime" class="metric-val">${snap.frameTimeMs} ms</span>
          <span class="metric-sub">Average: <b id="diag-avg-frametime">${snap.avgFrameTimeMs}</b> ms</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">1% LOW FRAMERATE</span>
          <span id="diag-1pct-low" class="metric-val fps-${snap.onePercentLowFps >= 45 ? 'good' : snap.onePercentLowFps >= 25 ? 'warn' : 'bad'}">${snap.onePercentLowFps}</span>
          <span class="metric-sub">99th percentile worst frames</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">SPIKES (&gt;25ms)</span>
          <span id="diag-spikes" class="metric-val ${snap.spikeCount25ms > 5 ? 'bad' : 'good'}">${snap.spikeCount25ms}</span>
          <span class="metric-sub">&gt;33.3ms: <b id="diag-spikes33">${snap.spikeCount33ms}</b></span>
        </div>

        <div class="metric-card">
          <span class="metric-label">CPU LOGIC TIME</span>
          <span id="diag-cputime" class="metric-val">${snap.cpuTimeMs} ms</span>
          <span class="metric-sub">Transforms, Physics & Kinematics</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">WEBGL SUBMISSION</span>
          <span id="diag-rendertime" class="metric-val">${snap.renderTimeMs} ms</span>
          <span class="metric-sub">Driver Draw Command Buffer</span>
        </div>

        <div class="metric-card">
          <span class="metric-label">DRAW CALLS</span>
          <span id="diag-drawcalls" class="metric-val">${snap.drawCalls}</span>
          <span class="metric-sub">Triangles: <b id="diag-triangles">${snap.triangles.toLocaleString()}</b></span>
        </div>

        <div class="metric-card">
          <span class="metric-label">JS HEAP MEMORY</span>
          <span id="diag-memory" class="metric-val">${snap.usedHeapMb !== null ? `${snap.usedHeapMb} MB` : 'N/A'}</span>
          <span class="metric-sub">Garbage Collection Space</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3 class="section-title">COMBAT EVENT RECORDING & PROFILING</h3>
      <p class="section-desc">Record attacks, hits, ground slams, and dodge rolls to pinpoint exact frame-time spikes.</p>

      <div class="profiler-controls">
        <button id="btn-toggle-record" class="btn-action ${snap.isRecording ? 'recording' : ''}">
          ${ctx.icons.RECORD} <span>${snap.isRecording ? 'HALT RECORDING' : 'RECORD SESSION'}</span>
        </button>
        <button id="btn-clear-stats" class="btn-util">${ctx.icons.CLEAR} <span>PURGE STATS</span></button>
        <button id="btn-export-json" class="btn-util">${ctx.icons.EXPORT} <span>EXPORT JSON</span></button>
      </div>

      <div id="profiler-status-banner" class="profiler-banner ${snap.isRecording ? 'active' : ''}">
        ${snap.isRecording ? 'TELEMETRY SESSION ACTIVE — Perform attacks, clashes and rolls in arena...' : 'Ready to capture combat performance session.'}
      </div>
    </div>

    <div class="settings-section diagnostic-notes">
      <h4 class="notes-title">DIAGNOSTIC ARCHITECTURE & HARDWARE CONSTRAINTS</h4>
      <p>• <b>CPU vs GPU Timings:</b> In WebGL 2.0, direct on-chip GPU rasterization timestamps (EXT_disjoint_timer_query) are disabled across modern browsers for security reasons. Metrics above reflect precise JavaScript CPU time and WebGL driver submission.</p>
      <p>• <b>Hitstop Time Dilation:</b> Clashes trigger intentional simulation time dilation (0.15x) for visceral impact weight. The renderer and camera continue updating at full framerate.</p>
    </div>
  `;

  // Bind Profiler Actions
  const recordBtn = el.querySelector<HTMLButtonElement>('#btn-toggle-record');
  recordBtn?.addEventListener('click', () => {
    if (ctx.profiler.isRecording) {
      ctx.profiler.stopRecording();
    } else {
      ctx.profiler.startRecording();
    }
    ctx.renderCurrentTab();
  });

  const clearBtn = el.querySelector<HTMLButtonElement>('#btn-clear-stats');
  clearBtn?.addEventListener('click', () => {
    ctx.profiler.clearStats();
    ctx.renderCurrentTab();
  });

  const exportBtn = el.querySelector<HTMLButtonElement>('#btn-export-json');
  exportBtn?.addEventListener('click', () => {
    const json = ctx.profiler.exportReportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `souls-combat-performance-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function updateTelemetryValues(container: HTMLElement | null, profiler: PerformanceProfiler): void {
  if (!container) return;
  const snap = profiler.getSnapshot();
  const setVal = (id: string, val: string | number) => {
    const target = container.querySelector<HTMLElement>(`#${id}`);
    if (target) target.textContent = String(val);
  };

  setVal('diag-fps', snap.fps);
  setVal('diag-avg-fps', snap.avgFps);
  setVal('diag-frametime', `${snap.frameTimeMs} ms`);
  setVal('diag-avg-frametime', snap.avgFrameTimeMs);
  setVal('diag-1pct-low', snap.onePercentLowFps);
  setVal('diag-spikes', snap.spikeCount25ms);
  setVal('diag-spikes33', snap.spikeCount33ms);
  setVal('diag-cputime', `${snap.cpuTimeMs} ms`);
  setVal('diag-rendertime', `${snap.renderTimeMs} ms`);
  setVal('diag-drawcalls', snap.drawCalls);
  setVal('diag-triangles', snap.triangles.toLocaleString());
  if (snap.usedHeapMb !== null) setVal('diag-memory', `${snap.usedHeapMb} MB`);
}
