import assert from "node:assert/strict";
import test from "node:test";
import * as candidate from "../src/index.ts";

const originalUrl = new URL("../reference/xviewer.module.min.js", import.meta.url);
const original: typeof candidate = await import(originalUrl.href);

/** 使用同步缓存和音源替身，记录加载完成前后的播放调用顺序。 */
async function trace(lib: typeof candidate) {
    const calls: unknown[] = [];
    const url = "xviewer2-test-audio.mp3";
    const buffer = {};
    const camera = new lib.Object3D();
    const parent = new lib.Object3D();
    const audioListener = new lib.Object3D();
    const component = new lib.PositionalAudioComponent();
    const node = {
        listener: audioListener,
        isPlaying: true,
        setBuffer(value: unknown) { calls.push(["buffer", value === buffer]); },
        setLoop(loop: boolean) { calls.push(["loop", loop]); },
        setVolume(volume: number) { calls.push(["volume", volume]); },
        setRefDistance(distance: number) { calls.push(["refDistance", distance]); },
        setMaxDistance(distance: number) { calls.push(["maxDistance", distance]); },
        stop() { this.isPlaying = false; calls.push("stop"); },
        play() { this.isPlaying = true; calls.push("play"); },
    };
    Object.assign(component, {
        node,
        viewer: {
            camera,
            addNode(listener: unknown, props: unknown, target: unknown) {
                calls.push(["listener", listener === audioListener, props, target === camera, target === parent]);
            },
        },
    });
    lib.AssetManager.caches.set(url, buffer);
    try {
        component.onLoad({});
        component.onLoad({ listener: parent });
        assert.equal(component.play({ url, loop: true, volume: 0.25 }), undefined);
        await Promise.resolve();
        component.play({ url, force: true, refDistance: 5, maxDistance: 50 });
        await Promise.resolve();
        component.stop();
        return calls;
    } finally {
        lib.AssetManager.caches.delete(url);
    }
}

test("音频监听器挂载、衰减设置和播放调度与原版一致", async () => {
    assert.deepEqual(await trace(candidate), await trace(original));
});
