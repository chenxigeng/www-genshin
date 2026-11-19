import { Entity } from "./Entity.ts";
import type { ScheduledCallback } from "./Scheduler.ts";
import type { Object3D } from "three";
import type { Viewer } from "./Viewer.ts";

/** 组件管理需要的场景节点能力，Three.js 对象可直接满足。 */
export interface ComponentNode {
    /** 当前节点的可见状态。 */
    visible: boolean;
    /** 直接子节点，按场景树顺序遍历。 */
    children: ComponentNode[];
    /** 挂载到此节点上的组件。 */
    _components?: Component[];
    /** 从父节点移除自身。 */
    removeFromParent(): unknown;
}

/** 挂载在场景节点上，由 Viewer 管理生命周期和计时任务。 */
export class Component<TNode extends ComponentNode = ComponentNode> extends Entity {
    /** 挂载时由管理器填入的 Viewer。 */
    viewer!: Viewer;
    /** 保留组件专用节点的类型。 */
    node!: TNode;
    isComponent = true;
    _enabled = true;
    /** 可选的宿主节点工厂，由 Viewer.addNode 在挂载前调用。 */
    create?(props: unknown): Object3D;
    /** 已加载组件销毁时可执行的业务清理。 */
    onDestroy?(): void;
    /** 节点挂载后首次加载，接收调用者提供的配置。 */
    onLoad?(props: unknown): void;
    /** 进入生命周期调度时调用。 */
    onEnable?(): void;
    /** 离开生命周期调度时调用。 */
    onDisable?(): void;
    /** 在启用后的首个更新阶段执行。 */
    start?(): void;
    /** 常规帧更新。 */
    update?(dt: number): void;
    /** 所有常规更新完成后的帧更新。 */
    lastUpdate?(dt: number): void;

    get enabled() {
        return this._enabled;
    }

    /** 更新启用状态，只在值变化时通知组件调度器。 */
    set enabled(enabled: boolean) {
        if (this._enabled !== enabled) {
            this._enabled = enabled;
            this.viewer?.componentScheduler.enableComponent(this, enabled);
        }
    }

    /** 在实体失效前注销任务、解除节点挂载，并完成组件销毁回调。 */
    _onPreDestroy() {
        this.unscheduleAll();
        this.viewer?.removeComponent(this.node, this);
        if (this._enabled) this.viewer?.componentScheduler.enableComponent(this, false);
        if (this.onDestroy && this.__getFlag(Entity.Flags.OnLoadCalled)) this.onDestroy();
    }

    /** 按 Viewer 时间步调度任务，默认持续执行。 */
    schedule(callback: ScheduledCallback<this>, interval: number, repeat = -1) {
        this.viewer?.scheduler.schedule(this, callback, interval, repeat);
    }

    /** 按回调注销任务，方法名沿用原版拼写。 */
    unshedule(callback: ScheduledCallback<this>) {
        this.viewer?.scheduler.unshedule(this, callback);
    }

    /** 注销此组件的全部任务。 */
    unscheduleAll() {
        this.viewer?.scheduler.unscheduleAll(this);
    }
}
