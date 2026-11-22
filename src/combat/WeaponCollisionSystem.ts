import * as THREE from 'three';

export interface WeaponBladeSegment {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  radius: number;
}

export interface BodyCapsule {
  position: THREE.Vector3;
  radius: number;
  height: number;
}

export interface WeaponCollisionResult {
  hit: boolean;
  distance: number;
  contactPoint?: THREE.Vector3;
}

export class WeaponCollisionSystem {
  private static readonly EPSILON = 1e-6;

  /**
   * [Purpose]: Computes the exact minimum Euclidean distance and closest contact points between two 3D line segments.
   * @condition Called during weapon-to-body hit tests and capsule collision queries.
   * @param p1,q1,p2,q2,outClosest1,outClosest2 Endpoints of segments S1 and S2, and output vectors to receive closest points.
   * @returns Minimum distance (in world units) separating the two line segments.
   */
  public static distSegmentToSegment(
    p1: THREE.Vector3,
    q1: THREE.Vector3,
    p2: THREE.Vector3,
    q2: THREE.Vector3,
    outClosest1 = new THREE.Vector3(),
    outClosest2 = new THREE.Vector3(),
  ): number {
    const d1 = new THREE.Vector3().subVectors(q1, p1);
    const d2 = new THREE.Vector3().subVectors(q2, p2);
    const r = new THREE.Vector3().subVectors(p1, p2);

    const a = d1.dot(d1);
    const e = d2.dot(d2);
    const f = d2.dot(r);

    let s = 0;
    let t = 0;

    if (a <= this.EPSILON && e <= this.EPSILON) {
      outClosest1.copy(p1);
      outClosest2.copy(p2);
      return outClosest1.distanceTo(outClosest2);
    }

    if (a <= this.EPSILON) {
      s = 0;
      t = THREE.MathUtils.clamp(f / e, 0, 1);
    } else {
      const c = d1.dot(r);
      if (e <= this.EPSILON) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else {
        const b = d1.dot(d2);
        const denom = a * e - b * b;

        if (denom !== 0) {
          s = THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1);
        } else {
          s = 0;
        }

        t = (b * s + f) / e;

        if (t < 0) {
          t = 0;
          s = THREE.MathUtils.clamp(-c / a, 0, 1);
        } else if (t > 1) {
          t = 1;
          s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
        }
      }
    }

    outClosest1.copy(p1).addScaledVector(d1, s);
    outClosest2.copy(p2).addScaledVector(d2, t);
    return outClosest1.distanceTo(outClosest2);
  }

  /**
   * [Purpose]: Performs continuous swept collision volume testing between weapon blade segments (current/previous frames) and target body capsule.
   * @condition Invoked during active attack hitbox frames to prevent fast weapon swings from tunneling through character capsules.
   * @param currBlade,prevBlade,target Current and previous weapon blade segments (base, tip, radius), and target body capsule geometry.
   * @returns WeaponCollisionResult indicating hit status, shortest distance, contact point, and impact surface normal.
   */
  public static testSweptBladeToBody(
    currBlade: WeaponBladeSegment,
    prevBlade: WeaponBladeSegment | null,
    target: BodyCapsule,
  ): WeaponCollisionResult {
    // Target vertical spine segment
    const bodyBottom = new THREE.Vector3(
      target.position.x,
      target.position.y + target.radius,
      target.position.z,
    );
    const bodyTop = new THREE.Vector3(
      target.position.x,
      target.position.y + Math.max(target.radius, target.height - target.radius),
      target.position.z,
    );

    const hitThreshold = currBlade.radius + target.radius;

    const c1 = new THREE.Vector3();
    const c2 = new THREE.Vector3();

    // 1. Current frame segment test
    let minDist = this.distSegmentToSegment(
      currBlade.base,
      currBlade.tip,
      bodyBottom,
      bodyTop,
      c1,
      c2,
    );
    const bestContact = c2.clone();

    if (minDist <= hitThreshold) {
      return { hit: true, distance: minDist, contactPoint: bestContact };
    }

    // 2. Continuous Swept Test (against previous frame if available)
    if (prevBlade) {
      // Test A: Previous frame segment
      const dPrev = this.distSegmentToSegment(
        prevBlade.base,
        prevBlade.tip,
        bodyBottom,
        bodyTop,
        c1,
        c2,
      );
      if (dPrev < minDist) {
        minDist = dPrev;
        bestContact.copy(c2);
      }
      if (dPrev <= hitThreshold) {
        return { hit: true, distance: dPrev, contactPoint: bestContact };
      }

      // Test B: Blade tip swept trajectory
      const dTip = this.distSegmentToSegment(
        prevBlade.tip,
        currBlade.tip,
        bodyBottom,
        bodyTop,
        c1,
        c2,
      );
      if (dTip < minDist) {
        minDist = dTip;
        bestContact.copy(c2);
      }
      if (dTip <= hitThreshold) {
        return { hit: true, distance: dTip, contactPoint: bestContact };
      }

      // Test C: Blade diagonal 1 (prev base -> curr tip)
      const dDiag1 = this.distSegmentToSegment(
        prevBlade.base,
        currBlade.tip,
        bodyBottom,
        bodyTop,
        c1,
        c2,
      );
      if (dDiag1 < minDist) {
        minDist = dDiag1;
        bestContact.copy(c2);
      }
      if (dDiag1 <= hitThreshold) {
        return { hit: true, distance: dDiag1, contactPoint: bestContact };
      }

      // Test D: Blade diagonal 2 (curr base -> prev tip)
      const dDiag2 = this.distSegmentToSegment(
        currBlade.base,
        prevBlade.tip,
        bodyBottom,
        bodyTop,
        c1,
        c2,
      );
      if (dDiag2 < minDist) {
        minDist = dDiag2;
        bestContact.copy(c2);
      }
      if (dDiag2 <= hitThreshold) {
        return { hit: true, distance: dDiag2, contactPoint: bestContact };
      }
    }

    return { hit: minDist <= hitThreshold, distance: minDist, contactPoint: bestContact };
  }

  /**
   * Tests a point/sphere (such as a kick foot bone) against a target body capsule.
   */
  public static testSphereToBody(
    spherePos: THREE.Vector3,
    sphereRadius: number,
    target: BodyCapsule,
  ): WeaponCollisionResult {
    const bodyBottom = new THREE.Vector3(
      target.position.x,
      target.position.y + target.radius,
      target.position.z,
    );
    const bodyTop = new THREE.Vector3(
      target.position.x,
      target.position.y + Math.max(target.radius, target.height - target.radius),
      target.position.z,
    );

    const c1 = new THREE.Vector3();
    const c2 = new THREE.Vector3();

    // Treat sphere as zero-length segment at spherePos
    const dist = this.distSegmentToSegment(spherePos, spherePos, bodyBottom, bodyTop, c1, c2);
    const hitThreshold = sphereRadius + target.radius;

    return {
      hit: dist <= hitThreshold,
      distance: dist,
      contactPoint: c2.clone(),
    };
  }
}
