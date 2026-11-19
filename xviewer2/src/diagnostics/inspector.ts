import {
    Color, DirectionalLight, DirectionalLightHelper, Euler, Group, Mesh, PointLight,
    PointLightHelper, SpotLight, SpotLightHelper, Texture, Vector2, Vector3, Vector4,
} from "three";
import type { Light, Material, Object3D, TextureEncoding, ToneMapping } from "three";
import type { Controller } from "three/examples/jsm/libs/lil-gui.module.min.js";
import { $basename } from "../assets/paths.ts";
import { Component } from "../core/Component.ts";
import { dependencies } from "../core/ComponentManager.ts";
import { Plugin } from "../core/Plugin.ts";
import type { Viewer } from "../core/Viewer.ts";
import { EffectPlugin, PassPlugin } from "../rendering/postprocessing.ts";
import { GUI } from "./gui.ts";

/** 参数控制器的分组、范围和状态元数据。 */
interface InspectorProperty {
    /** 分组名和排序位置。 */
    dir?: string;
    order?: number;
    /** 数值控制范围。 */
    min?: number;
    max?: number;
    step?: number;
    /** 指定控制器类型或下拉选项。 */
    value?: number | object;
    /** 控制器依赖存在的属性。 */
    parent?: string;
    /** 最近创建的控制器实例。 */
    $?: Controller;
}

/** 检查器通过元数据查找可编辑属性。 */
interface Inspectable {
    /** 文件夹标识和名称。 */
    uuid?: string;
    name?: string;
    __cls?: string;
    /** 应由检查器展示的属性。 */
    __properties?: Record<string, InspectorProperty>;
    /** 添加自动发现项之前保存的显式配置。 */
    __properties_copy?: Record<string, InspectorProperty>;
    /** 自动发现时忽略的属性。 */
    __properties_ignore?: Record<string, unknown>;
}

/** GUI 路由、场景节点增量同步和属性编辑的根插件。 */
export class InspectorPlugin extends Plugin {
    /** 根目录由此插件持有。 */
    private _gui!: GUI;

    /** 创建初始折叠的检查器。 */
    onLoad() { this._gui = new GUI({ width: 310, title: "Inspector" }).close(); }

    /** 卸载根目录。 */
    onDestroy() { this._gui.destroy(); }

    /** 将对象登记在指定目录下，按自有属性元数据创建控制器。 */
    inspect(folder = "", ...targets: (object & Inspectable)[]) {
        const root = folder ? this._gui.getFolder(folder) || this._gui.addFolder(folder).close() : this._gui;
        for (const target of targets) {
            if (root.getFolder(target.uuid!)) return;
            const metadata = target.__properties;
            if (metadata && Object.keys(metadata).length) {
                this._addControllers(root.addFolder(this.getObjectName(target), target.uuid).close(), target, metadata);
            }
        }
        return this;
    }

    /** 移除对象的目录，或清除整个分组。 */
    uninspect(folder = "", ...targets: (object & Inspectable)[]) {
        if (targets.length) {
            const parent = folder ? this._gui.getFolder(folder) || this._gui : this._gui;
            for (const target of targets) parent.removeFolder(target.uuid!);
        } else if (folder) this._gui.removeFolder(folder);
    }

    /** 优先显示对象给定的名称。 */
    getObjectName(target: object & Inspectable) { return target.name || target.constructor.name || target.__cls!; }

    /** 将颜色、纹理、向量与标量映射到原版编辑控件。 */
    private _addControllers(root: GUI, target: object, metadata: Record<string, InspectorProperty>) {
        const entries = Object.entries(metadata);
        if (target instanceof Component) entries.unshift(["enabled", { order: 0 }]);
        entries.sort(([, a], [, b]) => (a.order ?? 1000) - (b.order ?? 1000));
        for (const [key, options] of entries) {
            const folder = options.dir ? root.getFolder(options.dir) || root.addFolder(options.dir).close() : root;
            const value: unknown = Reflect.get(target, key);
            if (value instanceof Color) {
                options.$ = folder.addColor({ [key]: "#" + value.getHexString() }, key).onChange((color: string) => value.set(color));
            } else if (value instanceof Texture) {
                const image: unknown = value.image;
                const preview = { [key]: image };
                options.$ = folder.addImage(preview, key);
            } else if (value instanceof Vector2 || value instanceof Vector3 || value instanceof Vector4 || value instanceof Euler) {
                options.$ = folder.addVector({ [key]: value }, key, options.min, options.max, options.step)
                    .onChange((next: never) => value.copy(next));
            } else if (value == null || typeof value !== "object") {
                options.$ = folder.add(target, key, options.value || options.min, options.max, options.step);
            }
        }
    }
}

/** Viewer 发出的节点变化。 */
interface NodeChange {
    /** 增加、删除或清空动作。 */
    action: "add" | "remove" | "clear";
    /** 发生变化的场景子树。 */
    target: Object3D;
}

/** 可为场景子树变更注册的检查器扩展。 */
export class InspectorNodeHandler {
    /** 已连接的节点检查器。 */
    inspectorNode!: InspectorNodePlugin;
    /** 访问被挂载的场景节点。 */
    onNodeAdd?(node: Object3D): void;
    /** 访问被移除的场景节点。 */
    onNodeRemove?(node: Object3D): void;

    /** 连接到节点检查器。 */
    init(inspector: InspectorNodePlugin) {
        this.inspectorNode = inspector;
        return this;
    }
}

/** 把场景树变化分发给材质和灯光等检查器。 */
export class InspectorNodePlugin extends Plugin {
    /** 供各个处理器操作的根检查器。 */
    inspector!: InspectorPlugin;
    /** 按注册顺序运行的节点处理器。 */
    inspectorNodeHandlers: InspectorNodeHandler[] = [];

    /** 获取检查器并开始监听。 */
    onLoad() {
        const viewer = this.viewer as Viewer;
        this.inspector = viewer.getPlugin(InspectorPlugin)!;
        viewer.on("node-changed", this._onNodeChanged, this);
    }
    /** 在销毁时解除监听。 */
    onDestroy() { (this.viewer as Viewer).off("node-changed", this._onNodeChanged, this); }
    /** 启动时补录已经存在的节点。 */
    start() { (this.viewer as Viewer).scene.traverse((node) => this._onNodeChangedAt("add", node)); }
    /** 注册处理器并为其提供上下文。 */
    registHandler(handler: InspectorNodeHandler) { this.inspectorNodeHandlers.push(handler.init(this)); }
    /** 删除此前注册的处理器。 */
    unregistHandler(handler: InspectorNodeHandler) {
        const index = this.inspectorNodeHandlers.indexOf(handler);
        if (index !== -1) this.inspectorNodeHandlers.splice(index, 1);
    }
    /** 将变化应用于受影响整棵子树。 */
    private _onNodeChanged({ action, target }: NodeChange) {
        target.traverse((node) => this._onNodeChangedAt(action, node));
    }
    /** 选择对应的新增或移除回调。 */
    private _onNodeChangedAt(action: NodeChange["action"], node: Object3D) {
        for (const handler of this.inspectorNodeHandlers) {
            if (action === "add") handler.onNodeAdd?.(node);
            if (action === "remove" || action === "clear") handler.onNodeRemove?.(node);
        }
    }
}

/** Viewer 发出的组件变化。 */
interface ComponentChange {
    /** 组件被挂载或移除。 */
    action: "add" | "remove";
    /** 变化的组件。 */
    target: Component;
}

/** 共用组件事件与分类检查器的登记流程。 */
abstract class ComponentInspector extends Plugin {
    /** 目标根检查器。 */
    private _inspector!: InspectorPlugin;
    /** 在根检查器中使用的分组名。 */
    protected abstract folder: string;
    /** 判断组件是否属于本分组。 */
    protected abstract accepts(component: Component): boolean;
    /** 取得启动前已经挂载的组件。 */
    protected abstract existing(viewer: Viewer): Component[];

    /** 先登记现有对象，再观察后续变化。 */
    onLoad() {
        const viewer = this.viewer as Viewer;
        this._inspector = viewer.getPlugin(InspectorPlugin)!;
        this._inspector.inspect(this.folder, ...this.existing(viewer).filter((component) => this.accepts(component)));
        viewer.on("component-changed", this._onComponentChanged, this);
    }
    /** 解绑组件事件。 */
    onDestroy() { (this.viewer as Viewer).off("component-changed", this._onComponentChanged, this); }
    /** 仅为本分组的组件更新检查器条目。 */
    private _onComponentChanged({ action, target }: ComponentChange) {
        if (!this.accepts(target)) return;
        if (action === "add") this._inspector.inspect(this.folder, target);
        if (action === "remove") this._inspector.uninspect(this.folder, target);
    }
}

/** 查看普通组件及其公开属性。 */
export class InspectorComponentPlugin extends ComponentInspector {
    protected folder = "Components";
    protected accepts(component: Component) { return !(component instanceof Plugin); }
    protected existing(viewer: Viewer) { return viewer.getComponentsInChidren(viewer.scene, Component); }
}

/** 查看当前场景上的后处理插件。 */
export class InspectorPostprocessingPlugin extends ComponentInspector {
    protected folder = "Postprocessing";
    protected accepts(component: Component) { return component instanceof EffectPlugin || component instanceof PassPlugin; }
    protected existing(viewer: Viewer) { return viewer._getComponents(viewer.scene); }
}

/** 原版保留的相机检查扩展入口。 */
export class InspectorCameraPlugin extends Plugin {
    /** 原版的此钩子没有额外面板行为。 */
    onLoad(_options?: unknown) {}
}

/** 自动登记材质的常用属性，已有显式设置优先。 */
class MaterialHandler extends InspectorNodeHandler {
    /** 记录同一份材质的引用数量。 */
    private materials = new Map<Material, number>();

    /** 记录首个使用材质的网格。 */
    onNodeAdd(node: Object3D) {
        if (!(node instanceof Mesh) || !node.material || Array.isArray(node.material)) return;
        const material: Material & Inspectable = node.material;
        const count = this.materials.get(material) ?? 0;
        if (!count) {
            const controls: Record<string, InspectorProperty> = {
                visible: {}, transparent: {}, side: { value: { FrontSide: 0, BackSide: 1, DoubleSide: 2 } },
                color: { dir: "diffuse" }, opacity: { dir: "diffuse", min: 0, max: 1, step: 0.01 },
                map: { dir: "diffuse" }, roughness: { dir: "roughness", min: 0, max: 1, step: 0.01 },
                metalness: { dir: "metalness", min: 0, max: 1, step: 0.01 },
                emissive: { dir: "emissive" }, normalMap: { dir: "normal" }, normalScale: { dir: "normal" },
            };
            material.__properties = { ...Object.fromEntries(Object.entries(controls).filter(([key]) => Reflect.get(material, key) != null)), ...material.__properties };
            this.inspectorNode.inspector.inspect("Materials", material);
        }
        this.materials.set(material, count + 1);
    }

    /** 最后一个使用者移除时关闭材质条目。 */
    onNodeRemove(node: Object3D) {
        if (!(node instanceof Mesh) || !node.material || Array.isArray(node.material)) return;
        const material = node.material;
        const count = this.materials.get(material) ?? 0;
        if (count <= 1) {
            this.materials.delete(material);
            this.inspectorNode.inspector.uninspect("Materials", material);
        } else this.materials.set(material, count - 1);
    }
}

/** 挂载材质检查处理器。 */
export class InspectorMaterialPlugin extends Plugin {
    /** 管理当前场景中的材质引用。 */
    private _inspectorHandler = new MaterialHandler();
    private _inspectorNode!: InspectorNodePlugin;
    /** 给当前节点检查器安装处理器。 */
    onLoad() {
        this._inspectorNode = (this.viewer as Viewer).getPlugin(InspectorNodePlugin)!;
        this._inspectorNode.registHandler(this._inspectorHandler);
    }
    /** 移除材质处理器。 */
    onDestroy() { this._inspectorNode.unregistHandler(this._inspectorHandler); }
}

/** 灯光及辅助线的检查处理器。 */
class LightHandler extends InspectorNodeHandler {
    /** 集中存放各光源的辅助节点。 */
    helperGroup!: Group;
    /** 光源与各自的辅助图形。 */
    helpers = new Map<Light, DirectionalLightHelper | PointLightHelper | SpotLightHelper>();

    /** 登记光源并建立其专用辅助节点。 */
    onNodeAdd(node: Object3D) {
        if (!Reflect.get(node, "isLight")) return;
        const light = node as Light & Inspectable;
        const helper = node instanceof DirectionalLight ? new DirectionalLightHelper(node)
            : node instanceof PointLight ? new PointLightHelper(node)
                : node instanceof SpotLight ? new SpotLightHelper(node) : undefined;
        if (helper) {
            this.helperGroup.add(helper);
            this.helpers.set(light, helper);
        }
        if (node instanceof DirectionalLight || node instanceof SpotLight) {
            Object.defineProperty(node, "targetPos", {
                configurable: true, enumerable: true,
                get: () => node.target.position,
                set: (value: Vector3) => { node.target.position.copy(value); },
            });
        }
        light.__properties = {
            visible: {}, castShadow: {}, intensity: { min: 0, max: 1, step: 0.01 },
            color: {}, position: {}, ...("targetPos" in node ? { targetPos: {} } : {}), ...light.__properties,
        };
        this.inspectorNode.inspector.inspect("Lights", light);
    }
    /** 删除对应光源和辅助节点。 */
    onNodeRemove(node: Object3D) {
        if (!Reflect.get(node, "isLight")) return;
        const light = node as Light;
        const helper = this.helpers.get(light);
        if (helper) this.helperGroup.remove(helper);
        this.helpers.delete(light);
        this.inspectorNode.inspector.uninspect("Lights", light);
    }
}

/** 显示和更新场景灯光辅助线。 */
export class InspectorLightPlugin extends Plugin {
    /** 节点检查器和它使用的灯光处理器。 */
    private _inspectorNode!: InspectorNodePlugin;
    private _inspectorHandler = new LightHandler();
    /** 创建辅助根节点并注册。 */
    onLoad() {
        const viewer = this.viewer as Viewer;
        this._inspectorNode = viewer.getPlugin(InspectorNodePlugin)!;
        this._inspectorHandler.helperGroup = viewer.addNode(Group);
        this._inspectorNode.registHandler(this._inspectorHandler);
    }
    /** 移除处理器。 */
    onDestroy() { this._inspectorNode.unregistHandler(this._inspectorHandler); }
    /** 更新可见性和辅助线变换。 */
    update(_dt: number) {
        for (const [light, helper] of this._inspectorHandler.helpers) {
            helper.visible = light.visible;
            helper.update();
        }
    }
}

/** Viewer 面板可选环境贴图。 */
interface InspectorViewerOptions {
    /** 用于构建下拉列表的环境 URL。 */
    environments?: string[];
}

/** 将渲染器设置暴露为普通可编辑属性。 */
class ViewerSettings implements Inspectable {
    name = "Viewer";
    /** 以文件名作为标签的环境选项。 */
    private envMap = new Map<string, string | File | undefined>();
    /** 渲染器控制面板的属性配置。 */
    __properties: Record<string, InspectorProperty>;
    /** 接收控件变化的 Viewer。 */
    private viewer: Viewer;

    constructor(viewer: Viewer, { environments = [] }: InspectorViewerOptions) {
        this.viewer = viewer;
        this.envMap.set("none", undefined);
        const active = viewer.environment;
        if (typeof active === "string" || active instanceof File) this.envMap.set(this.environment, active);
        for (const url of environments) this.envMap.set($basename(url), url);
        this.__properties = {
            outputEncoding: { value: { LinearEncoding: 3000, sRGBEncoding: 3001 } },
            toneMapping: { value: { NoToneMapping: 0, LinearToneMapping: 1, ReinhardToneMapping: 2, CineonToneMapping: 3, ACESFilmicToneMapping: 4 } },
            toneMappingExposure: { min: 0, max: 10, step: 0.01 },
            shadows: {},
            environment: { value: [...this.envMap.keys()] },
        };
        viewer.on("env-changed", this._onEnvChanged, this);
    }
    get outputEncoding() { return this.viewer.renderer.outputEncoding; }
    set outputEncoding(value: TextureEncoding) { this.viewer.renderer.outputEncoding = value; }
    get toneMapping() { return this.viewer.renderer.toneMapping; }
    set toneMapping(value: ToneMapping) { this.viewer.renderer.toneMapping = value; }
    get toneMappingExposure() { return this.viewer.renderer.toneMappingExposure; }
    set toneMappingExposure(value: number) { this.viewer.renderer.toneMappingExposure = value; }
    get shadows() { return this.viewer.renderer.shadowMap.enabled; }
    set shadows(value: boolean) { this.viewer.renderer.shadowMap.enabled = value; }
    get environment() {
        const url = this.viewer.environment;
        return typeof url === "string" ? $basename(url) : url instanceof File ? url.name : "none";
    }
    set environment(value: string) {
        void this.viewer.setEnvironment({ url: this.envMap.get(value) }).catch((error: unknown) => { console.error(error); });
    }
    /** 解除环境更新监听。 */
    dispose() { this.viewer.off("env-changed", this._onEnvChanged, this); }
    /** 当其他调用方切换环境时，同步下拉选择。 */
    private _onEnvChanged() { this.__properties.environment.$?.updateDisplay(); }
}

/** 将当前 Viewer 的渲染设置登记到检查器。 */
export class InspectorViewerPlugin extends Plugin {
    /** 由插件管理的面板数据。 */
    private _viewerWrap!: ViewerSettings;
    /** 初始化设置和环境列表。 */
    onLoad(options: InspectorViewerOptions) {
        const viewer = this.viewer as Viewer;
        this._viewerWrap = new ViewerSettings(viewer, options);
        viewer.getPlugin(InspectorPlugin)!.inspect("", this._viewerWrap);
    }
    /** 清理面板的环境事件。 */
    onDestroy() { this._viewerWrap.dispose(); }
}

dependencies(InspectorPlugin)(InspectorComponentPlugin);
dependencies(InspectorPlugin)(InspectorCameraPlugin);
dependencies(InspectorPlugin)(InspectorNodePlugin);
dependencies(InspectorPlugin)(InspectorPostprocessingPlugin);
dependencies(InspectorPlugin)(InspectorViewerPlugin);
dependencies(InspectorNodePlugin)(InspectorLightPlugin);
dependencies(InspectorNodePlugin)(InspectorMaterialPlugin);
