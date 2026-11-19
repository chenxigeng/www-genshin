import assert from "node:assert/strict";
import test from "node:test";
import * as candidate from "../src/index.ts";
import { ComponentManager } from "../src/core/ComponentManager.ts";

const originalUrl = new URL("../../src/libs/xviewer/xviewer.module.min.js", import.meta.url);
const original: typeof candidate = await import(originalUrl.href);

/** 对比 Viewer 方法，渲染器用记录调用的替身，场景和相机使用各自真实实现。 */
function trace(lib: typeof candidate) {
    const { Component, Viewer, Object3D, Scene, PerspectiveCamera, OrthographicCamera, Vector3 } = lib;
    const Base = Object.getPrototypeOf(Viewer) as typeof ComponentManager;
    const calls: unknown[] = [];
    let loop: ((time: number) => void) | null = null;
    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 1, 1000);
    camera.position.z = 10;
    const viewer = Object.assign(Object.setPrototypeOf(new Base(), Viewer.prototype), {
        _scene: scene,
        _camera: camera,
        _states: [],
        _running: false,
        _time: 0,
        _renderer: {
            setSize: (width: number, height: number) => calls.push(["size", width, height]),
            setAnimationLoop: (callback: typeof loop) => { loop = callback; calls.push(callback ? "loop on" : "loop off"); },
            info: { reset: () => calls.push("reset") },
            render: (activeScene: typeof scene, activeCamera: InstanceType<typeof Viewer>["camera"]) =>
                calls.push(["render", activeScene === scene, activeCamera === camera]),
        },
    }) as InstanceType<typeof Viewer>;
    class Example extends Component {
        create() { return new Object3D(); }
        onLoad() { calls.push("load"); }
        update(dt: number) { calls.push(["update", dt]); }
    }
    viewer.on("node-changed", ({ target }: { target: InstanceType<typeof Object3D> }) => calls.push(target.type));
    viewer.resize(800, 400);
    calls.push({ ...viewer.viewport }, camera.aspect);
    const object = viewer.addNode(Object3D, { name: "example", position: new Vector3(1, 2, 3), "scale-x": 4 });
    calls.push(object.name, object.position.toArray(), object.scale.x);
    const component = viewer.addNode(Example);
    calls.push(component.node === scene.children[1]);
    viewer.start().start();
    const frame = loop as ((time: number) => void) | null;
    assert.ok(frame);
    frame(1000);
    frame(1125);
    viewer.stop();
    calls.push(viewer.time);
    viewer.render(0);
    viewer.pushScene();
    const ortho = viewer.addNode(OrthographicCamera, { makeDefault: true, zoom: 2 });
    viewer.resize(900, 300);
    calls.push({ ...viewer.viewport }, viewer.camera === ortho, viewer.scene === scene);
    viewer.popScene();
    calls.push(viewer.scene === scene, viewer.camera === camera);
    return calls;
}

test("Viewer 节点、视口、帧时间和场景切换与原版一致", () => {
    assert.deepEqual(trace(candidate), trace(original));
});

/** 构造无 WebGL 的宿主，对照组件、渲染器和监听器的释放顺序。 */
function destroyTrace(lib: typeof candidate) {
    const Base = Object.getPrototypeOf(lib.Viewer) as typeof ComponentManager;
    const calls: string[] = [];
    const viewer = Object.assign(
        Object.setPrototypeOf(new Base(), lib.Viewer.prototype),
        {
            _scene: new lib.Scene(),
            _input: { removeAllListeners: () => calls.push("listeners") },
            _renderer: {
                dispose: () => calls.push("renderer"),
                setAnimationLoop: (loop: null) => { assert.equal(loop, null); calls.push("loop"); },
            },
            _running: true,
            _time: 12,
            _user: { before: true },
        },
    ) as InstanceType<typeof lib.Viewer>;
    class Example extends lib.Component {
        onDisable() { calls.push("disable"); }
        onDestroy() { calls.push("destroy"); }
    }
    const component = viewer.addNode(Example);
    assert.equal(viewer.destroy(), true);
    assert.equal(viewer.destroy(), false);
    return { calls, user: viewer.user, time: viewer.time, valid: component.isValid };
}

test("Viewer 销毁时按原版顺序移除监听器、释放渲染器并停止帧循环", () => {
    assert.deepEqual(destroyTrace(candidate), destroyTrace(original));
});

test("$p 复用可复制对象、合并嵌套属性并保留 force 行为", () => {
    for (const lib of [candidate, original]) {
        const position = new lib.Vector3();
        const target = { position, options: { value: 1 } };
        assert.equal(lib.$p(target, { position: new lib.Vector3(1, 2, 3), "options-value": 4, missing: 5 }), target);
        assert.equal(target.position, position);
        assert.deepEqual(position.toArray(), [1, 2, 3]);
        assert.equal(target.options.value, 4);
        assert.equal(Object.hasOwn(target, "missing"), false);
        lib.$p(target, { missing: 5 }, true);
        assert.equal(Reflect.get(target, "missing"), 5);
    }
});
