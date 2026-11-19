import { N8AOPostPass } from "n8ao";
import type { AOConfiguration } from "n8ao";
import type { Viewer } from "../core/Viewer.ts";
import { PassPlugin } from "./postprocessing.ts";

/** 使用原版初始化参数安装 N8AO 后处理通道。 */
export class N8AOPlugin extends PassPlugin<N8AOPostPass> {
    name = "N8AOPlugin";
    /** 原版访问器恒定报告默认质量。 */
    private _quality = "Medium";

    /** 应用原版降噪和遮蔽默认值。 */
    initialize(options: Partial<AOConfiguration>) {
        const { scene, camera } = this.viewer as Viewer;
        this.pass = new N8AOPostPass(scene, camera);
        Object.assign(this.pass.configuration, {
            depthAwareUpsampling: true, aoRadius: 5, aoSamples: 16, denoiseSamples: 4,
            denoiseRadius: 12, distanceFalloff: 1, intensity: 1, renderMode: 0, ...options,
        });
    }

    get intensity() { return this.pass.configuration.intensity; }
    set intensity(value: number) { this.pass.configuration.intensity = value; }
    get aoRadius() { return this.pass.configuration.aoRadius; }
    set aoRadius(value: number) { this.pass.configuration.aoRadius = value; }
    get quality() { return this._quality; }
    set quality(value: string) { this.pass.setQualityMode(value); }
    get renderMode() { return this.pass.configuration.renderMode; }
    set renderMode(value: number) { this.pass.configuration.renderMode = value; }
    get depthAwareUpsampling() { return this.pass.configuration.depthAwareUpsampling; }
    set depthAwareUpsampling(value: boolean) { this.pass.configuration.depthAwareUpsampling = value; }
    get halfRes() { return this.pass.configuration.halfRes; }
    set halfRes(value: boolean) { this.pass.configuration.halfRes = value; }
}
