import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter as Candidate } from "../src/index.ts";
import type { ListenerContainer } from "../src/core/EventEmitter.ts";

const originalUrl = new URL("../reference/xviewer.module.min.js", import.meta.url);
const { EventEmitter: Original }: { EventEmitter: typeof Candidate } = await import(originalUrl.href);

/** 记录倒序分发、回调上下文和一次性监听的重入行为。 */
function dispatch(Emitter: typeof Candidate) {
    const emitter = new Emitter();
    const target = { label: "target" };
    const calls: [string, string][] = [];
    emitter.on("event", function (this: typeof target, value: string) {
        calls.push([this.label, value]);
    }, target);
    emitter.on("event", (value: string) => {
        calls.push(["once", value]);
        emitter.emit("event", "nested");
    }, undefined, true);
    assert.equal(emitter.emit("event", "first"), emitter);
    emitter.emit("event", "second");
    return calls;
}

/** 记录按回调、上下文和容器注销，以及清空后的行为。 */
function unsubscribe(Emitter: typeof Candidate) {
    const emitter = new Emitter();
    const first = { label: "first" };
    const second = { label: "second" };
    const container: ListenerContainer = {};
    const calls: string[] = [];
    function listener(this: typeof first) {
        calls.push(this.label);
    }
    assert.equal(emitter.on("event", listener, first), emitter);
    emitter.on("event", listener, second);
    emitter.off("event", listener);
    emitter.emit("event");
    emitter.targetOff(second);
    emitter.onof("event", () => calls.push("container"), container);
    emitter.emit("event");
    assert.equal(emitter.offof(container), emitter);
    emitter.emit("event");
    assert.equal(emitter.on("event", listener, first), emitter);
    emitter.clear().emit("event");
    return { calls, containerRecords: container._listeners?.length };
}

test("分发顺序、上下文和重入与原版一致", () => {
    assert.deepEqual(dispatch(Candidate), dispatch(Original));
});

test("批量注销及容器记录与原版一致", () => {
    assert.deepEqual(unsubscribe(Candidate), unsubscribe(Original));
});

test("重复注册的告警与返回值与原版一致", (context) => {
    const warning = context.mock.method(console, "warn", () => {});
    const callback = () => {};
    for (const Emitter of [Original, Candidate]) {
        const emitter = new Emitter();
        assert.equal(emitter.on("event", callback), emitter);
        assert.equal(emitter.on("event", callback), undefined);
    }
    assert.deepEqual(warning.mock.calls[1].arguments, warning.mock.calls[0].arguments);
});
