import { ShaderChunk as threeChunks, ShaderLib as threeShaders, UniformsLib } from "three";
import { shaderOverrides } from "./shader-chunks.ts";

export { UniformsLib };

/** 与原版公开着色器片段对应的字典。 */
export const ShaderChunk = { ...threeChunks, ...shaderOverrides };

/** 原版 ShaderLib 中引用改写片段的三个入口。 */
export const ShaderLib = {
    ...threeShaders,
    standard: { ...threeShaders.standard, fragmentShader: ShaderChunk.meshphysical_frag },
    physical: { ...threeShaders.physical, fragmentShader: ShaderChunk.meshphysical_frag },
    backgroundCube: { ...threeShaders.backgroundCube, fragmentShader: ShaderChunk.backgroundCube_frag },
};
