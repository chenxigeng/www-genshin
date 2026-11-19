import { Component } from "./Component.ts";
import type { ComponentNode } from "./Component.ts";
import { ComponentScheduler } from "./ComponentScheduler.ts";
import { Entity } from "./Entity.ts";
import { Scheduler } from "./Scheduler.ts";
import type { Viewer } from "./Viewer.ts";

/** 可由管理器无参构造的组件类型。 */
type ComponentConstructor<T extends Component = Component> = new () => T;

/** 装饰器写入的组件依赖记录。 */
interface DependencyMetadata {
    /** 挂载组件前需要先挂载的类型，按登记顺序处理。 */
    _dependencies?: ComponentConstructor[];
}

/** 在目标类原型上登记依赖，保留原版的继承查找行为。 */
export function dependencies(...components: ComponentConstructor[]) {
    return (target: ComponentConstructor) => {
        const prototype: Component & DependencyMetadata = target.prototype;
        (prototype._dependencies ??= []).push(...components);
    };
}

/** 管理场景树上的组件挂载及每帧生命周期。 */
export class ComponentManager extends Entity {
    /** 分别处理计时任务和组件钩子。 */
    private _scheduler = new Scheduler();
    private _componentScheduler = new ComponentScheduler();

    get scheduler() { return this._scheduler; }
    get componentScheduler() { return this._componentScheduler; }

    /** 先处理计时任务，再依次执行启动、常规更新和帧末更新。 */
    update(dt: number) {
        this.scheduler.update(dt);
        this.componentScheduler.start();
        this.componentScheduler.update(dt);
        this.componentScheduler.lastUpdate(dt);
    }

    /** 摘除场景节点并销毁其组件。 */
    destroyNode(node: ComponentNode) {
        node.removeFromParent();
        this.destroyComponents(node);
    }

    /** 更新节点可见性，并重新应用子树组件的激活状态。 */
    activeNode(node: ComponentNode, active: boolean) {
        node.visible = active;
        this.activeComponents(node);
    }

    /** 按原版活动数组的遍历行为销毁节点及子节点组件。 */
    destroyComponents(node: ComponentNode) {
        for (const component of this._getComponents(node)) component.destroy();
        node._components = [];
        for (const child of node.children) this.destroyComponents(child);
    }

    /** 每个节点按自身的 visible 值决定组件激活状态。 */
    activeComponents(node: ComponentNode) {
        const active = node.visible;
        for (const component of this._getComponents(node)) this._activeComponent(component, active);
        for (const child of node.children) this.activeComponents(child);
    }

    /** 挂载组件实例或构造器，匹配到已有组件时直接复用。 */
    addComponent<T extends Component>(target: ComponentNode | Component, source: T | ComponentConstructor<T>, props?: unknown): T {
        const node = target instanceof Component ? target.node : target;
        const constructor = typeof source === "function" ? source : source.constructor as ComponentConstructor<T>;
        const existing = this._findComponent(node, constructor);
        if (existing !== undefined) return existing;

        const component: T & DependencyMetadata = typeof source === "function" ? new source() : source;
        component.node = node;
        // 正常运行入口是 Viewer，生命周期对照也允许使用内部管理器。
        component.viewer = this as unknown as Viewer;
        for (const dependency of component._dependencies ?? []) {
            if (this.getComponent(node, dependency) === undefined) this.addComponent(node, dependency);
        }
        if (!component.__getFlag(Entity.Flags.OnLoadCalled)) {
            component.__setFlag(Entity.Flags.OnLoadCalled);
            component.onLoad?.(props || {});
        }
        this._getComponents(node).push(component);
        this._activeComponent(component, true);
        this.emit("component-changed", { action: "add", target: component });
        return component;
    }

    /** 解除挂载并发出原版拼写的移除事件。 */
    removeComponent(node: ComponentNode, component: Component) {
        const components = this._getComponents(node);
        const index = components.indexOf(component);
        if (index !== -1) {
            components.splice(index, 1);
            this.emit("omponent-changed", { action: "remove", target: component });
        }
        return this;
    }

    /** 查找该节点上的指定组件。 */
    getComponent<T extends Component>(node: ComponentNode, constructor: ComponentConstructor<T>): T | undefined {
        return this._findComponent(node, constructor);
    }

    /** 收集当前节点和子树上的指定组件，保留原版方法名。 */
    getComponentsInChidren<T extends Component>(node: ComponentNode, constructor: ComponentConstructor<T>, out: T[] = []): T[] {
        const components = this._getComponents(node);
        for (let index = components.length - 1; index >= 0; index--) {
            const component = components[index];
            if (component instanceof constructor) out.push(component);
        }
        for (const child of node.children) this.getComponentsInChidren(child, constructor, out);
        return out;
    }

    /** 按需初始化节点上的活动组件列表。 */
    _getComponents(node: ComponentNode) {
        return node._components ??= [];
    }

    /** 从该节点最后挂载的组件开始匹配实例类型。 */
    private _findComponent<T extends Component>(node: ComponentNode, constructor: ComponentConstructor<T>): T | undefined {
        const components = this._getComponents(node);
        for (let index = components.length - 1; index >= 0; index--) {
            const component = components[index];
            if (component instanceof constructor) return component;
        }
    }

    /** 将挂载或节点可见性变化交给生命周期调度器。 */
    protected _activeComponent(component: Component, active: boolean) {
        this._componentScheduler.enableComponent(component, active);
    }
}
