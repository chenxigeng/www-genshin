import {
    DepthFormat, DepthTexture, Euler, HalfFloatType, LinearFilter, Matrix4, Mesh, PerspectiveCamera,
    Plane, PlaneGeometry, UnsignedShortType, Vector3, Vector4, WebGLRenderTarget,
} from "three";
import type { Texture } from "three";
import { Component } from "../core/Component.ts";
import { $p } from "../core/properties.ts";
import type { Viewer } from "../core/Viewer.ts";
import { BlurPass, MeshReflectorMaterial } from "../rendering/reflection.ts";

/** 挂载时控制反射平面、缓冲和反射材质。 */
interface ReflectorOptions {
    /** 反射网格宽高，默认 1。 */
    width?: number;
    height?: number;
    /** 反射颜色及模糊对底色的贡献。 */
    mixBlur?: number;
    mixStrength?: number;
    /** 方形渲染缓冲的像素数。 */
    resolution?: number;
    /** 水平和垂直的模糊尺度。 */
    blur?: [number, number];
    /** 深度衰减的参数。 */
    minDepthThreshold?: number;
    maxDepthThreshold?: number;
    depthScale?: number;
    depthToBlurRatioBias?: number;
    /** 镜面底色混合、扭曲和对比度。 */
    mirror?: number;
    distortion?: number;
    mixContrast?: number;
    distortionMap?: Texture;
    /** 沿世界平面法线偏移反射面。 */
    reflectorOffset?: number;
    /** 额外值可应用于反射网格或材质。 */
    [key: string]: unknown;
}

/** 使用虚拟相机与斜投影裁剪面渲染镜面反射。 */
export class PlaneReflector extends Component {
    /** 挂载的反射网格。 */
    declare node: Mesh;
    /** 主反射、模糊目标和工作材质。 */
    private _fbo1!: WebGLRenderTarget;
    private _fbo2!: WebGLRenderTarget;
    private _blurPass!: BlurPass;
    private _reflectorMaterial!: MeshReflectorMaterial;
    private _hasBlur = false;
    /** 镜像相机、投影矩阵和法线位移。 */
    private _virtualCamera = new PerspectiveCamera();
    private _textureMatrix = new Matrix4();
    private _reflectorOffset = 0;
    /** 每帧复用的平面法线、相机和裁剪计算空间。 */
    private scratch = {
        planePosition: new Vector3(), eye: new Vector3(), normal: new Vector3(), view: new Vector3(),
        reference: new Vector3(), target: new Vector3(), rotation: new Matrix4(),
        plane: new Plane(), clip: new Vector4(), corner: new Vector4(),
    };

    /** 默认将平面从垂直方向旋转为水平。 */
    create({ width = 1, height = 1, ...options }: ReflectorOptions) {
        return $p(new Mesh(new PlaneGeometry(width, height)), { rotation: new Euler(-Math.PI / 2, 0, 0), ...options });
    }

    /** 初始化颜色和深度缓冲，再为网格设置反射材质。 */
    onLoad({
        mixBlur = 0, mixStrength = 1, resolution = 256, blur = [0, 0],
        minDepthThreshold = 0.9, maxDepthThreshold = 1, depthScale = 0, depthToBlurRatioBias = 0.25,
        mirror = 0, distortion = 1, mixContrast = 1, distortionMap, reflectorOffset = 0, ...materialOptions
    }: ReflectorOptions) {
        const { renderer } = this.viewer as Viewer;
        const options = { minFilter: LinearFilter, magFilter: LinearFilter, type: HalfFloatType } as const;
        this._fbo1 = new WebGLRenderTarget(resolution, resolution, options);
        this._fbo1.depthBuffer = true;
        this._fbo1.depthTexture = new DepthTexture(resolution, resolution, UnsignedShortType);
        this._fbo1.depthTexture.format = DepthFormat;
        this._fbo2 = new WebGLRenderTarget(resolution, resolution, options);
        this._blurPass = new BlurPass({
            gl: renderer, resolution, width: blur[0], height: blur[1],
            minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias,
        });
        const hasBlur = this._hasBlur = blur[0] + blur[1] > 0;
        this._reflectorOffset = reflectorOffset;
        this._reflectorMaterial = Object.assign(new MeshReflectorMaterial(), {
            mirror, mixBlur, textureMatrix: this._textureMatrix, tDiffuse: this._fbo1.texture,
            tDepth: this._fbo1.depthTexture, tDiffuseBlur: this._fbo2.texture, hasBlur, mixStrength,
            minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias, distortion, distortionMap, mixContrast,
            defines: { USE_BLUR: hasBlur ? "" : undefined, USE_DEPTH: depthScale > 0 ? "" : undefined, USE_DISTORTION: distortionMap ? "" : undefined },
            ...materialOptions,
        });
        this.node.material = this._reflectorMaterial;
    }

    /** 释放反射组件的各个 GPU 资源。 */
    onDestroy() {
        this._fbo1.dispose();
        this._fbo2.dispose();
        this._reflectorMaterial.dispose();
        this._blurPass.renderTargetA.dispose();
        this._blurPass.renderTargetB.dispose();
        this._blurPass.convolutionMaterial.dispose();
        this._blurPass.screen.geometry.dispose();
    }

    /** 计算镜像相机和反射纹理空间，调整斜投影的近裁剪面。 */
    beforeRender() {
        const { camera } = this.viewer as Viewer;
        const mirror = this._virtualCamera;
        const matrix = this._textureMatrix;
        const { planePosition, eye, normal, view, reference, target, rotation, plane, clip, corner } = this.scratch;
        planePosition.setFromMatrixPosition(this.node.matrixWorld);
        eye.setFromMatrixPosition(camera.matrixWorld);
        rotation.extractRotation(this.node.matrixWorld);
        normal.set(0, 0, 1).applyMatrix4(rotation);
        planePosition.addScaledVector(normal, this._reflectorOffset);
        view.subVectors(planePosition, eye);
        if (view.dot(normal) > 0) return;
        view.reflect(normal).negate().add(planePosition);
        rotation.extractRotation(camera.matrixWorld);
        reference.set(0, 0, -1).applyMatrix4(rotation).add(eye);
        target.subVectors(planePosition, reference).reflect(normal).negate().add(planePosition);
        mirror.position.copy(view);
        mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
        mirror.lookAt(target);
        mirror.far = camera.far;
        mirror.updateMatrixWorld();
        mirror.projectionMatrix.copy(camera.projectionMatrix);
        matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
            .multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse).multiply(this.node.matrixWorld);
        plane.setFromNormalAndCoplanarPoint(normal, planePosition).applyMatrix4(mirror.matrixWorldInverse);
        clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        const p = mirror.projectionMatrix.elements;
        corner.set((Math.sign(clip.x) + p[8]) / p[0], (Math.sign(clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
        clip.multiplyScalar(2 / clip.dot(corner));
        p[2] = clip.x;
        p[6] = clip.y;
        p[10] = clip.z + 1;
        p[14] = clip.w;
    }

    /** 在临时渲染状态下绘制反射，完成后恢复 Viewer 的默认目标。 */
    update(_dt: number) {
        this.node.visible = false;
        const { renderer, scene } = this.viewer as Viewer;
        const xr = renderer.xr.enabled;
        const shadows = renderer.shadowMap.autoUpdate;
        try {
            this.beforeRender();
            renderer.xr.enabled = false;
            renderer.shadowMap.autoUpdate = false;
            renderer.setRenderTarget(this._fbo1);
            renderer.state.buffers.depth.setMask(true);
            if (!renderer.autoClear) renderer.clear();
            renderer.render(scene, this._virtualCamera);
            if (this._hasBlur) this._blurPass.render(renderer, this._fbo1, this._fbo2);
        } finally {
            renderer.xr.enabled = xr;
            renderer.shadowMap.autoUpdate = shadows;
            this.node.visible = true;
            renderer.setRenderTarget(null);
        }
    }
}
