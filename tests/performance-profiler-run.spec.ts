import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Real-Time Combat Performance Profiler & Stress Test', () => {
  test('records live gameplay with intense VFX and generates detailed performance report', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleLogs.push(`[ERROR] ${msg.text()}`);
    });

    console.log('Navigating to http://127.0.0.1:5188 ...');
    await page.goto('/');
    await expect(page.locator('#game-canvas')).toBeVisible();

    // 1. Wait for match preparation and prewarm to complete
    console.log('Waiting for pre-warm loading sequence to finish...');
    await page.waitForFunction(
      () => {
        const d = window.__THREE_GAME_DIAGNOSTICS__;
        return d && d.assetsLoaded === true && (d.frame ?? 0) > 15;
      },
      { timeout: 20_000 },
    );

    // Hide settings UI if open
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi(true);
    });

    // 2. Start recording profiler session
    console.log('Starting profiler recording...');
    await page.evaluate(() => {
      const profiler = window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.();
      if (profiler) {
        profiler.clearStats();
        profiler.startRecording();
      }
    });

    // 3. Phase 1: Locomotion & Lock-on
    console.log('Phase 1: Locomotion & Lock-on...');
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.().markCombatEvent('PHASE_LOCOMOTION');
    });
    await page.keyboard.press('KeyQ'); // Lock-on
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft'); // Sprint forward
    await page.waitForTimeout(600);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');

    // 4. Phase 2: Dodge roll with i-frames
    console.log('Phase 2: Dodge roll...');
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.().markCombatEvent('PLAYER_DODGE_ROLL');
    });
    await page.keyboard.press('Space');
    await page.waitForTimeout(650);

    // 5. Phase 3: Player 3-Hit Light Attack Combo (Ribbons & Slash VFX)
    console.log('Phase 3: Player 3-Hit Light Combo...');
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.().markCombatEvent('PLAYER_LIGHT_1');
    });
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.().markCombatEvent('PLAYER_LIGHT_2');
    });
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(350);

    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.().markCombatEvent('PLAYER_LIGHT_3_FINISHER');
    });
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(700);

    // 6. Phase 4: Player Heavy Attack (Thrust)
    console.log('Phase 4: Player Heavy Attack...');
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.().markCombatEvent('PLAYER_HEAVY_ATTACK');
    });
    await page.keyboard.press('KeyK');
    await page.waitForTimeout(1100);

    // 7. Phase 5: Boss Downward Cleave & Ground Slam VFX
    console.log('Phase 5: Boss Downward Cleave & Ground Slam Decal...');
    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      if (hooks) {
        hooks.getProfiler?.().markCombatEvent('BOSS_DOWNWARD_CLEAVE');
        hooks.triggerBossAttack?.('downward');
      }
    });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      if (hooks) {
        hooks.getProfiler?.().markCombatEvent('VFX_GROUND_SLAM_IMPACT');
        hooks.triggerGroundSlam?.();
      }
    });
    await page.waitForTimeout(900);

    // 8. Phase 6: Directional Blood Spray & Sparks
    console.log('Phase 6: Directional Blood & Sparks...');
    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (hooks && diag) {
        hooks.getProfiler?.().markCombatEvent('VFX_BLOOD_AND_SPARKS');
        const p = diag.player.position;
        hooks.triggerBloodBurst?.({ x: p.x, y: p.y + 1.2, z: p.z - 1.5 }, { x: 0.5, y: 0.2, z: -0.8 });
        hooks.triggerHitSparks?.({ x: p.x, y: p.y + 1.2, z: p.z - 1.5 }, { x: -0.3, y: 0.7, z: 0.6 });
      }
    });
    await page.waitForTimeout(700);

    // 9. Phase 7: Boss Relentless Flurry Combo
    console.log('Phase 7: Boss Flurry Combo...');
    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      if (hooks) {
        hooks.getProfiler?.().markCombatEvent('BOSS_FLURRY_COMBO');
        hooks.triggerBossAttack?.('combo');
      }
    });
    await page.waitForTimeout(1800);

    // 10. Phase 8: Boss 360 Spin Maelstrom
    console.log('Phase 8: Boss 360 Spin Maelstrom...');
    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      if (hooks) {
        hooks.getProfiler?.().markCombatEvent('BOSS_SPIN_360');
        hooks.triggerBossAttack?.('spin360');
      }
    });
    await page.waitForTimeout(1800);

    // 11. Phase 9: Boss Leaping Wrath Jump Attack
    console.log('Phase 9: Boss Leaping Wrath...');
    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      if (hooks) {
        hooks.getProfiler?.().markCombatEvent('BOSS_LEAPING_WRATH');
        hooks.triggerBossAttack?.('jump');
      }
    });
    await page.waitForTimeout(2200);

    // 12. Phase 10: Extreme Stress VFX Burst (Overlapping particles, decals, ribbons)
    console.log('Phase 10: Extreme Stress Chaos (Multi-VFX Overlap)...');
    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (hooks && diag) {
        hooks.getProfiler?.().markCombatEvent('STRESS_CHAOS_BURST');
        const p = diag.player.position;
        // Trigger multiple overlapping particles
        for (let i = 0; i < 4; i++) {
          hooks.triggerBloodBurst?.({ x: p.x + (i - 2) * 0.4, y: p.y + 1.0, z: p.z - 1.0 }, { x: 0.2 * i, y: 0.5, z: -0.7 });
          hooks.triggerHitSparks?.({ x: p.x + (i - 2) * 0.4, y: p.y + 1.2, z: p.z - 1.0 }, { x: -0.2 * i, y: 0.8, z: 0.5 });
        }
        hooks.triggerGroundSlam?.();
        hooks.triggerBossAttack?.('spin360');
      }
    });
    await page.waitForTimeout(2000);

    // 13. Stop recording and collect data
    console.log('Stopping recording and extracting report...');
    const result = await page.evaluate(() => {
      const profiler = window.__THREE_GAME_TEST_HOOKS__?.getProfiler?.();
      if (!profiler) return null;
      profiler.stopRecording();
      const reportStr = profiler.exportReportJSON();
      const report = JSON.parse(reportStr);
      const samples = profiler.recordedSamples || [];
      const snap = profiler.getSnapshot();
      return { report, samples, snap };
    });

    expect(result).not.toBeNull();
    const { report, samples, snap } = result!;

    // Save report to disk
    const outDir = path.resolve('artifacts/performance');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const reportPath = path.join(outDir, 'combat-stress-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ summary: snap, report, samples }, null, 2));
    console.log(`Report successfully written to ${reportPath}`);

    // Print summary metrics
    console.log('====================================================');
    console.log('COMBAT PERFORMANCE DIAGNOSTIC REPORT:');
    console.log(`Total Recorded Frames: ${samples.length}`);
    console.log(`Average Engine Framerate: ${snap.avgFps} FPS (avg frame work: ${snap.avgFrameTimeMs} ms)`);
    console.log(`1% Low Framerate: ${snap.onePercentLowFps} FPS`);
    console.log(`Spikes > 25ms (< 40 FPS): ${snap.spikeCount25ms}`);
    console.log(`Spikes > 33.3ms (< 30 FPS): ${snap.spikeCount33ms}`);
    console.log(`CPU Logic Time: ${snap.cpuTimeMs} ms`);
    console.log(`WebGL Render Submission Time: ${snap.renderTimeMs} ms`);
    console.log(`Draw Calls: ${snap.drawCalls} | Triangles: ${snap.triangles}`);
    console.log(`JS Heap Memory: ${snap.usedHeapMb ?? 'N/A'} MB`);
    console.log('====================================================');

    // 14. Assert 60 FPS performance thresholds
    expect(snap.avgFps, 'Average engine framerate must be >= 55 FPS').toBeGreaterThanOrEqual(55);
    expect(snap.onePercentLowFps, '1% low framerate must be >= 30 FPS').toBeGreaterThanOrEqual(30);
    expect(snap.spikeCount33ms, 'Spikes > 33.3ms must be <= 5').toBeLessThanOrEqual(5);
    expect(snap.cpuTimeMs, 'CPU frame logic time must be < 14ms').toBeLessThan(14);
  });
});
