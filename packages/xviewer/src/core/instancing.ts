import { Group, InstancedMesh } from "three";
import type { BufferGeometry, Material, Mesh, Object3D } from "three";
import { $p } from "./properties.ts";

/** 保留原版参与批次合并的几何体、材质以及源网格。 */
interface InstanceBatch {
    /** 该批次共享的几何体。 */
    geometry: BufferGeometry;
    /** 取同组第一个网格的材质。 */
    material: Material | Material[];
    /** 按场景树遍历顺序记录的源网格。 */
    meshes: Mesh[];
}

/** 将场景树中的可见网格按几何体和材质名合并，保留世界变换。 */
export function makeInstanced(root: Object3D, props: object = {}, ignore?: (mesh: Mesh) => boolean) {
    const batches: Record<string, InstanceBatch | undefined> = {};
    root.traverse((object) => {
        if (!object.visible || !("isMesh" in object) || !object.isMesh) return;
        const mesh = object as Mesh;
        const { geometry, material } = mesh;
        if (!geometry || ignore?.(mesh)) return;

        // 原版按材质名分组。同名的不同材质共用第一份材质，多材质数组通常没有名字。
        const key = geometry.uuid + (material as { name?: string } | undefined)?.name;
        const batch = batches[key];
        if (batch) batch.meshes.push(mesh);
        else batches[key] = { geometry, material, meshes: [mesh] };
    });

    const result = new Group();
    for (const key of Object.keys(batches)) {
        const { geometry, material, meshes } = batches[key]!;
        const instance = new InstancedMesh(geometry, material, meshes.length);
        for (let index = meshes.length - 1; index >= 0; index--) {
            const mesh = meshes[index];
            mesh.updateWorldMatrix(true, false);
            instance.setMatrixAt(index, mesh.matrixWorld);
        }
        $p(instance, props);
        result.add(instance);
    }
    return result;
}
