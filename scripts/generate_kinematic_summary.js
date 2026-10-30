#!/usr/bin/env node
/**
 * scripts/generate_kinematic_summary.js
 * Kinematic Analyzer and Summary Generator for Three.js / Mixamo Animation Pipeline.
 *
 * Reads raw frame-by-frame JSON dumps from `local_anim_dumps/`, computes
 * kinematic metrics (velocity, acceleration, spatial deltas, peak impacts),
 * groups frames into state-machine phases (Windup, Airborne, Impact, Recovery),
 * and serializes a lightweight `kinematic_summary.json` for AI reporting and runtime tuning.
 *
 * Usage:
 *   node scripts/generate_kinematic_summary.js
 *   node scripts/generate_kinematic_summary.js --input local_anim_dumps --output kinematic_summary.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  let inputDir = path.resolve(PROJECT_ROOT, 'local_anim_dumps');
  let outputFile = path.resolve(PROJECT_ROOT, 'kinematic_summary.json');

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--input' || args[i] === '-i') && i + 1 < args.length) {
      inputDir = path.resolve(PROJECT_ROOT, args[i + 1]);
      i++;
    } else if ((args[i] === '--output' || args[i] === '-o') && i + 1 < args.length) {
      outputFile = path.resolve(PROJECT_ROOT, args[i + 1]);
      i++;
    }
  }

  return { inputDir, outputFile };
}

function round(val, decimals = 1) {
  if (typeof val !== 'number' || Number.isNaN(val)) return 0;
  const factor = 10 ** decimals;
  const rounded = Math.round(val * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

class KinematicSummaryAnalyzer {
  constructor(dumpData) {
    this.data = dumpData;
    this.fps = Number(dumpData.fps) || 30.0;
    this.dt = 1.0 / this.fps;
    this.frames = dumpData.frames || [];
    this.totalFrames = this.frames.length;
    this.rootMotion = dumpData.root_motion || {};
    this.validation = dumpData.mixamo_validation || {};
    this.fileName = dumpData.file_name || 'unknown.fbx';
    this.actionName = dumpData.action_name || 'Action';
  }

  analyze() {
    if (this.totalFrames === 0) {
      return {
        file_name: this.fileName,
        action_name: this.actionName,
        mixamo_validation: {
          is_valid: false,
          hierarchy_detected: 'none',
        },
        total_frames: 0,
        fps: this.fps,
        root_motion: {
          type: 'In-Place',
          delta_y_meters: 0.0,
          delta_x_meters: 0.0,
        },
        calculated_phases: [],
      };
    }

    const firstFrame = this.frames[0];
    const baseHipsPos = firstFrame.bones['mixamorig:Hips']?.translation || [0, 0, 1.0];
    const baseZ = baseHipsPos[2];

    const frameMetrics = [];
    let maxHandSpeed = 0;
    let maxHandSpeedFrame = 1;
    let maxRFootSpeed = 0;
    let maxRFootSpeedFrame = 1;
    let maxLFootSpeed = 0;
    let maxLFootSpeedFrame = 1;

    let minHipsZ = Infinity;
    let minHipsZFrame = 1;
    let maxHipsZ = -Infinity;
    let maxHipsZFrame = 1;

    for (let i = 0; i < this.frames.length; i++) {
      const cur = this.frames[i];
      const prev = i > 0 ? this.frames[i - 1] : cur;

      // Hips
      const hipsCur = cur.bones['mixamorig:Hips']?.translation || [0, 0, 0];
      const hipsPrev = prev.bones['mixamorig:Hips']?.translation || hipsCur;
      const hipsZ = hipsCur[2];
      const hipsDeltaZ = hipsZ - baseZ;

      if (hipsZ < minHipsZ) {
        minHipsZ = hipsZ;
        minHipsZFrame = cur.frame;
      }
      if (hipsZ > maxHipsZ) {
        maxHipsZ = hipsZ;
        maxHipsZFrame = cur.frame;
      }

      const hipsVx = (hipsCur[0] - hipsPrev[0]) / this.dt;
      const hipsVy = (hipsCur[1] - hipsPrev[1]) / this.dt;
      const hipsVz = (hipsCur[2] - hipsPrev[2]) / this.dt;
      const hipsSpeed = Math.hypot(hipsVx, hipsVy, hipsVz);

      // RightHand
      const rHandCur = cur.bones['mixamorig:RightHand']?.translation || [0, 0, 0];
      const rHandPrev = prev.bones['mixamorig:RightHand']?.translation || rHandCur;
      const rHandVx = (rHandCur[0] - rHandPrev[0]) / this.dt;
      const rHandVy = (rHandCur[1] - rHandPrev[1]) / this.dt;
      const rHandVz = (rHandCur[2] - rHandPrev[2]) / this.dt;
      const rHandSpeed = Math.hypot(rHandVx, rHandVy, rHandVz);

      if (rHandSpeed > maxHandSpeed) {
        maxHandSpeed = rHandSpeed;
        maxHandSpeedFrame = cur.frame;
      }

      // RightFoot
      const rFootCur = cur.bones['mixamorig:RightFoot']?.translation || [0, 0, 0];
      const rFootPrev = prev.bones['mixamorig:RightFoot']?.translation || rFootCur;
      const rFootVx = (rFootCur[0] - rFootPrev[0]) / this.dt;
      const rFootVy = (rFootCur[1] - rFootPrev[1]) / this.dt;
      const rFootVz = (rFootCur[2] - rFootPrev[2]) / this.dt;
      const rFootSpeed = Math.hypot(rFootVx, rFootVy, rFootVz);

      if (rFootSpeed > maxRFootSpeed) {
        maxRFootSpeed = rFootSpeed;
        maxRFootSpeedFrame = cur.frame;
      }

      // LeftFoot
      const lFootCur = cur.bones['mixamorig:LeftFoot']?.translation || [0, 0, 0];
      const lFootPrev = prev.bones['mixamorig:LeftFoot']?.translation || lFootCur;
      const lFootVx = (lFootCur[0] - lFootPrev[0]) / this.dt;
      const lFootVy = (lFootCur[1] - lFootPrev[1]) / this.dt;
      const lFootVz = (lFootCur[2] - lFootPrev[2]) / this.dt;
      const lFootSpeed = Math.hypot(lFootVx, lFootVy, lFootVz);

      if (lFootSpeed > maxLFootSpeed) {
        maxLFootSpeed = lFootSpeed;
        maxLFootSpeedFrame = cur.frame;
      }

      frameMetrics.push({
        frame: cur.frame,
        hipsPos: hipsCur,
        hipsDeltaZ,
        hipsVelocity: [hipsVx, hipsVy, hipsVz],
        hipsSpeed,
        rHandPos: rHandCur,
        rHandVelocity: [rHandVx, rHandVy, rHandVz],
        rHandSpeed,
        rFootPos: rFootCur,
        rFootVelocity: [rFootVx, rFootVy, rFootVz],
        rFootSpeed,
        lFootPos: lFootCur,
        lFootVelocity: [lFootVx, lFootVy, lFootVz],
        lFootSpeed,
      });
    }

    // Accelerations
    for (let i = 0; i < frameMetrics.length; i++) {
      const prev = i > 0 ? frameMetrics[i - 1] : frameMetrics[i];
      frameMetrics[i].rHandAccel = (frameMetrics[i].rHandSpeed - prev.rHandSpeed) / this.dt;
      frameMetrics[i].rFootAccel = (frameMetrics[i].rFootSpeed - prev.rFootSpeed) / this.dt;
      frameMetrics[i].lFootAccel = (frameMetrics[i].lFootSpeed - prev.lFootSpeed) / this.dt;
    }

    const lowerName = this.fileName.toLowerCase();
    const isExplicitLocomotion = /(walk|run|strafe)/.test(lowerName);
    const isExplicitKick = lowerName.includes('kick');

    // Identify dominant kicking foot if applicable
    let bestFootName = 'RightFoot';
    let bestFootSpeed = maxRFootSpeed;
    let bestFootFrame = maxRFootSpeedFrame;
    if (maxLFootSpeed > maxRFootSpeed) {
      bestFootName = 'LeftFoot';
      bestFootSpeed = maxLFootSpeed;
      bestFootFrame = maxLFootSpeedFrame;
    }

    const isAirborneAction = (maxHipsZ - baseZ) > 0.45;
    const isDodgeRoll = lowerName.includes('roll') || lowerName.includes('dodge') || (minHipsZ - baseZ) < -0.50;
    const isKick = !isDodgeRoll && (isExplicitKick || (!isExplicitLocomotion && bestFootSpeed > 6.5 && bestFootSpeed > maxHandSpeed * 1.25));

    const strikeBoneName = isKick ? bestFootName : 'RightHand';
    const strikeMaxSpeed = isKick ? bestFootSpeed : maxHandSpeed;
    const strikePeakFrame = isKick ? bestFootFrame : maxHandSpeedFrame;

    const isLocomotion = isExplicitLocomotion || (!isAirborneAction && !isDodgeRoll && !isKick && strikeMaxSpeed < 6.0 && (bestFootSpeed > 3.0 || this.rootMotion.is_root_motion));
    const isAttackAction = !isLocomotion && !isDodgeRoll && (isKick || strikeMaxSpeed >= 6.5 || isAirborneAction);
    const isHitReaction = !isAttackAction && !isLocomotion && !isDodgeRoll && lowerName.includes('impact');

    const calculated_phases = this.segmentPhases({
      frameMetrics,
      baseZ,
      minHipsZ,
      minHipsZFrame,
      maxHipsZ,
      maxHipsZFrame,
      strikeBoneName,
      strikeMaxSpeed,
      strikePeakFrame,
      isAirborneAction,
      isDodgeRoll,
      isAttackAction,
      isLocomotion,
      isHitReaction,
    });

    const hierarchyDetected = this.validation.is_valid ? 'mixamorig' : (this.validation.root_bone || 'none');
    const isRootMotion = Boolean(this.rootMotion.is_root_motion);

    return {
      file_name: this.fileName,
      action_name: this.actionName,
      mixamo_validation: {
        is_valid: Boolean(this.validation.is_valid),
        hierarchy_detected: hierarchyDetected,
      },
      total_frames: this.totalFrames,
      fps: Math.round(this.fps),
      root_motion: {
        type: isRootMotion ? 'Root Motion' : 'In-Place',
        delta_y_meters: round(this.rootMotion.delta_y || 0.0, 1),
        delta_x_meters: round(this.rootMotion.delta_x || 0.0, 1),
      },
      calculated_phases,
    };
  }

  segmentPhases(ctx) {
    const {
      frameMetrics,
      baseZ,
      minHipsZ,
      maxHipsZ,
      strikeBoneName,
      strikeMaxSpeed,
      strikePeakFrame,
      isAirborneAction,
      isDodgeRoll,
      isAttackAction,
      isLocomotion,
      isHitReaction,
    } = ctx;

    const N = this.totalFrames;
    const startF = frameMetrics[0].frame;
    const endF = frameMetrics[N - 1].frame;

    // --- CASE 1: JUMP ATTACK / AIRBORNE COMBAT ---
    if (isAirborneAction) {
      let airStartIdx = frameMetrics.findIndex((m) => m.hipsDeltaZ >= 0.45);
      if (airStartIdx === -1) airStartIdx = Math.floor(N * 0.25);
      const airStartF = frameMetrics[airStartIdx].frame;

      const peakIdx = frameMetrics.findIndex((m) => m.frame === strikePeakFrame);
      const impactStartIdx = Math.max(airStartIdx + 1, Math.min(peakIdx - 3, Math.floor(N * 0.45)));
      const impactEndIdx = Math.min(N - 5, Math.max(impactStartIdx + 4, peakIdx + 4));

      const impactStartF = frameMetrics[impactStartIdx].frame;
      const impactEndF = frameMetrics[impactEndIdx].frame;

      const windupMetrics = frameMetrics.slice(0, airStartIdx);
      const minWindupZ = windupMetrics.reduce((acc, m) => Math.min(acc, m.hipsDeltaZ), 0.0);
      const avgWindupVy =
        windupMetrics.length > 0
          ? windupMetrics.reduce((acc, m) => acc + m.rHandVelocity[1], 0) / windupMetrics.length
          : -1.0;
      const handVyDir = avgWindupVy < 0 ? 'negative Y' : 'positive Y';

      return [
        {
          phase_type: 'Windup',
          start_frame: startF,
          end_frame: airStartF - 1,
          metrics: {
            hips_z_drop_meters: round(minWindupZ, 1),
            dominant_hand_velocity_direction: handVyDir,
          },
        },
        {
          phase_type: 'Airborne',
          start_frame: airStartF,
          end_frame: impactStartF - 1,
          metrics: {
            hips_max_z_meters: round(maxHipsZ - baseZ, 2),
            hips_y_velocity_state: 'constant',
          },
        },
        {
          phase_type: 'Impact',
          start_frame: impactStartF,
          end_frame: impactEndF,
          metrics: {
            peak_velocity_bone: strikeBoneName,
            peak_velocity_ms: round(strikeMaxSpeed, 1),
            peak_velocity_frame: strikePeakFrame,
            deceleration_profile: 'abrupt stop',
          },
        },
        {
          phase_type: 'Recovery',
          start_frame: impactEndF + 1,
          end_frame: endF,
          metrics: {
            velocity_state: 'stabilizes',
            posture_trend: 'returning to neutral stance',
          },
        },
      ];
    }

    // --- CASE 2: GROUND ATTACK / MELEE STRIKE / KICK ---
    if (isAttackAction || ctx.isAttackAction) {
      const getStrikeSpeed = (m) => {
        if (strikeBoneName === 'LeftFoot') return m.lFootSpeed;
        if (strikeBoneName === 'RightFoot') return m.rFootSpeed;
        return m.rHandSpeed;
      };
      const getStrikeVy = (m) => {
        if (strikeBoneName === 'LeftFoot') return m.lFootVelocity[1];
        if (strikeBoneName === 'RightFoot') return m.rFootVelocity[1];
        return m.rHandVelocity[1];
      };

      const peakIdx = frameMetrics.findIndex((m) => m.frame === strikePeakFrame);

      let impactStartIdx = Math.max(0, peakIdx - 1);
      while (
        impactStartIdx > 1 &&
        getStrikeSpeed(frameMetrics[impactStartIdx]) > strikeMaxSpeed * 0.45 &&
        peakIdx - impactStartIdx < 12
      ) {
        impactStartIdx--;
      }
      if (impactStartIdx < 1) impactStartIdx = Math.max(1, Math.floor(peakIdx * 0.7));

      let impactEndIdx = Math.min(N - 1, peakIdx + 1);
      while (
        impactEndIdx < N - 2 &&
        getStrikeSpeed(frameMetrics[impactEndIdx]) > strikeMaxSpeed * 0.35 &&
        impactEndIdx - peakIdx < 10
      ) {
        impactEndIdx++;
      }
      if (impactEndIdx >= N - 1) impactEndIdx = Math.min(N - 2, peakIdx + 4);

      const impactStartF = frameMetrics[impactStartIdx].frame;
      const impactEndF = frameMetrics[impactEndIdx].frame;

      const windupSlice = frameMetrics.slice(0, impactStartIdx);
      const minWindupZ = windupSlice.reduce((acc, m) => Math.min(acc, m.hipsDeltaZ), 0.0);
      const avgVy =
        windupSlice.length > 0
          ? windupSlice.reduce((acc, m) => acc + getStrikeVy(m), 0) / windupSlice.length
          : -0.5;
      const vyDir = avgVy < 0 ? 'negative Y' : 'positive Y';

      const phases = [];
      if (impactStartF > startF) {
        phases.push({
          phase_type: 'Windup',
          start_frame: startF,
          end_frame: impactStartF - 1,
          metrics: {
            hips_z_drop_meters: round(minWindupZ, 1),
            dominant_hand_velocity_direction: vyDir,
          },
        });
      }

      phases.push({
        phase_type: 'Impact',
        start_frame: impactStartF,
        end_frame: impactEndF,
        metrics: {
          peak_velocity_bone: strikeBoneName,
          peak_velocity_ms: round(strikeMaxSpeed, 1),
          peak_velocity_frame: strikePeakFrame,
          deceleration_profile: 'abrupt stop',
        },
      });

      if (impactEndF < endF) {
        phases.push({
          phase_type: 'Recovery',
          start_frame: impactEndF + 1,
          end_frame: endF,
          metrics: {
            velocity_state: 'stabilizes',
            posture_trend: 'returning to neutral stance',
          },
        });
      }

      return phases;
    }

    // --- CASE 3: DODGE / EVASIVE ROLL ---
    if (isDodgeRoll) {
      const minZIdx = frameMetrics.findIndex((m) => m.hipsPos[2] === minHipsZ);
      const tuckEndIdx = Math.max(1, Math.floor(minZIdx * 0.5));
      const recoveryStartIdx = Math.min(N - 2, minZIdx + Math.floor((N - minZIdx) * 0.45));

      const tuckEndF = frameMetrics[tuckEndIdx].frame;
      const recoveryStartF = frameMetrics[recoveryStartIdx].frame;

      return [
        {
          phase_type: 'Windup',
          start_frame: startF,
          end_frame: tuckEndF,
          metrics: {
            hips_z_drop_meters: round(minHipsZ - baseZ, 1),
            dominant_hand_velocity_direction: 'negative Y',
          },
        },
        {
          phase_type: 'Airborne',
          start_frame: tuckEndF + 1,
          end_frame: recoveryStartF - 1,
          metrics: {
            hips_max_z_meters: round(minHipsZ - baseZ, 2),
            hips_y_velocity_state: 'constant',
          },
        },
        {
          phase_type: 'Recovery',
          start_frame: recoveryStartF,
          end_frame: endF,
          metrics: {
            velocity_state: 'stabilizes',
            posture_trend: 'returning to neutral stance',
          },
        },
      ];
    }

    // --- CASE 4: LOCOMOTION (WALK / RUN / STRAFE) ---
    if (isLocomotion) {
      const p1Idx = Math.floor(N * 0.25);
      const p2Idx = Math.floor(N * 0.75);

      const p1F = frameMetrics[p1Idx].frame;
      const p2F = frameMetrics[p2Idx].frame;

      return [
        {
          phase_type: 'Windup',
          start_frame: startF,
          end_frame: p1F,
          metrics: {
            hips_z_drop_meters: 0.0,
            dominant_hand_velocity_direction: 'negative Y',
          },
        },
        {
          phase_type: 'Airborne',
          start_frame: p1F + 1,
          end_frame: p2F,
          metrics: {
            hips_max_z_meters: round(maxHipsZ - baseZ, 2),
            hips_y_velocity_state: 'constant',
          },
        },
        {
          phase_type: 'Recovery',
          start_frame: p2F + 1,
          end_frame: endF,
          metrics: {
            velocity_state: 'stabilizes',
            posture_trend: 'returning to neutral stance',
          },
        },
      ];
    }

    // --- CASE 5: HIT REACTION / IMPACT STAGGER ---
    if (isHitReaction) {
      const splitIdx = Math.min(Math.floor(N * 0.4), 15);
      const splitF = frameMetrics[splitIdx].frame;

      return [
        {
          phase_type: 'Impact',
          start_frame: startF,
          end_frame: splitF,
          metrics: {
            peak_velocity_bone: strikeBoneName,
            peak_velocity_ms: round(strikeMaxSpeed, 1),
            peak_velocity_frame: strikePeakFrame,
            deceleration_profile: 'abrupt stop',
          },
        },
        {
          phase_type: 'Recovery',
          start_frame: splitF + 1,
          end_frame: endF,
          metrics: {
            velocity_state: 'stabilizes',
            posture_trend: 'returning to neutral stance',
          },
        },
      ];
    }

    // --- CASE 6: IDLE / NEUTRAL ---
    const midF = Math.floor((startF + endF) / 2);
    return [
      {
        phase_type: 'Windup',
        start_frame: startF,
        end_frame: midF,
        metrics: {
          hips_z_drop_meters: 0.0,
          dominant_hand_velocity_direction: 'neutral',
        },
      },
      {
        phase_type: 'Recovery',
        start_frame: midF + 1,
        end_frame: endF,
        metrics: {
          velocity_state: 'stabilizes',
          posture_trend: 'returning to neutral stance',
        },
      },
    ];
  }
}

function main() {
  const { inputDir, outputFile } = parseArgs();

  console.log(`[KinematicSummary] Ingesting raw JSON dumps from: ${path.relative(PROJECT_ROOT, inputDir)}`);

  if (!fs.existsSync(inputDir)) {
    console.error(`[KinematicSummary] Error: Input directory does not exist: ${inputDir}`);
    process.exit(1);
  }

  const jsonFiles = fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (jsonFiles.length === 0) {
    console.warn(`[KinematicSummary] Warning: No JSON dumps found in ${inputDir}`);
    process.exit(0);
  }

  console.log(`[KinematicSummary] Processing ${jsonFiles.length} raw animation dumps...`);

  const summaryList = [];

  for (const jsonFile of jsonFiles) {
    const fullPath = path.join(inputDir, jsonFile);
    try {
      const fileContent = fs.readFileSync(fullPath, 'utf-8');
      const dumpData = JSON.parse(fileContent);

      const analyzer = new KinematicSummaryAnalyzer(dumpData);
      const summary = analyzer.analyze();
      summaryList.push(summary);
    } catch (err) {
      console.error(`[KinematicSummary] Error analyzing ${jsonFile}:`, err.message);
    }
  }

  fs.writeFileSync(outputFile, JSON.stringify(summaryList, null, 2), 'utf-8');
  console.log(`[KinematicSummary] Successfully generated summary for ${summaryList.length} animations:`);
  console.log(`  -> ${path.relative(PROJECT_ROOT, outputFile)}`);
}

main();
