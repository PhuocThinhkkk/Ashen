import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const ARTIFACTS_DIR = path.resolve('artifacts/vfx-validation');

function ensureArtifactsDir() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
}

/**
 * Compares two PNG buffers and computes the number of changed pixels
 * with color delta above threshold in the specified bounding box region.
 */
function computePixelDifference(
  bufBefore: Buffer,
  bufAfter: Buffer,
  region?: { minX: number; maxX: number; minY: number; maxY: number },
): { changedPixels: number; totalSampled: number; maxDelta: number } {
  const imgA = PNG.sync.read(bufBefore);
  const imgB = PNG.sync.read(bufAfter);

  const width = Math.min(imgA.width, imgB.width);
  const height = Math.min(imgA.height, imgB.height);

  const rMinX = region ? Math.floor(region.minX * width) : 0;
  const rMaxX = region ? Math.floor(region.maxX * width) : width;
  const rMinY = region ? Math.floor(region.minY * height) : 0;
  const rMaxY = region ? Math.floor(region.maxY * height) : height;

  let changedPixels = 0;
  let totalSampled = 0;
  let maxDelta = 0;

  for (let y = rMinY; y < rMaxY; y++) {
    for (let x = rMinX; x < rMaxX; x++) {
      totalSampled++;
      const idx = (y * width + x) * 4;
      const dr = Math.abs(imgA.data[idx] - imgB.data[idx]);
      const dg = Math.abs(imgA.data[idx + 1] - imgB.data[idx + 1]);
      const db = Math.abs(imgA.data[idx + 2] - imgB.data[idx + 2]);
      const delta = dr + dg + db;
      if (delta > maxDelta) maxDelta = delta;

      // Noticeable color change
      if (delta > 20) {
        changedPixels++;
      }
    }
  }

  return { changedPixels, totalSampled, maxDelta };
}

test.describe('VFX Visual Regression & Animation Capture', () => {
  test.beforeAll(() => {
    ensureArtifactsDir();
  });

  test('captures and verifies blood, ground slam, and sparks VFX mid-action animation frames', async ({
    page,
  }) => {
    test.setTimeout(90000);
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

    console.log('Navigating to / ...');
    await page.goto('/');
    await expect(page.locator('#game-canvas')).toBeVisible();

    console.log('Waiting for diagnostics frame > 15 ...');
    // Wait for encounter initialization and prewarm to complete
    await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 15, {
      timeout: 30000,
    });
    console.log('Game frame ready!');

    // Close settings/debug modals
    await page.evaluate(() => {
      window.__THREE_GAME_TEST_HOOKS__?.hideDebugUi(true);
    });

    const canvas = page.locator('#game-canvas');

    // -------------------------------------------------------------------------
    // 1. DIRECTIONAL BLOOD BURST & GROUND DECALS
    // -------------------------------------------------------------------------
    // Frame before blood trigger
    const beforeBloodBuf = await canvas.screenshot();

    // Trigger directional blood impact burst in front of the camera view
    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (hooks?.triggerBloodBurst && diag) {
        const p = diag.player.position;
        hooks.triggerBloodBurst(
          { x: p.x + 0.3, y: p.y + 1.2, z: p.z - 2.0 },
          { x: -0.7, y: 0.6, z: -0.4 },
        );
      }
    });

    // Capture Peak Arterial Spray (+80ms)
    await page.waitForTimeout(80);
    const bloodPeakBuf = await canvas.screenshot();
    const bloodPeakPath = path.join(ARTIFACTS_DIR, 'vfx-blood-peak.png');
    fs.writeFileSync(bloodPeakPath, bloodPeakBuf);

    // Pixel sanity assertion: verify particles visibly changed canvas pixels
    const bloodDiff = computePixelDifference(beforeBloodBuf, bloodPeakBuf, {
      minX: 0.25,
      maxX: 0.75,
      minY: 0.20,
      maxY: 0.85,
    });
    expect(
      bloodDiff.changedPixels,
      `Blood burst particles must visibly render. Changed pixels: ${bloodDiff.changedPixels}`,
    ).toBeGreaterThan(15);

    // Capture Ground Splat Settling (+240ms)
    await page.waitForTimeout(240);
    const bloodSplatBuf = await canvas.screenshot();
    const bloodSplatPath = path.join(ARTIFACTS_DIR, 'vfx-blood-splat.png');
    fs.writeFileSync(bloodSplatPath, bloodSplatBuf);

    // Wait for blood burst to dissipate before next effect
    await page.waitForTimeout(450);

    // -------------------------------------------------------------------------
    // 2. METALLIC HIT SPARKS & LINGERING EMBERS
    // -------------------------------------------------------------------------
    const beforeSparksBuf = await canvas.screenshot();

    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (hooks?.triggerHitSparks && diag) {
        const p = diag.player.position;
        hooks.triggerHitSparks(
          { x: p.x - 0.3, y: p.y + 1.2, z: p.z - 2.0 },
          { x: 0.8, y: 0.7, z: -0.3 },
        );
      }
    });

    // Capture Sparks Clash Peak (+60ms)
    await page.waitForTimeout(60);
    const sparksClashBuf = await canvas.screenshot();
    const sparksClashPath = path.join(ARTIFACTS_DIR, 'vfx-sparks-clash.png');
    fs.writeFileSync(sparksClashPath, sparksClashBuf);

    const sparksDiff = computePixelDifference(beforeSparksBuf, sparksClashBuf, {
      minX: 0.30,
      maxX: 0.70,
      minY: 0.20,
      maxY: 0.80,
    });
    expect(
      sparksDiff.changedPixels,
      `Hit sparks must visibly render. Changed pixels: ${sparksDiff.changedPixels}`,
    ).toBeGreaterThan(100);

    await page.waitForTimeout(450);

    // -------------------------------------------------------------------------
    // 3. HEAVY GROUND SLAM: DUST RING, SHOCKWAVE & 3D PEBBLES
    // -------------------------------------------------------------------------
    const beforeSlamBuf = await canvas.screenshot();

    await page.evaluate(() => {
      const hooks = window.__THREE_GAME_TEST_HOOKS__;
      const diag = window.__THREE_GAME_DIAGNOSTICS__;
      if (hooks?.triggerGroundSlam && diag) {
        const p = diag.player.position;
        // Slam right in front of the camera view
        hooks.triggerGroundSlam({ x: p.x, y: 0.05, z: p.z - 2.4 });
      }
    });

    // Capture Shockwave & Initial Impact (+80ms)
    await page.waitForTimeout(80);
    const slamImpactBuf = await canvas.screenshot();
    const slamImpactPath = path.join(ARTIFACTS_DIR, 'vfx-slam-impact.png');
    fs.writeFileSync(slamImpactPath, slamImpactBuf);

    const slamDiff = computePixelDifference(beforeSlamBuf, slamImpactBuf, {
      minX: 0.15,
      maxX: 0.85,
      minY: 0.30,
      maxY: 0.95,
    });
    expect(
      slamDiff.changedPixels,
      `Ground slam shockwave must visibly render. Changed pixels: ${slamDiff.changedPixels}`,
    ).toBeGreaterThan(300);

    // Capture Billowing Dust Ring & Flying Pebbles (+260ms)
    await page.waitForTimeout(260);
    const slamBillowBuf = await canvas.screenshot();
    const slamBillowPath = path.join(ARTIFACTS_DIR, 'vfx-slam-billow.png');
    fs.writeFileSync(slamBillowPath, slamBillowBuf);

    // Verify all 5 files exist with non-trivial size
    const expectedFiles = [
      bloodPeakPath,
      bloodSplatPath,
      sparksClashPath,
      slamImpactPath,
      slamBillowPath,
    ];

    for (const filePath of expectedFiles) {
      expect(fs.existsSync(filePath), `Expected artifact ${filePath} to exist`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size, `Expected artifact ${filePath} to have content`).toBeGreaterThan(10000);
    }
  });
});
