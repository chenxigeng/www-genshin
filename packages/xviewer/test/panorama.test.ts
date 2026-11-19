import assert from "node:assert/strict";
import test from "node:test";
import * as candidate from "../src/index.ts";
import type { AssetLoadRequest } from "../src/index.ts";

const originalUrl = new URL("../reference/xviewer.module.min.js", import.meta.url);
const original: typeof candidate = await import(originalUrl.href);

/** 记录全景球体参数、纹理加载请求和材质更新。 */
async function trace(lib: typeof candidate) {
    const calls: unknown[] = [];
    const url = "test.panorama-fixture";
    const texture = new lib.Texture();
    class Loader extends lib.AssetLoader {
        extensions = ["panorama-fixture"];
        load(request: AssetLoadRequest) {
            calls.push([request.url, Reflect.get(request, "magFilter"), Reflect.get(request, "minFilter")]);
            request.onLoad(texture);
        }
    }
    lib.AssetManager.RegistLoader(Loader);
    const image = new lib.ImagePanorama();
    const video = new lib.VideoPanorama();
    const node = image.node = image.create();
    const videoNode = video.create();
    try {
        assert.ok(image instanceof lib.Panorama);
        assert.ok(video instanceof lib.Panorama);
        image.onLoad({ url });
        await Promise.resolve();
        const plugin = new lib.RenderPlugin();
        Object.assign(plugin, { viewer: { render: (dt: number) => calls.push(["render", dt]) } });
        plugin.update(0.25);
        return {
            calls,
            imageGeometry: node.geometry.parameters,
            imageSide: node.material.side,
            textureAttached: node.material.map === texture,
            materialVersion: node.material.version,
            videoGeometry: videoNode.geometry.parameters,
            videoMap: videoNode.material.map,
        };
    } finally {
        lib.AssetManager.loaders.delete("panorama-fixture");
        lib.AssetManager.caches.delete(url);
        node.geometry.dispose();
        node.material.dispose();
        videoNode.geometry.dispose();
        videoNode.material.dispose();
        texture.dispose();
    }
}

test("全景组件的几何体、纹理和默认渲染插件与原版一致", async () => {
    assert.deepEqual(await trace(candidate), await trace(original));
});
