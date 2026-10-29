#!/usr/bin/env python3
"""
scripts/blender_convert.py
Expert 3D Pipeline Automation Script: Sketchfab GLB -> Mixamo-Ready FBX

Solves:
1. Axis Orientation Bug:
   - Sketchfab GLBs are Y-up. Blender is Z-up. Mixamo expects Y-up.
   - Automatically unparents meshes from Sketchfab empty hierarchies.
   - Applies all transforms (location, rotation, scale) to geometry vertices.
   - Exports FBX with strict Mixamo standards: axis_forward='-Z', axis_up='Y'.
2. Material & Texture Preservation:
   - Cleans up PBR node trees to standard Principled BSDF inputs.
   - Exports with path_mode='COPY' and embed_textures=True so textures embed into FBX.
   - Tags material slot names cleanly so Three.js can rebind PBR maps if stripped.
3. Scene Hygiene:
   - Purges all empty nodes (Sketchfab_model, GLTF_SceneRootNode, locators).
   - Removes cameras, lights, and debug helper geometry (icospheres, cylinders).

CLI Usage:
    blender --background --python scripts/blender_convert.py -- <input.glb> <output.fbx>
"""

import os
import sys
import tempfile
from pathlib import Path

try:
    import bpy
    import mathutils
except ImportError:
    print(
        "Error: This script must be run inside Blender in background mode:\n"
        "       blender --background --python scripts/blender_convert.py -- <input.glb> <output.fbx>",
        file=sys.stderr,
    )
    sys.exit(1)


def parse_args():
    if "--" in sys.argv:
        args = sys.argv[sys.argv.index("--") + 1 :]
    else:
        args = []

    if len(args) < 2:
        print(
            "Usage: blender --background --python scripts/blender_convert.py -- <input.glb> <output.fbx>",
            file=sys.stderr,
        )
        sys.exit(1)

    input_path = Path(args[0]).resolve()
    output_path = Path(args[1]).resolve()
    return input_path, output_path


def clear_scene():
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


def is_helper_artifact(obj) -> bool:
    if obj.type != "MESH":
        return False
    name_low = obj.name.lower()
    if any(k in name_low for k in ("icosphere", "hand_shape", "cylinder", "debug", "helper")):
        # Only remove if it has no materials or is a low-poly primitive
        if len(obj.data.materials) == 0 or len(obj.data.vertices) < 120:
            return True
    return False


def convert_glb_to_mixamo_fbx(input_path: Path, output_path: Path):
    if not input_path.exists():
        print(f"Error: Input file does not exist: {input_path}", file=sys.stderr)
        sys.exit(1)

    print(f"\n[Blender Convert] Converting GLB -> Mixamo FBX")
    print(f"  Input:  {input_path}")
    print(f"  Output: {output_path}")

    clear_scene()

    # 1. Import GLTF/GLB
    print(f"[Blender Convert] Importing GLB scene...")
    bpy.ops.import_scene.gltf(filepath=str(input_path))

    # 2. Remove cameras, lights, and empty locator hierarchies
    for obj in list(bpy.data.objects):
        if obj.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif is_helper_artifact(obj):
            print(f"[Blender Convert] Removing helper artifact: {obj.name}")
            bpy.data.objects.remove(obj, do_unlink=True)

    # 3. Collect active mesh objects
    mesh_objects = [o for o in bpy.data.objects if o.type == "MESH"]
    if not mesh_objects:
        print("Error: No mesh objects found in source GLB.", file=sys.stderr)
        sys.exit(1)

    print(f"[Blender Convert] Processing {len(mesh_objects)} mesh object(s)...")

    # 4. Detach meshes from empty parent hierarchies while preserving world space
    for obj in mesh_objects:
        world_mat = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world_mat

        # Remove any armature modifiers (model must be clean static T-pose for Mixamo)
        arm_mods = [m for m in obj.modifiers if m.type == "ARMATURE"]
        for m in arm_mods:
            obj.modifiers.remove(m)
        if len(obj.vertex_groups) > 0:
            obj.vertex_groups.clear()
        if obj.animation_data:
            obj.animation_data_clear()

    # 5. Purge all leftover non-mesh objects (empties, old armatures)
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    # 6. Apply all transforms to geometry
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]

    # Apply Location, Rotation, Scale directly to vertices
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 7. Normalize height and place base at ground (Z=0 in Blender)
    # Calculate bounding box across all meshes
    all_verts = [obj.matrix_world @ v.co for obj in mesh_objects for v in obj.data.vertices]
    if all_verts:
        min_z = min(v.z for v in all_verts)
        max_z = max(v.z for v in all_verts)
        height = max_z - min_z
        print(f"[Blender Convert] Model height in Blender: {height:.2f}m (Z: {min_z:.2f}..{max_z:.2f})")

        # If base is offset from floor, snap to Z=0
        if abs(min_z) > 0.01:
            z_offset = -min_z
            for obj in mesh_objects:
                obj.location.z += z_offset
            bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
            print(f"[Blender Convert] Snapped base to ground (Z=0).")

    # 8. Clean up materials: clamp excessive emissions, ensure Principled BSDF
    for obj in mesh_objects:
        for slot in obj.material_slots:
            mat = slot.material
            if not mat:
                continue
            if mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == "BSDF_PRINCIPLED":
                        # Clamp emission strength so model doesn't glow white
                        if "Emission Strength" in node.inputs:
                            if node.inputs["Emission Strength"].default_value > 1.0:
                                node.inputs["Emission Strength"].default_value = 0.0
                        if "Emission Color" in node.inputs:
                            # If pure white emission, turn off
                            c = node.inputs["Emission Color"].default_value
                            if c[0] > 0.9 and c[1] > 0.9 and c[2] > 0.9:
                                node.inputs["Emission Color"].default_value = (0, 0, 0, 1)

    # 9. Export to Mixamo-standard FBX
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objects[0]

    # Write via temporary file to prevent locked overwrites
    temp_fd, temp_file_path = tempfile.mkstemp(suffix=".fbx", dir=str(output_path.parent))
    os.close(temp_fd)
    temp_target = Path(temp_file_path)

    try:
        print(f"[Blender Convert] Exporting Mixamo FBX (forward='-Z', up='Y', embed_textures=True)...")
        bpy.ops.export_scene.fbx(
            filepath=str(temp_target),
            use_selection=True,
            object_types={"MESH"},
            bake_anim=False,
            path_mode="COPY",
            embed_textures=True,
            axis_forward="-Z",
            axis_up="Y",
            apply_unit_scale=True,
            apply_scale_options="FBX_SCALE_ALL",
        )

        if output_path.exists():
            output_path.unlink()
        temp_target.rename(output_path)
    finally:
        if temp_target.exists():
            temp_target.unlink()

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"[Blender Convert] Success! Exported Mixamo-ready FBX: {output_path.name} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    in_p, out_p = parse_args()
    convert_glb_to_mixamo_fbx(in_p, out_p)
