import assert from "node:assert/strict";
import test from "node:test";
import * as candidate from "../src/index.ts";

const originalUrl = new URL("../reference/xviewer.module.min.js", import.meta.url);
const original: typeof candidate = await import(originalUrl.href);

/** 采样大时间步、跨帧追赶、暂停恢复、重复次数与注销。 */
function schedulerTrace({ Scheduler }: typeof candidate) {
    const scheduler = new Scheduler();
    const first = { uuid: "first" };
    const second = { uuid: "second" };
    const trace: ([string, number, number] | string)[] = [];
    function record(this: typeof first, dt: number, elapsed: number) {
        trace.push([this.uuid, dt, elapsed]);
    }
    scheduler.schedule(first, record, 1, 3);
    scheduler.schedule(first, record, 0, -1);
    scheduler.schedule(second, record, 0, -1);
    scheduler.schedule(second, () => trace.push("disabled"), 0, 0);
    scheduler.update(3);
    scheduler.pause(first);
    scheduler.update(2);
    scheduler.resume(first);
    scheduler.update(0);
    scheduler.update(0);
    scheduler.unshedule(first, record);
    scheduler.unscheduleAll(second);
    scheduler.update(1);
    scheduler.unscheduleAll(first);
    scheduler.update(1);
    return trace;
}

/** 记录组件启停、调度转发和销毁时的可观察顺序。 */
function componentTrace({ Component, Plugin, EventEmitter }: typeof candidate) {
    const trace: unknown[][] = [];
    const plugin = new Plugin("example");
    const callback = () => {};
    const node = { visible: true, children: [], removeFromParent() {} };
    plugin.node = node;
    Object.assign(plugin, { viewer: {
        scheduler: {
            schedule: (target: unknown, fn: unknown, interval: number, repeat: number) => trace.push(["schedule", target === plugin, fn === callback, interval, repeat]),
            unshedule: (target: unknown, fn: unknown) => trace.push(["unshedule", target === plugin, fn === callback]),
            unscheduleAll: (target: unknown) => trace.push(["unscheduleAll", target === plugin]),
        },
        componentScheduler: {
            enableComponent: (target: unknown, enabled: boolean) => trace.push(["enable", target === plugin, enabled]),
        },
        removeComponent: (targetNode: unknown, target: unknown) => trace.push(["remove", targetNode === node, target === plugin]),
    } });
    plugin.onDestroy = () => trace.push(["onDestroy", plugin.isValid]);
    plugin.__setFlag(Component.Flags.OnLoadCalled);
    plugin.enabled = false;
    plugin.enabled = false;
    plugin.enabled = true;
    plugin.schedule(callback, 2);
    plugin.unshedule(callback);
    trace.push([plugin.destroy(), plugin.isValid, plugin.destroy()]);
    plugin.destroyImmediate();
    return {
        trace,
        flags: Component.Flags,
        name: plugin.name,
        isComponent: plugin.isComponent && plugin instanceof Component,
        isPlugin: plugin.isPlugin,
        isEmitter: plugin instanceof EventEmitter,
        nextIdDelta: Number(new Component().uuid) - Number(plugin.uuid),
    };
}

test("Scheduler 时间、顺序和注销与原版一致", () => {
    assert.deepEqual(schedulerTrace(candidate), schedulerTrace(original));
});

test("Component 和 Plugin 的继承、调度与销毁与原版一致", () => {
    assert.deepEqual(componentTrace(candidate), componentTrace(original));
});

test("销毁钩子异常时组件保持有效，未加载组件不调用 onDestroy", () => {
    for (const { Component } of [original, candidate]) {
        const component = new Component();
        component.onDestroy = () => assert.fail("未加载组件调用了 onDestroy");
        Object.assign(component, { viewer: {
            scheduler: new class extends candidate.Scheduler {
                /** 模拟调度器清理失败。 */
                override unscheduleAll() { throw new Error("cleanup"); }
            }(),
            componentScheduler: { enableComponent() {} },
            removeComponent() {},
        } });
        assert.throws(() => component.destroy(), /cleanup/);
        assert.equal(component.isValid, true);
        Object.assign(component, { viewer: undefined });
        assert.equal(component.destroy(), true);
        assert.equal(component.isValid, false);
    }
});
