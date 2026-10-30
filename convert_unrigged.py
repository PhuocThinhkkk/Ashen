#!/usr/bin/env python3
"""
convert_unrigged.py
Automated Blender script to process and unrig 3D models into clean, static, optimized FBX files.

Features:
- Imports GLB or FBX 3D models.
- Strips all armature data, armatures, and skeletons.
- Removes all armature modifiers from all mesh objects.
- Clears any bone parent relationships while preserving exact world space transforms.
- Removes debug artifact meshes (e.g., debug icospheres, helper shapes).
- Clears remnant vertex groups and animation actions.
- Cleans out all empty locator nodes.
- Exports self-contained, unrigged FBX models with materials and embedded textures.
- Automatically verifies exported models.

Usage:
    blender --background --python convert_unrigged.py
    blender --background --python convert_unrigged.py -- --dir assets/request-animatons
"""

import os
import sys
import tempfile
import mathutils
from pathlib import Path

try:
    import bpy
except ImportError:
    print(
        "Error: Must be run inside Blender in background mode:\n"
        "       blender --background --python convert_unrigged.py",
        file=sys.stderr,
    )
    sys.exit(1)


def clear_blender_scene():
    """Completely resets the Blender scene and purges all datablocks."""
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


def is_debug_artifact(obj) -> bool:
    """Detects debug mesh artifacts (e.g. bounding spheres, icospheres with no materials)."""
    if obj.type != "MESH":
        return False
    name_low = obj.name.lower()
    # Explicit debug naming
    if any(k in name_low for k in ("icosphere", "hand_shape", "debug_shape")):
        return True
    # Untextured icosphere/cube at root
    if "icosphere" in name_low and len(obj.data.materials) == 0:
        return True
    return False


def get_bounding_box(objects):
    """Calculates world-space axis-aligned bounding box for a set of objects."""
    min_co = [float("inf")] * 3
    max_co = [float("-inf")] * 3
    found = False
    for obj in objects:
        if obj.type != "MESH" or not obj.data.vertices:
            continue
        found = True
        for corner in obj.bound_box:
            world_pt = obj.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                min_co[i] = min(min_co[i], world_pt[i])
                max_co[i] = max(max_co[i], world_pt[i])
    if not found:
        return (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)
    return tuple(min_co), tuple(max_co)


def process_model(input_path: Path, output_path: Path) -> dict:
    """
    Imports model, removes rigging/armatures, cleans transforms, strips modifiers,
    and exports an optimized unrigged FBX file.
    """
    print("\n" + "=" * 70)
    print(f"PROCESSING: {input_path.name}")
    print(f"  Source Path: {input_path}")
    print(f"  Target FBX:  {output_path}")
    print("=" * 70)

    clear_blender_scene()

    # 1. Import source model
    ext = input_path.suffix.lower()
    if ext in (".glb", ".gltf"):
        print(f"[Import] Importing GLTF/GLB: {input_path.name}...")
        bpy.ops.import_scene.gltf(filepath=str(input_path))
    elif ext == ".fbx":
        print(f"[Import] Importing FBX: {input_path.name}...")
        bpy.ops.import_scene.fbx(filepath=str(input_path))
    else:
        raise ValueError(f"Unsupported model extension: {ext}")

    orig_armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    orig_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    orig_empties = [o for o in bpy.data.objects if o.type == "EMPTY"]
    orig_actions = list(bpy.data.actions)

    print(
        f"[Analysis] Found {len(orig_meshes)} mesh(es), "
        f"{len(orig_armatures)} armature(s), "
        f"{len(orig_empties)} empty/locator node(s), "
        f"{len(orig_actions)} action(s)."
    )

    # 2. Remove debug artifacts (e.g. Icosphere)
    artifacts_removed = []
    for obj in list(bpy.data.objects):
        if is_debug_artifact(obj):
            print(f"[Clean] Removing debug mesh artifact: '{obj.name}' ({len(obj.data.vertices)} verts)")
            artifacts_removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)

    # 3. Unparent all mesh objects while strictly preserving their world transform matrix
    active_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for obj in active_meshes:
        world_mat = obj.matrix_world.copy()
        # Clear bone parenting specifically if present
        if obj.parent_type == "BONE" or obj.parent_bone:
            obj.parent_bone = ""
            obj.parent_type = "OBJECT"
        obj.parent = None
        obj.matrix_world = world_mat

        # Remove Armature modifiers
        armature_mods = [m for m in obj.modifiers if m.type == "ARMATURE"]
        for m in armature_mods:
            print(f"[Clean] Removing Armature modifier '{m.name}' from '{obj.name}'")
            obj.modifiers.remove(m)

        # Clear vertex groups (skeleton weights)
        if len(obj.vertex_groups) > 0:
            obj.vertex_groups.clear()

        # Clear animation data
        if obj.animation_data:
            obj.animation_data_clear()

    # 4. Remove all Armatures, Empties, and non-mesh objects
    removed_non_meshes = 0
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
            removed_non_meshes += 1

    # Remove all datablock armatures and actions
    for arm in list(bpy.data.armatures):
        bpy.data.armatures.remove(arm)
    for act in list(bpy.data.actions):
        bpy.data.actions.remove(act)

    remaining_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not remaining_meshes:
        raise RuntimeError(f"Error: No mesh objects found in {input_path}")

    # Calculate bounding box
    min_box, max_box = get_bounding_box(remaining_meshes)
    height = max_box[2] - min_box[2]
    width = max_box[0] - min_box[0]
    depth = max_box[1] - min_box[1]

    total_verts = sum(len(m.data.vertices) for m in remaining_meshes)
    total_faces = sum(len(m.data.polygons) for m in remaining_meshes)
    all_materials = {mat.name for m in remaining_meshes for mat in m.data.materials if mat}

    print(f"[Pipeline] Final unrigged structure:")
    print(f"  Mesh objects: {len(remaining_meshes)}")
    print(f"  Total vertices: {total_verts:,} | Total faces: {total_faces:,}")
    print(f"  Materials ({len(all_materials)}): {sorted(list(all_materials))}")
    print(f"  Dimensions: W={width:.2f}m, D={depth:.2f}m, H={height:.2f}m (Z: {min_box[2]:.2f}..{max_box[2]:.2f})")

    # 5. Export clean FBX
    output_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in remaining_meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = remaining_meshes[0]

    # Write to a temporary file first if outputting to the same path to avoid overwrite locks
    temp_fd, temp_file_path = tempfile.mkstemp(suffix=".fbx", dir=str(output_path.parent))
    os.close(temp_fd)
    temp_target = Path(temp_file_path)

    try:
        bpy.ops.export_scene.fbx(
            filepath=str(temp_target),
            use_selection=True,
            object_types={"MESH"},
            bake_anim=False,
            path_mode="COPY",
            embed_textures=True,
            axis_forward="-Z",
            axis_up="Y",
        )

        # Replace destination atomically/cleanly
        if output_path.exists():
            output_path.unlink()
        temp_target.rename(output_path)
    finally:
        if temp_target.exists():
            temp_target.unlink()

    out_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"[Export] Saved clean unrigged FBX: {output_path.name} ({out_size_mb:.2f} MB)")

    # 6. Verification: Re-import and validate
    clear_blender_scene()
    bpy.ops.import_scene.fbx(filepath=str(output_path))

    verify_armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    verify_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    verify_actions = list(bpy.data.actions)
    verify_arm_mods = [m for o in verify_meshes for m in o.modifiers if m.type == "ARMATURE"]

    assert len(verify_armatures) == 0, f"Expected 0 armatures, found {len(verify_armatures)}"
    assert len(verify_arm_mods) == 0, f"Expected 0 armature modifiers, found {len(verify_arm_mods)}"
    assert len(verify_actions) == 0, f"Expected 0 animation actions, found {len(verify_actions)}"
    assert len(verify_meshes) == len(remaining_meshes), f"Mesh count mismatch: {len(verify_meshes)} vs {len(remaining_meshes)}"

    print(f"[Verify] VERIFIED OK: 0 armatures, 0 armature modifiers, 0 actions, {len(verify_meshes)} meshes intact.")

    return {
        "name": input_path.name,
        "output": str(output_path),
        "meshes": len(verify_meshes),
        "vertices": total_verts,
        "faces": total_faces,
        "materials": len(all_materials),
        "height_m": round(height, 2),
        "size_mb": round(out_size_mb, 2),
    }


def find_target_models(base_dir: Path):
    """
    Locates the two character 3D models in the request directory,
    excluding standalone animation clips.
    """
    candidates = []
    # Check all FBX and GLB files
    for ext in ("*.glb", "*.gltf", "*.fbx", "*.FBX"):
        for p in base_dir.rglob(ext):
            p_res = p.resolve()
            name_low = p.name.lower()
            # Explicitly match the known models or filter out obvious animation clips
            is_anim_clip = any(
                k in name_low
                for k in ("attack", "kick", "combo", "roll", "running", "walk", "idle", "die", "hit", "roar")
            )
            if not is_anim_clip:
                candidates.append(p_res)

    # Sort and remove duplicates
    unique_candidates = sorted(list(set(candidates)))
    return unique_candidates


def main():
    root_dir = Path(__file__).resolve().parent

    # Check CLI arguments after '--'
    custom_dir = None
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
        for i, a in enumerate(args):
            if a in ("--dir", "-d") and i + 1 < len(args):
                custom_dir = Path(args[i + 1])

    # Determine search directory
    candidate_dirs = []
    if custom_dir:
        candidate_dirs.append(custom_dir)
    candidate_dirs.extend([
        root_dir / "assets" / "raw",
        root_dir / "assets" / "raw" / "anims",
    ])

    search_dir = None
    for d in candidate_dirs:
        if d.exists() and d.is_dir():
            search_dir = d
            break

    if not search_dir:
        print(f"Error: Could not locate directory 'assets/request-animatons'.", file=sys.stderr)
        sys.exit(1)

    print(f"Scanning models in: {search_dir}")
    models = find_target_models(search_dir)

    if not models:
        # Fallback to direct paths
        direct_boss = search_dir / "boss" / "fantasy_knight.glb"
        direct_player = search_dir / "player" / "the_forgotten_knight.fbx"
        if direct_boss.exists():
            models.append(direct_boss.resolve())
        if direct_player.exists():
            models.append(direct_player.resolve())

    print(f"Found {len(models)} model(s) to process:")
    for m in models:
        print(f"  • {m.relative_to(root_dir) if root_dir in m.parents else m.name}")

    if len(models) == 0:
        print("Error: No models found to process.", file=sys.stderr)
        sys.exit(1)

    results = []
    for model_path in models:
        # Destination: always .fbx inside the same parent folder
        dest_fbx = model_path.parent / f"{model_path.stem}.fbx"
        res = process_model(model_path, dest_fbx)
        results.append(res)

    print("\n" + "=" * 70)
    print("  BATCH PIPELINE PROCESSING COMPLETED SUCCESSFULLY")
    print("=" * 70)
    for r in results:
        print(
            f"  ✓ {r['name']:<25} -> {Path(r['output']).name:<25} "
            f"({r['meshes']} meshes, {r['vertices']:,} verts, {r['materials']} mats, "
            f"H: {r['height_m']}m, {r['size_mb']} MB)"
        )
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
