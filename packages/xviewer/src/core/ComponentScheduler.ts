import type { Component } from "./Component.ts";
import { Entity } from "./Entity.ts";

/** 按注册顺序执行生命周期回调，保留回调内调整队列的行为。 */
class Invoker {
    protected _targets: Component[] = [];
    protected _callback: (component: Component, dt: number) => void;

    constructor(callback: (component: Component, dt: number) => void) {
        this._callback = callback;
    }

    /** 追加待调度组件。 */
    add(component: Component) {
        this._targets.push(component);
    }

    /** 删除第一个匹配的待调度组件。 */
    remove(component: Component) {
        const index = this._targets.indexOf(component);
        if (index !== -1) this._targets.splice(index, 1);
    }

    /** 遍历当前队列。原版直接遍历活动数组。 */
    invoke(dt: number) {
        const callback = this._callback;
        for (const target of this._targets) callback(target, dt);
    }
}

/** start 队列成功执行后清空，重新启用可再次加入。 */
class StartInvoker extends Invoker {
    override invoke(dt: number) {
        super.invoke(dt);
        this._targets.length = 0;
    }
}

/** 将启用状态同步到 start、update 和 lastUpdate 三个阶段。 */
export class ComponentScheduler {
    /** 方法存在时才会入队，执行时读取最新方法。 */
    startInvoker = new StartInvoker((component) => component.start!());
    updateInvoker = new Invoker((component, dt) => component.update!(dt));
    lastUpdateInvoker = new Invoker((component, dt) => component.lastUpdate!(dt));

    /** 运行本帧待启动的组件。 */
    start() {
        this.startInvoker.invoke(0);
    }

    /** 执行常规帧更新。 */
    update(dt: number) {
        this.updateInvoker.invoke(dt);
    }

    /** 执行帧末更新。 */
    lastUpdate(dt: number) {
        this.lastUpdateInvoker.invoke(dt);
    }

    /** 先更新启用标志和回调，再调整三个调度队列。 */
    enableComponent(component: Component, enabled: boolean) {
        const flag = Entity.Flags.OnEnableCalled;
        if (enabled && !component.__getFlag(flag)) {
            component.__setFlag(flag);
            component.onEnable?.();
            if (component.start) this.startInvoker.add(component);
            if (component.update) this.updateInvoker.add(component);
            if (component.lastUpdate) this.lastUpdateInvoker.add(component);
        } else if (!enabled && component.__getFlag(flag)) {
            component.__clearFlag(flag);
            component.onDisable?.();
            if (component.start) this.startInvoker.remove(component);
            if (component.update) this.updateInvoker.remove(component);
            if (component.lastUpdate) this.lastUpdateInvoker.remove(component);
        }
    }
}
