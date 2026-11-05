import type * as THREE from 'three';
import { SettingsManager } from './SettingsManager';

export interface ActiveVFXCounts {
  slashArcs: number;
  sparks: number;
  decals: number;
  shockwaves: number;
  particles: number;
}

export interface FrameSample {
  frame: number;
  timestamp: number;
  frameTimeMs: number;
  cpuTimeMs: number;
  renderTimeMs: number;
  fps: number;
  event?: string;
  eventDetails?: Record<string, unknown>;
}

export interface ProfilerSnapshot {
  fps: number;
  avgFps: number;
  frameTimeMs: number;
  avgFrameTimeMs: number;
  onePercentLowFps: number;
  cpuTimeMs: number;
  renderTimeMs: number;
  spikeCount25ms: number;
  spikeCount33ms: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  activeCounts: ActiveVFXCounts;
  usedHeapMb: number | null;
  isRecording: boolean;
  recordedEventsCount: number;
}

export class PerformanceProfiler {
  private static instance: PerformanceProfiler | null = null;

  // Frame timing buffers
  private readonly bufferSize = 180; // 3 seconds @ 60fps
  private readonly frameTimes: number[] = [];
  private readonly cpuTimes: number[] = [];
  private readonly renderTimes: number[] = [];

  // Frame timestamps
  private frameCount = 0;
  private frameStartTime = 0;
  private updateEndTime = 0;

  // Real-time snapshot metrics
  private currentFps = 60;
  private avgFps = 60;
  private currentFrameTimeMs = 16.6;
  private avgFrameTimeMs = 16.6;
  private currentCpuTimeMs = 0;
  private currentRenderTimeMs = 0;
  private currentOnePercentLowFps = 60;
  private spikeCount25ms = 0;
  private spikeCount33ms = 0;

  // Renderer stats
  private lastDrawCalls = 0;
  private lastTriangles = 0;
  private lastGeometries = 0;
  private lastTextures = 0;
  private lastActiveCounts: ActiveVFXCounts = {
    slashArcs: 0,
    sparks: 0,
    decals: 0,
    shockwaves: 0,
    particles: 0,
  };

  // Recording & Events
  public isRecording = false;
  private recordedSamples: FrameSample[] = [];
  private pendingEvent: string | null = null;
  private pendingEventDetails?: Record<string, unknown>;

  public static getInstance(): PerformanceProfiler {
    if (!PerformanceProfiler.instance) {
      PerformanceProfiler.instance = new PerformanceProfiler();
    }
    return PerformanceProfiler.instance;
  }

  public beginFrame(): void {
    this.frameCount++;
    const now = performance.now();
    this.frameStartTime = now;
  }

  public markUpdateEnd(): void {
    this.updateEndTime = performance.now();
  }

  public endFrame(renderer?: THREE.WebGLRenderer, activeCounts?: ActiveVFXCounts): void {
    const now = performance.now();

    const totalFrameTime = Math.max(0.001, now - this.frameStartTime);
    const cpuTime = Math.max(0, this.updateEndTime - this.frameStartTime);
    const renderTime = Math.max(0, now - this.updateEndTime);

    this.currentFrameTimeMs = totalFrameTime;
    this.currentCpuTimeMs = cpuTime;
    this.currentRenderTimeMs = renderTime;
    this.currentFps = Math.min(999, Math.round(1000 / totalFrameTime));

    // Maintain circular buffers
    this.frameTimes.push(totalFrameTime);
    this.cpuTimes.push(cpuTime);
    this.renderTimes.push(renderTime);

    if (this.frameTimes.length > this.bufferSize) {
      this.frameTimes.shift();
      this.cpuTimes.shift();
      this.renderTimes.shift();
    }

    // Spike counters
    if (totalFrameTime > 25) {
      this.spikeCount25ms++;
    }
    if (totalFrameTime > 33.3) {
      this.spikeCount33ms++;
    }

    // Averages and 1% low calculations (calculated every 4 frames to avoid overhead)
    if (this.frameCount % 4 === 0 && this.frameTimes.length > 0) {
      let sum = 0;
      for (let i = 0; i < this.frameTimes.length; i++) {
        sum += this.frameTimes[i];
      }
      this.avgFrameTimeMs = sum / this.frameTimes.length;
      this.avgFps = Math.round(1000 / this.avgFrameTimeMs);

      // 1% Low: 99th percentile frame duration
      const sorted = [...this.frameTimes].sort((a, b) => a - b);
      const p99Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
      const p99Duration = sorted[p99Index];
      this.currentOnePercentLowFps = Math.max(1, Math.round(1000 / Math.max(0.1, p99Duration)));
    }

    // Capture Three.js render metrics if renderer passed
    if (renderer) {
      this.lastDrawCalls = renderer.info.render.calls;
      this.lastTriangles = renderer.info.render.triangles;
      this.lastGeometries = renderer.info.memory.geometries;
      this.lastTextures = renderer.info.memory.textures;
    }

    if (activeCounts) {
      this.lastActiveCounts = activeCounts;
    }

    // If recording active, store sample
    if (this.isRecording) {
      const sample: FrameSample = {
        frame: this.frameCount,
        timestamp: now,
        frameTimeMs: totalFrameTime,
        cpuTimeMs: cpuTime,
        renderTimeMs: renderTime,
        fps: this.currentFps,
      };

      if (this.pendingEvent) {
        sample.event = this.pendingEvent;
        sample.eventDetails = this.pendingEventDetails;
        this.pendingEvent = null;
        this.pendingEventDetails = undefined;
      }

      this.recordedSamples.push(sample);
      // Cap at 3600 frames (~1 minute)
      if (this.recordedSamples.length > 3600) {
        this.recordedSamples.shift();
      }
    } else {
      this.pendingEvent = null;
      this.pendingEventDetails = undefined;
    }
  }

  public markCombatEvent(eventName: string, details?: Record<string, unknown>): void {
    this.pendingEvent = eventName;
    this.pendingEventDetails = details;
  }

  public startRecording(): void {
    this.isRecording = true;
    this.recordedSamples = [];
    this.spikeCount25ms = 0;
    this.spikeCount33ms = 0;
    this.markCombatEvent('RECORDING_STARTED');
  }

  public stopRecording(): void {
    this.isRecording = false;
    this.markCombatEvent('RECORDING_STOPPED');
  }

  public clearStats(): void {
    this.spikeCount25ms = 0;
    this.spikeCount33ms = 0;
    this.frameTimes.length = 0;
    this.cpuTimes.length = 0;
    this.renderTimes.length = 0;
    this.recordedSamples = [];
  }

  public getSnapshot(): ProfilerSnapshot {
    let usedHeapMb: number | null = null;
    if (typeof performance !== 'undefined' && (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory) {
      const bytes = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize;
      usedHeapMb = Math.round((bytes / (1024 * 1024)) * 10) / 10;
    }

    return {
      fps: this.currentFps,
      avgFps: this.avgFps,
      frameTimeMs: Math.round(this.currentFrameTimeMs * 10) / 10,
      avgFrameTimeMs: Math.round(this.avgFrameTimeMs * 10) / 10,
      onePercentLowFps: this.currentOnePercentLowFps,
      cpuTimeMs: Math.round(this.currentCpuTimeMs * 100) / 100,
      renderTimeMs: Math.round(this.currentRenderTimeMs * 100) / 100,
      spikeCount25ms: this.spikeCount25ms,
      spikeCount33ms: this.spikeCount33ms,
      drawCalls: this.lastDrawCalls,
      triangles: this.lastTriangles,
      geometries: this.lastGeometries,
      textures: this.lastTextures,
      activeCounts: this.lastActiveCounts,
      usedHeapMb,
      isRecording: this.isRecording,
      recordedEventsCount: this.recordedSamples.filter((s) => s.event).length,
    };
  }

  public exportReportJSON(): string {
    const settings = SettingsManager.getInstance().data;
    const events = this.recordedSamples.filter((s) => s.event);

    const report = {
      title: 'Ashen Souls Combat Performance Diagnostic Report',
      generatedAt: new Date().toISOString(),
      summary: {
        totalRecordedFrames: this.recordedSamples.length,
        averageFps: this.avgFps,
        onePercentLowFps: this.currentOnePercentLowFps,
        spikesOver25ms: this.spikeCount25ms,
        spikesOver33ms: this.spikeCount33ms,
        drawCalls: this.lastDrawCalls,
        triangles: this.lastTriangles,
        activeSettings: settings,
      },
      events: events.map((e) => ({
        frame: e.frame,
        event: e.event,
        frameTimeMs: e.frameTimeMs,
        cpuTimeMs: e.cpuTimeMs,
        renderTimeMs: e.renderTimeMs,
        details: e.eventDetails,
      })),
      recentSamples: this.recordedSamples.slice(-120),
    };

    return JSON.stringify(report, null, 2);
  }
}
