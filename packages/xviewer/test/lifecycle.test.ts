import assert from "node:assert/strict";
import test from "node:test";
import { Component, dependencies } from "../src/index.ts";
import type { ComponentNode } from "../src/core/Component.ts";
import { ComponentManager } from "../src/core/ComponentManager.ts";

const originalUrl = new URL("../reference/xviewer.module.min.js", import.meta.url);
const original = await import(originalUrl.href) as {
    /** 原版用于探测内部管理器原型的公开类。 */
    Viewer: new () => unknown;
    /** 原版公开组件类。 */
    Component: typeof Component;
    /** 原版组件依赖装饰器。 */
    dependencies: typeof dependencies;
};
const OriginalManager = Object.getPrototypeOf(original.Viewer) as typeof ComponentManager;

/** 对照依赖、挂载去重、跨帧行为、重新启用以及原版事件名。 */
function trace(Base: typeof Component, Manager: typeof ComponentManager, depends: typeof dependencies) {
    const events: unknown[] = [];
    const manager = new Manager();
    const child: ComponentNode = { visible: true, children: [], removeFromParent() {} };
    const root: ComponentNode = {
        visible: true,
        children: [child],
        removeFromParent() { events.push("detach"); },
    };
    class Dependency extends Base {
        onLoad() { events.push("dependency:load"); }
        update() { events.push("dependency:update"); }
    }
    class Example extends Base {
        onLoad(props: unknown) {
            events.push(["load", props, this.viewer === manager, this.node === root]);
            this.schedule(() => events.push("timer"), 0, 1);
        }
        onEnable() { events.push("enable"); }
        onDisable() { events.push("disable"); }
        start() { events.push("start"); }
        update(dt: number) { events.push(["update", dt]); }
        lastUpdate(dt: number) { events.push(["lastUpdate", dt]); }
        onDestroy() { events.push(["destroy", this.isValid]); }
    }
    depends(Dependency)(Example);
    manager.on("component-changed", ({ target }: { target: Component }) => events.push(["add", target instanceof Example]));
    manager.on("omponent-changed", ({ target }: { target: Component }) => events.push(["remove", target instanceof Example]));
    const component = manager.addComponent(root, Example, { value: 1 });
    manager.addComponent(child, Dependency);
    events.push(manager.addComponent(component, new Example()) === component);
    events.push(manager.getComponentsInChidren(root, Base).map((item) => item instanceof Example));
    manager.update(0.25);
    manager.update(0.5);
    manager.activeNode(root, false);
    manager.update(0.5);
    manager.activeNode(root, true);
    manager.update(0.5);
    manager.destroyNode(root);
    events.push(["after node destroy", component.isValid, manager.getComponent(root, Example)]);
    component.destroy();
    manager.update(0.5);
    return events;
}

test("组件依赖、启停、帧顺序和销毁与原版一致", () => {
    assert.deepEqual(trace(Component, ComponentManager, dependencies), trace(original.Component, OriginalManager, original.dependencies));
});

test("更新中注销当前组件时，保留原版活动数组的遍历结果", () => {
    for (const [Base, Manager] of [[Component, ComponentManager], [original.Component, OriginalManager]] as const) {
        const manager = new Manager();
        const node: ComponentNode = { visible: true, children: [], removeFromParent() {} };
        const calls: string[] = [];
        class First extends Base {
            update() {
                calls.push("first");
                this.enabled = false;
            }
        }
        class Second extends Base {
            update() { calls.push("second"); }
        }
        manager.addComponent(node, First);
        manager.addComponent(node, Second);
        manager.update(1);
        assert.deepEqual(calls, ["first"]);
        manager.update(1);
        assert.deepEqual(calls, ["first", "second"]);
    }
});
