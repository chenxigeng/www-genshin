import { HalfFloatType, ShaderMaterial, Vector2 } from "three";
import type { TextureDataType } from "three";
import {
    BlendFunction, BloomEffect, ChromaticAberrationEffect, DepthOfFieldEffect, Effect, EffectComposer,
    EffectPass, FXAAEffect, Pass, RenderPass, SelectiveBloomEffect, ShaderPass, ToneMappingEffect,
} from "postprocessing/module";
import { Plugin } from "../core/Plugin.ts";
import { dependencies } from "../core/ComponentManager.ts";
import { RenderPlugin } from "../core/Viewer.ts";
import type { Viewer } from "../core/Viewer.ts";
import { DeviceInput } from "../input/DeviceInput.ts";
import type { Object3D, Vector3 } from "three";
import { fragmentShader, vertexShader } from "./nv-fxaa-shaders.ts";

export { Effect, Pass };

/** 后处理缓冲配置。 */
interface ComposerOptions {
    /** 是否分配深度与模板缓冲。 */
    depthBuffer?: boolean;
    stencilBuffer?: boolean;
    /** MSAA 采样数，0 表示关闭。 */
    multisampling?: number;
    /** 中间颜色缓冲的数据类型。 */
    frameBufferType?: TextureDataType;
}

/** 管理场景渲染通道和按需重建的效果通道。 */
export class PostprocessingPlugin extends Plugin {
    /** 当前合成器、有效效果及更新标记。 */
    private _composer!: EffectComposer;
    private _effects: Effect[] = [];
    private _effectPass: EffectPass | null = null;
    private _effectsNeedUpdate = false;

    /** 以当前场景和相机构建首个渲染通道。 */
    onLoad({ depthBuffer = true, stencilBuffer = false, multisampling = 0, frameBufferType = HalfFloatType }: ComposerOptions) {
        const { renderer, scene, camera } = this.viewer as Viewer;
        this._composer = new EffectComposer(renderer, { depthBuffer, stencilBuffer, multisampling, frameBufferType });
        this._composer.addPass(new RenderPass(scene, camera));
    }

    /** 释放合成器持有的通道与缓冲。 */
    onDestroy() { this._composer.dispose(); }

    /** 接管渲染，并监听 Viewer 的尺寸更新。 */
    onEnable() {
        const viewer = this.viewer as Viewer;
        const render = viewer.getPlugin(RenderPlugin);
        if (render) render.enabled = false;
        viewer.on(DeviceInput.RESIZE, this.onResize, this);
    }

    /** 将渲染交还给默认插件。 */
    onDisable() {
        const viewer = this.viewer as Viewer;
        const render = viewer.getPlugin(RenderPlugin);
        if (render) render.enabled = true;
        viewer.off(DeviceInput.RESIZE, this.onResize, this);
    }

    /** 同步合成器尺寸。 */
    onResize(width: number, height: number) { this._composer.setSize(width, height); }

    /** 添加独立通道。 */
    addPass(pass: Pass) { this._composer.addPass(pass); }

    /** 移除指定通道。 */
    removePass(pass: Pass) { this._composer.removePass(pass); }

    /** 登记效果，延迟至下一帧重建合成通道。 */
    addEffect(effect: Effect) {
        this._effects.push(effect);
        this._effectsNeedUpdate = true;
    }

    /** 移除首个匹配的效果。 */
    removeEffect(effect: Effect) {
        const index = this._effects.indexOf(effect);
        if (index !== -1) {
            this._effects.splice(index, 1);
            this._effectsNeedUpdate = true;
        }
    }

    /** 按最新效果清单更新最后一个合成通道。 */
    updateEffects() {
        if (!this._effectsNeedUpdate) return;
        this._effectsNeedUpdate = false;
        if (this._effectPass) {
            this.removePass(this._effectPass);
            this._effectPass = null;
        }
        if (this._effects.length) {
            this._effectPass = new EffectPass((this.viewer as Viewer).camera, ...this._effects);
            this.addPass(this._effectPass);
        }
    }

    /** 重置统计并使用秒级帧增量渲染。 */
    update(dt: number) {
        this.updateEffects();
        (this.viewer as Viewer).renderer.info.reset();
        this._composer.render(dt);
    }
}

/** 插件生命周期与 postprocessing 效果间的桥接。 */
export class EffectPlugin<E extends Effect = Effect> extends Plugin {
    /** 初始化后交给合成器的效果。 */
    effect!: E;
    /** 根据挂载配置构建实际效果。 */
    initialize?(props: unknown): void;

    /** 初始化包装器。 */
    onLoad(props: unknown) { this.initialize?.(props); }
    /** 向活动场景现有的合成器登记效果。 */
    onEnable() { (this.viewer as Viewer).getPlugin(PostprocessingPlugin)?.addEffect(this.effect); }
    /** 从活动合成器移除效果。 */
    onDisable() { (this.viewer as Viewer).getPlugin(PostprocessingPlugin)?.removeEffect(this.effect); }
}

/** 插件生命周期与独立后处理通道间的桥接。 */
export class PassPlugin<P extends Pass = Pass> extends Plugin {
    /** 初始化后交给合成器的通道。 */
    pass!: P;
    /** 根据挂载配置构建实际通道。 */
    initialize?(props: unknown): void;

    /** 初始化通道并登记到现有合成器。 */
    onLoad(props: unknown) {
        this.initialize?.(props);
        (this.viewer as Viewer).getPlugin(PostprocessingPlugin)?.addPass(this.pass);
    }
    /** 启用已有通道。 */
    onEnable() { this.pass.enabled = true; }
    /** 禁用已有通道。 */
    onDisable() { this.pass.enabled = false; }
    /** 从合成器撤除已销毁插件的通道。 */
    onDestroy() { (this.viewer as Viewer).getPlugin(PostprocessingPlugin)?.removePass(this.pass); }
}

dependencies(PostprocessingPlugin)(EffectPlugin);
dependencies(PostprocessingPlugin)(PassPlugin);

/** 阈值泛光，使用原版的加法混合。 */
export class BloomPlugin extends EffectPlugin<BloomEffect> {
    name = "BloomPlugin";
    /** 初始化泛光效果。 */
    initialize(options: ConstructorParameters<typeof BloomEffect>[0]) {
        this.effect = new BloomEffect({ blendFunction: BlendFunction.ADD, ...options });
    }
    get intensity() { return this.effect.intensity; }
    set intensity(value: number) { this.effect.intensity = value; }
    get luminanceThreshold() { return this.effect.luminanceMaterial.threshold; }
    set luminanceThreshold(value: number) { this.effect.luminanceMaterial.threshold = value; }
}

/** 选择对象后执行阈值泛光。 */
export class SelectiveBloomPlugin extends EffectPlugin<SelectiveBloomEffect> {
    name = "SelectiveBloomPlugin";
    /** 使用选择集、图层和背景配置创建效果。 */
    initialize({
        selection, selectionLayer = 11, ignoreBackground = false, ...options
    }: NonNullable<ConstructorParameters<typeof SelectiveBloomEffect>[2]> & {
        /** 初始参与泛光的场景对象。 */
        selection?: Object3D[];
        /** 选择集使用的图层。 */
        selectionLayer?: number;
        /** 是否从效果中忽略背景。 */
        ignoreBackground?: boolean;
    }) {
        const { scene, camera } = this.viewer as Viewer;
        this.effect = new SelectiveBloomEffect(scene, camera, { blendFunction: BlendFunction.ADD, ...options });
        if (Array.isArray(selection)) this.effect.selection.set(selection);
        this.effect.selection.layer = selectionLayer;
        this.effect.ignoreBackground = ignoreBackground;
    }
    get intensity() { return this.effect.intensity; }
    set intensity(value: number) { this.effect.intensity = value; }
    get luminanceThreshold() { return this.effect.luminanceMaterial.threshold; }
    set luminanceThreshold(value: number) { this.effect.luminanceMaterial.threshold = value; }
    get selectionLayer() { return this.effect.selection.layer; }
    set selectionLayer(value: number) { this.effect.selection.layer = value; }
}

/** 配置 FXAA 边缘阈值和采样。 */
export class FXAAPlugin extends EffectPlugin<FXAAEffect> {
    name = "FXAAPlugin";
    /** 构造 FXAA 效果。 */
    initialize(options: ConstructorParameters<typeof FXAAEffect>[0]) { this.effect = new FXAAEffect(options); }
    /** 依赖的声明误写为 boolean，此访问器在运行时使用数值。 */
    get minEdgeThreshold(): number { return Number(this.effect.minEdgeThreshold); }
    set minEdgeThreshold(value: number) { Reflect.set(this.effect, "minEdgeThreshold", value); }
    get maxEdgeThreshold() { return this.effect.maxEdgeThreshold; }
    set maxEdgeThreshold(value: number) { this.effect.maxEdgeThreshold = value; }
    /** 库的声明误写为 boolean，实际访问器接收和返回数值。 */
    get subpixelQuality(): number { return Number(this.effect.subpixelQuality); }
    set subpixelQuality(value: number) { Reflect.set(this.effect, "subpixelQuality", value); }
    get samples(): number { return Number(this.effect.samples); }
    set samples(value: number) { Reflect.set(this.effect, "samples", value); }
}

/** 通过通道完成 HDR 到显示亮度的映射。 */
export class ToneMappingPlugin extends EffectPlugin<ToneMappingEffect> {
    name = "ToneMappingPlugin";
    /** 构造色调映射效果。 */
    initialize(options: ConstructorParameters<typeof ToneMappingEffect>[0]) { this.effect = new ToneMappingEffect(options); }
    get mode() { return this.effect.mode; }
    set mode(value: ToneMappingEffect["mode"]) { this.effect.mode = value; }
}

/** 为屏幕空间颜色通道设置偏移。 */
export class ChromaticAberrationPlugin extends EffectPlugin<ChromaticAberrationEffect> {
    name = "ChromaticAberrationPlugin";
    /** 构造色差效果。 */
    initialize(options: ConstructorParameters<typeof ChromaticAberrationEffect>[0]) {
        this.effect = new ChromaticAberrationEffect(options);
    }
    get offset() { return this.effect.offset; }
    set offset(value: Vector2) { this.effect.offset.copy(value); }
}

/** 按活动相机和目标位置计算景深。 */
export class DepthOfFieldPlugin extends EffectPlugin<DepthOfFieldEffect> {
    name = "DepthOfFieldPlugin";
    /** 使用当前相机初始化景深，可指定聚焦目标。 */
    initialize({ target, ...options }: NonNullable<ConstructorParameters<typeof DepthOfFieldEffect>[1]> & {
        /** 可选的世界坐标聚焦点。 */
        target?: Vector3;
    }) {
        this.effect = new DepthOfFieldEffect((this.viewer as Viewer).camera, options);
        this.effect.target = target!;
    }
    get target() { return this.effect.target; }
    set target(value: Vector3) { this.effect.target = value; }
    get focalLength() { return this.effect.circleOfConfusionMaterial.focalLength; }
    set focalLength(value: number) { this.effect.circleOfConfusionMaterial.focalLength = value; }
    get bokehScale() { return this.effect.bokehScale; }
    set bokehScale(value: number) { this.effect.bokehScale = value; }
}

/** 使用原版独立着色器执行 NVIDIA FXAA。 */
export class NVFXAAPlugin extends PassPlugin<ShaderPass> {
    name = "NVFXAAPlugin";
    /** 保留输入缓冲及当前物理像素大小。 */
    private _material = new ShaderMaterial({
        fragmentShader,
        vertexShader,
        uniforms: { tDiffuse: { value: null }, resolution: { value: new Vector2(1 / 1024, 1 / 512) } },
    });

    /** 创建由输入纹理驱动的抗锯齿通道。 */
    initialize() { this.pass = new ShaderPass(this._material, "tDiffuse"); }

    /** 将 CSS 尺寸和 DPR 转换成物理像素的倒数。 */
    update(_dt: number) {
        const { dpr, size } = this.viewer as Viewer;
        this._material.uniforms.resolution.value.set(1 / (size.width * dpr), 1 / (size.height * dpr));
    }
}
