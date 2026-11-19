import * as THREE from 'three';

/**
 * Bone classification patterns for Lower Body track separation.
 * Lower body includes Hips (position, rotation, scale) and all leg/foot/toe bones.
 */
const LOWER_BODY_PATTERNS = [
  /hips/i,
  /upleg/i,
  /thigh/i,
  /leg/i,
  /calf/i,
  /shin/i,
  /foot/i,
  /ankle/i,
  /toe/i,
];

/**
 * Checks whether a bone belongs to the Lower Body hierarchy.
 * @param boneName Raw bone name (with or without mixamorig: prefix)
 */
export function isLowerBodyBone(boneName: string): boolean {
  const cleanName = boneName.replace(/^(mixamorig[:_]?|humanarmature[:_]?)/i, '');
  return LOWER_BODY_PATTERNS.some((pattern) => pattern.test(cleanName));
}

/**
 * Splits a full-body THREE.AnimationClip into two independent sub-clips:
 * - Upper Body: Spine, Neck, Head, Shoulders, Arms, Hands, Fingers, Items
 * - Lower Body: Hips (position & rotation) and all leg/foot/toe bones
 *
 * @param clip Source full-body AnimationClip
 * @returns Object containing upper and lower AnimationClips with cloned tracks
 */
export function splitClipByBodyPart(clip: THREE.AnimationClip): {
  upper: THREE.AnimationClip;
  lower: THREE.AnimationClip;
} {
  const upperTracks: THREE.KeyframeTrack[] = [];
  const lowerTracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    const lastDot = track.name.lastIndexOf('.');
    const boneName = lastDot !== -1 ? track.name.substring(0, lastDot) : track.name;

    if (isLowerBodyBone(boneName)) {
      lowerTracks.push(track.clone());
    } else {
      upperTracks.push(track.clone());
    }
  }

  const upperClip = new THREE.AnimationClip(`${clip.name}__upper`, clip.duration, upperTracks);
  const lowerClip = new THREE.AnimationClip(`${clip.name}__lower`, clip.duration, lowerTracks);

  return { upper: upperClip, lower: lowerClip };
}
