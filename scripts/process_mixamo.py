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


# Standard animation mapping dictionaries
# Maps raw animation file stems into standardized game state names
PLAYER_ANIM_MAP = {
    "idle_01": "idle",
    "idle": "idle",
    "great_sword_slash": "attack_light",
    "attack_light": "attack_light",
    "sword_and_shield_slash": "attack_light",
    "run_sword_attack": "attack_light",
    "jump_attack": "attack_heavy",
    "sword_attack_jump": "attack_heavy",
    "attack_heavy": "attack_heavy",
    "dive_roll": "dodge",
    "roll": "dodge",
    "dodge": "dodge",
    "walking": "walk",
    "walk": "walk",
    "run": "run",
    "running": "run",
    "death": "death",
    "die": "death",
}

BOSS_ANIM_MAP = {
    "boss_idle": "idle",
    "idle": "idle",
    "heavy_smash": "attack_heavy",
    "attack": "attack_heavy",
    "attack_heavy": "attack_heavy",
    "roar": "special",
    "taunt": "special",
    "special": "special",
    "walking": "walking",
    "walk": "walking",
    "hit_reaction": "hit",
    "hit": "hit",
    "die": "die",
    "death": "die",
}

COMBINED_MAP = {**PLAYER_ANIM_MAP, **BOSS_ANIM_MAP}


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


def map_animation_name(raw_name: str, category: str = "auto") -> str:
    """
    Maps raw animation filename to standard state name based on category.
    Examples:
        Idle_01 -> idle
        Great_Sword_Slash -> attack_light
        Dive_Roll -> dodge
        Boss_Idle -> idle
        Heavy_Smash -> attack_heavy
        Roar -> special
    """
    norm = normalize_stem(raw_name)
    if category == "player" and norm in PLAYER_ANIM_MAP:
        return PLAYER_ANIM_MAP[norm]
    if category == "boss" and norm in BOSS_ANIM_MAP:
        return BOSS_ANIM_MAP[norm]
    if norm in COMBINED_MAP:
        return COMBINED_MAP[norm]
    return norm


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

    if not main_armature.animation_data:
        main_armature.animation_data_create()

    # Discover animation files in anims_dir
    anim_files = []
    if anims_dir and anims_dir.exists() and anims_dir.is_dir():
        seen_paths = set()
        for ext in ("*.fbx", "*.FBX", "*.glb", "*.gltf"):
            for p in anims_dir.glob(ext):
                resolved = p.resolve()
                if resolved not in seen_paths:
                    seen_paths.add(resolved)
                    anim_files.append(resolved)
        anim_files.sort()
    else:
        print(f"[Blender Pipeline] Note: Anims directory '{anims_dir}' not found or empty.")

    merged_tracks = []
    registered_names = set()

    for anim_path in anim_files:
        standard_name = map_animation_name(anim_path.stem, category)
        # Avoid duplicate track names
        final_track_name = standard_name
        counter = 1
        while final_track_name in registered_names:
            final_track_name = f"{standard_name}_{counter}"
            counter += 1
        registered_names.add(final_track_name)

        print(f"[Blender Pipeline] Merging '{anim_path.name}' -> standard track '{final_track_name}'")

        existing_actions = set(bpy.data.actions)
        existing_objects = set(bpy.context.scene.objects)

        if anim_path.suffix.lower() == ".fbx":
            bpy.ops.import_scene.fbx(filepath=str(anim_path))
        else:
            bpy.ops.import_scene.gltf(filepath=str(anim_path))

        new_actions = list(set(bpy.data.actions) - existing_actions)
        new_objects = list(set(bpy.context.scene.objects) - existing_objects)

        if not new_actions:
            print(f"  Warning: No action generated from {anim_path.name}, skipping.")
            for obj in new_objects:
                bpy.data.objects.remove(obj, do_unlink=True)
            continue

        imported_action = new_actions[0]
        imported_action.name = final_track_name
        imported_action.use_fake_user = True

        # Attach NLA track and strip
        track = main_armature.animation_data.nla_tracks.new()
        track.name = final_track_name

        strip = track.strips.new(
            final_track_name,
            int(imported_action.frame_range[0]),
            imported_action,
        )
        strip.action_frame_start = imported_action.frame_range[0]
        strip.action_frame_end = imported_action.frame_range[1]

        # Action Slot compatibility for Blender 4.4 / 5.x
        if hasattr(strip, "action_slot") and strip.action_slot is None:
            if hasattr(strip, "action_suitable_slots") and strip.action_suitable_slots:
                strip.action_slot = strip.action_suitable_slots[0]
            elif hasattr(imported_action, "slots") and len(imported_action.slots) > 0:
                strip.action_slot = imported_action.slots[0]

        # Purge temporary imported objects
        for obj in new_objects:
            try:
                bpy.data.objects.remove(obj, do_unlink=True)
            except Exception:
                pass

        merged_tracks.append(final_track_name)

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
