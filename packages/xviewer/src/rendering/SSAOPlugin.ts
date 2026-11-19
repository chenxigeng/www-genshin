import {
    DataTexture, DepthTexture, LinearFilter, MathUtils, Matrix4, Mesh, MeshNormalMaterial,
    NoBlending, OrthographicCamera, RepeatWrapping, RGBAFormat, ShaderMaterial, UnsignedByteType,
    UnsignedInt248Type, Vector3, Vector4, WebGLRenderTarget,
} from "three";
import type { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { getFullscreenTriangle } from "../core/geometry.ts";
import type { Viewer } from "../core/Viewer.ts";
import { Pass, PassPlugin } from "./postprocessing.ts";
import { fragmentShader, vertexShader } from "./ssao-shaders.ts";

/** 渲染世界法线及深度，再用原版 GLSL 合成屏幕空间遮蔽。 */
class AmbientOcclusionPass extends Pass {
    /** 使用活动场景和相机渲染法线缓冲。 */
    private _scene: Scene;
    private _camera: PerspectiveCamera;
    private _normalRenderTarget: WebGLRenderTarget;
    private _normalMaterial = new MeshNormalMaterial({ blending: NoBlending });
    /** 噪声、采样与输出平面由通道持有。 */
    private _noise: DataTexture;
    private _ssaoMaterial: ShaderMaterial;
    private _outputCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private _fsQuad: Mesh;
    private _aoParams = new Vector4(24, 32, 1, 0);

    constructor(scene: Scene, camera: PerspectiveCamera) {
        super();
        this._scene = scene;
        this._camera = camera;
        const width = window.innerWidth;
        const height = window.innerHeight;
        this._normalRenderTarget = new WebGLRenderTarget(width, height, {
            depthTexture: new DepthTexture(width, height, UnsignedInt248Type),
        });
        const samples = Array.from({ length: 32 }, () => {
            const vector = new Vector3(MathUtils.randFloat(-1, 1), MathUtils.randFloat(-1, 1), MathUtils.randFloat(-1, 1)).normalize();
            return new Vector4(vector.x, vector.y, vector.z, 1).multiplyScalar(MathUtils.randFloat(1e-5, 1));
        });
        const noise = new Uint8Array(64 * 64 * 4);
        for (let index = 0; index < noise.length; index += 4) {
            noise[index] = MathUtils.randInt(0, 255);
            noise[index + 1] = MathUtils.randInt(0, 255);
            noise[index + 2] = MathUtils.randInt(0, 255);
        }
        this._noise = new DataTexture(noise, 64, 64, RGBAFormat, UnsignedByteType);
        this._noise.wrapS = this._noise.wrapT = RepeatWrapping;
        this._noise.minFilter = this._noise.magFilter = LinearFilter;
        this._noise.needsUpdate = true;
        this._ssaoMaterial = new ShaderMaterial({ vertexShader, fragmentShader, uniforms: {
            tDiffuse: { value: null }, tDepth: { value: null }, tNormal: { value: null }, tNoise: { value: this._noise },
            uClippingParams: { value: new Vector4() }, uSamples: { value: samples }, uAoParams: { value: new Vector4() },
            uScreenSize: { value: new Vector4() }, uSsaoProjectionInfo: { value: new Vector4() }, uFrameModTaaSS: { value: 0 },
            cameraNear: { value: 0.1 }, cameraFar: { value: 100 },
            cameraProjectionMatrix: { value: new Matrix4() }, cameraInverseProjectionMatrix: { value: new Matrix4() },
        } });
        this._fsQuad = new Mesh(getFullscreenTriangle(), this._ssaoMaterial);
    }

    get radius() { return this._aoParams.x; }
    set radius(value: number) { this._aoParams.x = value; }
    get giBoost() { return this._aoParams.z; }
    set giBoost(value: number) { this._aoParams.z = value; }

    /** 根据目标尺寸重建投影恢复参数。 */
    override setSize(width: number, height: number) {
        this._normalRenderTarget.setSize(width, height);
        const u = this._ssaoMaterial.uniforms;
        u.uScreenSize.value.set(width, height, 1 / width, 1 / height);
        const p = this._camera.projectionMatrix.elements;
        u.uSsaoProjectionInfo.value.set(-2 / (width * p[0]), -2 / (height * p[5]), (1 - p[2]) / p[0], (1 + p[6]) / p[5]);
    }

    /** 渲染深度和法线，再写回合成器的当前输入缓冲。 */
    override render(renderer: WebGLRenderer, input: WebGLRenderTarget, output: WebGLRenderTarget) {
        renderer.setRenderTarget(this._normalRenderTarget);
        this._scene.overrideMaterial = this._normalMaterial;
        try {
            renderer.render(this._scene, this._camera);
        } finally {
            this._scene.overrideMaterial = null;
        }
        const u = this._ssaoMaterial.uniforms;
        u.tDiffuse.value = output.texture;
        u.tDepth.value = this._normalRenderTarget.depthTexture;
        u.tNormal.value = this._normalRenderTarget.texture;
        u.uAoParams.value = this._aoParams;
        u.uFrameModTaaSS.value++;
        const camera = this._camera;
        u.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
        u.cameraProjectionMatrix.value = camera.projectionMatrix;
        u.cameraNear.value = camera.near;
        u.cameraFar.value = camera.far;
        const extent = Math.tan(0.5 * MathUtils.degToRad(camera.fov));
        u.uClippingParams.value.set(camera.far - camera.near, camera.near, extent * camera.aspect, extent);
        renderer.setRenderTarget(this.renderToScreen ? null : input);
        renderer.render(this._fsQuad, this._outputCamera);
    }

    /** 释放通道的纹理、法线缓冲和几何体。 */
    override dispose() {
        this._noise.dispose();
        this._normalRenderTarget.dispose();
        this._normalMaterial.dispose();
        this._ssaoMaterial.dispose();
        this._fsQuad.geometry.dispose();
    }
}

/** 将原版屏幕空间遮蔽通道挂载到后处理合成器。 */
export class SSAOPlugin extends PassPlugin<AmbientOcclusionPass> {
    /** 使用挂载时的场景与相机。 */
    initialize() {
        const { scene, camera } = this.viewer as Viewer;
        this.pass = new AmbientOcclusionPass(scene, camera as PerspectiveCamera);
    }
    get radius() { return this.pass.radius; }
    set radius(value: number) { this.pass.radius = value; }
    get giBoost() { return this.pass.giBoost; }
    set giBoost(value: number) { this.pass.giBoost = value; }
}
