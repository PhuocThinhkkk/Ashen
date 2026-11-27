import * as THREE from 'three';
import { checkAttackHit } from '../combat/HitDetection';
import { WeaponCollisionSystem, type WeaponBladeSegment } from '../combat/WeaponCollisionSystem';
import type { PlayerCharacter } from '../entities/PlayerCharacter';
import type { BossCharacter } from '../entities/BossCharacter';
import type { RemotePlayerProxy } from '../network/RemotePlayerProxy';
import type { NetworkManager } from '../network/NetworkManager';
import type { VFXSystem } from '../systems/VFXSystem';
import type { AudioSystem } from '../systems/AudioSystem';
import type { Hud } from '../systems/Hud';
import type { SoulslikeCamera } from '../systems/SoulslikeCamera';
import type { SettingsManager } from '../systems/SettingsManager';
import type { PerformanceProfiler } from '../systems/PerformanceProfiler';

export interface CollisionResolverContext {
  player: PlayerCharacter;
  boss: BossCharacter;
  remotePlayer: RemotePlayerProxy | null;
  isMultiplayerDuel: boolean;
  opponentSessionId: string;
  network: NetworkManager;
  vfx: VFXSystem;
  audio: AudioSystem;
  hud: Hud;
  cameraRig: SoulslikeCamera;
  settingsManager: SettingsManager;
  profiler: PerformanceProfiler;
  projectToScreen: (worldPos: THREE.Vector3, heightOffset?: number) => THREE.Vector2;
  setHitstop: (time: number) => void;
}

let prevPlayerBladeSegment: WeaponBladeSegment | null = null;
let prevBossBladeSegment: WeaponBladeSegment | null = null;

function cloneBladeSegment(seg: WeaponBladeSegment): WeaponBladeSegment {
  return {
    base: seg.base.clone(),
    tip: seg.tip.clone(),
    radius: seg.radius,
  };
}

/**
 * [Purpose]: Evaluates hitbox-to-hurtbox intersections between player and enemies, dispatching damage, VFX, and audio.
 * @condition Called during the 60Hz simulation loop after entity kinematic and state updates.
 * @param ctx Context object containing combat entities, systems (VFX/audio), and screen projection helpers.
 * @returns Mutates entity HP, combat hit states, hitstop timers, and triggers particle effects.
 */
export function resolveCombatCollisions(ctx: CollisionResolverContext): void {
  const {
    player,
    boss,
    remotePlayer,
    isMultiplayerDuel,
    opponentSessionId,
    network,
    vfx,
    audio,
    hud,
    cameraRig,
    settingsManager,
    profiler,
    projectToScreen,
    setHitstop,
  } = ctx;

  // 1. Multiplayer Duel Collisions
  if (isMultiplayerDuel && remotePlayer && remotePlayer.hp > 0) {
    const playerHitboxActive = player.isHitboxActive();
    if (
      player.state === 'attack' &&
      (player.attackPhase === 'active' || playerHitboxActive) &&
      player.currentAttack &&
      !player.hasHitCurrentSwing
    ) {
      const hit = checkAttackHit(
        player.group.position,
        player.group.rotation.y,
        player.currentAttack,
        remotePlayer.group.position,
        remotePlayer.radius,
        remotePlayer.isInvulnerable,
      );

      if (hit.hit) {
        player.hasHitCurrentSwing = true;
        const hitPoint = hit.contactPoint || player.getHitboxWorldPosition();
        const fwdAngle = player.group.rotation.y;
        const hitDir = new THREE.Vector3(-Math.sin(fwdAngle), 0.25, -Math.cos(fwdAngle)).normalize();

        network.sendCombatHit({
          targetSessionId: opponentSessionId,
          damage: hit.damage,
          isHeavy: hit.isHeavy,
          hitPoint: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
          hitDir: { x: hitDir.x, y: hitDir.y, z: hitDir.z },
        });

        vfx.spawnBloodBurst(hitPoint, hitDir, hit.isHeavy);
        audio.hitConfirm(hit.isHeavy);
        audio.damageTaken(hit.isHeavy, true);

        if (settingsManager.data.vfx.cameraShake) {
          cameraRig.addShake(hit.isHeavy ? 0.32 : 0.16);
        }
        setHitstop(0.05);
      }
    }
    return;
  }

  // 2. Player Attack Hits Boss
  const playerHitboxActive = player.isHitboxActive();
  if (!playerHitboxActive) {
    prevPlayerBladeSegment = null;
  }
  if (
    (player.state === 'attack' || player.isAirborneAttack) &&
    playerHitboxActive &&
    player.currentAttack &&
    !player.hasHitCurrentSwing &&
    boss.state !== 'dead'
  ) {
    const currBlade = player.getWeaponBladeSegment();
    const bossCapsule = boss.getBodyCapsule();
    const swept = WeaponCollisionSystem.testSweptBladeToBody(
      currBlade,
      prevPlayerBladeSegment,
      bossCapsule,
    );
    prevPlayerBladeSegment = cloneBladeSegment(currBlade);

    // Fallback horizontal check only if sword mesh isn't mounted on hand bone
    const fallbackHit = !player.swordObject
      ? checkAttackHit(
          player.group.position,
          player.group.rotation.y,
          player.currentAttack,
          boss.group.position,
          boss.radius,
          false,
        )
      : { hit: false, damage: 0, poiseDamage: 0, isHeavy: false, contactPoint: undefined };

    const didHit = swept.hit || fallbackHit.hit;
    const hitDamage = player.currentAttack.damage;
    const hitPoiseDamage = player.currentAttack.poiseDamage;
    const hitIsHeavy = !!player.currentAttack.isHeavy;

    if (didHit) {
      boss.takeDamage(hitDamage, hitPoiseDamage);
      player.hasHitCurrentSwing = true;

      // Visual & Audio Feedback
      const screenPos = projectToScreen(boss.group.position, 1.5);
      hud.spawnDamageNumber(hitDamage, screenPos.x, screenPos.y, false);

      // Combat VFX: Minimal Elden Ring blade-slash blood spit right on target surface
      const toBoss = boss.group.position.clone().sub(player.group.position);
      toBoss.y = 0;
      let hitPoint: THREE.Vector3;
      if (swept.contactPoint) {
        hitPoint = swept.contactPoint.clone();
      } else if (toBoss.length() > 0.01) {
        toBoss.normalize();
        hitPoint = boss.group.position.clone().addScaledVector(toBoss, -boss.radius * 0.75);
        hitPoint.y = boss.group.position.y + 1.15;
      } else {
        hitPoint = fallbackHit.contactPoint || boss.group.position.clone().add(new THREE.Vector3(0, 1.15, 0));
      }

      const fwdAngle = player.group.rotation.y;
      const hitDir = new THREE.Vector3(
        Math.cos(fwdAngle) * 0.75 - Math.sin(fwdAngle) * 0.35,
        0.15,
        -Math.sin(fwdAngle) * 0.75 - Math.cos(fwdAngle) * 0.35,
      ).normalize();

      vfx.spawnBloodBurst(hitPoint, hitDir, hitIsHeavy);
      profiler.markCombatEvent('PLAYER_HIT_BOSS', { damage: hitDamage, isHeavy: hitIsHeavy });

      audio.hitConfirm(hitIsHeavy);
      audio.damageTaken(hitIsHeavy, true);

      if (settingsManager.data.vfx.cameraShake) {
        cameraRig.addShake(hitIsHeavy ? 0.32 : 0.16);
      }

      if (hitIsHeavy) {
        setHitstop(0.05);
      }

      if ((boss.state as string) === 'dead') {
        audio.victoryStinger();
        audio.stopBossMusic(2.0);
        cameraRig.setLockedTarget(null);
      } else if (boss.state === 'stagger') {
        audio.staggerClang();
      }
    }
  }

  // 3. Boss Attack Hits Player
  const bossHitboxActive = boss.isHitboxActive();
  if (!bossHitboxActive) {
    prevBossBladeSegment = null;
  }
  if (
    bossHitboxActive &&
    boss.currentAttack &&
    !boss.hasHitCurrentSwing &&
    player.state !== 'dead'
  ) {
    const isKick = boss.currentAttack.animationClip === 'kick';
    const playerCapsule = player.getBodyCapsule();
    let sweptHit = false;
    let sweptContact: THREE.Vector3 | undefined;

    if (isKick) {
      const footPos = boss.getFootLocation();
      const footRes = WeaponCollisionSystem.testSphereToBody(footPos, 0.48, playerCapsule);
      sweptHit = footRes.hit;
      sweptContact = footRes.contactPoint;
    } else {
      const currBossBlade = boss.getWeaponBladeSegment();
      const bladeRes = WeaponCollisionSystem.testSweptBladeToBody(
        currBossBlade,
        prevBossBladeSegment,
        playerCapsule,
      );
      prevBossBladeSegment = cloneBladeSegment(currBossBlade);
      sweptHit = bladeRes.hit;
      sweptContact = bladeRes.contactPoint;
    }

    if (sweptHit && !player.isInvulnerable) {
      const dmg = boss.currentAttack.damage;
      const isHeavy = !!boss.currentAttack.isHeavy;
      const damageDealt = player.takeDamage(dmg, isHeavy);
      boss.hasHitCurrentSwing = true;

      if (damageDealt) {
        const screenPos = projectToScreen(player.group.position, 1.2);
        hud.spawnDamageNumber(dmg, screenPos.x, screenPos.y, true);

        // Combat VFX: Minimal Elden Ring blade-slash blood spit right on player surface
        const toPlayer = player.group.position.clone().sub(boss.group.position);
        toPlayer.y = 0;
        let hitPoint: THREE.Vector3;
        if (sweptContact) {
          hitPoint = sweptContact.clone();
        } else if (toPlayer.length() > 0.01) {
          toPlayer.normalize();
          hitPoint = player.group.position.clone().addScaledVector(toPlayer, -player.radius * 0.75);
          hitPoint.y = player.group.position.y + 1.10;
        } else {
          hitPoint = player.group.position.clone().add(new THREE.Vector3(0, 1.10, 0));
        }

        const fwdAngle = boss.group.rotation.y;
        const hitDir = new THREE.Vector3(
          -Math.cos(fwdAngle) * 0.75 - Math.sin(fwdAngle) * 0.35,
          0.15,
          Math.sin(fwdAngle) * 0.75 - Math.cos(fwdAngle) * 0.35,
        ).normalize();

        vfx.spawnBloodBurst(hitPoint, hitDir, true);
        profiler.markCombatEvent('BOSS_HIT_PLAYER', { damage: dmg });

        audio.hitConfirm(true);
        audio.damageTaken(true, false);

        if (settingsManager.data.vfx.cameraShake) {
          cameraRig.addShake(0.42);
        }
        setHitstop(0.06);

        if ((player.state as string) === 'dead') {
          audio.deathStinger();
          audio.stopBossMusic(1.5);
        }
      }
    }
  }
}
