import { WebGLRenderTarget } from "three";
import type { Camera, Scene, Texture } from "three";
import { Component } from "../core/Component.ts";
import { $p } from "../core/properties.ts";
import type { Viewer } from "../core/Viewer.ts";

/** 离屏尺寸和可赋给纹理实例的属性。 */
interface RenderTextureOptions {
    /** 目标宽度，默认 128。取 0 时跟随初始化时的渲染尺寸。 */
    width?: number;
    /** 目标高度，默认 128。取 0 时跟随初始化时的渲染尺寸。 */
    height?: number;
    /** 其余设置通过原版属性工具应用。 */
    [property: string]: unknown;
}

/** 加入原版像素读取入口的渲染目标纹理。 */
interface ReadableTexture extends Texture {
    /** 从渲染目标读取指定矩形到调用方提供的缓冲。 */
    readPixels(x: number, y: number, width: number, height: number, buffer: ArrayBufferView): void;
}

/** 将加载时捕获的 Viewer 场景与相机渲染到纹理。 */
export class RenderTexture extends Component {
    /** 组件持有的目标及初始化时选定的场景和相机。 */
    private _fbo!: WebGLRenderTarget;
    private _scene!: Scene;
    private _camera!: Camera;

    get texture() { return this._fbo.texture as ReadableTexture; }

    /** 创建离屏目标并暴露像素读取接口。 */
    onLoad({ width = 128, height = 128, ...options }: RenderTextureOptions) {
        const { scene, camera, size, renderer } = this.viewer as Viewer;
        this._scene = scene;
        this._camera = camera;
        this._fbo = new WebGLRenderTarget(width || size.width, height || size.height);
        this.texture.readPixels = (x, y, w, h, buffer) => renderer.readRenderTargetPixels(this._fbo, x, y, w, h, buffer);
        $p(this.texture, options);
    }

    /** 每帧渲染目标并切回默认帧缓冲。 */
    update(_dt: number) {
        const { renderer } = this.viewer as Viewer;
        renderer.setRenderTarget(this._fbo);
        renderer.render(this._scene, this._camera);
        renderer.setRenderTarget(null);
    }
}
