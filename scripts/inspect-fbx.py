#!/usr/bin/env python3
"""
scripts/inspect-fbx.py
Headless Blender tool to inspect raw FBX or GLTF/GLB models and animations.

Usage:
    blender --background --python scripts/inspect-fbx.py -- <file_or_directory_path>
    npm run inspect:fbx -- <file_or_directory_path>
"""

import os
import sys
from pathlib import Path

try:
    import bpy
except ImportError:
    print("Error: Must be run inside Blender: blender --background --python scripts/inspect-fbx.py -- <path>", file=sys.stderr)
    sys.exit(1)


def inspect_single_file(file_path: Path):
    bpy.ops.wm.read_factory_settings(use_empty=True)

    suffix = file_path.suffix.lower()
    print("\n" + "=" * 70)
    print(f"  FBX/3D INSPECTION REPORT: {file_path.name}")
    print("=" * 70)
    print(f"  Path: {file_path}")
    print(f"  Size: {file_path.stat().st_size / (1024 * 1024):.2f} MB ({file_path.stat().st_size / 1024:.1f} KB)")

    try:
        if suffix in (".fbx",):
            bpy.ops.import_scene.fbx(filepath=str(file_path))
        elif suffix in (".glb", ".gltf"):
            bpy.ops.import_scene.gltf(filepath=str(file_path))
        else:
            print(f"  Unsupported file extension: {suffix}")
            return
    except Exception as e:
        print(f"  [Error] Failed to import: {e}")
        return

    # 1. Armature & Bones
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    print(f"\n--- 1. SKELETON / ARMATURES ({len(armatures)} found) ---")
    for arm in armatures:
        bones = arm.data.bones
        bone_names = [b.name for b in bones]
        print(f"  • Armature: '{arm.name}' ({len(bones)} bones)")

        # Identify rig archetype
        archetype = "Unknown"
        if any("mixamorig" in b.lower() for b in bone_names):
            archetype = "Mixamo Standard (mixamorig:...)"
        elif any("humanarmature" in arm.name.lower() or b in ("Palm.R", "PalmR") for b in bone_names):
            archetype = "Player HumanArmature (Low-poly Knight/Samurai standard)"
        elif any(b in ("hand.R", "upper_arm.R_IK") for b in bone_names):
            archetype = "Boss Rig (Titan standard)"
        print(f"    Archetype: {archetype}")

        # Hands & Socket Candidates
        hand_cands = [b for b in bone_names if any(k in b.lower() for k in ("hand", "palm", "wrist"))]
        print(f"    Hand/Socket Candidates: {hand_cands}")

        # Root bone
        root_cands = [b for b in bone_names if any(k in b.lower() for k in ("hip", "root", "body"))]
        print(f"    Root/Hips Candidates: {root_cands}")

    # 2. Meshes & Artifacts
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"\n--- 2. MESH OBJECTS ({len(meshes)} found) ---")
    for m in meshes:
        v_count = len(m.data.vertices)
        mats = [mat.name for mat in m.data.materials if mat]
        is_artifact = any(k in m.name.lower() for k in ("icosphere", "hand_shape", "cylinder"))
        status = "[DEBUG ARTIFACT - STRIP ME]" if is_artifact else "[CHARACTER MESH]"
        print(f"  • Mesh '{m.name}' {status}: {v_count} verts | Materials: {mats}")

    # 3. Actions / Animations
    actions = list(bpy.data.actions)
    print(f"\n--- 3. ANIMATION ACTIONS ({len(actions)} found) ---")
    if not actions:
        print("  (No embedded actions found - static mesh or base pose)")
    for act in actions:
        start, end = act.frame_range
        length = end - start
        duration_s = length / 24.0
        is_placeholder = length <= 2
        status = "[STATIC 1-FRAME POSE - AVOID]" if is_placeholder else "[ACTIVE CLIP]"
        print(f"  • Action '{act.name}' {status}: frames {start:.0f}..{end:.0f} (len: {length:.0f}, ~{duration_s:.2f}s)")


def main():
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
    else:
        args = sys.argv[1:]

    target = Path(args[0]) if args else Path("assets/raw")
    if not target.exists():
        print(f"Target path not found: {target}")
        sys.exit(1)

    if target.is_file():
        inspect_single_file(target)
    else:
        files = []
        for ext in ("*.fbx", "*.glb", "*.gltf"):
            files.extend(target.rglob(ext))
        files.sort()
        print(f"Found {len(files)} 3D file(s) under '{target}':")
        for f in files:
            inspect_single_file(f)


if __name__ == "__main__":
    main()
