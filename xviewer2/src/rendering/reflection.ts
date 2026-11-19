import {
    BufferAttribute, BufferGeometry, Camera, HalfFloatType, LinearFilter, Mesh, MeshStandardMaterial,
    NoBlending, Scene, ShaderMaterial, Uniform, Vector2, WebGLRenderTarget,
} from "three";
import type { Matrix4, MeshStandardMaterialParameters, Shader, Texture, WebGLRenderer } from "three";
import {
    blurFragment, blurVertex, reflectorFragmentBody, reflectorFragmentHeader,
    reflectorVertexBody, reflectorVertexHeader,
} from "./reflector-shaders.ts";

/** 标准材质与原版镜面反射采样的组合。 */
export class MeshReflectorMaterial extends MeshStandardMaterial {
    /** onBeforeCompile 与访问器共享同一套 uniform 引用。 */
    private reflectorUniforms = {
        tDiffuse: { value: null as Texture | null },
        tDepth: { value: null as Texture | null },
        distortionMap: { value: null as Texture | null },
        tDiffuseBlur: { value: null as Texture | null },
        textureMatrix: { value: null as Matrix4 | null },
        hasBlur: { value: false as boolean },
        mirror: { value: 0 as number },
        mixBlur: { value: 0 as number },
        mixStrength: { value: 0.5 as number },
        minDepthThreshold: { value: 0.9 as number },
        maxDepthThreshold: { value: 1 as number },
        depthScale: { value: 0 as number },
        depthToBlurRatioBias: { value: 0.25 as number },
        distortion: { value: 1 as number },
        mixContrast: { value: 1 as number },
    };

    constructor(options: MeshStandardMaterialParameters = {}) {
        super(options);
        this.setValues(options);
    }

    /** 将反射投影和镜面采样插入 Three.js 标准材质。 */
    override onBeforeCompile(shader: Shader & { defines?: Record<string, string> }) {
        const defines = shader.defines ??= {};
        if (!defines.USE_UV) defines.USE_UV = "";
        Object.assign(shader.uniforms, this.reflectorUniforms);
        shader.vertexShader = reflectorVertexHeader + shader.vertexShader.replace("#include <project_vertex>", reflectorVertexBody);
        shader.fragmentShader = reflectorFragmentHeader + shader.fragmentShader.replace("#include <emissivemap_fragment>", reflectorFragmentBody);
    }

    get tDiffuse() { return this.reflectorUniforms.tDiffuse.value; }
    set tDiffuse(value: Texture | null) { this.reflectorUniforms.tDiffuse.value = value; }
    get tDepth() { return this.reflectorUniforms.tDepth.value; }
    set tDepth(value: Texture | null) { this.reflectorUniforms.tDepth.value = value; }
    get distortionMap() { return this.reflectorUniforms.distortionMap.value; }
    set distortionMap(value: Texture | null) { this.reflectorUniforms.distortionMap.value = value; }
    get tDiffuseBlur() { return this.reflectorUniforms.tDiffuseBlur.value; }
    set tDiffuseBlur(value: Texture | null) { this.reflectorUniforms.tDiffuseBlur.value = value; }
    get textureMatrix() { return this.reflectorUniforms.textureMatrix.value; }
    set textureMatrix(value: Matrix4 | null) { this.reflectorUniforms.textureMatrix.value = value; }
    get hasBlur() { return this.reflectorUniforms.hasBlur.value; }
    set hasBlur(value: boolean) { this.reflectorUniforms.hasBlur.value = value; }
    get mirror() { return this.reflectorUniforms.mirror.value; }
    set mirror(value: number) { this.reflectorUniforms.mirror.value = value; }
    get mixBlur() { return this.reflectorUniforms.mixBlur.value; }
    set mixBlur(value: number) { this.reflectorUniforms.mixBlur.value = value; }
    get mixStrength() { return this.reflectorUniforms.mixStrength.value; }
    set mixStrength(value: number) { this.reflectorUniforms.mixStrength.value = value; }
    get minDepthThreshold() { return this.reflectorUniforms.minDepthThreshold.value; }
    set minDepthThreshold(value: number) { this.reflectorUniforms.minDepthThreshold.value = value; }
    get maxDepthThreshold() { return this.reflectorUniforms.maxDepthThreshold.value; }
    set maxDepthThreshold(value: number) { this.reflectorUniforms.maxDepthThreshold.value = value; }
    get depthScale() { return this.reflectorUniforms.depthScale.value; }
    set depthScale(value: number) { this.reflectorUniforms.depthScale.value = value; }
    get depthToBlurRatioBias() { return this.reflectorUniforms.depthToBlurRatioBias.value; }
    set depthToBlurRatioBias(value: number) { this.reflectorUniforms.depthToBlurRatioBias.value = value; }
    get distortion() { return this.reflectorUniforms.distortion.value; }
    set distortion(value: number) { this.reflectorUniforms.distortion.value = value; }
    get mixContrast() { return this.reflectorUniforms.mixContrast.value; }
    set mixContrast(value: number) { this.reflectorUniforms.mixContrast.value = value; }
}

/** 反射模糊所用的多次采样材质。 */
export class ConvolutionMaterial extends ShaderMaterial {
    /** 原版五组采样偏移。 */
    kernel = new Float32Array([0, 1, 2, 2, 3]);

    constructor(texel = new Vector2()) {
        super({
            uniforms: {
                inputBuffer: new Uniform(null), depthBuffer: new Uniform(null),
                resolution: new Uniform(new Vector2()), texelSize: new Uniform(new Vector2()),
                halfTexelSize: new Uniform(new Vector2()), kernel: new Uniform(0), scale: new Uniform(1),
                cameraNear: new Uniform(0), cameraFar: new Uniform(1),
                minDepthThreshold: new Uniform(0), maxDepthThreshold: new Uniform(1),
                depthScale: new Uniform(0), depthToBlurRatioBias: new Uniform(0.25),
            },
            fragmentShader: blurFragment, vertexShader: blurVertex,
            blending: NoBlending, depthWrite: false, depthTest: false, toneMapped: false,
        });
        this.setTexelSize(texel.x, texel.y);
    }

    /** 使用纹素尺寸计算半纹素偏移。 */
    setTexelSize(x: number, y: number) {
        this.uniforms.texelSize.value.set(x, y);
        this.uniforms.halfTexelSize.value.set(x, y).multiplyScalar(0.5);
    }

    /** 同步输入的解析宽高。 */
    setResolution(size: Vector2) { this.uniforms.resolution.value.copy(size); }
}

/** 离屏反射模糊缓冲参数。 */
interface BlurOptions {
    /** 原版保留的渲染器参数。 */
    gl?: WebGLRenderer;
    /** 两个缓冲的尺寸。 */
    resolution: number;
    /** 水平、垂直模糊采样尺度。 */
    width?: number;
    height?: number;
    /** 深度阈值和模糊偏差。 */
    minDepthThreshold?: number;
    maxDepthThreshold?: number;
    depthScale?: number;
    depthToBlurRatioBias?: number;
}

/** 在两个缓冲间交替执行卷积，结果写入给定目标。 */
export class BlurPass {
    /** 交替使用的缓冲。 */
    renderTargetA: WebGLRenderTarget;
    renderTargetB: WebGLRenderTarget;
    /** 多轮共用的采样材质和全屏网格。 */
    convolutionMaterial: ConvolutionMaterial;
    screen: Mesh;
    scene = new Scene();
    // r150 的运行时允许直接实例化 Camera，类型声明将它标记为抽象类。
    camera = new (Camera as unknown as new () => Camera)();
    /** 启用后将最后一轮输出到默认缓冲。 */
    renderToScreen = false;

    constructor({
        resolution, width = 500, height = 500, minDepthThreshold = 0,
        maxDepthThreshold = 1, depthScale = 0, depthToBlurRatioBias = 0.25,
    }: BlurOptions) {
        this.renderTargetA = new WebGLRenderTarget(resolution, resolution, {
            minFilter: LinearFilter, magFilter: LinearFilter, stencilBuffer: false,
            depthBuffer: false, type: HalfFloatType,
        });
        this.renderTargetB = this.renderTargetA.clone();
        this.convolutionMaterial = new ConvolutionMaterial();
        this.convolutionMaterial.setTexelSize(1 / width, 1 / height);
        this.convolutionMaterial.setResolution(new Vector2(width, height));
        const material = this.convolutionMaterial;
        material.uniforms.minDepthThreshold.value = minDepthThreshold;
        material.uniforms.maxDepthThreshold.value = maxDepthThreshold;
        material.uniforms.depthScale.value = depthScale;
        material.uniforms.depthToBlurRatioBias.value = depthToBlurRatioBias;
        material.defines = { ...material.defines, USE_DEPTH: depthScale > 0 };
        const geometry = new BufferGeometry()
            .setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
            .setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
        this.screen = new Mesh(geometry, material);
        this.screen.frustumCulled = false;
        this.scene.add(this.screen);
    }

    /** 逐轮将前一缓冲作为输入，最后一轮写到输出。 */
    render(renderer: WebGLRenderer, input: WebGLRenderTarget, output: WebGLRenderTarget) {
        const { kernel, uniforms } = this.convolutionMaterial;
        uniforms.depthBuffer.value = input.depthTexture;
        let current = input;
        for (let index = 0; index < kernel.length; index++) {
            const final = index === kernel.length - 1;
            const target = final ? this.renderToScreen ? null : output : index % 2 ? this.renderTargetB : this.renderTargetA;
            uniforms.kernel.value = kernel[index];
            uniforms.inputBuffer.value = current.texture;
            renderer.setRenderTarget(target);
            renderer.render(this.scene, this.camera);
            if (target) current = target;
        }
    }
}
