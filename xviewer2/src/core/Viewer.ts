import {
    ACESFilmicToneMapping, ColorManagement, EquirectangularReflectionMapping, MathUtils, Mesh, Object3D, PCFSoftShadowMap,
    PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer, sRGBEncoding,
} from "three";
import type { Color, Euler, OrthographicCamera, ShadowMapType, Texture, TextureEncoding, ToneMapping, WebGLRendererParameters } from "three";
import { AssetManager } from "../assets/AssetManager.ts";
import "../assets/defaultLoaders.ts";
import type { LoadProperties } from "../assets/AssetManager.ts";
import { DeviceInput } from "../input/DeviceInput.ts";
import { ComponentManager } from "./ComponentManager.ts";
import { Component } from "./Component.ts";
import { Plugin } from "./Plugin.ts";
import { $p } from "./properties.ts";
import "./threeCompatibility.ts";
import { TweenPlugin } from "../animation/TweenPlugin.ts";

/** 由 Viewer 创建的初始透视相机配置。 */
interface CameraOptions {
    /** 垂直视野角，单位为度。 */
    fov?: number;
    /** 初始宽高比，省略时使用窗口尺寸。 */
    aspect?: number;
    /** 近裁剪距离。 */
    near?: number;
    /** 远裁剪距离。 */
    far?: number;
    /** 初始世界位置。 */
    position?: Vector3;
    /** 初始旋转。 */
    rotation?: Euler;
}

/** Viewer 自有配置，以及透传给 Three.js 的渲染器参数。 */
export interface ViewerOptions<TUser extends object> extends WebGLRendererParameters {
    /** 指定阴影算法，布尔值使用原版默认算法。 */
    shadows?: boolean | ShadowMapType;
    /** 创建时设置 Three.js 全局色彩管理开关。 */
    linear?: boolean;
    /** 渲染输出编码。 */
    outputEncoding?: TextureEncoding;
    /** 渲染色调映射。 */
    toneMapping?: ToneMapping;
    /** 色调映射曝光值。 */
    toneMappingExposure?: number;
    /** 初始透视相机属性。 */
    camera?: CameraOptions;
    /** 挂载供应用场景访问的用户数据。 */
    user?: TUser;
}

/** 添加节点时应用的属性与实例化参数。 */
interface NodeOptions extends Record<string, unknown> {
    /** 传给节点或组件构造器的参数。 */
    args?: unknown[];
    /** 将新增相机切换为活动相机。 */
    makeDefault?: boolean;
}

/** 加载资源后添加到场景树的选项。 */
interface ViewerLoadOptions extends LoadProperties {
    /** 资源挂载位置，默认为活动场景。 */
    parent?: Object3D;
    /** 挂载前清除父节点现有子对象。 */
    replace?: boolean;
    /** 遍历模型网格并设置投射阴影。 */
    castShadow?: boolean;
    /** 遍历模型网格并设置接收阴影。 */
    receiveShadow?: boolean;
}

/** 环境贴图、背景贴图或背景颜色的设置。 */
interface BackgroundOptions extends LoadProperties {
    /** 优先于贴图的背景颜色。 */
    color?: Color;
    /** 更新环境时是否保留当前背景。 */
    noBackground?: boolean;
}

/** 原版允许给活动相机标记手动管理宽高比。 */
type ViewerCamera = (PerspectiveCamera | OrthographicCamera) & { manual?: boolean };

const origin = new Vector3();
const cameraPosition = new Vector3();
const rendererSize = new Vector2();

/** 在组件更新阶段复现原版自动渲染。 */
export class RenderPlugin extends Plugin {
    /** 将当前组件更新的帧增量转交给 Viewer。 */
    update(dt: number) {
        (this.viewer as Viewer).render(dt);
    }
}

/** 管理 WebGL 场景、输入与组件帧循环。 */
export class Viewer<TUser extends object = object> extends ComponentManager {
    /** 当前帧时间和动画循环状态，时间单位为秒。 */
    private _time = 0;
    private _running = false;
    /** WebGL 上下文、活动场景、相机及输入由 Viewer 管理。 */
    private _renderer: WebGLRenderer;
    private _scene = new Scene();
    private _camera: ViewerCamera;
    private _input: DeviceInput;
    /** 投影到相机视图的尺寸与像素比例。 */
    private _viewport = { width: 1, height: 1, factor: 1 };
    /** pushScene 前保存的场景和相机。 */
    private _states: {
        /** 上一个场景。 */
        scene: Scene;
        /** 上一个活动相机。 */
        camera: ViewerCamera;
    }[] = [];
    /** 应用传入的数据，销毁后重置为空对象。 */
    private _user: TUser | Record<string, never>;
    /** 最近请求的环境与背景标识，用于抑制相同输入的重复设置。 */
    private _environment: LoadProperties["url"] | null = null;
    private _background: LoadProperties["url"] | Color | null = null;

    constructor({
        canvas, shadows = false, linear = true, outputEncoding = sRGBEncoding,
        toneMapping = ACESFilmicToneMapping, toneMappingExposure = 1,
        camera = { fov: 45, near: 1, far: 1000 }, user, ...rendererOptions
    }: ViewerOptions<TUser>) {
        super();
        this._user = user ?? {};
        const { fov, aspect, near, far } = camera;
        this._camera = $p(new PerspectiveCamera(fov, aspect || window.innerWidth / window.innerHeight, near, far), camera);
        this._renderer = new WebGLRenderer({ canvas, ...rendererOptions });
        this._renderer.setPixelRatio(this.dpr);
        this._renderer.outputEncoding = outputEncoding;
        this._renderer.toneMapping = toneMapping;
        this._renderer.toneMappingExposure = toneMappingExposure;
        this._renderer.shadowMap.enabled = Boolean(shadows);
        this._renderer.shadowMap.type = typeof shadows === "boolean" ? PCFSoftShadowMap : shadows;
        this._renderer.info.autoReset = false;
        this._input = new DeviceInput(this);
        this._input.addEventListeners();
        this.addPlugin(RenderPlugin);
        this.addPlugin(TweenPlugin);
        ColorManagement.enabled = linear;
        if (!canvas) document.body.appendChild(this._renderer.domElement);
        this.start();
    }

    get input() { return this._input; }
    get time() { return this._time; }
    get renderer() { return this._renderer; }
    get scene() { return this._scene; }
    get camera() { return this._camera; }
    get dpr() { return Math.min(2, window.devicePixelRatio); }
    get viewport() { return this._viewport; }
    get size() { return this._renderer.getSize(rendererSize); }
    get user() { return this._user; }
    get environment() { return this._environment; }
    get background() { return this._background; }

    /** 加载对象并发出节点变更事件，必要时替换父节点内容。 */
    async load({ replace, castShadow, receiveShadow, parent = this._scene, ...request }: ViewerLoadOptions) {
        const node = await AssetManager.Load<Object3D>(request);
        if (replace) {
            parent.clear();
            this.emit("node-changed", { action: "clear", target: parent });
        }
        if (castShadow || receiveShadow) {
            node.traverse((child) => {
                if (child instanceof Mesh) {
                    child.castShadow = Boolean(castShadow);
                    child.receiveShadow = Boolean(receiveShadow);
                }
            });
        }
        parent.add(node);
        this.emit("node-changed", { action: "add", target: node });
        return node;
    }

    /** 更新环境贴图，并按原版规则触发背景更新。 */
    async setEnvironment(request?: BackgroundOptions) {
        const environment = request ? request.url : null;
        if (this._environment !== environment) {
            this._environment = environment;
            this.emit("env-changed", environment);
            this._scene.environment = environment ? await AssetManager.Load<Texture>({
                ...request, settings: { mapping: EquirectangularReflectionMapping, ...request?.settings },
            }) : null;
        }
        // 原版环境 Promise 先结束，背景完成与否通过其自身 Promise 处理。
        if (!request?.noBackground) void this.setBackground(request).catch((error: unknown) => {
            console.error(error);
        });
    }

    /** 设置纯色或加载背景贴图，省略参数时清除背景。 */
    async setBackground(request?: BackgroundOptions) {
        const background = request ? request.color || request.url : null;
        if (this._background !== background) {
            this._background = background;
            this.emit("bg-changed", background);
            this._scene.background = background ? request?.color || await AssetManager.Load<Texture>({
                ...request, settings: { mapping: EquirectangularReflectionMapping, ...request?.settings },
            }) : null;
        }
    }

    /** 保存当前场景与相机并切换场景。 */
    pushScene(scene = new Scene()) {
        this._states.push({ scene: this._scene, camera: this._camera });
        this._scene = scene || this._scene;
        return this;
    }

    /** 恢复最近保存的场景和相机。 */
    popScene() {
        const state = this._states.pop();
        if (state) {
            this._scene = state.scene;
            this._camera = state.camera;
        }
        return this;
    }

    /** 添加 Three.js 节点或为组件创建宿主节点。 */
    addNode<T extends Object3D>(source: T, props?: NodeOptions, parent?: Object3D): T;
    addNode<T extends Object3D | Component, Args extends unknown[]>(
        source: new (...args: Args) => T,
        props?: NodeOptions & { args?: NoInfer<Args> },
        parent?: Object3D,
    ): T;
    addNode<Args extends unknown[]>(
        source: Object3D | (new (...args: Args) => Object3D | Component),
        props: NodeOptions & { args?: Args } = {},
        parent: Object3D = this._scene,
    ): Object3D | Component {
        let node: Object3D;
        let result: Object3D | Component;
        if (typeof source === "function") {
            // 参数由调用者与构造器约定，省略 args 时原版无参实例化。
            const instance = new source(...(props.args ?? [] as unknown as Args));
            if ("isCamera" in instance && instance.isCamera && props.makeDefault) {
                const camera = instance as ViewerCamera;
                camera.manual = (camera as PerspectiveCamera).aspect !== (this._camera as PerspectiveCamera).aspect;
                this._camera = camera;
            }
            if ("isObject3D" in instance && instance.isObject3D) {
                node = parent.addObject($p(instance, props));
                result = node;
            } else {
                const component = instance as Component;
                node = parent.addObject(component.create?.(props) || new Object3D());
                result = this.addComponent(node, component, props);
            }
        } else {
            node = parent.addObject($p(source, props));
            result = node;
        }
        this.emit("node-changed", { action: "add", target: node });
        return result;
    }

    /** 将插件作为当前场景上的组件挂载。 */
    addPlugin<T extends Plugin>(plugin: T | (new () => T), props?: unknown) {
        return this.addComponent(this._scene, plugin, props);
    }

    /** 从当前场景解除插件挂载。 */
    removePlugin(plugin: Plugin) { return this.removeComponent(this._scene, plugin); }

    /** 查找当前场景上的插件。 */
    getPlugin<T extends Plugin>(plugin: new () => T) { return this.getComponent(this._scene, plugin); }

    /** 按活动相机类型调整投影和视口，再同步渲染尺寸。 */
    resize(width: number, height: number) {
        const camera = this._camera;
        if ("isOrthographicCamera" in camera && camera.isOrthographicCamera) {
            this._viewport = { width: width / camera.zoom, height: height / camera.zoom, factor: 1 };
        } else if ("isPerspectiveCamera" in camera && camera.isPerspectiveCamera) {
            if (!camera.manual) {
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
            }
            const distance = camera.getWorldPosition(cameraPosition).distanceTo(origin);
            const viewHeight = 2 * Math.tan(MathUtils.degToRad(0.5 * camera.fov)) * distance;
            const viewWidth = viewHeight * width / height;
            this._viewport = { width: viewWidth, height: viewHeight, factor: width / viewWidth };
        }
        this._renderer.setSize(width, height);
    }

    /** 启动一个动画循环，将毫秒时间戳转换为秒。 */
    start() {
        if (!this._running) {
            this._running = true;
            this._renderer.setAnimationLoop((timestamp) => {
                const time = 0.001 * timestamp;
                const dt = this._time !== 0 ? time - this._time : 0;
                this._time = time;
                this.update(dt);
            });
        }
        return this;
    }

    /** 重置本帧统计并渲染活动场景。 */
    render(_dt: number) {
        this._renderer.info.reset();
        this._renderer.render(this._scene, this._camera);
    }

    /** 停止动画循环并清零帧时间。 */
    stop() {
        this._time = 0;
        this._running = false;
        this._renderer.setAnimationLoop(null);
        return this;
    }

    /** 解除输入、释放渲染器并清理活动场景。 */
    protected override _onPreDestroy() {
        AssetManager.Clear();
        this._user = {};
        this._input.removeAllListeners();
        this._renderer.dispose();
        this.destroyComponents(this._scene);
        this.stop();
    }
}
