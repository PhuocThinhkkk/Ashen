import type * as THREE from 'three';
import type { PlayerCharacter } from '../../entities/PlayerCharacter';
import type { BossCharacter } from '../../entities/BossCharacter';
import type { AudioSystem } from '../../systems/AudioSystem';
import type { PerformanceProfiler } from '../../systems/PerformanceProfiler';

export interface DiagnosticsContext {
  frame: number;
  elapsed: number;
  player: PlayerCharacter;
  boss: BossCharacter;
  audio: AudioSystem;
  profiler: PerformanceProfiler;
  renderer: THREE.WebGLRenderer;
  isReady: boolean;
  halfWidth: number;
  halfHeight: number;
  canvas: HTMLCanvasElement;
  maxDpr: number;
}

export class GameDiagnostics {
  /**
   * [Purpose]: Collects engine, rendering, memory, and combat telemetry into a global window diagnostics object.
   * @condition Executed every frame or after screenshot capture during performance profiling.
   * @param ctx Diagnostics context providing frame count, elapsed time, renderer info, profiler, and entities.
   * @returns Updates window.__THREE_GAME_DIAGNOSTICS__ with real-time FPS, draw calls, and combat metrics.
   */
  public static publish(ctx: DiagnosticsContext): void {
    const info = ctx.renderer.info;
    const snap = ctx.profiler.getSnapshot();

    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: ctx.frame,
      elapsed: ctx.elapsed,
      fps: snap.fps,
      onePercentLowFps: snap.onePercentLowFps,
      frameTimeMs: snap.frameTimeMs,
      audio: ctx.audio.getAudioDiagnostics(),
      player: {
        position: {
          x: ctx.player.group.position.x,
          y: ctx.player.group.position.y,
          z: ctx.player.group.position.z,
        },
        speed: ctx.player.velocity.length(),
        hp: ctx.player.hp,
        stamina: ctx.player.stamina,
        state: ctx.player.state,
        isInvulnerable: ctx.player.isInvulnerable,
        loaded: ctx.player.isLoaded,
        activeClip: ctx.player.currentActionName,
        upperClip: ctx.player.currentUpperActionName,
        lowerClip: ctx.player.currentLowerActionName,
        isGrounded: ctx.player.isGrounded,
        isDrinking: ctx.player.isDrinking,
        isAirborneAttack: ctx.player.isAirborneAttack,
        tiltAngle: ctx.player.currentTiltAngle,
        healCharges: ctx.player.healCharges,
        maxHealCharges: ctx.player.maxHealCharges,
        modelId: ctx.player.modelId,
      },
      boss: {
        position: {
          x: ctx.boss.group.position.x,
          y: ctx.boss.group.position.y,
          z: ctx.boss.group.position.z,
        },
        hp: ctx.boss.hp,
        maxHp: ctx.boss.maxHp,
        state: ctx.boss.state,
        isPhase2: ctx.boss.isPhase2,
        loaded: ctx.boss.isLoaded,
        activeClip: ctx.boss.currentActionName,
        upperClip: ctx.boss.currentUpperActionName,
        lowerClip: ctx.boss.currentLowerActionName,
        turnDirection: ctx.boss.turnDirection,
        modelId: ctx.boss.modelId,
        subgoal: ctx.boss.ai.getCurrentSubgoal()?.type,
        attackCooldown: ctx.boss.ai.attackCooldown,
        strafeDir: ctx.boss.ai.strafeDir,
        locomotionWeights: { ...ctx.boss.currentWeights },
      },
      assetsLoaded: ctx.player.isLoaded && ctx.boss.isLoaded && ctx.isReady,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: Math.round(ctx.halfWidth * 2),
        clientHeight: Math.round(ctx.halfHeight * 2),
        width: ctx.canvas.width,
        height: ctx.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, ctx.maxDpr),
      },
    };
  }
}
