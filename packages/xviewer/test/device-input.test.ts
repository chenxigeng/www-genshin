import assert from "node:assert/strict";
import test from "node:test";
import { DeviceInput, REVISION, Vector2 } from "../src/index.ts";

const originalUrl = new URL("../reference/xviewer.module.min.js", import.meta.url);
const original: {
    /** 原版公开的输入控制器。 */
    DeviceInput: typeof DeviceInput;
    /** 原版内嵌渲染库的修订号。 */
    REVISION: string;
    /** 原版输入向量所属的构造器。 */
    Vector2: typeof Vector2;
} = await import(originalUrl.href);

/** 用可取消事件记录绑定、坐标、触点、按键及卸载行为。 */
function trace(Input: typeof DeviceInput, Vector: typeof Vector2) {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const windowTarget = Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 400 });
    const canvas = Object.assign(new EventTarget(), { style: { touchAction: "" } });
    const calls: unknown[] = [];
    const input = new Input({
        renderer: { domElement: canvas as unknown as HTMLCanvasElement },
        resize: (...size) => calls.push(["resize host", ...size]),
        emit: (name, ...args) => calls.push([name, ...args.map((arg) => arg instanceof Event ? arg.type : arg)]),
    });
    const snapshot = () => [
        input.pointerButton, input.pointer.toArray(), input.pointerPosition.toArray(), input.mouseWheel,
        input.touchCount, input.touches.map(({ id, position }) => [id, position.toArray()]), { ...input.keys },
    ];
    const send = (type: string, fields: object = {}) => canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), fields));
    Object.defineProperty(globalThis, "window", { configurable: true, value: windowTarget });
    try {
        input.addEventListeners();
        const contextMenu = send("contextmenu");
        const down = send("pointerdown", { button: 2 });
        send("pointermove", { pageX: 600, pageY: 100 });
        const wheel = send("mousewheel", { deltaY: -10 });
        send("touchstart", { touches: [{ identifier: 1, pageX: 20, pageY: 30 }] });
        const afterStart = snapshot();
        send("touchmove", { touches: [{ identifier: 1, pageX: 20, pageY: 30 }, { identifier: 2, pageX: 40, pageY: 50 }] });
        send("touchmove", { touches: [{ identifier: 3, pageX: 60, pageY: 70 }] });
        send("touchend", { touches: [] });
        send("keydown", { key: "a" });
        const beforeRelease = snapshot();
        send("keypress", { key: "b" });
        send("keyup", { key: "a" });
        const up = send("pointerup", { button: 2 });
        windowTarget.innerWidth = 400;
        windowTarget.dispatchEvent(new Event("resize"));
        const beforeRemoval = calls.length;
        input.removeAllListeners();
        input.removeAllListeners();
        send("pointermove", { pageX: 1, pageY: 1 });
        windowTarget.dispatchEvent(new Event("resize"));
        assert.equal(input.pointer instanceof Vector, true);
        assert.equal(input.touches[0].position instanceof Vector, true);
        assert.equal(calls.length, beforeRemoval);
        const originalResize = Input.prototype._onResize;
        Input.prototype._onResize = function () {
            this.viewer.resize(window.innerHeight, window.innerWidth);
            this.viewer.emit(Input.RESIZE, window.innerHeight, window.innerWidth);
        };
        try {
            input.addEventListeners();
            windowTarget.dispatchEvent(new Event("resize"));
        } finally {
            input.removeAllListeners();
            Input.prototype._onResize = originalResize;
        }
        return { calls, contextMenu, down, up, wheel, touchAction: canvas.style.touchAction, afterStart, beforeRelease, final: snapshot() };
    } finally {
        if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
        else Reflect.deleteProperty(globalThis, "window");
    }
}

test("DeviceInput 的事件、缓存、向量类型及卸载与原版一致", () => {
    assert.equal(REVISION, original.REVISION);
    assert.deepEqual(trace(DeviceInput, Vector2), trace(original.DeviceInput, original.Vector2));
});
