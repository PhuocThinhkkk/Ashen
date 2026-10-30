#!/usr/bin/env python3
"""
scripts/extract_anim_data.py
Headless Blender Python script to validate Mixamo character animations and extract
frame-by-frame global space kinematic data for Three.js engine runtime analysis.

Usage:
    blender --background --python scripts/extract_anim_data.py
    blender --background --python scripts/extract_anim_data.py -- --assets assets --output local_anim_dumps
"""

import os
import sys
import math
import json
import argparse
from pathlib import Path

try:
    import bpy
    import mathutils
except ImportError:
    print(
        "Error: This script must be executed within Blender headless mode:\n"
        "       blender --background --python scripts/extract_anim_data.py",
        file=sys.stderr,
    )
    sys.exit(1)


# Standard Mixamo bone names and expectations
MIXAMO_PREFIX = "mixamorig:"
MIXAMO_ROOT_BONE = "mixamorig:Hips"

# Essential bones that MUST exist for a valid humanoid Mixamo rig
MIXAMO_REQUIRED_BONES = [
    "mixamorig:Hips",
    "mixamorig:Spine",
    "mixamorig:RightArm",
    "mixamorig:RightHand",
    "mixamorig:LeftArm",
    "mixamorig:LeftHand",
    "mixamorig:RightUpLeg",
    "mixamorig:RightFoot",
    "mixamorig:LeftUpLeg",
    "mixamorig:LeftFoot",
]

# Extremities and key body nodes tracked for kinematic analysis
TRACKED_BONE_KEYS = [
    "mixamorig:Hips",
    "mixamorig:RightHand",
    "mixamorig:LeftHand",
    "mixamorig:RightFoot",
    "mixamorig:LeftFoot",
    "mixamorig:Head",
    "mixamorig:Spine2",
]


class AnimDataExtractor:
    """
    Modular data extractor and validator for Mixamo 3D character animations.
    Imports 3D assets, performs rig validation and anomaly detection,
    and extracts global space world-matrix transforms across all keyframes.
    """

    def __init__(self, assets_dir="assets", output_dir="local_anim_dumps", warnings_file="warnings.log"):
        self.project_root = Path.cwd().resolve()
        self.assets_dir = (self.project_root / assets_dir).resolve()
        self.output_dir = (self.project_root / output_dir).resolve()
        self.warnings_path = (self.project_root / warnings_file).resolve()
        
        # Ensure directories exist
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize or clear warnings log
        with open(self.warnings_path, "w", encoding="utf-8") as f:
            f.write("# Mixamo Animation Validation Warnings Log\n")
            f.write(f"# Generated: {Path(__file__).name}\n\n")

    def log_warning(self, file_path: Path, reason: str, details: str = ""):
        """Logs a validation anomaly or processing warning to console and warnings.log."""
        rel_path = file_path.relative_to(self.project_root) if file_path.is_relative_to(self.project_root) else file_path
        msg = f"[WARNING] [ANOMALY DETECTED] {rel_path}: {reason}"
        if details:
            msg += f" | Details: {details}"
        print(msg, file=sys.stderr)

        with open(self.warnings_path, "a", encoding="utf-8") as f:
            f.write(f"- **File:** `{rel_path}`\n")
            f.write(f"  - **Issue:** {reason}\n")
            if details:
                f.write(f"  - **Details:** {details}\n")
            f.write("\n")

    def scan_assets(self):
        """Recursively scans the assets directory for .fbx, .glb, and .gltf files."""
        if not self.assets_dir.exists():
            print(f"Assets directory not found: {self.assets_dir}", file=sys.stderr)
            return []

        supported_exts = {".fbx", ".glb", ".gltf"}
        matched_files = []
        for p in self.assets_dir.rglob("*"):
            if p.is_file() and p.suffix.lower() in supported_exts:
                matched_files.append(p)

        matched_files.sort()
        return matched_files

    def clear_scene(self):
        """Completely clears the Blender scene and unlinks all cached datablocks."""
        bpy.ops.wm.read_factory_settings(use_empty=True)
        for act in list(bpy.data.actions):
            bpy.data.actions.remove(act)
        for arm in list(bpy.data.armatures):
            bpy.data.armatures.remove(arm)
        for m in list(bpy.data.meshes):
            bpy.data.meshes.remove(m)
        for o in list(bpy.data.objects):
            bpy.data.objects.remove(o)

    def import_asset(self, file_path: Path) -> bool:
        """Imports an FBX, GLB, or GLTF asset into Blender."""
        ext = file_path.suffix.lower()
        try:
            if ext == ".fbx":
                bpy.ops.import_scene.fbx(filepath=str(file_path))
                return True
            elif ext in (".glb", ".gltf"):
                bpy.ops.import_scene.gltf(filepath=str(file_path))
                return True
            else:
                return False
        except Exception as e:
            self.log_warning(file_path, "Import Failure", str(e))
            return False

    def find_primary_armature(self):
        """Locates the primary armature object in the imported scene."""
        armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
        if not armatures:
            return None
        # Favor top-level armatures (no parent)
        for arm in armatures:
            if arm.parent is None:
                return arm
        return armatures[0]

    def find_primary_action(self, armature):
        """Locates the primary animation Action attached or imported."""
        if armature.animation_data and armature.animation_data.action:
            return armature.animation_data.action
        
        # Check scene actions
        actions = list(bpy.data.actions)
        if not actions:
            return None

        # Filter out 1-frame static poses if active clips exist
        active_clips = [a for a in actions if (a.frame_range[1] - a.frame_range[0]) > 2]
        if active_clips:
            return active_clips[0]
        return actions[0]

    def validate_mixamo_rig(self, armature, file_path: Path):
        """
        Validates whether the armature conforms to standard Mixamo hierarchy.
        Checks:
        1. Presence of armature bones.
        2. Top-level root bone is mixamorig:Hips (no ground root bone).
        3. Bone naming prefix matches mixamorig: standard.
        4. Presence of essential humanoid limb bones.

        Returns: (is_valid: bool, validation_meta: dict)
        """
        bones = armature.data.bones
        bone_names = [b.name for b in bones]
        bone_names_set = set(bone_names)

        meta = {
            "is_valid": False,
            "archetype": "Unknown",
            "root_bone": None,
            "total_bones": len(bones),
            "missing_key_bones": [],
            "anomalies": [],
        }

        if len(bones) == 0:
            meta["anomalies"].append("Armature has 0 bones")
            self.log_warning(file_path, "Empty Armature", "Armature contains 0 bones")
            return False, meta

        # 1. Identify root bones (bones without parent)
        root_bones = [b.name for b in bones if b.parent is None]
        meta["root_bones"] = root_bones

        if len(root_bones) != 1:
            anomaly = f"Expected exactly 1 root bone, found {len(root_bones)}: {root_bones}"
            meta["anomalies"].append(anomaly)
            self.log_warning(file_path, "Non-Standard Root Structure", anomaly)
            return False, meta

        primary_root = root_bones[0]
        meta["root_bone"] = primary_root

        # 2. Check if root bone is Hips
        # In Mixamo, Hips is the root (mixamorig:Hips)
        is_hips_root = primary_root == MIXAMO_ROOT_BONE or (
            "hips" in primary_root.lower() and primary_root.startswith("mixamorig")
        )

        if not is_hips_root:
            anomaly = f"Root bone is '{primary_root}', but Mixamo rigs require '{MIXAMO_ROOT_BONE}' as root"
            meta["anomalies"].append(anomaly)
            self.log_warning(file_path, "Root Bone Mismatch", anomaly)
            return False, meta

        # 3. Check for mixamorig: naming convention
        mixamo_prefixed_count = sum(1 for name in bone_names if name.startswith(MIXAMO_PREFIX))
        if mixamo_prefixed_count < (len(bone_names) * 0.8):
            anomaly = f"Only {mixamo_prefixed_count}/{len(bone_names)} bones follow the '{MIXAMO_PREFIX}' naming convention"
            meta["anomalies"].append(anomaly)
            self.log_warning(file_path, "Naming Prefix Anomaly", anomaly)
            return False, meta

        # 4. Check essential key bones
        missing_bones = [b for b in MIXAMO_REQUIRED_BONES if b not in bone_names_set]
        if missing_bones:
            meta["missing_key_bones"] = missing_bones
            anomaly = f"Missing essential Mixamo limb bones: {missing_bones}"
            meta["anomalies"].append(anomaly)
            self.log_warning(file_path, "Missing Key Bones", anomaly)
            return False, meta

        meta["is_valid"] = True
        meta["archetype"] = "Mixamo Standard Humanoid"
        return True, meta

    def extract_frame_data(self, armature, action, file_path: Path):
        """
        Iterates over the animation frame range and extracts global space
        (world matrix) translation and rotation for tracked bones.
        """
        # Ensure armature is active and evaluated
        bpy.context.view_layer.objects.active = armature
        if not armature.animation_data:
            armature.animation_data_create()
        armature.animation_data.action = action

        # Frame range
        start_frame = int(math.floor(action.frame_range[0]))
        end_frame = int(math.ceil(action.frame_range[1]))
        total_frames = (end_frame - start_frame) + 1

        # Scene FPS
        scene = bpy.context.scene
        fps = float(scene.render.fps / scene.render.fps_base)

        # Tracked bones available in this rig
        available_tracked_bones = [b for b in TRACKED_BONE_KEYS if b in armature.pose.bones]

        frames_data = []

        hips_start_trans = None
        hips_end_trans = None

        for f in range(start_frame, end_frame + 1):
            scene.frame_set(f)
            bpy.context.view_layer.update()

            time_s = round((f - start_frame) / fps, 4)
            frame_entry = {
                "frame": f,
                "time_s": time_s,
                "bones": {},
            }

            arm_matrix_world = armature.matrix_world

            for bone_name in available_tracked_bones:
                pose_bone = armature.pose.bones[bone_name]
                # Global space (World Matrix) of bone
                world_bone_matrix = arm_matrix_world @ pose_bone.matrix
                trans, rot_quat, _ = world_bone_matrix.decompose()
                rot_euler = rot_quat.to_euler("XYZ")

                t_list = [round(trans.x, 4), round(trans.y, 4), round(trans.z, 4)]
                q_list = [round(rot_quat.w, 4), round(rot_quat.x, 4), round(rot_quat.y, 4), round(rot_quat.z, 4)]
                e_list = [round(math.degrees(rot_euler.x), 2), round(math.degrees(rot_euler.y), 2), round(math.degrees(rot_euler.z), 2)]

                frame_entry["bones"][bone_name] = {
                    "translation": t_list,
                    "rotation_quaternion": q_list,
                    "rotation_euler_deg": e_list,
                }

                if bone_name == MIXAMO_ROOT_BONE:
                    if f == start_frame:
                        hips_start_trans = trans.copy()
                    if f == end_frame:
                        hips_end_trans = trans.copy()

            frames_data.append(frame_entry)

        # Determine Root Motion
        delta_x = round(hips_end_trans.x - hips_start_trans.x, 4) if hips_start_trans and hips_end_trans else 0.0
        delta_y = round(hips_end_trans.y - hips_start_trans.y, 4) if hips_start_trans and hips_end_trans else 0.0
        delta_z = round(hips_end_trans.z - hips_start_trans.z, 4) if hips_start_trans and hips_end_trans else 0.0

        horizontal_displacement = round(math.hypot(delta_x, delta_y), 4)
        is_root_motion = horizontal_displacement > 0.15

        root_motion_meta = {
            "is_root_motion": is_root_motion,
            "motion_label": "Root Motion" if is_root_motion else "In-Place",
            "delta_x": delta_x,
            "delta_y": delta_y,
            "delta_z": delta_z,
            "horizontal_displacement": horizontal_displacement,
        }

        return {
            "fps": fps,
            "frame_start": start_frame,
            "frame_end": end_frame,
            "total_frames": total_frames,
            "root_motion": root_motion_meta,
            "tracked_bones": available_tracked_bones,
            "frames": frames_data,
        }

    def bake_to_in_place(self, armature, action, output_path: Path = None):
        """
        Bakes an animation to in-place by neutralizing horizontal (X and Y)
        root translation while preserving vertical (Z) kinematics and rotations.
        Designed for future expansion when generating runtime in-place clips.
        """
        if not action or not action.fcurves:
            return False

        # Locate Hips translation F-Curves
        hips_fcurves = [fc for fc in action.fcurves if "mixamorig:Hips" in fc.data_path and fc.data_path.endswith("location")]
        if not hips_fcurves:
            return False

        # Target array_index 0 (X) and 1 (Y) in Blender coords
        for fc in hips_fcurves:
            if fc.array_index in (0, 1):
                base_val = fc.keyframe_points[0].co[1] if fc.keyframe_points else 0.0
                for kp in fc.keyframe_points:
                    kp.co[1] = base_val
                fc.update()

        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            bpy.ops.export_scene.gltf(filepath=str(output_path), export_format="GLB")
            print(f"[AnimDataExtractor] Baked in-place clip exported to: {output_path}")

        return True

    def process_file(self, file_path: Path) -> dict:
        """Processes a single 3D animation asset."""
        print(f"\n[AnimDataExtractor] Processing: {file_path.name}")
        self.clear_scene()

        success = self.import_asset(file_path)
        if not success:
            return None

        armature = self.find_primary_armature()
        if not armature:
            self.log_warning(file_path, "No Armature Object", "No ARMATURE object detected in scene")
            return None

        # Validate Mixamo structure
        is_valid, validation_meta = self.validate_mixamo_rig(armature, file_path)
        if not is_valid:
            print(f"[AnimDataExtractor] Skipping '{file_path.name}': Not a valid Mixamo rig.", file=sys.stderr)
            return None

        action = self.find_primary_action(armature)
        if not action:
            self.log_warning(file_path, "No Action Found", "Armature has no attached animation Action")
            return None

        # Check for static 1-frame poses (e.g. base character meshes)
        frame_len = action.frame_range[1] - action.frame_range[0]
        if frame_len <= 1:
            self.log_warning(
                file_path,
                "Static Mesh / Single Frame Pose",
                f"Action '{action.name}' has only {frame_len:.0f} frames. Skipping animation extraction.",
            )
            return None

        # Extract kinematic frame data
        anim_data = self.extract_frame_data(armature, action, file_path)

        rel_source = file_path.relative_to(self.project_root) if file_path.is_relative_to(self.project_root) else file_path

        dump_payload = {
            "source_file": str(rel_source).replace("\\", "/"),
            "file_name": file_path.name,
            "action_name": action.name,
            "mixamo_validation": validation_meta,
            "fps": anim_data["fps"],
            "frame_start": anim_data["frame_start"],
            "frame_end": anim_data["frame_end"],
            "total_frames": anim_data["total_frames"],
            "root_motion": anim_data["root_motion"],
            "tracked_bones": anim_data["tracked_bones"],
            "frames": anim_data["frames"],
        }

        # Write to local_anim_dumps
        # Create safe flat filename reflecting category or folder structure
        safe_rel_stem = str(file_path.relative_to(self.assets_dir)).replace("\\", "__").replace("/", "__")
        safe_json_name = Path(safe_rel_stem).with_suffix(".json").name
        out_file = self.output_dir / safe_json_name

        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(dump_payload, f, indent=2)

        print(
            f"[AnimDataExtractor] Successfully dumped {anim_data['total_frames']} frames to: {out_file.relative_to(self.project_root)}"
        )
        return dump_payload

    def process_all(self):
        """Scans and extracts animation data for all assets in the assets directory."""
        files = self.scan_assets()
        print(f"[AnimDataExtractor] Found {len(files)} asset candidate files in: {self.assets_dir}")

        processed_count = 0
        skipped_count = 0

        for f in files:
            res = self.process_file(f)
            if res is not None:
                processed_count += 1
            else:
                skipped_count += 1

        print("\n" + "=" * 60)
        print(f"[AnimDataExtractor] Batch Extraction Completed!")
        print(f"  • Processed & Dumped: {processed_count}")
        print(f"  • Skipped / Anomalies: {skipped_count}")
        print(f"  • Output Directory:    {self.output_dir.relative_to(self.project_root)}")
        print(f"  • Warnings Log:        {self.warnings_path.relative_to(self.project_root)}")
        print("=" * 60 + "\n")


def parse_args():
    # Pass arguments after '--' if run via blender
    argv = sys.argv
    if "--" in argv:
        raw_args = argv[argv.index("--") + 1 :]
    else:
        raw_args = []

    parser = argparse.ArgumentParser(description="Headless Mixamo Animation Data Extractor & Validator")
    parser.add_argument("--assets", default="assets", help="Path to assets folder to scan")
    parser.add_argument("--output", default="local_anim_dumps", help="Directory for JSON animation dumps")
    parser.add_argument("--warnings", default="warnings.log", help="Path to warnings log file")
    return parser.parse_args(raw_args)


def main():
    args = parse_args()
    extractor = AnimDataExtractor(
        assets_dir=args.assets,
        output_dir=args.output,
        warnings_file=args.warnings,
    )
    extractor.process_all()


if __name__ == "__main__":
    main()
