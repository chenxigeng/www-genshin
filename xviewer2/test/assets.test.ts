import assert from "node:assert/strict";
import test from "node:test";
import { Color, Texture } from "three";
import * as candidate from "../src/index.ts";
import type { AssetLoadRequest } from "../src/index.ts";
import type { JsonAtlas } from "../src/assets/TextureAtlas.ts";
import { ComponentManager } from "../src/core/ComponentManager.ts";

const originalUrl = new URL("../../src/libs/xviewer/xviewer.module.min.js", import.meta.url);
const original: typeof candidate = await import(originalUrl.href);

/** 核对缓存、加载器共享实例、本地文件归一化和失败后重试。 */
async function managerTrace({ AssetManager, AssetLoader }: typeof candidate) {
    class Manager extends AssetManager {
        static override caches = new Map<string, unknown>();
        static override loaders = new Map<string, InstanceType<typeof AssetLoader>>();
    }
    const calls: unknown[] = [];
    let failNext = false;
    let value = 0;
    class Loader extends AssetLoader {
        extensions = ["testfixture", "testalias"];
        load(request: AssetLoadRequest) {
            calls.push([request.url, request.file, Object.entries(request.settings ?? {})]);
            if (failNext) {
                failNext = false;
                request.onError("failed");
                return;
            }
            request.onLoad({ value: ++value });
        }
    }
    Manager.RegistLoader(Loader);
    assert.equal(Manager.loaders.get("testfixture"), Manager.loaders.get("testalias"));
    const url = "demo.testfixture";
    const first = await Manager.Load({ url, settings: { flipY: false, anisotropy: 2 } });
    assert.equal(await Manager.Load({ url, settings: { flipY: false, anisotropy: 2 } }), first);
    assert.notEqual(await Manager.Load({ url, settings: { anisotropy: 2, flipY: false } }), first);
    await assert.rejects(Manager.Load({ url: url + "?v=1" }), (reason) => reason === "missing loader fortestfixture?v=1");
    failNext = true;
    await assert.rejects(Manager.Load({ url: "retry.testalias" }), (reason) => reason === "failed");
    await Manager.Load({ url: "retry.testalias" });
    const fileOptions = { lastModified: 0 };
    await Manager.Load({ url: new File(["data"], "local.testfixture", fileOptions) });
    await Manager.Load({ url: {
        mainFile: new File([], "multi.testfixture", fileOptions),
        additionalFiles: [new File([], "extra.bin", fileOptions)],
    } });
    Manager.Clear();
    await Manager.Load({ url, settings: { flipY: false, anisotropy: 2 } });
    return calls;
}

test("AssetManager 的加载器、缓存、参数和重试与原版一致", async () => {
    assert.deepEqual([...candidate.AssetManager.loaders.keys()], [...original.AssetManager.loaders.keys()]);
    assert.deepEqual(await managerTrace(candidate), await managerTrace(original));
});

test("TextureAtlas 的 UV、网格坐标和帧复用与原版一致", () => {
    const json: JsonAtlas = {
        frames: {
            sample: { frame: { x: 32, y: 8, w: 16, h: 12 }, sourceSize: { w: 24, h: 24 }, spriteSourceSize: { x: 0, y: 4, w: 16, h: 12 } },
        },
        animations: { example: ["sample"] },
        meta: { size: { w: 128, h: 64 }, scale: 2, image: "atlas.png" },
    };
    const texture = new Texture();
    const trace = (Atlas: typeof candidate.TextureAtlas) => {
        const atlas = new Atlas(json, texture);
        const frame = atlas.getSpriteFrame("sample");
        assert.ok(frame);
        assert.equal(atlas.getAnimation("example")?.[0], frame);
        assert.equal(frame.texture, texture);
        return [frame.texCoords.toArray(), frame.meshCoords.toArray(), atlas.getSpriteFrame("missing")];
    };
    assert.deepEqual(trace(candidate.TextureAtlas), trace(original.TextureAtlas));
});

test("本地 GLB 由 Three.js 加载器解析并挂载动画数组", async (context) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "ProgressEvent");
    if (!previous) {
        Object.defineProperty(globalThis, "ProgressEvent", { configurable: true, value: Event });
        context.after(() => { Reflect.deleteProperty(globalThis, "ProgressEvent"); });
    }
    const json = JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "fixture" }] });
    const chunk = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
    const header = Buffer.alloc(20);
    header.write("glTF");
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(header.length + chunk.length, 8);
    header.writeUInt32LE(chunk.length, 12);
    header.write("JSON", 16);
    const bytes = Uint8Array.from(Buffer.concat([header, chunk]));
    const file = new File([bytes], "local-fixture.glb");
    context.after(() => candidate.AssetManager.Clear());
    const model = await candidate.AssetManager.Load<InstanceType<typeof candidate.Object3D>>({ url: file });
    assert.equal(model.children[0].name, "fixture");
    assert.deepEqual(model.animations, []);
});

/** 用加载器替身对照 Viewer 的场景事件、资源替换及延迟背景完成。 */
async function viewerTrace(lib: typeof candidate) {
    const Base = Object.getPrototypeOf(lib.Viewer) as typeof ComponentManager;
    const scene = new lib.Scene();
    const viewer = Object.assign(Object.setPrototypeOf(new Base(), lib.Viewer.prototype), {
        _scene: scene, _environment: null, _background: null,
    }) as InstanceType<typeof lib.Viewer>;
    const calls: unknown[] = [];
    const asset = new lib.Object3D();
    const environment = new Texture();
    let finishBackground: (() => void) | undefined;
    let textureRequests = 0;
    class Loader extends lib.AssetLoader {
        extensions = ["viewerfixture"];
        load(request: AssetLoadRequest) {
            calls.push([request.url, request.settings?.mapping]);
            if (request.url === "model.viewerfixture") request.onLoad(asset);
            else if (++textureRequests === 1) request.onLoad(environment);
            else finishBackground = () => request.onLoad(environment);
        }
    }
    const textureLoad = lib.AssetManager.Load;
    lib.AssetManager.RegistLoader(Loader);
    try {
        viewer.on("node-changed", ({ action }: { action: string }) => calls.push(action));
        viewer.on("env-changed", (url: string) => calls.push(["env", url]));
        viewer.on("bg-changed", (url: string) => calls.push(["bg", url]));
        scene.add(new lib.Object3D());
        assert.equal(await viewer.load({ url: "model.viewerfixture", replace: true }), asset);
        assert.deepEqual(scene.children, [asset]);

        // 模拟背景纹理与环境纹理各自完成，让 fire-and-forget 顺序可观察。
        lib.AssetManager.Load = ((request) => {
            lib.AssetManager.caches.delete("env.viewerfixture,mapping=303");
            return textureLoad.call(lib.AssetManager, request);
        }) as typeof textureLoad;
        await viewer.setEnvironment({ url: "env.viewerfixture" });
        assert.equal(scene.environment, environment);
        assert.equal(scene.background, null);
        assert.ok(finishBackground);
        finishBackground();
        await Promise.resolve();
        assert.equal(scene.background, environment);
        const color = new Color(0x123456);
        await viewer.setBackground({ color });
        assert.equal(scene.background, color);
        await viewer.setEnvironment();
        assert.equal(scene.environment, null);
        assert.equal(scene.background, null);
        return calls.map((call) => Array.isArray(call) && call[1] === color ? [call[0], color.getHex()] : call);
    } finally {
        lib.AssetManager.Load = textureLoad;
        lib.AssetManager.loaders.delete("viewerfixture");
        lib.AssetManager.Clear();
    }
}

test("Viewer 资源替换、环境贴图和背景时序与原版一致", async () => {
    assert.deepEqual(await viewerTrace(candidate), await viewerTrace(original));
});
