import { BufferGeometry, Color, Float32BufferAttribute, Quaternion, Vector2, Vector4 } from "three";
import type { ColorRepresentation } from "three";
import { Vector3 } from "./threeCompatibility.ts";

/** 构造颜色。三个数值表示各 RGB 分量，一个值交由 Three.js 解析。 */
export function $c(color?: ColorRepresentation): Color;
export function $c(r: number, g: number, b: number): Color;
export function $c(...args: [ColorRepresentation?] | [number, number, number]): Color {
    const color = new Color();
    if (args.length === 1) color.set(args[0]!);
    if (args.length === 3) color.setRGB(...args);
    return color;
}

/** 创建二维向量，缺省的后续坐标沿用首项。 */
export function $v2(x?: number, y?: number) {
    return new Vector2(x, y ?? x);
}

/** 创建三维向量，缺省的后续坐标沿用首项。 */
export function $v3(x?: number, y?: number, z?: number) {
    return new Vector3(x, y ?? x, z ?? x);
}

/** 创建四维向量，缺省的后续坐标沿用首项。 */
export function $v4(x?: number, y?: number, z?: number, w?: number) {
    return new Vector4(x, y ?? x, z ?? x, w ?? x);
}

/** 创建四元数，省略参数时使用单位四元数。 */
export function $q(x?: number, y?: number, z?: number, w?: number) {
    return new Quaternion(x, y, z, w);
}

/** 创建覆盖整个裁剪空间的非索引三角形，用于全屏渲染通道。 */
export function getFullscreenTriangle() {
    return new BufferGeometry()
        .setAttribute("position", new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3))
        .setAttribute("uv", new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
}
