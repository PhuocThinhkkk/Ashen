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
    "idle": ["great_sword_idle", "idle"],
    "walk": ["great_sword_walk_forward", "walk"],
    "walk_backward": ["great_sword_walk_backward"],
    "strafe_left": ["great_sword_strafe_left"],
    "strafe_right": ["great_sword_strafe_right"],
    "run": ["great_sword_run", "run"],
    "dodge": ["stand_to_roll", "roll"],
    "attack_light": ["great_sword_light_attack", "attack_light"],
    "attack_heavy": ["standing_melee_attack_downward", "great_sword_light_attack"],
    "hit": ["great_sword_impact", "impact", "hit"],
    "death": ["great_sword_impact", "hit", "death", "die"],
}

BOSS_STANDARD_TARGETS = {
    "idle": ["great_sword_idle", "idle"],
    "walking": ["great_sword_walk_forward", "walk"],
    "walk": ["great_sword_walk_forward", "walk"],
    "run": ["great_sword_run", "run"],
    "attack_heavy": ["standing_melee_attack_downward", "attack_heavy"],
    "attack_combo": ["standing_melee_combo_attack_ver_2", "combo_attack"],
    "attack_jump": ["standing_melee_run_jump_attack", "jump_attack"],
    "attack_360": ["standing_melee_attack_360_low_heavy_attack", "360_attack"],
    "kick": ["great_sword_kick", "kick"],
    "attack_light": ["great_sword_light_attack"],
    "special": ["standing_melee_attack_360_low_heavy_attack", "attack_360", "special"],
    "hit": ["great_sword_impact", "hit"],
    "die": ["great_sword_impact", "hit", "die", "death"],
    "death": ["great_sword_impact", "hit", "death", "die"],
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
            stem_lower = a.get("source_stem", "").lower()
            length = a.frame_range[1] - a.frame_range[0]
            if length <= 2:
                continue
            if pat.startswith("|") and (name_lower.endswith(pat.lower()) or stem_lower.endswith(pat.lower())):
                return a
            norm_name = normalize_stem(a.name)
            norm_stem = normalize_stem(stem_lower) if stem_lower else ""
            norm_alnum = re.sub(r"[^a-z0-9]", "", norm_name)
            stem_alnum = re.sub(r"[^a-z0-9]", "", norm_stem)
            if pat_alnum and (
                pat_alnum == norm_alnum
                or norm_alnum.endswith(pat_alnum)
                or pat_alnum in norm_alnum
                or (stem_alnum and (pat_alnum == stem_alnum or stem_alnum.endswith(pat_alnum) or pat_alnum in stem_alnum))
            ):
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

    # Locate primary character mesh
    char_mesh = next((o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Object")), None)
    if not char_mesh:
        char_mesh = next((o for o in bpy.data.objects if o.type == "MESH" and len(o.data.vertices) > 500), None)
    if not char_mesh:
        char_mesh = next((o for o in bpy.data.objects if o.type == "MESH"), None)

    # Purge all extraneous helper geometry, camera/light, and empty locator nodes
    for obj in list(bpy.data.objects):
        if obj != main_armature and obj != char_mesh:
            print(f"[Blender Pipeline] Purging non-character object: '{obj.name}' ({obj.type})")
            bpy.data.objects.remove(obj, do_unlink=True)

    # Reset emission on all materials so character doesn't blow out into a blinding white mesh
    for mat in list(bpy.data.materials):
        if mat and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    if "Emission Strength" in node.inputs:
                        node.inputs["Emission Strength"].default_value = 0.0
                    if "Emission Color" in node.inputs:
                        node.inputs["Emission Color"].default_value = (0, 0, 0, 1)

    if not main_armature.animation_data:
        main_armature.animation_data_create()

    # Discover animation files strictly from animation-request (65-bone Mixamo standard)
    anim_files = []
    search_dirs = []

    req_root = Path(__file__).resolve().parent.parent / "assets" / "animation-request"
    if req_root.exists() and req_root.is_dir():
        search_dirs.append(req_root)
        req_player = req_root / "player"
        if req_player.exists() and req_player.is_dir():
            search_dirs.append(req_player)
        req_boss = req_root / "boss"
        if req_boss.exists() and req_boss.is_dir():
            search_dirs.append(req_boss)

    seen_paths = set()
    for s_dir in search_dirs:
        for ext in ("*.fbx", "*.FBX", "*.glb", "*.gltf"):
            for p in s_dir.glob(ext):
                resolved = p.resolve()
                # Exclude T-pose base models and base meshes from animation sources
                if "t-pose" in resolved.name.lower() or resolved.stem.lower() == "base":
                    continue
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
            act["source_stem"] = anim_path.stem
            # Overwrite default Mixamo action name (e.g. 'Armature|mixamo.com|Layer0') with the source file stem
            act.name = anim_path.stem
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

        act_to_use = best_act
        if best_act in assigned_actions:
            act_to_use = best_act.copy()
        assigned_actions.add(act_to_use)
        act_to_use.name = std_name
        act_to_use.use_fake_user = True

        track = main_armature.animation_data.nla_tracks.new()
        track.name = std_name

        strip = track.strips.new(
            std_name,
            int(act_to_use.frame_range[0]),
            act_to_use,
        )
        strip.action_frame_start = act_to_use.frame_range[0]
        strip.action_frame_end = act_to_use.frame_range[1]

        # Action Slot compatibility for Blender 4.4 / 5.x
        if hasattr(strip, "action_slot") and strip.action_slot is None:
            if hasattr(strip, "action_suitable_slots") and strip.action_suitable_slots:
                strip.action_slot = strip.action_suitable_slots[0]
            elif hasattr(act_to_use, "slots") and len(act_to_use.slots) > 0:
                strip.action_slot = act_to_use.slots[0]

        merged_tracks.append(std_name)
        duration_s = (act_to_use.frame_range[1] - act_to_use.frame_range[0]) / 24.0
        print(f"[Blender Pipeline] Standardized track '{std_name}' -> '{act_to_use.name}' ({act_to_use.frame_range[0]}..{act_to_use.frame_range[1]}, ~{duration_s:.2f}s)")

    print(f"[Blender Pipeline] Successfully embedded {len(merged_tracks)} standardized NLA tracks: {merged_tracks}")

    # Remove any leftover actions not part of the active standardized tracks
    for act in list(bpy.data.actions):
        if act.name not in merged_tracks:
            bpy.data.actions.remove(act)

    # Purge any leftover objects so scene contains strictly the character armature and mesh
    for obj in list(bpy.data.objects):
        if obj != main_armature and obj != char_mesh:
            bpy.data.objects.remove(obj, do_unlink=True)

    # Clear active action so glTF exporter evaluates NLA tracks cleanly
    if main_armature.animation_data:
        main_armature.animation_data.action = None

    # Ensure output directory exists
    output_glb.parent.mkdir(parents=True, exist_ok=True)

    print(f"[Blender Pipeline] Exporting standardized GLB: {output_glb.name}...")
    bpy.ops.object.select_all(action="DESELECT")
    main_armature.select_set(True)
    if char_mesh:
        char_mesh.select_set(True)
    bpy.context.view_layer.objects.active = main_armature

    bpy.ops.export_scene.gltf(
        filepath=str(output_glb),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_def_bones=False,
        export_cameras=False,
        export_lights=False,
        export_optimize_animation_size=True,
    )

    size_mb = output_glb.stat().st_size / (1024 * 1024)
    print(f"[Blender Pipeline] Finished {output_glb.name} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
