#!/usr/bin/env python3
"""
scripts/process_mixamo.py
Headless Blender script to combine a base character FBX with a shared folder of animation FBX clips.
Renames animation clips to standardized game state names BEFORE exporting to GLB, guaranteeing
zero-config runtime compatibility.

CLI Usage:
    blender --background --python scripts/process_mixamo.py -- --base <base_fbx> --anims <anims_dir> --output <output_glb>
    or:
    blender --background --python scripts/process_mixamo.py -- <base_fbx> <anims_dir> <output_glb>
"""

import os
import re
import sys
from pathlib import Path

try:
    import bpy
except ImportError:
    print(
        "Error: This script must be run inside Blender in background mode:\n"
        "       blender --background --python scripts/process_mixamo.py -- --base <base_fbx> --anims <anims_dir> --output <output_glb>",
        file=sys.stderr,
    )
    sys.exit(1)


# Standard animation mapping priorities
# Maps standardized game state names to list of candidate action/file name patterns in order of priority
PLAYER_STANDARD_TARGETS = {
    "idle": ["idle_swordright", "idle_01", "idle"],
    "walk": ["walking", "walk"],
    "run": ["run_swordright", "running", "run"],
    "dodge": ["roll_sword", "roll", "dive_roll", "stand_to_roll", "dodge"],
    "attack_light": ["run_sword_attack", "run_swordattack", "great_sword_slash", "attack_light", "slash"],
    "attack_heavy": ["sword_attack_jump", "swordattackjump", "jump_attack", "attack_heavy"],
    "death": ["death", "die"],
}

BOSS_STANDARD_TARGETS = {
    "idle": ["|idle", "boss_idle", "idle"],
    "walking": ["|walking", "walking", "walk"],
    "attack_heavy": ["|attack", "heavy_smash", "attack_heavy", "attack_downward"],
    "special": ["|taunt", "roar", "special"],
    "hit": ["|hit", "hit_reaction", "hit"],
    "die": ["|die", "die", "death"],
}


def normalize_stem(stem: str) -> str:
    """Converts filename stem into clean snake_case."""
    if "|" in stem:
        stem = stem.split("|")[-1]
    s = re.sub(r"[\s\.\-]+", "_", stem)
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", s)
    s = re.sub(r"[^a-zA-Z0-9_]+", "_", s)
    s = re.sub(r"_+", "_", s)
    return s.strip("_").lower()


def find_best_action(actions, target_patterns):
    """
    Finds the action that best matches target patterns with length > 2 frames.
    Avoids 1-frame placeholder/base poses.
    """
    # 1. Try patterns with length > 2 frames
    for pat in target_patterns:
        pat_clean = pat.lower().strip("|")
        pat_alnum = re.sub(r"[^a-z0-9]", "", pat_clean)
        for a in actions:
            name_lower = a.name.lower()
            length = a.frame_range[1] - a.frame_range[0]
            if length <= 2:
                continue
            if pat.startswith("|") and name_lower.endswith(pat.lower()):
                return a
            norm_name = normalize_stem(a.name)
            norm_alnum = re.sub(r"[^a-z0-9]", "", norm_name)
            if pat_alnum and (pat_alnum == norm_alnum or norm_alnum.endswith(pat_alnum) or pat_alnum in norm_alnum):
                return a

    # 2. Relax length check if nothing found
    for pat in target_patterns:
        pat_clean = pat.lower().strip("|")
        pat_alnum = re.sub(r"[^a-z0-9]", "", pat_clean)
        for a in actions:
            name_lower = a.name.lower()
            if pat.startswith("|") and name_lower.endswith(pat.lower()):
                return a
            norm_name = normalize_stem(a.name)
            norm_alnum = re.sub(r"[^a-z0-9]", "", norm_name)
            if pat_alnum and (pat_alnum == norm_alnum or norm_alnum.endswith(pat_alnum) or pat_alnum in norm_alnum):
                return a

    return None


def parse_args():
    # Collect args passed after '--'
    if "--" in sys.argv:
        raw_args = sys.argv[sys.argv.index("--") + 1 :]
    else:
        raw_args = []

    base_fbx = None
    anims_dir = None
    output_glb = None
    category = "auto"

    i = 0
    while i < len(raw_args):
        arg = raw_args[i]
        if arg in ("--base", "-b") and i + 1 < len(raw_args):
            base_fbx = raw_args[i + 1]
            i += 2
        elif arg in ("--anims", "-a") and i + 1 < len(raw_args):
            anims_dir = raw_args[i + 1]
            i += 2
        elif arg in ("--output", "-o") and i + 1 < len(raw_args):
            output_glb = raw_args[i + 1]
            i += 2
        elif arg in ("--category", "-c") and i + 1 < len(raw_args):
            category = raw_args[i + 1].lower()
            i += 2
        else:
            # Positional arguments fallback
            if base_fbx is None:
                base_fbx = arg
            elif anims_dir is None:
                anims_dir = arg
            elif output_glb is None:
                output_glb = arg
            i += 1

    if not base_fbx or not output_glb:
        print(
            "Error: Missing required arguments.\n"
            "Usage: blender --background --python scripts/process_mixamo.py -- "
            "--base <base_fbx> --anims <anims_dir> --output <output_glb>",
            file=sys.stderr,
        )
        sys.exit(1)

    base_path = Path(base_fbx).resolve()
    anims_path = Path(anims_dir).resolve() if anims_dir else None
    output_path = Path(output_glb).resolve()

    if category == "auto" and anims_path:
        anims_str = str(anims_path).lower()
        if "player" in anims_str:
            category = "player"
        elif "boss" in anims_str:
            category = "boss"

    return base_path, anims_path, output_path, category


def clear_scene():
    """Wipes the Blender scene to factory defaults and frees all data blocks."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in list(bpy.data.actions):
        bpy.data.actions.remove(block)
    for block in list(bpy.data.armatures):
        bpy.data.armatures.remove(block)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.textures):
        bpy.data.textures.remove(block)
    for block in list(bpy.data.images):
        bpy.data.images.remove(block)
    for block in list(bpy.data.objects):
        bpy.data.objects.remove(block)


def find_main_armature():
    """Finds the primary character armature."""
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        return None
    for arm in armatures:
        if arm.parent is None:
            return arm
    return armatures[0]


def main():
    base_fbx, anims_dir, output_glb, category = parse_args()

    if not base_fbx.exists():
        print(f"Error: Base FBX file not found: {base_fbx}", file=sys.stderr)
        sys.exit(1)

    print(f"[Blender Pipeline] Initializing clean Blender workspace...")
    clear_scene()

    print(f"[Blender Pipeline] Importing base model: {base_fbx.name}")
    if base_fbx.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(base_fbx))
    else:
        bpy.ops.import_scene.gltf(filepath=str(base_fbx))

    main_armature = find_main_armature()
    if not main_armature:
        print("Error: Could not find ARMATURE object in base model.", file=sys.stderr)
        sys.exit(1)

    print(f"[Blender Pipeline] Found main armature: '{main_armature.name}' (category: {category})")

    # Remove debug helper meshes (white hemispherical geometry, cylinders, helper shapes)
    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            low_name = obj.name.lower()
            if (
                "icosphere" in low_name
                or "cylinder" in low_name
                or "hand_shape" in low_name
                or "plane" in low_name
            ):
                print(f"[Blender Pipeline] Removing debug mesh artifact: '{obj.name}'")
                bpy.data.objects.remove(obj, do_unlink=True)

    if not main_armature.animation_data:
        main_armature.animation_data_create()

    # Discover animation files in anims_dir and optional assets/animation-request/<category>
    anim_files = []
    search_dirs = []
    if anims_dir and anims_dir.exists() and anims_dir.is_dir():
        search_dirs.append(anims_dir)

    # Also check animation-request folder
    req_dir = Path(__file__).resolve().parent.parent / "assets" / "animation-request" / category
    if req_dir.exists() and req_dir.is_dir():
        search_dirs.append(req_dir)

    seen_paths = set()
    for s_dir in search_dirs:
        for ext in ("*.fbx", "*.FBX", "*.glb", "*.gltf"):
            for p in s_dir.glob(ext):
                resolved = p.resolve()
                if resolved not in seen_paths:
                    seen_paths.add(resolved)
                    anim_files.append(resolved)
    anim_files.sort()

    print(f"[Blender Pipeline] Found {len(anim_files)} animation sources across {len(search_dirs)} directories.")

    all_imported_actions = []
    existing_actions = set(bpy.data.actions)
    existing_objects = set(bpy.context.scene.objects)

    for anim_path in anim_files:
        try:
            if anim_path.suffix.lower() == ".fbx":
                bpy.ops.import_scene.fbx(filepath=str(anim_path))
            else:
                bpy.ops.import_scene.gltf(filepath=str(anim_path))
        except Exception as e:
            print(f"  Warning: Failed to import {anim_path.name}: {e}")
            continue

        new_acts = list(set(bpy.data.actions) - existing_actions)
        new_objs = list(set(bpy.context.scene.objects) - existing_objects)

        for act in new_acts:
            act.use_fake_user = True
            all_imported_actions.append(act)
            existing_actions.add(act)

        for obj in new_objs:
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
            except Exception:
                pass
            existing_objects.discard(obj)

    targets = (
        PLAYER_STANDARD_TARGETS if category == "player" else BOSS_STANDARD_TARGETS
    )

    merged_tracks = []
    assigned_actions = set()

    for std_name, candidate_patterns in targets.items():
        # Find best matching action from all imported actions
        best_act = find_best_action(
            [a for a in all_imported_actions if a not in assigned_actions],
            candidate_patterns,
        )
        if not best_act:
            # Fallback allowing reuse if needed
            best_act = find_best_action(all_imported_actions, candidate_patterns)

        if not best_act:
            print(f"  Warning: No action found matching standard track '{std_name}' (patterns: {candidate_patterns})")
            continue

        assigned_actions.add(best_act)
        best_act.name = std_name
        best_act.use_fake_user = True

        track = main_armature.animation_data.nla_tracks.new()
        track.name = std_name

        strip = track.strips.new(
            std_name,
            int(best_act.frame_range[0]),
            best_act,
        )
        strip.action_frame_start = best_act.frame_range[0]
        strip.action_frame_end = best_act.frame_range[1]

        # Action Slot compatibility for Blender 4.4 / 5.x
        if hasattr(strip, "action_slot") and strip.action_slot is None:
            if hasattr(strip, "action_suitable_slots") and strip.action_suitable_slots:
                strip.action_slot = strip.action_suitable_slots[0]
            elif hasattr(best_act, "slots") and len(best_act.slots) > 0:
                strip.action_slot = best_act.slots[0]

        merged_tracks.append(std_name)
        duration_s = (best_act.frame_range[1] - best_act.frame_range[0]) / 24.0
        print(f"[Blender Pipeline] Standardized track '{std_name}' -> '{best_act.name}' ({best_act.frame_range[0]}..{best_act.frame_range[1]}, ~{duration_s:.2f}s)")

    print(f"[Blender Pipeline] Successfully embedded {len(merged_tracks)} standardized NLA tracks: {merged_tracks}")

    # Remove any leftover actions not part of the active standardized tracks
    for act in list(bpy.data.actions):
        if act.name not in merged_tracks:
            bpy.data.actions.remove(act)

    # Clear active action so glTF exporter evaluates NLA tracks cleanly
    if main_armature.animation_data:
        main_armature.animation_data.action = None

    # Ensure output directory exists
    output_glb.parent.mkdir(parents=True, exist_ok=True)

    print(f"[Blender Pipeline] Exporting standardized GLB: {output_glb.name}...")
    bpy.context.view_layer.objects.active = main_armature
    main_armature.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        export_animations=True,
        export_nla_strips=True,
        export_def_bones=False,
        export_optimize_animation_size=True,
    )

    size_mb = output_glb.stat().st_size / (1024 * 1024)
    print(f"[Blender Pipeline] Finished {output_glb.name} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
