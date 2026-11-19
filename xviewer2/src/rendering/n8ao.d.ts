declare module "n8ao" {
    import type { Camera, Color, Scene } from "three";
    import { Pass } from "postprocessing/module";

    /** 1.6.8 后处理通道公开的 AO 参数。 */
    export interface AOConfiguration {
        /** 遮蔽和降噪采样设置。 */
        aoSamples: number;
        aoRadius: number;
        denoiseSamples: number;
        denoiseRadius: number;
        denoiseIterations: number;
        /** 遮蔽强度、衰减和颜色。 */
        distanceFalloff: number;
        intensity: number;
        color: Color;
        /** 显示模式和渲染分辨率。 */
        renderMode: number;
        depthAwareUpsampling: boolean;
        halfRes: boolean;
        /** 通道与渲染器颜色和深度的配合方式。 */
        gammaCorrection: boolean;
        logarithmicDepthBuffer: boolean;
        screenSpaceRadius: boolean;
        colorMultiply: boolean;
    }

    /** 供 postprocessing 合成器使用的通道。 */
    export class N8AOPostPass extends Pass {
        /** 运行时可修改的配置。 */
        configuration: AOConfiguration;
        constructor(scene: Scene, camera: Camera, width?: number, height?: number);
        /** 按原版质量名切换采样数。 */
        setQualityMode(mode: string): void;
    }
}
